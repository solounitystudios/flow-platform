-- Passport privacy at the database layer.
--
-- profiles.public_passport (added in add_passport_visibility) has never
-- actually gated anything: profile_credentials, profile_achievements, and
-- profile_skills all shipped with unconditional `for select using (true)`
-- policies, and the passport_summary view is security_invoker = false
-- (deliberately bypasses RLS for accurate aggregate counts) with no row
-- filter at all — so ANY row, for ANY profile, was directly queryable via
-- PostgREST regardless of the owner's privacy toggle. The Passport UI may
-- have respected the flag, but the database never did.
--
-- Fix: every Passport-linked table gets a single combined SELECT policy —
-- owner always reads their own rows; admins (is_flow_admin, not requiring
-- AAL2 — this is read-only display data, not a verification decision)
-- always read; everyone else only when the owning profile has
-- public_passport = true. Because that check is a correlated subquery
-- against public.profiles, it runs through profiles' own RLS — including
-- the existing profiles_block_restrict RESTRICTIVE policy — so a blocked
-- viewer is excluded here for free, the same way every other Passport
-- query already relies on that policy for blocking enforcement.
--
-- recommendations (testimonials) get the same treatment, plus the author
-- can always read what they wrote. verifications/verification_reviews
-- and match_recommendations are untouched — they were already correctly
-- self-or-admin-only.

-- is_flow_admin(boolean) previously had no anon EXECUTE grant (only ever
-- called from authenticated-only contexts before now). Every policy below
-- references it in an OR branch, and Postgres checks function EXECUTE
-- privilege at parse time for every function referenced in a query —
-- regardless of whether a boolean OR/AND short-circuits around it at
-- runtime. Without this grant, an anonymous visitor viewing any public
-- Passport page would get a permission-denied error instead of the
-- public data. For anon, auth.uid() is null, so is_flow_admin()
-- deterministically returns false — this grants no actual capability,
-- the same reasoning as is_blocked_between's existing anon grant.
grant execute on function public.is_flow_admin(boolean) to anon;

-- ── profile_credentials ────────────────────────────────────────────────

drop policy if exists profile_credentials_public_read on public.profile_credentials;

create policy profile_credentials_read on public.profile_credentials for select
  using (
    (select auth.uid()) = profile_id
    or public.is_flow_admin(false)
    or exists (
      select 1 from public.profiles p
      where p.id = profile_credentials.profile_id
        and p.public_passport = true
    )
  );

-- ── profile_achievements ───────────────────────────────────────────────

drop policy if exists profile_achievements_public_read on public.profile_achievements;

create policy profile_achievements_read on public.profile_achievements for select
  using (
    (select auth.uid()) = profile_id
    or public.is_flow_admin(false)
    or exists (
      select 1 from public.profiles p
      where p.id = profile_achievements.profile_id
        and p.public_passport = true
    )
  );

-- ── profile_skills ──────────────────────────────────────────────────────
-- Owner read is already covered by profile_skills_self_manage (an ALL
-- policy, which includes SELECT) — only the public-facing read needs the
-- privacy gate. Admin read is added since verification review needs it.

drop policy if exists profile_skills_public_read on public.profile_skills;

create policy profile_skills_read on public.profile_skills for select
  using (
    public.is_flow_admin(false)
    or exists (
      select 1 from public.profiles p
      where p.id = profile_skills.profile_id
        and p.public_passport = true
    )
  );

-- ── recommendations (Passport testimonials) ───────────────────────────

drop policy if exists recommendations_public_read on public.recommendations;

create policy recommendations_read on public.recommendations for select
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = recipient_id
    or public.is_flow_admin(false)
    or exists (
      select 1 from public.profiles p
      where p.id = recommendations.recipient_id
        and p.public_passport = true
    )
  );

-- ── passport_summary view ──────────────────────────────────────────────
-- security_invoker stays false (phase2_security_hardening's reasoning
-- still holds: counts must be accurate for any legitimate viewer, not
-- undercounted by RLS on the underlying application/attendance rows) —
-- but the view previously had NO row filter at all, so it returned a row
-- for every profile unconditionally, private or not. Add the same
-- owner-or-public-or-admin gate as the tables above, plus explicit
-- blocking exclusion (this view bypasses RLS entirely, so profiles'
-- block-restrict policy doesn't apply here the way it does in a normal
-- query — it has to be re-stated).
create or replace view public.passport_summary as
select p.id,
 p.username,
 p.full_name,
 p.city,
 p.state,
 p.available_now,
 p.reliability_score,
 p.flow_points,
 (select count(*) from public.applications a where a.applicant_id=p.id and a.status='completed') as gigs_completed,
 (select count(*) from public.profile_skills ps where ps.profile_id=p.id and ps.verified=true) as skills_verified,
 (select count(*) from public.event_attendance ea where ea.profile_id=p.id and ea.status='attended') as events_attended,
 (select count(*) from public.recommendations r where r.recipient_id=p.id) as recommendations,
 coalesce((select sum(l.amount_cents) from public.flow_ledger l where l.profile_id=p.id and l.entry_type='earning'),0) as earned_cents
from public.profiles p
where (
  p.public_passport = true
  or p.id = (select auth.uid())
  or public.is_flow_admin(false)
)
and not public.is_blocked_between(p.id, (select auth.uid()));

comment on view public.passport_summary is
  'Public aggregate Passport stats. security_invoker=false so counts stay accurate across RLS-restricted application/attendance rows, but row visibility itself is explicitly gated here: owner, admin, or public_passport=true only, and blocked pairs are excluded explicitly since this view does not inherit profiles RLS.';
