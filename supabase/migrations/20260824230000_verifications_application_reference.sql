-- Verifications ↔ Applications: "Application Evidence Reference" (Priority #1
-- Batch 1). One-way coupling, same shape as
-- 20260823145545_verifications_creative_project_reference.sql (the Creative
-- Projects precedent this migration mirrors directly).
--
-- Architecture decision (from the read-only Activity/Outcome → Evidence →
-- Passport audit that preceded this batch): FLOW does NOT need a new
-- universal `activities` or `outcomes` table. `applications` already is the
-- authoritative record of work/gig/volunteer/event-staff participation and
-- completion (`status='completed'`, set only by the opportunity's own
-- `created_by` via `enforce_application_lifecycle()` — a participant cannot
-- self-mark their own work complete). `verifications` already is FLOW's
-- universal evidence/credential layer, via the same untyped
-- `reference_table`/`reference_id` polymorphic-reference convention already
-- proven twice (`profile_skill`, `creative_project`). This migration widens
-- that convention a third time, coupling verifications to applications with
-- no new table and no change to `applications`/`opportunities` themselves.
--
-- Live-data audit before this migration (read-only, via Supabase MCP, this
-- session): public.verifications, verification_reviews,
-- verification_collaborator_confirmations all have 0 rows on the live
-- project touching reference_table='application' (the column itself has 1
-- unrelated live row from Batch A's opportunities.event_id work, not
-- verifications). Every change below is additive and requires no backfill.
--
-- What this migration adds, and nothing else:
--
--   1. Widens verifications_reference_table_check to also allow
--      reference_table = 'application' (alongside 'profile_skill' and
--      'creative_project'). reference_id is applications.id — still a bare
--      uuid with no FK, matching the existing precedent exactly (reference_id
--      is polymorphic by design; a real FK would have to be conditional on
--      reference_table, which Postgres can't express as a single
--      constraint). This is a known, already-live limitation for the
--      existing two reference types (a member can already hard-delete a
--      verified profile_skills row and the resulting verifications/
--      profile_credentials rows persist with a now-stale reference_id, since
--      _resolve_verification()'s profile_skills update simply no-ops if the
--      row is gone) — this migration knowingly extends the same
--      already-accepted gap to 'application'. Acceptable here because
--      neither `applications` nor `opportunities` rows are ever hard-deleted
--      anywhere in this codebase (both lifecycles are status-transition-only
--      and terminal at 'completed'), confirmed by the preceding audit.
--
--   2. No new credential_types row. The existing 'work' key ("Verified
--      completed work history", seeded in
--      20260819073354_v1plus_passport_trust_matching.sql) already fits
--      application-linked evidence exactly — reusing it, per explicit scope.
--
--   3. New helper is_application_participant(p_application_id), mirroring
--      is_creative_project_member()'s exact shape (stable sql, security
--      definer, checks auth.uid() internally). True iff the application
--      exists, the caller is its applicant, and its status is 'completed' —
--      NOT gated on worker_ack_at, which has no effect anywhere else in the
--      system today (confirmed: set only by acknowledgeCompletionAction,
--      read only by WorkCard.tsx to toggle a checkmark string) and would
--      block a common, legitimate case for no corresponding trust gain.
--
--   4. Re-creates verifications_self_insert with one added condition,
--      following the exact same pattern as the creative_project branch
--      immediately below it: when reference_table = 'application', the
--      claimant must satisfy is_application_participant(reference_id). Every
--      other insert path is untouched.
--
--   5. Re-creates confirm_verification_as_collaborator(p_verification_id,
--      p_notes) adding one new branch, reached only once the caller is
--      already confirmed to be the claim's named witness_profile_id (the
--      pre-existing generic check runs first, unchanged) — mirrors the
--      creative_project branch's check-order exactly:
--
--        not_authenticated
--          -> not_found
--          -> not_authorized                  (existing: caller isn't the named witness at all)
--          -> not_a_project_member             (existing, creative_project only)
--          -> not_the_opportunity_creator       (NEW: application only — caller IS the
--                                                 named witness, but a live re-check of
--                                                 applications -> opportunities.created_by
--                                                 no longer matches them)
--          -> application_not_completed         (NEW: application only — the referenced
--                                                 application is no longer status='completed')
--          -> not_pending
--          -> success (insert confirmation row + _resolve_verification, unchanged)
--
--      Both new checks are live re-derivations from applications/
--      opportunities at confirmation time — never trusting the
--      witness_profile_id column alone, even though that column was already
--      server-derived (never client-supplied) at submission time by
--      submitEvidenceAction. This is deliberate defense-in-depth, matching
--      the creative_project precedent's live-membership re-check rather than
--      a one-time identity match.
--
--   6. New index: verifications(reference_table, reference_id) where
--      reference_table is not null. Never existed for any reference type —
--      needed for "has evidence already been submitted for this row"
--      lookups the new UI performs, and won't be caught by this repo's
--      normal FK-index advisor since reference_id has no real FK.
--
--   7. New partial unique index: (profile_id, reference_table, reference_id)
--      where reference_table is not null and status in ('pending',
--      'verified') — prevents the same profile from holding more than one
--      simultaneously-active claim against the exact same source row, for
--      every reference type (not just 'application'; applies retroactively
--      to profile_skill/creative_project too, since this is a pure safety
--      tightening with 0 conflicting live rows, not a behavior change for
--      any currently-relied-on pattern). A rejected/revoked/expired claim is
--      excluded from this index, so legitimate historical resubmission after
--      a rejection remains fully possible — only two simultaneously-open
--      claims against the same source are blocked.
--
-- Explicitly out of scope for this migration (per this batch's authorized
-- scope): reference_table = 'event_attendance', the auto_verified tier in
-- any form, resolve_verification_as_organization(), decide_evidence_
-- verification(), _resolve_verification() (already fully generic across
-- reference types — confirmed by direct read, no change needed), any
-- activities/outcomes table, any change to applications/opportunities/
-- event_attendance schema or lifecycle triggers, any reliability or rewards
-- change, any Passport credential-type or passport_summary change.
--
-- Passport behavior note (raw activity vs. verified credential — unchanged
-- by this migration, documented here per this batch's explicit instruction):
-- passport_summary's gigs_completed count reads applications.status directly
-- and is completely independent of this table — completing a gig has always
-- incremented that count regardless of whether any evidence is ever
-- submitted or verified. This migration adds the ability to also earn a
-- verified 'work' profile_credentials badge for a specific completed gig,
-- which is a separate, additional signal, not a replacement for or change to
-- the raw count. Reconciling the two remains explicitly out of scope.
--
-- Rollback: safe to state plainly given the 0-row audit above.
--   drop index if exists public.verifications_active_claim_unique_idx;
--   drop index if exists public.verifications_reference_idx;
--   create or replace function public.confirm_verification_as_collaborator(p_verification_id uuid, p_notes text default null)
--   returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
--   declare v_row public.verifications%rowtype;
--   begin
--     if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
--     select * into v_row from public.verifications where id = p_verification_id for update;
--     if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
--     if v_row.witness_profile_id is null or v_row.witness_profile_id <> auth.uid() then
--       return jsonb_build_object('ok', false, 'reason', 'not_authorized');
--     end if;
--     if v_row.reference_table = 'creative_project' and not public.is_creative_project_member(v_row.reference_id) then
--       return jsonb_build_object('ok', false, 'reason', 'not_a_project_member');
--     end if;
--     if v_row.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
--     insert into public.verification_collaborator_confirmations (verification_id, confirmed_by, note)
--     values (p_verification_id, auth.uid(), p_notes);
--     perform public._resolve_verification(p_verification_id, 'verified', 'collaborator_verified', auth.uid(), 'collaborator_confirmation', null, p_notes, null);
--     return jsonb_build_object('ok', true);
--   end; $$;
--   -- (i.e. re-apply 20260823145545_verifications_creative_project_reference.sql's
--   -- version of this function verbatim.)
--   drop policy if exists verifications_self_insert on public.verifications;
--   create policy verifications_self_insert on public.verifications for insert
--     with check (
--       (select auth.uid()) = profile_id and status = 'pending'
--       and (reference_table is distinct from 'creative_project' or public.is_creative_project_member(reference_id))
--     );
--   drop function if exists public.is_application_participant(uuid);
--   alter table public.verifications drop constraint if exists verifications_reference_table_check;
--   alter table public.verifications add constraint verifications_reference_table_check
--     check (reference_table is null or reference_table in ('profile_skill', 'creative_project'));

-- ── A. widen reference_table CHECK ─────────────────────────────────────────

alter table public.verifications drop constraint if exists verifications_reference_table_check;
alter table public.verifications add constraint verifications_reference_table_check
  check (reference_table is null or reference_table in ('profile_skill', 'creative_project', 'application'));

-- ── B. is_application_participant(): mirrors is_creative_project_member() ──

create or replace function public.is_application_participant(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_application_id
      and a.applicant_id = auth.uid()
      and a.status = 'completed'
  );
$$;

revoke execute on function public.is_application_participant(uuid) from public, anon;
grant execute on function public.is_application_participant(uuid) to authenticated;

-- ── C. verifications_self_insert: add the application-participant gate ────

drop policy if exists verifications_self_insert on public.verifications;
create policy verifications_self_insert on public.verifications for insert
  with check (
    (select auth.uid()) = profile_id
    and status = 'pending'
    and (
      reference_table is distinct from 'creative_project'
      or public.is_creative_project_member(reference_id)
    )
    and (
      reference_table is distinct from 'application'
      or public.is_application_participant(reference_id)
    )
  );

-- ── D. confirm_verification_as_collaborator: add the application branch ───

create or replace function public.confirm_verification_as_collaborator(p_verification_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_row public.verifications%rowtype;
  v_opportunity_created_by uuid;
  v_application_status text;
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

  -- Reached only once the caller is confirmed to be the claim's named
  -- witness. A witness who has since left (or never joined) the referenced
  -- creative project gets this specific reason rather than the generic
  -- not_authorized above.
  if v_row.reference_table = 'creative_project' and not public.is_creative_project_member(v_row.reference_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_project_member');
  end if;

  -- Application claims: live re-derivation from applications/opportunities,
  -- never trusting witness_profile_id alone even though it was already
  -- server-derived (never client-supplied) at submission time. Two distinct
  -- failure reasons, checked in order, mirroring the creative_project branch.
  if v_row.reference_table = 'application' then
    select o.created_by, a.status into v_opportunity_created_by, v_application_status
    from public.applications a
    join public.opportunities o on o.id = a.opportunity_id
    where a.id = v_row.reference_id;

    if v_opportunity_created_by is null or v_opportunity_created_by <> auth.uid() then
      return jsonb_build_object('ok', false, 'reason', 'not_the_opportunity_creator');
    end if;

    if v_application_status is distinct from 'completed' then
      return jsonb_build_object('ok', false, 'reason', 'application_not_completed');
    end if;
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

-- ── E. reference lookup index ──────────────────────────────────────────────

create index if not exists verifications_reference_idx
  on public.verifications (reference_table, reference_id)
  where reference_table is not null;

-- ── F. active-claim uniqueness (all reference types, not application-only) ─

create unique index if not exists verifications_active_claim_unique_idx
  on public.verifications (profile_id, reference_table, reference_id)
  where reference_table is not null and status in ('pending', 'verified');
