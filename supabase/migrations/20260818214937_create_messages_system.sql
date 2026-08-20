-- ── Tables (all three first, so policies below can reference each other) ──
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'event', 'opportunity')),
  event_id uuid references public.events(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  applicant_id uuid references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_shape check (
    (type = 'direct' and event_id is null and opportunity_id is null and applicant_id is null)
    or (type = 'event' and event_id is not null and opportunity_id is null and applicant_id is null)
    or (type = 'opportunity' and opportunity_id is not null and applicant_id is not null and event_id is null)
  )
);

create unique index conversations_event_unique on public.conversations (event_id) where type = 'event';
create unique index conversations_opportunity_unique on public.conversations (opportunity_id, applicant_id) where type = 'opportunity';
create index conversations_last_message_idx on public.conversations (last_message_at desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index conversation_members_profile_idx on public.conversation_members (profile_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (deleted_at is not null or (length(btrim(body)) > 0 and length(body) <= 4000)),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy conversations_member_read
  on public.conversations for select
  using (exists (select 1 from public.conversation_members m where m.conversation_id = id and m.profile_id = auth.uid()));

create policy conversation_members_read
  on public.conversation_members for select
  using (exists (select 1 from public.conversation_members m where m.conversation_id = conversation_members.conversation_id and m.profile_id = auth.uid()));

create policy messages_member_read
  on public.messages for select
  using (exists (select 1 from public.conversation_members m where m.conversation_id = messages.conversation_id and m.profile_id = auth.uid()));

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversation_members;

-- ── RPCs ─────────────────────────────────────────────────────────────────

create or replace function public.get_or_create_direct_conversation(p_other_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_conv_id uuid;
  v_lo uuid;
  v_hi uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if v_me = p_other_id then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  if public.is_blocked_between(v_me, p_other_id) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  if not exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = v_me and c.recipient_id = p_other_id) or (c.requester_id = p_other_id and c.recipient_id = v_me))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_connected');
  end if;

  v_lo := least(v_me, p_other_id);
  v_hi := greatest(v_me, p_other_id);
  perform pg_advisory_xact_lock(hashtext('direct_conv:' || v_lo::text || v_hi::text));

  select c.id into v_conv_id
  from public.conversations c
  where c.type = 'direct'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.profile_id = v_lo)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.profile_id = v_hi);

  if v_conv_id is null then
    insert into public.conversations (type, created_by) values ('direct', v_me) returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, profile_id) values (v_conv_id, v_me), (v_conv_id, p_other_id);
  end if;

  return jsonb_build_object('ok', true, 'conversation_id', v_conv_id);
end;
$$;

create or replace function public.get_or_create_event_conversation(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_event record;
  v_conv_id uuid;
  v_eligible boolean;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event is null then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;

  v_eligible := v_event.created_by = v_me
    or exists (select 1 from public.event_attendance a where a.event_id = p_event_id and a.profile_id = v_me and a.status in ('registered', 'attended'));
  if not v_eligible then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  perform pg_advisory_xact_lock(hashtext('event_conv:' || p_event_id::text));

  select id into v_conv_id from public.conversations where type = 'event' and event_id = p_event_id;
  if v_conv_id is null then
    insert into public.conversations (type, event_id, created_by) values ('event', p_event_id, v_me) returning id into v_conv_id;
  end if;

  insert into public.conversation_members (conversation_id, profile_id)
    values (v_conv_id, v_me)
    on conflict (conversation_id, profile_id) do nothing;

  return jsonb_build_object('ok', true, 'conversation_id', v_conv_id);
end;
$$;

create or replace function public.get_or_create_opportunity_conversation(p_opportunity_id uuid, p_applicant_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_opportunity record;
  v_applicant_id uuid;
  v_conv_id uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_opportunity from public.opportunities where id = p_opportunity_id;
  if v_opportunity is null then
    return jsonb_build_object('ok', false, 'reason', 'opportunity_not_found');
  end if;

  if v_opportunity.created_by = v_me then
    if p_applicant_id is null then
      return jsonb_build_object('ok', false, 'reason', 'applicant_required');
    end if;
    v_applicant_id := p_applicant_id;
    if not exists (select 1 from public.applications a where a.opportunity_id = p_opportunity_id and a.applicant_id = v_applicant_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_an_applicant');
    end if;
  elsif exists (select 1 from public.applications a where a.opportunity_id = p_opportunity_id and a.applicant_id = v_me) then
    v_applicant_id := v_me;
  else
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if public.is_blocked_between(v_opportunity.created_by, v_applicant_id) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;

  perform pg_advisory_xact_lock(hashtext('opp_conv:' || p_opportunity_id::text || v_applicant_id::text));

  select id into v_conv_id from public.conversations where type = 'opportunity' and opportunity_id = p_opportunity_id and applicant_id = v_applicant_id;
  if v_conv_id is null then
    insert into public.conversations (type, opportunity_id, applicant_id, created_by)
      values ('opportunity', p_opportunity_id, v_applicant_id, v_me)
      returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, profile_id)
      values (v_conv_id, v_opportunity.created_by), (v_conv_id, v_applicant_id)
      on conflict (conversation_id, profile_id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'conversation_id', v_conv_id);
end;
$$;

create or replace function public.send_message(p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_recent_count int;
  v_message_id uuid;
  v_other_id uuid;
  v_conv_type text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if length(v_body) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if length(v_body) > 4000 then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation_id and m.profile_id = v_me) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  select type into v_conv_type from public.conversations where id = p_conversation_id;
  if v_conv_type = 'direct' then
    select profile_id into v_other_id from public.conversation_members where conversation_id = p_conversation_id and profile_id <> v_me limit 1;
    if v_other_id is not null and public.is_blocked_between(v_me, v_other_id) then
      return jsonb_build_object('ok', false, 'reason', 'blocked');
    end if;
  end if;

  -- Rate limit: 20 messages per rolling 60 seconds per sender.
  select count(*) into v_recent_count from public.messages
    where sender_id = v_me and created_at > now() - interval '60 seconds';
  if v_recent_count >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (p_conversation_id, v_me, v_body) returning id into v_message_id;
  update public.conversations set last_message_at = now() where id = p_conversation_id;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conversation_id and profile_id = v_me;

  perform public.notify(m.profile_id, 'message_received', 'New message',
    coalesce((select full_name from public.profiles where id = v_me), 'A FLOW member') || ' sent you a message.',
    '/messages/' || p_conversation_id)
  from public.conversation_members m
  where m.conversation_id = p_conversation_id and m.profile_id <> v_me;

  return jsonb_build_object('ok', true, 'message_id', v_message_id);
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation_id and profile_id = auth.uid();

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_row public.messages;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row from public.messages where id = p_message_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.sender_id <> v_me then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_row.deleted_at is not null then
    return jsonb_build_object('ok', true);
  end if;

  update public.messages set deleted_at = now(), deleted_by = v_me, body = '' where id = p_message_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.get_or_create_direct_conversation(uuid) from anon;
revoke execute on function public.get_or_create_event_conversation(uuid) from anon;
revoke execute on function public.get_or_create_opportunity_conversation(uuid, uuid) from anon;
revoke execute on function public.send_message(uuid, text) from anon;
revoke execute on function public.mark_conversation_read(uuid) from anon;
revoke execute on function public.delete_message(uuid) from anon;
