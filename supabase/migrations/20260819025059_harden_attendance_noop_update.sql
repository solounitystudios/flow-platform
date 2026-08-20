-- The generated Insert type requires checkin_code (NOT NULL, no column
-- default) even though the trigger always overwrites it on every accepted
-- INSERT/UPDATE transition — so the client payload must include some
-- value for it. Rather than rely on "the client just happens not to send
-- price_cents/checkin_code" as the only thing preventing a same-status
-- no-op update (e.g. a duplicate register tap while already registered)
-- from clobbering the real checkin_code with whatever placeholder the
-- client sent, make the no-op branch return OLD unchanged instead of NEW.
-- This is correct by construction regardless of what any future caller's
-- payload contains — a true no-op transition must never let ANY client-
-- supplied field through.
create or replace function public.enforce_attendance_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    new.checkin_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- tg_op = 'UPDATE' from here on.

  -- True no-op: requested status equals current status. Return OLD
  -- unchanged so no client-supplied field (e.g. a placeholder
  -- checkin_code/price_cents sent only to satisfy a NOT NULL insert
  -- payload shape) can ever leak through on an idempotent repeat call.
  if old.status = new.status then
    return old;
  end if;

  -- Reactivation: a previously cancelled registrant may register again,
  -- subject to the same eligibility checks as a brand-new registration.
  -- Must be checked before the terminal-status rule below, or 'cancelled'
  -- would be treated as permanently final with no way back.
  if old.status = 'cancelled' and new.status = 'registered' then
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

    new.ticket_type := 'general';
    new.price_cents := coalesce(v_event.ticket_price_cents, 0);
    new.reserved_at := now();
    new.checkin_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- 'attended', 'cancelled', and 'no_show' are terminal for every other transition.
  if old.status in ('attended', 'cancelled', 'no_show') then
    raise exception 'This ticket is already %  and cannot be changed.', old.status;
  end if;

  if old.status = 'registered' and new.status = 'cancelled' then
    if auth.uid() <> old.profile_id then
      raise exception 'Only the ticket holder can cancel it.';
    end if;
    new.cancelled_at := now();

    delete from public.conversation_members cm
    using public.conversations c
    where cm.conversation_id = c.id
      and c.type = 'event'
      and c.event_id = new.event_id
      and cm.profile_id = old.profile_id;

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
$function$;
