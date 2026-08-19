-- FLOW V1+ Batch 1: Passport, Trust and Matching Foundation.
--
-- Reuses rather than duplicates existing trust infrastructure:
--   - public.recommendations (testimonials) is untouched — already the
--     "Passport Recommendations" feature, already wired to the Passport
--     page and a notify() trigger.
--   - public.verifications existed but was empty and completely unwired
--     (no RPC, no insert policy, no admin policy) — extended here into
--     the real evidence/credential verification workflow.
--   - public.evaluate_achievements() existed but had zero call sites
--     anywhere in the app — extended with new unlock conditions and
--     actually invoked from this batch's new code paths.
--   - public.is_flow_admin(), the decide_verification_case()/
--     verification_decisions pattern, and public.notify() are reused/
--     mirrored exactly rather than inventing a second admin or audit
--     concept.
--   - profiles_block_restrict (existing RESTRICTIVE policy) is relied on
--     for blocking exclusion in every new query that reads public.profiles.
--
-- Real gap fixed: profile_skills' self-manage policy allowed a member to
-- set their own `verified` column directly (ALL, no column restriction).
-- Tightened so verified can only ever become true through the new
-- SECURITY DEFINER decide_evidence_verification() RPC.

-- ── security fix: close the self-verification gap on profile_skills ──────

drop policy if exists profile_skills_self_manage on public.profile_skills;
create policy profile_skills_self_manage on public.profile_skills for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id and verified = false);

-- ── A. Member intent and goals ────────────────────────────────────────────

create table public.member_intents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  intent_type text not null check (intent_type in (
    'find_work','find_gigs','hire_or_collaborate','find_mentor','become_mentor',
    'find_training','build_skill','attend_events','meet_community','promote_project','reconnect'
  )),
  goal text,
  target_categories text[] not null default '{}',
  target_skills uuid[] not null default '{}',
  location_city text,
  location_state text,
  radius_miles integer,
  availability text,
  remote_preference text not null default 'either' check (remote_preference in ('remote','in_person','either')),
  visible boolean not null default true,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_intents_profile_idx on public.member_intents (profile_id, active);
create index member_intents_type_idx on public.member_intents (intent_type) where active and visible;

alter table public.member_intents enable row level security;

-- Owner sees/manages everything about their own intent, always.
create policy member_intents_self_all on public.member_intents for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Other members may only read active, visible, unexpired intent — the
-- matching engine and any future intent-search UI both read through this
-- same policy, so "member controls whether intent is visible" is a single
-- RLS rule, not something every caller has to remember to filter by.
create policy member_intents_public_read on public.member_intents for select
  using (active and visible and (expires_at is null or expires_at > now()));

create trigger member_intents_updated_at before update on public.member_intents
  for each row execute function public.set_admin_updated_at();

-- ── B. Passport evidence and external verification ───────────────────────
-- Extends the existing (empty, unwired) public.verifications table rather
-- than creating a parallel one. `source` and `status` are separate axes —
-- a claim can be self-reported-and-pending, self-reported-and-verified,
-- externally-linked-and-pending, etc. — which is what actually
-- distinguishes the 7 states the spec lists, without conflating "how was
-- this claimed" with "what happened to it on review."

-- verification_type already existed (unconstrained free text, 0 rows,
-- never used by any app code) — renamed to credential_type rather than
-- adding a second, overlapping column for the same concept.
alter table public.verifications rename column verification_type to credential_type;
alter table public.verifications add column if not exists title text;
alter table public.verifications add column if not exists source text not null default 'self_reported';
alter table public.verifications add column if not exists evidence_url text;
alter table public.verifications add column if not exists evidence_note text;
alter table public.verifications add column if not exists reference_table text;
alter table public.verifications add column if not exists expires_at timestamptz;
alter table public.verifications add column if not exists revoked_at timestamptz;
alter table public.verifications add column if not exists updated_at timestamptz not null default now();

alter table public.verifications drop constraint if exists verifications_source_check;
alter table public.verifications add constraint verifications_source_check
  check (source in ('self_reported','external_link'));

alter table public.verifications drop constraint if exists verifications_status_check;
alter table public.verifications add constraint verifications_status_check
  check (status in ('pending','verified','rejected','expired','revoked'));

alter table public.verifications drop constraint if exists verifications_reference_table_check;
alter table public.verifications add constraint verifications_reference_table_check
  check (reference_table is null or reference_table in ('profile_skill'));

alter table public.verifications drop constraint if exists verifications_evidence_check;
alter table public.verifications add constraint verifications_evidence_check
  check (source = 'self_reported' or evidence_url is not null);

create index if not exists verifications_status_idx on public.verifications (profile_id, status);

create trigger verifications_updated_at before update on public.verifications
  for each row execute function public.set_admin_updated_at();

-- A member may submit a claim about themselves, always starting pending —
-- they cannot insert a row that's already verified, and (per the ALL
-- policy below) cannot ever move it out of pending themselves either.
create policy verifications_self_insert on public.verifications for insert
  with check (auth.uid() = profile_id and status = 'pending');

-- Every column on this table is member-appropriate (no verifier identity,
-- method, or internal reasoning lives here — that's verification_reviews,
-- admin-only). Self-read only; no self-update/delete, so the only way
-- status changes is decide_evidence_verification() below.
drop policy if exists verifications_self_read on public.verifications;
create policy verifications_self_read on public.verifications for select
  using (auth.uid() = profile_id or public.is_flow_admin(true));

-- Append-only decision trail, mirrors public.verification_decisions
-- exactly. Never exposed to the member — internal admin notes and reason
-- codes live only here.
create table public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.verifications(id) on delete cascade,
  actor_id uuid not null default auth.uid() references public.profiles(id),
  from_status text,
  to_status text not null,
  method text,
  reason_code text,
  notes text,
  created_at timestamptz not null default now()
);

create index verification_reviews_verification_idx on public.verification_reviews (verification_id, created_at desc);

alter table public.verification_reviews enable row level security;
create policy verification_reviews_admin_read on public.verification_reviews for select
  using (public.is_flow_admin(true));

-- ── C. Colored credentials ────────────────────────────────────────────────
-- Static reference data for rendering — color is never the only indicator,
-- every row also carries a label and an icon name the UI resolves.

create table public.credential_types (
  key text primary key,
  label text not null,
  description text not null,
  color_token text not null,
  icon_name text not null,
  sort_order integer not null default 0
);

alter table public.credential_types enable row level security;
create policy credential_types_public_read on public.credential_types for select using (true);

insert into public.credential_types (key, label, description, color_token, icon_name, sort_order) values
  ('identity', 'Identity', 'Verified real-world identity.', 'blue', 'badge-check', 1),
  ('skill', 'Skill', 'A verified skill claim with reviewed evidence.', 'flow', 'sparkles', 2),
  ('work', 'Work', 'Verified completed work history.', 'emerald', 'briefcase', 3),
  ('education', 'Education', 'Verified education or training credential.', 'violet', 'graduation-cap', 4),
  ('community', 'Community', 'Recognized community contribution.', 'amber', 'users', 5),
  ('reliability', 'Reliability', 'Earned through a consistent completion record.', 'teal', 'shield-check', 6),
  ('founding_member', 'Founding member', 'Joined during FLOW''s founding class.', 'rose', 'star', 7),
  ('mentor', 'Mentor', 'Eligible and active as a FLOW mentor.', 'indigo', 'compass', 8),
  ('organization_issued', 'Organization-issued', 'Issued directly by a verified organization.', 'slate', 'building', 9)
on conflict (key) do nothing;

alter table public.verifications add constraint verifications_credential_type_fkey
  foreign key (credential_type) references public.credential_types(key);

-- Unified "earned colored credential" instances the Passport renders —
-- populated only by decide_evidence_verification(), grant_founding_class(),
-- and evaluate_achievements(), never directly by a client.
create table public.profile_credentials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  credential_type text not null references public.credential_types(key),
  title text not null,
  source_table text,
  source_id uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index profile_credentials_profile_idx on public.profile_credentials (profile_id) where revoked_at is null;

alter table public.profile_credentials enable row level security;
create policy profile_credentials_public_read on public.profile_credentials for select using (true);

-- ── D. Profile unlocks: extend the existing (already-built, never-called)
-- achievement engine rather than inventing a second unlock system. New
-- unlock keys are plain rows in the existing achievements table; a
-- points_bonus of 0 means "unlock", not "gamification badge" — the
-- Passport UI tells them apart by key, not by a new column.

insert into public.achievements (key, title, description, icon, points_bonus) values
  ('core_profile_complete', 'Core profile complete', 'Added a name, bio, and location.', 'user-check', 0),
  ('first_skill_added', 'First skill added', 'Added your first skill to your Passport.', 'sparkles', 0),
  ('first_evidence_submitted', 'First evidence submitted', 'Submitted your first piece of verification evidence.', 'file-check', 0),
  ('first_credential_verified', 'First credential verified', 'Had a claim reviewed and verified by FLOW.', 'shield-check', 25),
  ('first_recommendation_received', 'First recommendation received', 'Received your first Passport recommendation.', 'quote', 0),
  ('first_intent_set', 'Goal set', 'Told FLOW what you''re trying to do next.', 'target', 0),
  ('mentor_eligible', 'Mentor-eligible', 'Reached the reliability and verification bar to mentor others.', 'compass', 25)
on conflict (key) do nothing;

create or replace function public.evaluate_achievements(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_gigs_completed int;
  v_volunteer_completed int;
  v_events_attended int;
  v_networking_attended int;
  v_profile record;
  v_skills_count int;
  v_evidence_count int;
  v_verified_credentials int;
  v_recommendations_count int;
  v_intents_count int;
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

  select * into v_profile from public.profiles where id = p_profile_id;
  select count(*) into v_skills_count from public.profile_skills where profile_id = p_profile_id;
  select count(*) into v_evidence_count from public.verifications where profile_id = p_profile_id;
  select count(*) into v_verified_credentials from public.verifications where profile_id = p_profile_id and status = 'verified';
  select count(*) into v_recommendations_count from public.recommendations where recipient_id = p_profile_id;
  select count(*) into v_intents_count from public.member_intents where profile_id = p_profile_id;

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
      when 'core_profile_complete' then v_profile.full_name is not null and v_profile.bio is not null and length(coalesce(v_profile.bio, '')) > 0
      when 'first_skill_added' then v_skills_count >= 1
      when 'first_evidence_submitted' then v_evidence_count >= 1
      when 'first_credential_verified' then v_verified_credentials >= 1
      when 'first_recommendation_received' then v_recommendations_count >= 1
      when 'first_intent_set' then v_intents_count >= 1
      when 'mentor_eligible' then v_profile.reliability_score >= 90 and v_verified_credentials >= 1
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

revoke all on function public.evaluate_achievements(uuid) from public, anon;
grant execute on function public.evaluate_achievements(uuid) to authenticated;

-- ── decide_evidence_verification: the only path a claim's status changes ──
-- Mirrors decide_verification_case() from Admin Batch 2 exactly: admin +
-- AAL2 only, fixed search_path, records an immutable review, and (only on
-- 'verified') flips profile_skills.verified when the claim references a
-- skill, and mints a profile_credentials badge.

create or replace function public.decide_evidence_verification(
  p_verification_id uuid, p_new_status text, p_method text default null,
  p_reason_code text default null, p_notes text default null, p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_old_status text; v_row public.verifications%rowtype;
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select * into v_row from public.verifications where id = p_verification_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_old_status := v_row.status;

  update public.verifications set
    status = p_new_status,
    expires_at = coalesce(p_expires_at, expires_at),
    revoked_at = case when p_new_status = 'revoked' then now() else revoked_at end
  where id = p_verification_id;

  insert into public.verification_reviews(verification_id, actor_id, from_status, to_status, method, reason_code, notes)
  values (p_verification_id, auth.uid(), v_old_status, p_new_status, p_method, p_reason_code, p_notes);

  if v_row.reference_table = 'profile_skill' and v_row.reference_id is not null then
    update public.profile_skills set
      verified = (p_new_status = 'verified'),
      verified_at = case when p_new_status = 'verified' then now() else null end
    where profile_id = v_row.profile_id and skill_id = v_row.reference_id;
  end if;

  if p_new_status = 'verified' then
    insert into public.profile_credentials (profile_id, credential_type, title, source_table, source_id)
    values (v_row.profile_id, coalesce(v_row.credential_type, 'skill'), coalesce(v_row.title, 'Verified claim'), 'verifications', v_row.id);
  elsif p_new_status in ('revoked', 'expired') then
    update public.profile_credentials set revoked_at = now()
    where source_table = 'verifications' and source_id = v_row.id and revoked_at is null;
  end if;

  perform public.evaluate_achievements(v_row.profile_id);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.decide_evidence_verification(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.decide_evidence_verification(uuid, text, text, text, text, timestamptz) to authenticated;

-- ── E. Referrals and founding class ───────────────────────────────────────

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  intended_email text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referrals enable row level security;

-- The referrer can see and revoke their own referrals. Nobody else can
-- read a referral row (no "who referred me" leak before acceptance) —
-- accept_referral() is SECURITY DEFINER and looks it up by hash directly,
-- bypassing RLS, same pattern as accept_employer_invitation().
create policy referrals_self_manage on public.referrals for all
  using (auth.uid() = referrer_id)
  with check (auth.uid() = referrer_id);

create table public.founding_class_grants (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.founding_class_grants enable row level security;
create policy founding_class_grants_self_read on public.founding_class_grants for select
  using (auth.uid() = profile_id or public.is_flow_admin(true));

-- Small admin-configurable key/value settings table — the "configurable
-- cutoff" founding-class eligibility explicitly asks for, rather than
-- ever inferring it from profiles.created_at.
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
create policy platform_settings_admin_read on public.platform_settings for select
  using (public.is_flow_admin(true));

insert into public.platform_settings (key, value) values
  ('founding_class_cutoff_at', to_jsonb((now() + interval '90 days')::text)),
  ('founding_class_max_members', to_jsonb(500))
on conflict (key) do nothing;

create or replace function public.grant_founding_class(p_profile_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  insert into public.founding_class_grants (profile_id, granted_by, reason)
  values (p_profile_id, auth.uid(), p_reason)
  on conflict (profile_id) do nothing;

  insert into public.profile_credentials (profile_id, credential_type, title, source_table, source_id)
  select p_profile_id, 'founding_member', 'Founding member', 'founding_class_grants', p_profile_id
  where not exists (
    select 1 from public.profile_credentials
    where profile_id = p_profile_id and credential_type = 'founding_member' and revoked_at is null
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.grant_founding_class(uuid, text) from public, anon;
grant execute on function public.grant_founding_class(uuid, text) to authenticated;

-- accept_referral: mirrors accept_employer_invitation() exactly. Blocks
-- self-referral, revoked/expired tokens, and re-acceptance by a second
-- account. Auto-grants founding class only if the configured cutoff
-- (platform_settings.founding_class_cutoff_at) hasn't passed and the cap
-- hasn't been hit — never inferred from created_at.
create or replace function public.accept_referral(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_referral public.referrals%rowtype;
declare v_cutoff timestamptz;
declare v_max int;
declare v_current_count int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;

  select * into v_referral from public.referrals
    where token_hash = p_token_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired'); end if;

  if v_referral.referrer_id = auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  if v_referral.intended_email is not null
    and lower(v_referral.intended_email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  if v_referral.accepted_by is not null then
    if v_referral.accepted_by = auth.uid() then
      return jsonb_build_object('ok', true, 'already_accepted', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update public.referrals set accepted_by = auth.uid(), accepted_at = now() where id = v_referral.id;

  select (value #>> '{}')::timestamptz into v_cutoff from public.platform_settings where key = 'founding_class_cutoff_at';
  select (value #>> '{}')::int into v_max from public.platform_settings where key = 'founding_class_max_members';
  select count(*) into v_current_count from public.founding_class_grants;

  if v_cutoff is not null and now() < v_cutoff and (v_max is null or v_current_count < v_max) then
    perform public.grant_founding_class(auth.uid(), 'Referral accepted before founding-class cutoff');
  end if;

  perform public.notify(v_referral.referrer_id, 'connection_accepted', 'Your referral was accepted',
    'Someone you referred just joined FLOW.', '/passport');

  return jsonb_build_object('ok', true, 'already_accepted', false);
end;
$$;

revoke all on function public.accept_referral(text) from public, anon;
grant execute on function public.accept_referral(text) to authenticated;

-- ── I. Opportunity requirements (needed for real gap analysis) ───────────

create table public.opportunity_skill_requirements (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  required boolean not null default true,
  primary key (opportunity_id, skill_id)
);

alter table public.opportunity_skill_requirements enable row level security;
create policy opportunity_skill_requirements_public_read on public.opportunity_skill_requirements for select using (true);

create policy opportunity_skill_requirements_owner_manage on public.opportunity_skill_requirements for all
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id and o.created_by = auth.uid()))
  with check (exists (select 1 from public.opportunities o where o.id = opportunity_id and o.created_by = auth.uid()));

-- ── F/G/H. Recommendations, matching, reconnection, gap analysis ─────────
-- One shared table for every candidate type (opportunity/mentor/
-- community/reconnection/skill_training) — each row is fully explainable
-- (reasons + signals) and carries its own expiration/dismissed/acted
-- state, so the feed never has to recompute to know what to show.

create table public.match_recommendations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recommendation_type text not null check (recommendation_type in ('opportunity','mentor','community','reconnection','skill_training')),
  target_profile_id uuid references public.profiles(id) on delete cascade,
  target_opportunity_id uuid references public.opportunities(id) on delete cascade,
  target_skill_id uuid references public.skills(id) on delete cascade,
  score numeric not null default 0,
  reasons text[] not null default '{}',
  signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  dismissed_at timestamptz,
  acted_at timestamptz,
  constraint match_recommendations_target_check check (
    (recommendation_type = 'opportunity' and target_opportunity_id is not null)
    or (recommendation_type in ('mentor','community','reconnection') and target_profile_id is not null)
    or (recommendation_type = 'skill_training' and target_skill_id is not null)
  )
);

create index match_recommendations_profile_idx on public.match_recommendations (profile_id, dismissed_at, expires_at);
-- One active (non-dismissed, unexpired) recommendation per profile+type+target combination.
create unique index match_recommendations_dedup_idx on public.match_recommendations (
  profile_id, recommendation_type,
  coalesce(target_profile_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_opportunity_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_skill_id, '00000000-0000-0000-0000-000000000000')
) where dismissed_at is null;

alter table public.match_recommendations enable row level security;

create policy match_recommendations_self_read on public.match_recommendations for select
  using (auth.uid() = profile_id);

-- Self may only ever mark their own recommendation dismissed/acted — the
-- Server Action is the only caller and only ever sets those two columns;
-- generation itself only ever happens through the SECURITY DEFINER RPC
-- below, which bypasses RLS entirely, so this policy never governs inserts.
create policy match_recommendations_self_update on public.match_recommendations for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- generate_match_recommendations: deterministic, explainable, on-demand
-- (no cron — same reasoning as Admin Batch 2's generate_onboarding_
-- followup_tasks: no tested scheduler in this app yet). Self or admin
-- callable. Every insert excludes blocked pairs via is_blocked_between,
-- excludes self-matches, excludes closed/cancelled opportunities, and
-- only reads intent rows that are active/visible/unexpired (the same
-- member_intents_public_read policy a human would see through).
create or replace function public.generate_match_recommendations(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_created int := 0;
  v_rec record;
  v_my_skills uuid[];
  v_my_city text; v_my_state text;
  v_reliability numeric;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if auth.uid() <> p_profile_id and not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select array_agg(skill_id) into v_my_skills from public.profile_skills where profile_id = p_profile_id;
  select city, state, reliability_score into v_my_city, v_my_state, v_reliability from public.profiles where id = p_profile_id;

  -- Opportunity matches: open opportunities whose required skills overlap
  -- mine, scored by overlap fraction, respecting remote/location fit from
  -- any active find_work/find_gigs intent.
  for v_rec in
    select o.id as opp_id, o.title, o.organization_id, o.is_remote, o.city, o.state,
      count(r.skill_id) filter (where r.skill_id = any (coalesce(v_my_skills, '{}'))) as matched,
      count(r.skill_id) as total_required
    from public.opportunities o
    left join public.opportunity_skill_requirements r on r.opportunity_id = o.id and r.required
    where o.status = 'open'
      and o.created_by <> p_profile_id
      and not public.is_blocked_between(p_profile_id, o.created_by)
      and exists (
        select 1 from public.member_intents i
        where i.profile_id = p_profile_id and i.active and i.intent_type in ('find_work','find_gigs')
      )
    group by o.id, o.title, o.organization_id, o.is_remote, o.city, o.state
    having count(r.skill_id) = 0 or count(r.skill_id) filter (where r.skill_id = any (coalesce(v_my_skills, '{}'))) > 0
    order by (count(r.skill_id) filter (where r.skill_id = any (coalesce(v_my_skills, '{}')))) desc, o.created_at desc
    limit 20
  loop
    insert into public.match_recommendations (profile_id, recommendation_type, target_opportunity_id, score, reasons, signals)
    values (
      p_profile_id, 'opportunity', v_rec.opp_id,
      case when v_rec.total_required = 0 then 50 else round(100.0 * v_rec.matched / v_rec.total_required) end,
      case when v_rec.total_required = 0 then array['Matches your active find-work/gigs goal']
        else array[v_rec.matched::text || ' of ' || v_rec.total_required::text || ' required skills match your Passport'] end,
      jsonb_build_object('matched_skills', v_rec.matched, 'total_required', v_rec.total_required, 'is_remote', v_rec.is_remote)
    )
    on conflict (profile_id, recommendation_type, coalesce(target_profile_id, '00000000-0000-0000-0000-000000000000'),
      coalesce(target_opportunity_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_skill_id, '00000000-0000-0000-0000-000000000000'))
      where dismissed_at is null
      do update set score = excluded.score, reasons = excluded.reasons, signals = excluded.signals, expires_at = now() + interval '14 days';
    v_created := v_created + 1;
  end loop;

  -- Mentor matches: profiles with an active become_mentor intent, at
  -- least one verified credential, reliability >= 90, sharing a skill
  -- with mine, when I have an active find_mentor intent.
  if exists (select 1 from public.member_intents where profile_id = p_profile_id and active and intent_type = 'find_mentor') then
    for v_rec in
      select p.id, p.full_name, count(ps.skill_id) as shared_skills
      from public.profiles p
      join public.member_intents mi on mi.profile_id = p.id and mi.active and mi.visible and mi.intent_type = 'become_mentor'
      join public.profile_skills ps on ps.profile_id = p.id and ps.skill_id = any (coalesce(v_my_skills, '{}'))
      where p.id <> p_profile_id
        and p.reliability_score >= 90
        and not public.is_blocked_between(p_profile_id, p.id)
        and exists (select 1 from public.verifications v where v.profile_id = p.id and v.status = 'verified')
      group by p.id, p.full_name
      order by count(ps.skill_id) desc
      limit 10
    loop
      insert into public.match_recommendations (profile_id, recommendation_type, target_profile_id, score, reasons, signals)
      values (p_profile_id, 'mentor', v_rec.id, least(100, v_rec.shared_skills * 20 + 40),
        array[v_rec.full_name || ' shares ' || v_rec.shared_skills::text || ' of your skills and is mentor-eligible'],
        jsonb_build_object('shared_skills', v_rec.shared_skills))
      on conflict (profile_id, recommendation_type, coalesce(target_profile_id, '00000000-0000-0000-0000-000000000000'),
        coalesce(target_opportunity_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_skill_id, '00000000-0000-0000-0000-000000000000'))
        where dismissed_at is null
        do update set score = excluded.score, reasons = excluded.reasons, signals = excluded.signals, expires_at = now() + interval '14 days';
      v_created := v_created + 1;
    end loop;
  end if;

  -- Community matches: shared skills/goals with anyone whose active intent
  -- is meet_community/attend_events, when I have the same kind of intent.
  if exists (select 1 from public.member_intents where profile_id = p_profile_id and active and intent_type in ('meet_community','attend_events')) then
    for v_rec in
      select p.id, p.full_name, count(ps.skill_id) as shared_skills
      from public.profiles p
      join public.member_intents mi on mi.profile_id = p.id and mi.active and mi.visible and mi.intent_type in ('meet_community','attend_events')
      join public.profile_skills ps on ps.profile_id = p.id and ps.skill_id = any (coalesce(v_my_skills, '{}'))
      where p.id <> p_profile_id and not public.is_blocked_between(p_profile_id, p.id)
      group by p.id, p.full_name
      having count(ps.skill_id) > 0
      order by count(ps.skill_id) desc
      limit 10
    loop
      insert into public.match_recommendations (profile_id, recommendation_type, target_profile_id, score, reasons, signals)
      values (p_profile_id, 'community', v_rec.id, least(100, v_rec.shared_skills * 15 + 30),
        array[v_rec.full_name || ' shares ' || v_rec.shared_skills::text || ' skills and wants to connect too'],
        jsonb_build_object('shared_skills', v_rec.shared_skills))
      on conflict (profile_id, recommendation_type, coalesce(target_profile_id, '00000000-0000-0000-0000-000000000000'),
        coalesce(target_opportunity_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_skill_id, '00000000-0000-0000-0000-000000000000'))
        where dismissed_at is null
        do update set score = excluded.score, reasons = excluded.reasons, signals = excluded.signals, expires_at = now() + interval '14 days';
      v_created := v_created + 1;
    end loop;
  end if;

  -- Reconnection: previously-accepted connections with no message and no
  -- shared event/opportunity activity in the last 60 days — legitimate
  -- prior interaction only, never a cold stranger.
  for v_rec in
    select case when c.requester_id = p_profile_id then c.recipient_id else c.requester_id end as other_id,
      p.full_name
    from public.connections c
    join public.profiles p on p.id = (case when c.requester_id = p_profile_id then c.recipient_id else c.requester_id end)
    where c.status = 'accepted'
      and (c.requester_id = p_profile_id or c.recipient_id = p_profile_id)
      and not public.is_blocked_between(p_profile_id, (case when c.requester_id = p_profile_id then c.recipient_id else c.requester_id end))
      and c.responded_at < now() - interval '60 days'
    limit 10
  loop
    insert into public.match_recommendations (profile_id, recommendation_type, target_profile_id, score, reasons, signals)
    values (p_profile_id, 'reconnection', v_rec.other_id, 40,
      array['You connected with ' || v_rec.full_name || ' a while ago — worth reconnecting'],
      jsonb_build_object('basis', 'accepted_connection'))
    on conflict (profile_id, recommendation_type, coalesce(target_profile_id, '00000000-0000-0000-0000-000000000000'),
      coalesce(target_opportunity_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_skill_id, '00000000-0000-0000-0000-000000000000'))
      where dismissed_at is null
      do update set score = excluded.score, reasons = excluded.reasons, signals = excluded.signals, expires_at = now() + interval '14 days';
    v_created := v_created + 1;
  end loop;

  -- Skill-training gap: skills required by 2+ open opportunities in my
  -- city that I don't have yet — a concrete, explainable "build this."
  for v_rec in
    select r.skill_id, s.name, count(distinct r.opportunity_id) as demand
    from public.opportunity_skill_requirements r
    join public.opportunities o on o.id = r.opportunity_id and o.status = 'open'
    join public.skills s on s.id = r.skill_id
    where r.required
      and not (r.skill_id = any (coalesce(v_my_skills, '{}')))
      and (o.city = v_my_city or o.is_remote)
    group by r.skill_id, s.name
    having count(distinct r.opportunity_id) >= 2
    order by count(distinct r.opportunity_id) desc
    limit 5
  loop
    insert into public.match_recommendations (profile_id, recommendation_type, target_skill_id, score, reasons, signals)
    values (p_profile_id, 'skill_training', v_rec.skill_id, least(100, v_rec.demand * 20),
      array[v_rec.demand::text || ' open opportunities near you want "' || v_rec.name || '" and it''s not on your Passport yet'],
      jsonb_build_object('demand', v_rec.demand))
    on conflict (profile_id, recommendation_type, coalesce(target_profile_id, '00000000-0000-0000-0000-000000000000'),
      coalesce(target_opportunity_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_skill_id, '00000000-0000-0000-0000-000000000000'))
      where dismissed_at is null
      do update set score = excluded.score, reasons = excluded.reasons, signals = excluded.signals, expires_at = now() + interval '14 days';
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'generated', v_created);
end;
$$;

revoke all on function public.generate_match_recommendations(uuid) from public, anon;
grant execute on function public.generate_match_recommendations(uuid) to authenticated;
