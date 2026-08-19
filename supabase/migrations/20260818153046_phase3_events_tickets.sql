-- ============================================================
-- PHASE 3b: real events, tickets, QR check-in
-- ============================================================

-- 1. Event fields
alter table public.events
  add column if not exists category text
    check (category is null or category in (
      'Networking','Career','Hiring','Community','Music','Arts','Technology',
      'Education','Sports/Fitness','Entrepreneurship','Government/Civic','Volunteer','FLOW Official'
    )),
  add column if not exists address text,
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists is_public boolean not null default true,
  add column if not exists featured boolean not null default false,
  add column if not exists image_url text,
  add column if not exists tags text[],
  add column if not exists age_restriction text,
  add column if not exists is_paid boolean not null default false,
  add column if not exists ticket_price_cents integer check (ticket_price_cents is null or ticket_price_cents >= 0);

-- 2. event_attendance becomes the real ticket record
alter table public.event_attendance
  add column if not exists id uuid unique not null default gen_random_uuid(),
  add column if not exists ticket_type text not null default 'general',
  add column if not exists price_cents integer not null default 0,
  add column if not exists checkin_code text unique,
  add column if not exists reserved_at timestamptz not null default now(),
  add column if not exists cancelled_at timestamptz,
  add column if not exists checked_in_by uuid references public.profiles(id),
  add column if not exists check_in_method text check (check_in_method is null or check_in_method in ('qr', 'manual', 'search'));

update public.event_attendance set checkin_code = upper(encode(gen_random_bytes(6), 'hex')) where checkin_code is null;
alter table public.event_attendance alter column checkin_code set not null;

create index if not exists event_attendance_checkin_code_idx on public.event_attendance (checkin_code);

-- 3. Ticket state machine — mirrors the Phase 2 applications trigger pattern.
-- The QR/checkin_code is opaque (random hex, not a database id) and is the
-- only thing exposed to the attendee's device or printed pass.
create or replace function public.enforce_attendance_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_is_owner boolean;
  v_taken int;
  v_checkin_opens timestamptz;
  v_checkin_closes timestamptz;
begin
  select * into v_event from public.events where id = new.event_id;
  if v_event is null then
    raise exception 'Event not found.';
  end if;
  v_is_owner := (auth.uid() = v_event.created_by);

  if tg_op = 'INSERT' then
    if v_event.status <> 'published' then
      raise exception 'This event is not open for registration.';
    end if;
    if now() > coalesce(v_event.ends_at, v_event.starts_at) then
      raise exception 'This event has already happened.';
    end if;
    if v_event.is_paid then
      raise exception 'Payment processing is not yet enabled for this event.';
    end if;
    if v_event.capacity is not null then
      select count(*) into v_taken from public.event_attendance
      where event_id = new.event_id and status in ('registered', 'attended');
      if v_taken >= v_event.capacity then
        raise exception 'This event is at capacity.';
      end if;
    end if;

    new.status := 'registered';
    new.ticket_type := 'general';
    new.price_cents := coalesce(v_event.ticket_price_cents, 0);
    new.reserved_at := now();
    new.checkin_code := upper(encode(gen_random_bytes(6), 'hex'));
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- tg_op = 'UPDATE' from here on — 'attended', 'cancelled', and 'no_show' are terminal.
  if old.status in ('attended', 'cancelled', 'no_show') then
    raise exception 'This ticket is already %  and cannot be changed.', old.status;
  end if;

  if old.status = new.status then
    return new;
  end if;

  if old.status = 'registered' and new.status = 'cancelled' then
    if auth.uid() <> old.profile_id then
      raise exception 'Only the ticket holder can cancel it.';
    end if;
    new.cancelled_at := now();
    return new;
  end if;

  if old.status = 'registered' and new.status = 'attended' then
    if not v_is_owner then
      raise exception 'Only the event organizer can check in a ticket.';
    end if;
    v_checkin_opens := v_event.starts_at - interval '60 minutes';
    v_checkin_closes := coalesce(v_event.ends_at, v_event.starts_at + interval '4 hours') + interval '120 minutes';
    if now() < v_checkin_opens or now() > v_checkin_closes then
      raise exception 'Check-in is only open from 1 hour before the event until 2 hours after it ends.';
    end if;
    new.checked_in_at := now();
    new.checked_in_by := auth.uid();
    return new;
  end if;

  if old.status = 'registered' and new.status = 'no_show' then
    if not v_is_owner then
      raise exception 'Only the event organizer can mark a no-show.';
    end if;
    return new;
  end if;

  raise exception 'Cannot move a ticket from % to %.', old.status, new.status;
end;
$$;

drop trigger if exists trg_enforce_attendance_lifecycle on public.event_attendance;
create trigger trg_enforce_attendance_lifecycle
  before insert or update on public.event_attendance
  for each row execute function public.enforce_attendance_lifecycle();

-- 4. Notifications + points on verified check-in (side effects, not the transition itself)
create or replace function public.on_attendance_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_title text;
  v_attendee_name text;
begin
  select created_by, title into v_owner_id, v_title from public.events where id = new.event_id;
  select coalesce(full_name, 'A FLOW member') into v_attendee_name from public.profiles where id = new.profile_id;

  perform public.notify(new.profile_id, 'ticket_reserved', 'You''re registered',
    'Your ticket for "' || v_title || '" is confirmed. Find your QR pass under My Tickets.', '/tickets');
  perform public.notify(v_owner_id, 'ticket_reserved', 'New registration',
    v_attendee_name || ' registered for "' || v_title || '".', '/business/events/' || new.event_id);

  return new;
end;
$$;

drop trigger if exists trg_on_attendance_inserted on public.event_attendance;
create trigger trg_on_attendance_inserted
  after insert on public.event_attendance
  for each row execute function public.on_attendance_inserted();

create or replace function public.on_attendance_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if old.status = new.status then
    return new;
  end if;

  select title into v_title from public.events where id = new.event_id;

  if new.status = 'attended' then
    perform set_config('flow.internal_write', 'true', true);
    update public.profiles set flow_points = flow_points + 25 where id = new.profile_id;
    insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, event_id)
    values (new.profile_id, 'earning', 0, 25, 'Verified attendance: ' || v_title, new.event_id);
    perform public.notify(new.profile_id, 'checkin_success', 'You''re checked in!',
      'Verified attendance at "' || v_title || '" — it''s now on your FLOW Passport.', '/passport');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_attendance_updated on public.event_attendance;
create trigger trg_on_attendance_updated
  after update on public.event_attendance
  for each row execute function public.on_attendance_updated();

-- 5. Event-level lifecycle notifications (cancel / material change)
create or replace function public.on_event_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att record;
begin
  if old.status <> 'cancelled' and new.status = 'cancelled' then
    for v_att in
      select profile_id from public.event_attendance
      where event_id = new.id and status in ('registered', 'attended')
    loop
      perform public.notify(v_att.profile_id, 'event_cancelled', 'Event cancelled',
        '"' || new.title || '" was cancelled by the organizer.', '/tickets');
    end loop;
  elsif new.status <> 'cancelled' and (old.starts_at <> new.starts_at or coalesce(old.venue, '') <> coalesce(new.venue, '')) then
    for v_att in
      select profile_id from public.event_attendance
      where event_id = new.id and status in ('registered', 'attended')
    loop
      perform public.notify(v_att.profile_id, 'event_changed', 'Event details changed',
        '"' || new.title || '" has an updated time or location — check your ticket.', '/tickets');
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_event_updated on public.events;
create trigger trg_on_event_updated
  after update on public.events
  for each row execute function public.on_event_updated();

-- 6. Check-in RPC — the only path that can move a ticket to 'attended'/'no_show'
-- from outside the ticket holder themselves. Accepts a QR/manual code OR a
-- direct profile_id (the "search fallback", since the organizer already has
-- legitimate read access to their own event's attendee list). Authorization
-- is re-checked inside the function itself (SECURITY DEFINER bypasses RLS),
-- and the trigger above is a second, independent guard on top of it.
create or replace function public.check_in_ticket(
  p_event_id uuid,
  p_checkin_code text default null,
  p_profile_id uuid default null,
  p_method text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_row record;
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event is null then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;
  if v_event.created_by <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if p_checkin_code is not null then
    select * into v_row from public.event_attendance where checkin_code = upper(p_checkin_code);
  elsif p_profile_id is not null then
    select * into v_row from public.event_attendance where event_id = p_event_id and profile_id = p_profile_id;
  else
    return jsonb_build_object('ok', false, 'reason', 'no_identifier');
  end if;

  if v_row is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_row.event_id <> p_event_id then
    return jsonb_build_object('ok', false, 'reason', 'wrong_event');
  end if;
  if v_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;
  if v_row.status = 'no_show' then
    return jsonb_build_object('ok', false, 'reason', 'no_show');
  end if;
  if v_row.status = 'attended' then
    return jsonb_build_object('ok', false, 'reason', 'already_checked_in', 'checked_in_at', v_row.checked_in_at);
  end if;

  update public.event_attendance
  set status = 'attended', check_in_method = p_method
  where event_id = v_row.event_id and profile_id = v_row.profile_id;

  return jsonb_build_object(
    'ok', true,
    'attendee_name', (select coalesce(full_name, 'FLOW member') from public.profiles where id = v_row.profile_id),
    'checked_in_at', now()
  );
end;
$$;

revoke execute on function public.check_in_ticket(uuid, text, uuid, text) from public, anon;

create or replace function public.mark_no_show(p_event_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event is null or v_event.created_by <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  update public.event_attendance set status = 'no_show'
  where event_id = p_event_id and profile_id = p_profile_id and status = 'registered';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found_or_not_registered');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.mark_no_show(uuid, uuid) from public, anon;

revoke execute on function public.enforce_attendance_lifecycle() from public, anon, authenticated;
revoke execute on function public.on_attendance_inserted() from public, anon, authenticated;
revoke execute on function public.on_attendance_updated() from public, anon, authenticated;
revoke execute on function public.on_event_updated() from public, anon, authenticated;
