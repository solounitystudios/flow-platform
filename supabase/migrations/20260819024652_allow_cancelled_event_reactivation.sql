-- registerForEventAction only ever INSERTed, so a second attempt after
-- cancelling collided with the existing (event_id, profile_id) primary key
-- and was reported as "You're already registered" — even though the row
-- was cancelled. Separately, even an UPDATE-based reactivation would have
-- been blocked here: the trigger's UPDATE branch treats 'cancelled' as
-- terminal ("This ticket is already cancelled and cannot be changed").
--
-- Fix: add an explicit cancelled -> registered transition, checked before
-- the terminal-status rule, that re-validates the exact same eligibility
-- conditions as a brand-new registration (event published, not past, not
-- paid, capacity available) and resets the ticket fields the same way a
-- fresh INSERT does — including regenerating checkin_code via
-- extensions.gen_random_bytes(6), so a reactivated ticket gets a real,
-- valid check-in token rather than reusing the stale one. Capacity counts
-- (both here and the pre-existing INSERT check) only ever count
-- status in ('registered','attended'), so a cancelled row already never
-- occupied a capacity slot and reactivating it re-checks capacity fresh.
--
-- No other transition, no RLS policy, and no grant is touched — this is a
-- single new branch ahead of the existing terminal-status check.
--
-- Reversible: CREATE OR REPLACE restoring the terminal-status check as the
-- first statement in the UPDATE branch (i.e. removing this new branch)
-- reverts to the previous (broken) behavior.
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
$function$;
