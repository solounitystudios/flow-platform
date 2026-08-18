-- ── Extend the connections table for blocking ──────────────────────────
alter table public.connections
  add column blocked_by uuid references public.profiles(id) on delete cascade,
  add column updated_at timestamptz not null default now();

alter table public.connections drop constraint connections_status_check;
alter table public.connections
  add constraint connections_status_check check (status in ('pending', 'accepted', 'blocked'));
alter table public.connections
  add constraint connections_blocked_by_valid check (
    (status = 'blocked' and blocked_by in (requester_id, recipient_id))
    or (status <> 'blocked' and blocked_by is null)
  );

create index connections_status_idx on public.connections (status);

-- Mutations now only happen through the SECURITY DEFINER RPCs below, which
-- enforce the state machine and handle race conditions transactionally —
-- drop the direct-write policies so the client can never bypass that logic.
drop policy if exists connections_requester_insert on public.connections;
drop policy if exists connections_recipient_update on public.connections;
drop policy if exists connections_parties_delete on public.connections;

-- ── Append-only audit log — survives row deletes/re-requests ───────────
create table public.connection_events (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('sent', 'accepted', 'declined', 'cancelled', 'removed', 'blocked', 'unblocked')),
  created_at timestamptz not null default now()
);

create index connection_events_pair_idx
  on public.connection_events (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index connection_events_created_at_idx on public.connection_events (created_at desc);

alter table public.connection_events enable row level security;

create policy connection_events_parties_read
  on public.connection_events for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

-- No insert/update/delete policies: only the RPCs (SECURITY DEFINER) write here.

-- ── Minimal admin roster for report moderation ──────────────────────────
-- A dedicated table (rather than a profiles.is_admin column) so no existing
-- RLS policy or trigger has to be re-audited for privilege escalation —
-- nobody can write to this table through the API at all, only by a project
-- owner running SQL directly.
create table public.admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy admins_self_read
  on public.admins for select
  using (auth.uid() = profile_id);

-- ── Reports ──────────────────────────────────────────────────────────────
create table public.connection_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  constraint connection_reports_not_self check (reporter_id <> reported_id)
);

create index connection_reports_reported_idx on public.connection_reports (reported_id);
create index connection_reports_reporter_idx on public.connection_reports (reporter_id);

alter table public.connection_reports enable row level security;

create policy connection_reports_read
  on public.connection_reports for select
  using (
    auth.uid() = reporter_id
    or exists (select 1 from public.admins a where a.profile_id = auth.uid())
  );

-- No insert policy: reports are only created through report_profile() below,
-- which stamps reporter_id from auth.uid() itself.

-- ── Block visibility: hide each blocked party's profile from the other ──
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'blocked'
      and ((c.requester_id = a and c.recipient_id = b) or (c.requester_id = b and c.recipient_id = a))
  );
$$;

-- RESTRICTIVE policies AND with existing permissive ones (profiles_public_read)
-- rather than replacing them, so this can't accidentally widen access.
create policy profiles_block_restrict
  on public.profiles as restrictive
  for select
  using (auth.uid() = id or not public.is_blocked_between(auth.uid(), id));

-- ── RPCs: every connection mutation goes through one of these ──────────

create or replace function public.send_connection_request(p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_requester uuid := auth.uid();
  v_row public.connections;
  v_lo uuid;
  v_hi uuid;
begin
  if v_requester is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if v_requester = p_recipient_id then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_lo := least(v_requester, p_recipient_id);
  v_hi := greatest(v_requester, p_recipient_id);

  perform pg_advisory_xact_lock(hashtext(v_lo::text || v_hi::text));

  select * into v_row from public.connections c
    where least(c.requester_id, c.recipient_id) = v_lo
      and greatest(c.requester_id, c.recipient_id) = v_hi
    for update;

  if not found then
    insert into public.connections (requester_id, recipient_id, status)
      values (v_requester, p_recipient_id, 'pending')
      returning * into v_row;
    insert into public.connection_events (requester_id, recipient_id, actor_id, action)
      values (v_requester, p_recipient_id, v_requester, 'sent');

    perform public.notify(p_recipient_id, 'connection_request', 'New connection request',
      coalesce((select full_name from public.profiles where id = v_requester), 'A FLOW member') || ' wants to connect.',
      '/connections');

    return jsonb_build_object('ok', true, 'status', v_row.status, 'connection_id', v_row.id);
  end if;

  if v_row.status = 'blocked' then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  elsif v_row.status = 'accepted' then
    return jsonb_build_object('ok', false, 'reason', 'already_connected');
  elsif v_row.requester_id = v_requester then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  else
    update public.connections
      set status = 'accepted', responded_at = now(), updated_at = now()
      where id = v_row.id
      returning * into v_row;
    insert into public.connection_events (requester_id, recipient_id, actor_id, action)
      values (v_row.requester_id, v_row.recipient_id, v_requester, 'accepted');

    perform public.notify(v_row.requester_id, 'connection_accepted', 'Connection accepted',
      coalesce((select full_name from public.profiles where id = v_requester), 'A FLOW member') || ' accepted your connection request.',
      '/connections');

    return jsonb_build_object('ok', true, 'status', 'accepted', 'connection_id', v_row.id, 'auto_accepted', true);
  end if;
end;
$$;

create or replace function public.respond_to_connection_request(p_connection_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.connections;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_action not in ('accept', 'decline') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_action');
  end if;

  select * into v_row from public.connections where id = p_connection_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.recipient_id <> v_actor then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  if p_action = 'accept' then
    update public.connections set status = 'accepted', responded_at = now(), updated_at = now() where id = p_connection_id;
    insert into public.connection_events (requester_id, recipient_id, actor_id, action)
      values (v_row.requester_id, v_row.recipient_id, v_actor, 'accepted');

    perform public.notify(v_row.requester_id, 'connection_accepted', 'Connection accepted',
      coalesce((select full_name from public.profiles where id = v_actor), 'A FLOW member') || ' accepted your connection request.',
      '/connections');

    return jsonb_build_object('ok', true, 'status', 'accepted');
  else
    delete from public.connections where id = p_connection_id;
    insert into public.connection_events (requester_id, recipient_id, actor_id, action)
      values (v_row.requester_id, v_row.recipient_id, v_actor, 'declined');
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end;
$$;

create or replace function public.cancel_connection_request(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.connections;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row from public.connections where id = p_connection_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.requester_id <> v_actor then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  delete from public.connections where id = p_connection_id;
  insert into public.connection_events (requester_id, recipient_id, actor_id, action)
    values (v_row.requester_id, v_row.recipient_id, v_actor, 'cancelled');

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

create or replace function public.remove_connection(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.connections;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row from public.connections where id = p_connection_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_actor not in (v_row.requester_id, v_row.recipient_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_row.status <> 'accepted' then
    return jsonb_build_object('ok', false, 'reason', 'not_connected');
  end if;

  delete from public.connections where id = p_connection_id;
  insert into public.connection_events (requester_id, recipient_id, actor_id, action)
    values (v_row.requester_id, v_row.recipient_id, v_actor, 'removed');

  return jsonb_build_object('ok', true, 'status', 'removed');
end;
$$;

create or replace function public.block_profile(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_lo uuid;
  v_hi uuid;
  v_row public.connections;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if v_actor = p_target_id then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_lo := least(v_actor, p_target_id);
  v_hi := greatest(v_actor, p_target_id);
  perform pg_advisory_xact_lock(hashtext(v_lo::text || v_hi::text));

  select * into v_row from public.connections c
    where least(c.requester_id, c.recipient_id) = v_lo
      and greatest(c.requester_id, c.recipient_id) = v_hi
    for update;

  if found and v_row.status = 'blocked' then
    return jsonb_build_object('ok', true, 'status', 'blocked');
  elsif found then
    update public.connections
      set status = 'blocked', blocked_by = v_actor, requester_id = v_actor, recipient_id = p_target_id,
          responded_at = now(), updated_at = now()
      where id = v_row.id;
  else
    insert into public.connections (requester_id, recipient_id, status, blocked_by, responded_at)
      values (v_actor, p_target_id, 'blocked', v_actor, now());
  end if;

  insert into public.connection_events (requester_id, recipient_id, actor_id, action)
    values (v_actor, p_target_id, v_actor, 'blocked');

  return jsonb_build_object('ok', true, 'status', 'blocked');
end;
$$;

create or replace function public.unblock_profile(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.connections;
  v_lo uuid;
  v_hi uuid;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  v_lo := least(v_actor, p_target_id);
  v_hi := greatest(v_actor, p_target_id);

  select * into v_row from public.connections c
    where least(c.requester_id, c.recipient_id) = v_lo
      and greatest(c.requester_id, c.recipient_id) = v_hi
    for update;

  if not found or v_row.status <> 'blocked' then
    return jsonb_build_object('ok', false, 'reason', 'not_blocked');
  end if;
  if v_row.blocked_by <> v_actor then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  delete from public.connections where id = v_row.id;
  insert into public.connection_events (requester_id, recipient_id, actor_id, action)
    values (v_row.requester_id, v_row.recipient_id, v_actor, 'unblocked');

  return jsonb_build_object('ok', true, 'status', 'unblocked');
end;
$$;

create or replace function public.report_profile(p_target_id uuid, p_reason text, p_details text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if v_actor = p_target_id then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_reason');
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.connection_reports (reporter_id, reported_id, reason, details)
    values (v_actor, p_target_id, p_reason, p_details);

  return jsonb_build_object('ok', true);
end;
$$;
