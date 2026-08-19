-- ============================================================
-- PHASE 3c: notification types, achievements, rewards marketplace
-- ============================================================

-- 1. Expand notification types for events/points/achievements/rewards.
-- Migration 3b's triggers already reference these values, so this must
-- land before any live event/ticket activity happens.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'application_submitted', 'application_accepted', 'application_rejected',
  'opportunity_changed', 'opportunity_cancelled', 'gig_reminder',
  'completion_confirmed', 'recommendation_received',
  'ticket_reserved', 'event_reminder', 'event_changed', 'event_cancelled',
  'checkin_success', 'points_earned', 'achievement_unlocked', 'reward_redeemed'
));

-- 2. flow_ledger: structured source + event/redemption references
alter table public.flow_ledger drop constraint if exists flow_ledger_entry_type_check;
alter table public.flow_ledger add constraint flow_ledger_entry_type_check
  check (entry_type in ('earning', 'reward', 'adjustment', 'redemption'));

alter table public.flow_ledger
  add column if not exists source text
    check (source is null or source in ('gig_completed', 'event_attendance', 'achievement', 'redemption', 'adjustment')),
  add column if not exists event_id uuid references public.events(id);

-- 3. Achievements — a fixed catalog of verified-activity badges. Only
-- evaluate_achievements() (below) may write to profile_achievements; there
-- is no insert policy for any client role, so a user cannot award
-- themselves a badge.
create table if not exists public.achievements (
  key text primary key,
  title text not null,
  description text not null,
  icon text not null,
  points_bonus int not null default 0
);

insert into public.achievements (key, title, description, icon, points_bonus) values
  ('first_flow', 'First FLOW', 'Completed your first verified activity.', 'sparkles', 25),
  ('reliable_10', 'Reliable 10', 'Completed 10 opportunities.', 'shield-check', 100),
  ('community_builder', 'Community Builder', 'Completed 3 volunteer opportunities.', 'heart-handshake', 75),
  ('networked', 'Networked', 'Attended 5 verified networking events.', 'users', 50),
  ('flow_regular', 'FLOW Regular', 'Attended 10 verified events.', 'calendar-check', 100)
on conflict (key) do nothing;

alter table public.achievements enable row level security;
create policy achievements_public_read on public.achievements for select using (true);

create table if not exists public.profile_achievements (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key),
  earned_at timestamptz not null default now(),
  primary key (profile_id, achievement_key)
);

alter table public.profile_achievements enable row level security;
create policy profile_achievements_public_read on public.profile_achievements for select using (true);
-- No insert/update/delete policy for any client role — only evaluate_achievements() writes here.

create or replace function public.evaluate_achievements(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gigs_completed int;
  v_volunteer_completed int;
  v_events_attended int;
  v_networking_attended int;
  v_achievement record;
  v_earned boolean;
begin
  select count(*) into v_gigs_completed from public.applications where applicant_id = p_profile_id and status = 'completed';
  select count(*) into v_volunteer_completed from public.applications a
    join public.opportunities o on o.id = a.opportunity_id
    where a.applicant_id = p_profile_id and a.status = 'completed' and o.opportunity_type = 'volunteer';
  select count(*) into v_events_attended from public.event_attendance where profile_id = p_profile_id and status = 'attended';
  select count(*) into v_networking_attended from public.event_attendance ea
    join public.events e on e.id = ea.event_id
    where ea.profile_id = p_profile_id and ea.status = 'attended' and e.category = 'Networking';

  for v_achievement in select * from public.achievements loop
    if exists (select 1 from public.profile_achievements where profile_id = p_profile_id and achievement_key = v_achievement.key) then
      continue;
    end if;

    v_earned := case v_achievement.key
      when 'first_flow' then (v_gigs_completed + v_events_attended) >= 1
      when 'reliable_10' then v_gigs_completed >= 10
      when 'community_builder' then v_volunteer_completed >= 3
      when 'networked' then v_networking_attended >= 5
      when 'flow_regular' then v_events_attended >= 10
      else false
    end;

    if v_earned then
      insert into public.profile_achievements (profile_id, achievement_key) values (p_profile_id, v_achievement.key);

      if v_achievement.points_bonus > 0 then
        perform set_config('flow.internal_write', 'true', true);
        update public.profiles set flow_points = flow_points + v_achievement.points_bonus where id = p_profile_id;
        insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, source)
        values (p_profile_id, 'reward', 0, v_achievement.points_bonus, 'Achievement: ' || v_achievement.title, 'achievement');
      end if;

      perform public.notify(p_profile_id, 'achievement_unlocked', 'Achievement unlocked: ' || v_achievement.title,
        v_achievement.description, '/passport');
    end if;
  end loop;
end;
$$;

revoke execute on function public.evaluate_achievements(uuid) from public, anon, authenticated;

-- Wire achievement evaluation into the two verified-activity paths.
create or replace function public.on_application_updated()
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

  select title into v_title from public.opportunities where id = new.opportunity_id;

  if new.status = 'accepted' then
    perform public.maybe_fill_opportunity(new.opportunity_id);
    perform public.notify(new.applicant_id, 'application_accepted', 'You''re confirmed!',
      'You were accepted for "' || v_title || '".', '/work');
  elsif new.status = 'rejected' then
    perform public.notify(new.applicant_id, 'application_rejected', 'Application update',
      'You were not selected for "' || v_title || '".', '/applications');
  elsif new.status = 'completed' then
    perform set_config('flow.internal_write', 'true', true);
    update public.profiles set flow_points = flow_points + 40 where id = new.applicant_id;
    insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, opportunity_id, source)
    select new.applicant_id, 'earning', o.pay_cents, 40, o.title, o.id, 'gig_completed'
    from public.opportunities o where o.id = new.opportunity_id and o.pay_cents is not null;
    perform public.recompute_reliability(new.applicant_id);
    perform public.evaluate_achievements(new.applicant_id);
    perform public.notify(new.applicant_id, 'completion_confirmed', 'Gig completed',
      '"' || v_title || '" was marked complete. It''s now on your FLOW Passport.', '/passport');
  elsif new.status in ('no_show', 'cancelled') then
    perform public.recompute_reliability(new.applicant_id);
  end if;

  return new;
end;
$$;

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
    insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, event_id, source)
    values (new.profile_id, 'earning', 0, 25, 'Verified attendance: ' || v_title, new.event_id, 'event_attendance');
    perform public.evaluate_achievements(new.profile_id);
    perform public.notify(new.profile_id, 'checkin_success', 'You''re checked in!',
      'Verified attendance at "' || v_title || '" — it''s now on your FLOW Passport.', '/passport');
  end if;

  return new;
end;
$$;

revoke execute on function public.on_attendance_updated() from public, anon, authenticated;

-- 4. Rewards marketplace
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  partner text not null,
  description text,
  points_required int not null check (points_required > 0),
  inventory int check (inventory is null or inventory >= 0),
  redeemed_count int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  eligibility text,
  redemption_instructions text,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.rewards enable row level security;
create policy rewards_public_read on public.rewards for select using (true);
create policy rewards_owner_manage on public.rewards for all
  using (auth.uid() = created_by) with check (auth.uid() = created_by);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards(id),
  profile_id uuid not null references public.profiles(id),
  points_spent int not null,
  redemption_code text not null unique,
  status text not null default 'issued' check (status in ('issued', 'used', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);

alter table public.reward_redemptions enable row level security;
create policy redemptions_self_read on public.reward_redemptions for select using (auth.uid() = profile_id);
create policy redemptions_reward_owner_read on public.reward_redemptions for select
  using (exists (select 1 from public.rewards r where r.id = reward_id and r.created_by = auth.uid()));
-- No insert/update policy for any client role — only redeem_reward() writes here.

alter table public.flow_ledger add column if not exists redemption_id uuid references public.reward_redemptions(id);

-- Atomic, race-safe redemption: row locks on the reward and the profile
-- prevent two concurrent redemptions from over-spending points or inventory.
create or replace function public.redeem_reward(p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  v_code := upper(encode(gen_random_bytes(6), 'hex'));

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
$$;

revoke execute on function public.redeem_reward(uuid) from public, anon;

-- Seed a real FLOW-official rewards catalog (no partner accounts exist yet).
insert into public.rewards (title, partner, description, points_required, inventory, eligibility, redemption_instructions, status) values
  ('$10 Elmwood Fitness day pass', 'Elmwood Fitness Collective', 'One day pass to a local independent gym.', 400, 50, null, 'Show your redemption code at the front desk.', 'active'),
  ('15% off at The Dockside Tavern', 'The Dockside Tavern', 'Discount on your next visit.', 250, null, null, 'Show your redemption code to your server.', 'active'),
  ('FLOW branded tote bag', 'FLOW', 'Limited-run canvas tote.', 150, 100, null, 'Pick up at the next FLOW community event.', 'active'),
  ('Priority application badge (7 days)', 'FLOW', 'Your applications are highlighted to businesses for a week.', 300, null, null, 'Applied automatically to your account.', 'active')
on conflict do nothing;
