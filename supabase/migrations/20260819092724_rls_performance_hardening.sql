-- Performance advisor: RLS policies calling auth.uid() (and functions that
-- take it as an argument) directly get re-evaluated once per row scanned,
-- since the planner can't prove a volatile-looking per-row call is safe to
-- hoist. Wrapping it as (select auth.uid()) lets Postgres evaluate it once
-- per statement (an InitPlan) instead. This migration only rewraps the
-- existing predicates on the highest-traffic tables — no policy changes
-- meaning at all, verified qual-for-qual against the current definitions.

-- ── profiles ────────────────────────────────────────────────────────────

drop policy if exists profiles_block_restrict on public.profiles;
create policy profiles_block_restrict on public.profiles for select
  using ((select auth.uid()) = id or not public.is_blocked_between((select auth.uid()), id));

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ── opportunities ───────────────────────────────────────────────────────

drop policy if exists opportunities_creator_manage on public.opportunities;
create policy opportunities_creator_manage on public.opportunities for all
  using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);

drop policy if exists opportunities_public_read on public.opportunities;
create policy opportunities_public_read on public.opportunities for select
  using (status <> 'draft' or (select auth.uid()) = created_by);

-- ── events ──────────────────────────────────────────────────────────────

drop policy if exists events_creator_manage on public.events;
create policy events_creator_manage on public.events for all
  using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);

drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events for select
  using (status <> 'draft' or (select auth.uid()) = created_by);

-- ── applications ────────────────────────────────────────────────────────

drop policy if exists applications_parties_read on public.applications;
create policy applications_parties_read on public.applications for select
  using (
    (select auth.uid()) = applicant_id
    or exists (select 1 from public.opportunities o where o.id = applications.opportunity_id and o.created_by = (select auth.uid()))
  );

drop policy if exists applications_self_insert on public.applications;
create policy applications_self_insert on public.applications for insert
  with check ((select auth.uid()) = applicant_id);

drop policy if exists applications_self_update on public.applications;
create policy applications_self_update on public.applications for update
  using ((select auth.uid()) = applicant_id) with check ((select auth.uid()) = applicant_id);

drop policy if exists applications_owner_update on public.applications;
create policy applications_owner_update on public.applications for update
  using (exists (select 1 from public.opportunities o where o.id = applications.opportunity_id and o.created_by = (select auth.uid())))
  with check (exists (select 1 from public.opportunities o where o.id = applications.opportunity_id and o.created_by = (select auth.uid())));

-- ── event_attendance ────────────────────────────────────────────────────

drop policy if exists attendance_participant_read on public.event_attendance;
create policy attendance_participant_read on public.event_attendance for select
  using (
    (select auth.uid()) = profile_id
    or exists (select 1 from public.events e where e.id = event_attendance.event_id and e.created_by = (select auth.uid()))
  );

drop policy if exists attendance_self_insert on public.event_attendance;
create policy attendance_self_insert on public.event_attendance for insert
  with check ((select auth.uid()) = profile_id);

drop policy if exists attendance_self_cancel on public.event_attendance;
create policy attendance_self_cancel on public.event_attendance for update
  using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- ── notifications ───────────────────────────────────────────────────────

drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications for select
  using ((select auth.uid()) = profile_id);

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications for update
  using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- ── messages / conversations / conversation_members ───────────────────

drop policy if exists conversations_member_read on public.conversations;
create policy conversations_member_read on public.conversations for select
  using (public.is_conversation_member(id, (select auth.uid())));

drop policy if exists conversation_members_read on public.conversation_members;
create policy conversation_members_read on public.conversation_members for select
  using (public.is_conversation_member(conversation_id, (select auth.uid())));

drop policy if exists messages_member_read on public.messages;
create policy messages_member_read on public.messages for select
  using (public.is_conversation_member(conversation_id, (select auth.uid())));

-- ── member_intents ──────────────────────────────────────────────────────

drop policy if exists member_intents_self_all on public.member_intents;
create policy member_intents_self_all on public.member_intents for all
  using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- ── match_recommendations ───────────────────────────────────────────────

drop policy if exists match_recommendations_self_read on public.match_recommendations;
create policy match_recommendations_self_read on public.match_recommendations for select
  using ((select auth.uid()) = profile_id);

drop policy if exists match_recommendations_self_update on public.match_recommendations;
create policy match_recommendations_self_update on public.match_recommendations for update
  using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

-- ── profile_skills ──────────────────────────────────────────────────────

drop policy if exists profile_skills_self_manage on public.profile_skills;
create policy profile_skills_self_manage on public.profile_skills for all
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id and verified = false);

-- ── referrals ───────────────────────────────────────────────────────────

drop policy if exists referrals_self_manage on public.referrals;
create policy referrals_self_manage on public.referrals for all
  using ((select auth.uid()) = referrer_id) with check ((select auth.uid()) = referrer_id);

-- ── rewards / reward_redemptions ────────────────────────────────────────

drop policy if exists rewards_owner_manage on public.rewards;
create policy rewards_owner_manage on public.rewards for all
  using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);

drop policy if exists redemptions_self_read on public.reward_redemptions;
create policy redemptions_self_read on public.reward_redemptions for select
  using ((select auth.uid()) = profile_id);

drop policy if exists redemptions_reward_owner_read on public.reward_redemptions;
create policy redemptions_reward_owner_read on public.reward_redemptions for select
  using (exists (select 1 from public.rewards r where r.id = reward_redemptions.reward_id and r.created_by = (select auth.uid())));
