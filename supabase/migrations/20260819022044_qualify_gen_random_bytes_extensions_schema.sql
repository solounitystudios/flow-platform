-- gen_random_bytes (and the rest of pgcrypto: crypt, digest, encrypt, hmac)
-- lives in the `extensions` schema on this project, not pg_catalog — unlike
-- gen_random_uuid(), which is native to Postgres core and always resolves
-- regardless of search_path. Both functions below call gen_random_bytes(6)
-- unqualified while running under `SET search_path TO 'public'`, so Postgres
-- can't find it: "function gen_random_bytes(integer) does not exist". This
-- broke every ticket registration (enforce_attendance_lifecycle fires as a
-- BEFORE INSERT trigger on event_attendance, so the INSERT itself failed)
-- and would have broken every reward redemption (redeem_reward) the same
-- way the first time it ran.
--
-- Fix: schema-qualify the call as extensions.gen_random_bytes(6) in both
-- functions. Everything else — SECURITY DEFINER, SET search_path TO
-- 'public', all business logic — is byte-identical to before.
--
-- Reversible: CREATE OR REPLACE with gen_random_bytes(6) unqualified restores
-- the prior (broken) behavior.

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
$function$;

create or replace function public.redeem_reward(p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reward record;
  v_balance int;
  v_code text;
  v_redemption_id uuid;
begin
  select * into v_reward from public.rewards where id = p_reward_id for update;
  if v_reward is null or v_reward.status <> 'active' then
    raise exception 'This reward is not available.';
  end if;
  if v_reward.starts_at is not null and now() < v_reward.starts_at then
    raise exception 'This reward is not available yet.';
  end if;
  if v_reward.ends_at is not null and now() > v_reward.ends_at then
    raise exception 'This reward has expired.';
  end if;
  if v_reward.inventory is not null and v_reward.redeemed_count >= v_reward.inventory then
    raise exception 'This reward is out of stock.';
  end if;

  select flow_points into v_balance from public.profiles where id = auth.uid() for update;
  if v_balance is null or v_balance < v_reward.points_required then
    raise exception 'Not enough FLOW Points.';
  end if;

  v_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));

  perform set_config('flow.internal_write', 'true', true);
  update public.profiles set flow_points = flow_points - v_reward.points_required where id = auth.uid();
  update public.rewards set redeemed_count = redeemed_count + 1 where id = p_reward_id;

  insert into public.reward_redemptions (reward_id, profile_id, points_spent, redemption_code)
  values (p_reward_id, auth.uid(), v_reward.points_required, v_code)
  returning id into v_redemption_id;

  insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, source, redemption_id)
  values (auth.uid(), 'redemption', 0, -v_reward.points_required, 'Redeemed: ' || v_reward.title, 'redemption', v_redemption_id);

  perform public.notify(auth.uid(), 'reward_redeemed', 'Reward redeemed',
    v_reward.title || ' — your code is in My Rewards.', '/rewards');

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id, 'code', v_code);
end;
$function$;
