-- Passport verification tiering — general FLOW infrastructure.
--
-- Today public.verifications resolves exactly one way: an admin, at AAL2,
-- calls decide_evidence_verification(). This batch introduces four
-- resolution tiers so a claim can eventually resolve without a human admin
-- every time, while keeping the admin path completely intact:
--
--   admin_verified         — today's existing path. Unchanged behavior.
--   auto_verified           — reserved for a future deterministic
--                              auto-verifier. Structural only in this batch
--                              (a valid tier value + column to record it)
--                              — no auto-verifier logic is wired up here.
--   collaborator_verified   — a specific collaborator the claimant names on
--                              their own claim (new `witness_profile_id`
--                              column) confirms it via a narrow RPC.
--   organization_verified   — a verified organization's owner/admin member
--                              attests to a claim the claimant tagged with
--                              that organization (new `organization_id`
--                              column) via a narrow RPC.
--
-- This is built ahead of the not-yet-built Creative Contributions feature,
-- which will need collaborator confirmation as its primary verification
-- path — but it's designed as general Passport infrastructure, not
-- Creative-Contributions-specific: nothing here references a project,
-- session, or contribution concept.
--
-- Live-data audit before this migration (read-only, via Supabase MCP):
-- public.verifications has 0 rows and public.verification_reviews has 0
-- rows on the live project, so every constraint added below (including the
-- new NOT NULL `tier` column on verification_reviews) requires no backfill
-- and tightens nothing against real data.
--
-- Reuses rather than duplicates existing infrastructure:
--   - Extends public.verifications and public.verification_reviews (the
--     existing claim + admin-audit-trail tables from
--     20260819073354_v1plus_passport_trust_matching.sql) instead of
--     building parallel tables for the same "a claim was made, then
--     decided" concept.
--   - organization_verified reuses organizations.verified and
--     is_organization_member()/has_organization_role() exactly as
--     established in 20260820091500_organization_members_foundation.sql —
--     no new org-membership concept invented.
--   - decide_evidence_verification()'s admin/AAL2 gating, fixed
--     search_path, and side effects (profile_skills flip,
--     profile_credentials mint/revoke, evaluate_achievements) are factored
--     into a new private helper (public._resolve_verification, no grants
--     to any role — same "internal only" shape as
--     sync_organization_owner_membership()) and reused by all three human
--     resolution paths, so the three tiers can never drift out of sync on
--     what "verified" actually does to the rest of the Passport.
--
-- New surface, and nothing else:
--   1. public.verifications: + witness_profile_id, + organization_id
--      (both nullable, claimant-supplied at submission — naming a
--      collaborator or organization grants no access by itself; it only
--      identifies who could later act on this specific claim), +
--      resolved_tier (nullable; set only when a tier actually resolves the
--      row).
--   2. public.verification_reviews: + tier (not null — every review row,
--      including the pre-existing admin path, now records which tier
--      produced it).
--   3. public.verification_collaborator_confirmations — a new,
--      collaborator-specific confirmation record, distinct from
--      verification_reviews (which stays the cross-tier decision audit
--      trail). Captures who confirmed, when, and any note. No insert/
--      update/delete RLS policy — the only writer is
--      confirm_verification_as_collaborator() (SECURITY DEFINER).
--   4. public._resolve_verification(...) — private shared resolution
--      logic. Not callable directly by any role.
--   5. public.confirm_verification_as_collaborator(p_verification_id,
--      p_notes) — SECURITY DEFINER. Only callable, successfully, by the
--      profile named as witness_profile_id on that specific pending claim.
--   6. public.resolve_verification_as_organization(p_verification_id,
--      p_notes) — SECURITY DEFINER. Only callable, successfully, by an
--      active owner/admin member of the specific verified organization
--      named on that specific pending claim.
--   7. decide_evidence_verification() re-created with the same signature
--      and the same admin+AAL2 gating, now delegating to
--      _resolve_verification() and stamping tier = 'admin_verified'.
--      Nothing about its external behavior changes.
--
-- Explicitly out of scope for this migration: any Creative Contributions
-- schema, any auto-verifier logic for auto_verified, any change to
-- verifications_self_insert / verifications_self_read (the claimant's own
-- insert/read policies already cover the two new nullable columns with no
-- change needed).
--
-- Rollback: purely additive; nothing existing is dropped or narrowed
-- except verification_reviews.tier becoming NOT NULL (safe today per the
-- 0-row audit above — would need re-auditing before rollback once real
-- rows exist). If this needs reverting before any real verification rows
-- exist:
--   drop function if exists public.resolve_verification_as_organization(uuid, text);
--   drop function if exists public.confirm_verification_as_collaborator(uuid, text);
--   drop function if exists public._resolve_verification(uuid, text, text, uuid, text, text, text, timestamptz);
--   drop table if exists public.verification_collaborator_confirmations;
--   alter table public.verification_reviews drop constraint if exists verification_reviews_tier_check;
--   alter table public.verification_reviews alter column tier drop not null;
--   alter table public.verification_reviews drop column if exists tier;
--   alter table public.verifications drop constraint if exists verifications_resolved_tier_check;
--   alter table public.verifications drop column if exists resolved_tier;
--   alter table public.verifications drop column if exists organization_id;
--   alter table public.verifications drop column if exists witness_profile_id;
--   -- then re-apply decide_evidence_verification() from
--   -- 20260819073354_v1plus_passport_trust_matching.sql verbatim.

-- ── A. verifications: new nullable columns ────────────────────────────────

alter table public.verifications add column if not exists witness_profile_id uuid references public.profiles(id) on delete set null;
alter table public.verifications add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.verifications add column if not exists resolved_tier text;

alter table public.verifications drop constraint if exists verifications_resolved_tier_check;
alter table public.verifications add constraint verifications_resolved_tier_check
  check (resolved_tier is null or resolved_tier in ('auto_verified', 'collaborator_verified', 'organization_verified', 'admin_verified'));

-- A claimant cannot name themselves as their own collaborator/witness —
-- collaborator_verified is only meaningful when the confirming profile is
-- someone other than the claimant.
alter table public.verifications drop constraint if exists verifications_witness_not_self_check;
alter table public.verifications add constraint verifications_witness_not_self_check
  check (witness_profile_id is null or witness_profile_id <> profile_id);

create index if not exists verifications_witness_idx on public.verifications (witness_profile_id) where witness_profile_id is not null;
create index if not exists verifications_organization_idx on public.verifications (organization_id) where organization_id is not null;

-- ── B. verification_reviews: record which tier produced each decision ────

alter table public.verification_reviews add column if not exists tier text;
alter table public.verification_reviews alter column tier set not null;

alter table public.verification_reviews drop constraint if exists verification_reviews_tier_check;
alter table public.verification_reviews add constraint verification_reviews_tier_check
  check (tier in ('auto_verified', 'collaborator_verified', 'organization_verified', 'admin_verified'));

-- ── C. verification_collaborator_confirmations ────────────────────────────
-- Distinct from verification_reviews: this is the collaborator-specific
-- confirmation record (who confirmed, when, any note), not the cross-tier
-- decision audit trail. Every resolution via this tier still also writes a
-- verification_reviews row (through _resolve_verification below), so the
-- admin-facing audit trail stays a single source of truth for "what
-- happened to this claim and when" across every tier.

create table public.verification_collaborator_confirmations (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.verifications(id) on delete cascade,
  confirmed_by uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (verification_id)
);

create index verification_collaborator_confirmations_confirmed_by_idx
  on public.verification_collaborator_confirmations (confirmed_by);

alter table public.verification_collaborator_confirmations enable row level security;

-- Read-only via RLS: the confirming collaborator, the claim's owner, or an
-- admin. There is deliberately no insert/update/delete policy — the only
-- writer is confirm_verification_as_collaborator() (SECURITY DEFINER,
-- bypasses RLS), so a legitimate collaborator can never be impersonated by
-- a client-side insert.
create policy verification_collaborator_confirmations_read
  on public.verification_collaborator_confirmations for select
  using (
    (select auth.uid()) = confirmed_by
    or public.is_flow_admin(true)
    or exists (
      select 1 from public.verifications v
      where v.id = verification_collaborator_confirmations.verification_id
        and v.profile_id = (select auth.uid())
    )
  );

-- ── D. _resolve_verification: shared, private resolution logic ───────────
-- Not granted to any role (mirrors sync_organization_owner_membership()'s
-- "internal only, callable solely from another SECURITY DEFINER function
-- owned by the same role" shape). Every human/system resolution path
-- (admin, collaborator, organization, and eventually auto) goes through
-- this single function so the side effects of "a claim just got resolved"
-- — profile_skills flip, profile_credentials mint/revoke,
-- evaluate_achievements, and the verification_reviews audit row — can
-- never drift out of sync between tiers.

create or replace function public._resolve_verification(
  p_verification_id uuid, p_new_status text, p_tier text, p_actor_id uuid,
  p_method text default null, p_reason_code text default null, p_notes text default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_old_status text; v_row public.verifications%rowtype;
begin
  select * into v_row from public.verifications where id = p_verification_id for update;
  if not found then return; end if;
  v_old_status := v_row.status;

  update public.verifications set
    status = p_new_status,
    resolved_tier = p_tier,
    verified_at = case when p_new_status = 'verified' then now() else verified_at end,
    expires_at = coalesce(p_expires_at, expires_at),
    revoked_at = case when p_new_status = 'revoked' then now() else revoked_at end
  where id = p_verification_id;

  insert into public.verification_reviews(verification_id, actor_id, from_status, to_status, tier, method, reason_code, notes)
  values (p_verification_id, p_actor_id, v_old_status, p_new_status, p_tier, p_method, p_reason_code, p_notes);

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
end;
$$;

revoke all on function public._resolve_verification(uuid, text, text, uuid, text, text, text, timestamptz) from public, anon, authenticated;

-- ── E. decide_evidence_verification: unchanged gating, now tier-stamped ──
-- Same signature, same admin+AAL2 authorization check, same "not_found"
-- short-circuit. The only change is that the update/audit/side-effect
-- logic now runs through _resolve_verification() with tier =
-- 'admin_verified' instead of being duplicated inline.

create or replace function public.decide_evidence_verification(
  p_verification_id uuid, p_new_status text, p_method text default null,
  p_reason_code text default null, p_notes text default null, p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if not exists (select 1 from public.verifications where id = p_verification_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  perform public._resolve_verification(p_verification_id, p_new_status, 'admin_verified', auth.uid(), p_method, p_reason_code, p_notes, p_expires_at);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.decide_evidence_verification(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.decide_evidence_verification(uuid, text, text, text, text, timestamptz) to authenticated;

-- ── F. confirm_verification_as_collaborator ───────────────────────────────
-- Authorization is entirely row-scoped: the caller must be exactly the
-- profile named as witness_profile_id on that specific pending claim — not
-- any authenticated user, not any connection of the claimant. Always
-- resolves to 'verified' (a collaborator confirms; they don't reject
-- someone else's claim on their behalf — a claimant who names the wrong
-- collaborator or gets no confirmation simply stays pending, same as
-- today, and can still be resolved by an admin).

create or replace function public.confirm_verification_as_collaborator(p_verification_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_row public.verifications%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row from public.verifications where id = p_verification_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_row.witness_profile_id is null or v_row.witness_profile_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  insert into public.verification_collaborator_confirmations (verification_id, confirmed_by, note)
  values (p_verification_id, auth.uid(), p_notes);

  perform public._resolve_verification(p_verification_id, 'verified', 'collaborator_verified', auth.uid(), 'collaborator_confirmation', null, p_notes, null);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.confirm_verification_as_collaborator(uuid, text) from public, anon;
grant execute on function public.confirm_verification_as_collaborator(uuid, text) to authenticated;

-- ── G. resolve_verification_as_organization ───────────────────────────────
-- Authorization is entirely row-scoped and org-scoped: the caller must be
-- an active 'owner' or 'admin' member (is_organization_member/
-- has_organization_role — the same exact-match role helpers Part A of the
-- organization-members batch established) of the specific organization
-- named on that specific pending claim, and that organization must itself
-- be organizations.verified = true. Recruiter/manager roles cannot resolve
-- claims — only owner/admin, mirroring the posting-rights conservatism in
-- 20260820140929_organization_attribution_authorization.sql (no blanket
-- "any member" grant).

create or replace function public.resolve_verification_as_organization(p_verification_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_row public.verifications%rowtype; v_org_verified boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row from public.verifications where id = p_verification_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_row.organization_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_organization_named');
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  select verified into v_org_verified from public.organizations where id = v_row.organization_id;
  if v_org_verified is not true then
    return jsonb_build_object('ok', false, 'reason', 'organization_not_verified');
  end if;

  if not (public.has_organization_role(v_row.organization_id, 'owner') or public.has_organization_role(v_row.organization_id, 'admin')) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  perform public._resolve_verification(p_verification_id, 'verified', 'organization_verified', auth.uid(), 'organization_attestation', null, p_notes, null);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.resolve_verification_as_organization(uuid, text) from public, anon;
grant execute on function public.resolve_verification_as_organization(uuid, text) to authenticated;
