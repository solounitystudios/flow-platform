-- Verifications ↔ Creative Projects: one-way coupling (Batch 16).
--
-- 20260822180043_passport_verification_tiering.sql built the
-- collaborator-confirmation tier explicitly "ahead of the not-yet-built
-- Creative Contributions feature" and 20260823041155_creative_projects_foundation.sql
-- then built the standalone project/membership foundation with an explicit,
-- load-bearing trust-boundary statement that creating/joining a creative
-- project never reads from or writes to any Passport/verification table.
-- This migration is the anticipated first point of contact between the two
-- features — and it is deliberately one-way only:
--
--   verifications MAY reference a creative_projects row (a claimant can
--   submit "I contributed to this project" as a claim, and a currently
--   active fellow project member can confirm it via the existing
--   collaborator-confirmation RPC).
--
--   creative_projects / creative_project_members continue to NEVER
--   reference or touch verifications, verification_reviews,
--   verification_collaborator_confirmations, profile_credentials,
--   achievements, or profile_achievements. Nothing in this migration adds a
--   column, trigger, or function to either creative_projects or
--   creative_project_members, and nothing here writes to them. The coupling
--   is expressed entirely on the verifications side, via the same untyped
--   `reference_table`/`reference_id` polymorphic-reference convention
--   already established for `profile_skill` — no new FK, no new join table.
--
-- Live-data audit before this migration (read-only, via Supabase MCP, this
-- session): public.verifications, verification_reviews,
-- verification_collaborator_confirmations, creative_projects, and
-- creative_project_members all have 0 rows on the live project, and the
-- live schema matches every local migration file exactly (no drift). Every
-- change below therefore requires no backfill and tightens nothing against
-- real data.
--
-- What this migration adds, and nothing else:
--
--   1. Widens verifications_reference_table_check to also allow
--      reference_table = 'creative_project' (alongside the existing
--      'profile_skill'). When set, reference_id is
--      creative_projects.id — still a bare uuid with no FK, exactly
--      matching the profile_skill precedent (reference_id is polymorphic by
--      design; a real FK would have to be conditional on reference_table,
--      which Postgres can't express as a single constraint, so this table
--      has never used one).
--
--   2. One new public.credential_types row: key = 'creative'
--      ("Creative contribution"), sort_order = 10 (after the existing 9,
--      which top out at 9). color_token = 'fuchsia', icon_name = 'palette'
--      — chosen because neither value is used by any of the 9 existing rows
--      (identity=blue/badge-check, skill=flow/sparkles, work=emerald/briefcase,
--      education=violet/graduation-cap, community=amber/users,
--      reliability=teal/shield-check, founding_member=rose/star,
--      mentor=indigo/compass, organization_issued=slate/building).
--      components/passport/CredentialBadges.tsx's hardcoded ICONS/
--      COLOR_CLASSES maps still need a matching 'creative' -> fuchsia/palette
--      entry added — that UI change is out of scope for this migration
--      (owned by passport-reputation) and is called out here so the
--      color_token/icon_name pair is documented verbatim for that follow-up.
--
--   3. Re-creates verifications_self_insert with one added condition: when
--      the claimant sets reference_table = 'creative_project', they must
--      also currently be an active member of that project
--      (public.is_creative_project_member(reference_id) — no second
--      argument, since the function already checks auth.uid() internally,
--      and this policy's own with-check already pins profile_id =
--      auth.uid(), so there's no way for a member to submit this kind of
--      claim on someone else's behalf). Every other insert path
--      (reference_table null or 'profile_skill') is untouched in
--      permissiveness — only the style of the auth.uid() reference changes
--      (see below), not the logic gating those paths.
--
--      While rewriting this policy anyway, its auth.uid() references move
--      to the `(select auth.uid())` scalar-subquery form this repo has
--      settled on for RLS performance (see verifications_witness_read in
--      20260822191355_verification_witness_read_access.sql and the Batch 15
--      creative_project_members policies) instead of the bare auth.uid()
--      form the policy has used since its original
--      20260819073354_v1plus_passport_trust_matching.sql definition. This is
--      a pure style/performance-parity change — it does not alter which
--      inserts succeed or fail versus the previous wording.
--
--   4. Re-creates confirm_verification_as_collaborator(p_verification_id,
--      p_notes) with the same signature, same SECURITY DEFINER / fixed
--      search_path, adding exactly one new check: when the claim being
--      confirmed has reference_table = 'creative_project', the confirming
--      caller (already required, by the pre-existing check immediately
--      above it, to be exactly the profile named as witness_profile_id on
--      that specific pending claim) must ALSO currently be an active member
--      of the referenced project
--      (public.is_creative_project_member(reference_id)). If not, the
--      function returns a new, more specific reason:
--      {ok:false, reason:'not_a_project_member'}.
--
--      Check order (deliberate, documented inline at the check site too):
--        not_authenticated
--          -> not_found
--          -> not_authorized               (existing: caller isn't the named witness at all)
--          -> not_a_project_member          (NEW: only reached once the caller
--                                             IS the named witness, and only when
--                                             reference_table = 'creative_project')
--          -> not_pending
--          -> success (insert confirmation row + _resolve_verification, unchanged)
--      This ordering means a stranger who was never named as the witness on
--      this claim always gets the existing, deliberately generic
--      not_authorized — the new not_authorized-adjacent reason is reserved
--      for the narrower, more specific case of a correctly-named witness who
--      has since left the project (or never actually joined it), so the
--      caller can be told exactly what's wrong without leaking any
--      information to someone who was never entitled to act on the claim in
--      the first place.
--
-- Explicitly out of scope for this migration: resolve_verification_as_organization(),
-- decide_evidence_verification(), _resolve_verification(), creative_projects,
-- creative_project_members, is_creative_project_member() (used as-is, not
-- modified), and any Studio Sessions / Creative Capture / wallet concept.
-- None of those are touched below.
--
-- Rollback: safe to state plainly given the 0-row audit above across every
-- table this migration touches or depends on.
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
--     if v_row.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
--     insert into public.verification_collaborator_confirmations (verification_id, confirmed_by, note)
--     values (p_verification_id, auth.uid(), p_notes);
--     perform public._resolve_verification(p_verification_id, 'verified', 'collaborator_verified', auth.uid(), 'collaborator_confirmation', null, p_notes, null);
--     return jsonb_build_object('ok', true);
--   end; $$;
--   -- (i.e. re-apply 20260822180043_passport_verification_tiering.sql's
--   -- version of this function verbatim, from lines 275-307 of that file.)
--   drop policy if exists verifications_self_insert on public.verifications;
--   create policy verifications_self_insert on public.verifications for insert
--     with check (auth.uid() = profile_id and status = 'pending');
--   delete from public.credential_types where key = 'creative';
--   alter table public.verifications drop constraint if exists verifications_reference_table_check;
--   alter table public.verifications add constraint verifications_reference_table_check
--     check (reference_table is null or reference_table in ('profile_skill'));

-- ── A. widen reference_table CHECK ─────────────────────────────────────────

alter table public.verifications drop constraint if exists verifications_reference_table_check;
alter table public.verifications add constraint verifications_reference_table_check
  check (reference_table is null or reference_table in ('profile_skill', 'creative_project'));

-- ── B. new credential_types row ────────────────────────────────────────────
-- color_token='fuchsia', icon_name='palette' — verbatim values for
-- components/passport/CredentialBadges.tsx's ICONS/COLOR_CLASSES maps
-- (passport-reputation follow-up, not touched here).

insert into public.credential_types (key, label, description, color_token, icon_name, sort_order) values
  ('creative', 'Creative contribution', 'A verified contribution to a creative project.', 'fuchsia', 'palette', 10)
on conflict (key) do nothing;

-- ── C. verifications_self_insert: add the project-membership gate ────────

drop policy if exists verifications_self_insert on public.verifications;
create policy verifications_self_insert on public.verifications for insert
  with check (
    (select auth.uid()) = profile_id
    and status = 'pending'
    and (
      reference_table is distinct from 'creative_project'
      or public.is_creative_project_member(reference_id)
    )
  );

-- ── D. confirm_verification_as_collaborator: add the project-membership gate ─

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

  -- New, narrower check: reached only once the caller is confirmed to be the
  -- claim's named witness. A witness who has since left (or never actually
  -- joined) the referenced creative project gets this specific reason rather
  -- than the generic not_authorized above, which stays reserved for callers
  -- who were never the named witness at all.
  if v_row.reference_table = 'creative_project' and not public.is_creative_project_member(v_row.reference_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_project_member');
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
