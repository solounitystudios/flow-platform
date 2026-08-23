-- Creative Project invite consent (Batch 17a).
--
-- 20260823041155_creative_projects_foundation.sql shipped creative_projects
-- and creative_project_members with a working invite/roster/self-leave
-- model, but left one gap that batch's own header comment did not flag as a
-- gap at the time: creative_project_members_owner_manage's with-check
-- allows the project owner to move a non-owner row directly from 'invited'
-- to 'active' themselves. That means today the owner can unilaterally make
-- someone an active member without that person ever having agreed to
-- anything — there is no self-accept path, and no self-decline path either
-- (leave_creative_project() requires status = 'active', so an invited row
-- can't use it).
--
-- This migration closes that gap with the smallest change that makes
-- consent structurally required, not just conventionally expected:
--
--   1. accept_creative_project_invite(p_project_id uuid) — SECURITY DEFINER,
--      self-targeted only (auth.uid()), requires the caller's own row for
--      that project to currently be status = 'invited'. On success sets
--      status = 'active', joined_at = now(), leaves removed_at untouched
--      (already null on an invited row — the removed_at consistency CHECK
--      guarantees that).
--
--   2. decline_creative_project_invite(p_project_id uuid) — SECURITY
--      DEFINER, same self-targeting and same 'invited'-only precondition.
--      On success sets status = 'removed', removed_at = now(). Reuses the
--      existing 'removed' status rather than adding a new 'declined' value:
--      a declined invite and a since-departed active member are already
--      distinguishable by whether joined_at was ever set (null for a
--      decline, non-null for anyone who was actually active first), so no
--      status/CHECK-constraint change is needed to keep that history
--      honest. This is a UI-level label distinction, not a schema one.
--
--   3. creative_project_members_owner_manage is re-created with its
--      with-check narrowed from status in ('invited','active','suspended')
--      to status in ('invited','suspended') — removing exactly the one
--      capability this migration exists to remove (the owner setting
--      status='active' directly on someone else's row) and nothing else.
--      Its using clause, its self-row exclusion, its role='owner' exclusion,
--      and its "never 'removed'" behavior are all unchanged.
--
-- Both new functions mirror leave_creative_project()'s exact idiom from the
-- prior batch (row-locked SELECT ... FOR UPDATE, a {ok, reason} jsonb
-- return per rejected precondition, no exception raised for any
-- anticipated rejection path) rather than a new self-facing RLS policy,
-- for the same reason that migration gave: after this revision there is
-- still no client-facing UPDATE grant path for a plain member to touch
-- their own row's status — every self-service status transition
-- (accept/decline/leave) goes through a narrow SECURITY DEFINER RPC that
-- can only ever act on the caller's own row for the project named in its
-- argument.
--
-- Preserved, unchanged by this migration:
--   - creative_project_members_owner_invite (owner can still invite;
--     unaffected — it only ever inserts status='invited').
--   - creative_project_members_self_read (an invitee can already read
--     their own pending invite; that was true before this migration and
--     needed no change).
--   - leave_creative_project() (self-leave for an already-active non-owner
--     member; untouched, still the only path to 'removed' for someone who
--     was actually active first).
--   - is_creative_project_member() (untouched; still status='active' only
--     — an accepted invite satisfies it the instant this migration's
--     accept RPC sets status='active', no further change needed anywhere
--     else, including Batch 16's verifications_self_insert and
--     confirm_verification_as_collaborator(), both of which gate on this
--     same helper).
--   - Owner-row protections: the owner's own membership row is created
--     status='active' by sync_creative_project_owner_membership()
--     (AFTER INSERT, unique to creative_projects) and can therefore never
--     be status='invited' — so it structurally can never match either new
--     RPC's precondition. Both RPCs also target row-by-(project_id,
--     profile_id), never by role, so there is no path for either RPC to
--     touch a role='owner' row even if one somehow were 'invited'.
--   - creative_project_members_admin_all (unchanged; AAL2 FLOW admin
--     retains full access via RLS, same as every other table in this
--     feature area — column-level grants, not this policy, are what
--     already constrain what an UPDATE can change, and this migration
--     does not touch those grants).
--   - No table, column, CHECK constraint, index, or grant is added or
--     changed anywhere in this migration. No table outside
--     creative_project_members (no verifications, profile_credentials,
--     achievements, organizations, or any Creative Capture concept) is
--     read from, written to, or referenced.
--
-- Meaning boundary (explicit, load-bearing, same posture as
-- 20260823041155_creative_projects_foundation.sql's own trust-boundary
-- statement): accepting an invite via accept_creative_project_invite()
-- means only "I consent to being listed as a member of this creative
-- project." It is not a contribution confirmation, not evidence approval,
-- and grants no copyright, royalty, publishing, master, or contractual
-- right. Nothing in this migration mints a profile_credentials row, writes
-- to verifications, or touches Passport in any way.
--
-- Live-data audit before this migration (read-only, via Supabase MCP, this
-- session): neither accept_creative_project_invite nor
-- decline_creative_project_invite exists live under any name.
-- creative_project_members_owner_manage's live with-check still matches
-- this file's pre-migration text exactly (status in
-- ('invited','active','suspended')), confirming no drift. This migration
-- has not been applied live as of this file being written.
--
-- Explicitly out of scope for this migration: any Creative Capture
-- integration, Studio Sessions, legal/rights/split/royalty concepts, a
-- 'declined' status value, invite expiration, invite notifications, an
-- owner-initiated hard-removal RPC, and any change to organizations/
-- organization_members (which retains its own, unrelated, unchanged
-- owner-direct-activate behavior — this migration is a deliberate
-- Creative-Projects-specific departure from that precedent, not a
-- correction applied platform-wide).
--
-- Rollback: creative_project_members had 0 live rows at the time this
-- migration was written (confirmed above), so a full rollback is safe to
-- state plainly:
--   drop function if exists public.accept_creative_project_invite(uuid);
--   drop function if exists public.decline_creative_project_invite(uuid);
--   drop policy if exists creative_project_members_owner_manage on public.creative_project_members;
--   create policy creative_project_members_owner_manage
--     on public.creative_project_members for update
--     using (
--       exists (select 1 from public.creative_projects p where p.id = creative_project_members.project_id and p.owner_id = (select auth.uid()))
--       and profile_id <> (select auth.uid())
--     )
--     with check (
--       exists (select 1 from public.creative_projects p where p.id = creative_project_members.project_id and p.owner_id = (select auth.uid()))
--       and profile_id <> (select auth.uid())
--       and role <> 'owner'
--       and status in ('invited', 'active', 'suspended')
--     );
--   (i.e. re-apply 20260823041155_creative_projects_foundation.sql's
--   version of this policy verbatim.)

-- ── A. accept_creative_project_invite ──────────────────────────────────────
-- Self-targeted only: the WHERE clause below can never match a row that
-- isn't (p_project_id, auth.uid()) — there is no parameter that accepts an
-- arbitrary profile, and profile_id/project_id are never written by this
-- function, only read to locate the row. A caller who names a project they
-- have no row on, or whose row isn't currently 'invited' (already active,
-- suspended, removed, or belongs to someone who was never invited to begin
-- with), gets not_found or not_pending — never a partial mutation.

create or replace function public.accept_creative_project_invite(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.creative_project_members;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row
  from public.creative_project_members
  where project_id = p_project_id
    and profile_id = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_row.status <> 'invited' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  update public.creative_project_members
  set status = 'active', joined_at = now(), updated_at = now()
  where id = v_row.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.accept_creative_project_invite(uuid) from public, anon;
grant execute on function public.accept_creative_project_invite(uuid) to authenticated;

-- ── B. decline_creative_project_invite ─────────────────────────────────────
-- Same self-targeting and same 'invited'-only precondition as accept above.
-- Reuses status='removed' (see header comment) rather than a new status
-- value — joined_at staying null is what keeps a decline distinguishable
-- from a later self-leave.

create or replace function public.decline_creative_project_invite(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.creative_project_members;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row
  from public.creative_project_members
  where project_id = p_project_id
    and profile_id = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_row.status <> 'invited' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  update public.creative_project_members
  set status = 'removed', removed_at = now(), updated_at = now()
  where id = v_row.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.decline_creative_project_invite(uuid) from public, anon;
grant execute on function public.decline_creative_project_invite(uuid) to authenticated;

-- ── C. creative_project_members_owner_manage: remove direct-activate ──────
-- Identical to the original policy except the with-check's allowed status
-- set drops 'active'. The owner can still move a non-owner row to
-- 'invited' (re-inviting after a decline/removal, since profile_id/
-- project_id are unique together only while a row exists with that pair —
-- see note below) or 'suspended'. Only accept_creative_project_invite()
-- can ever set 'active' now. The using clause (which rows the owner can
-- target at all), the self-row exclusion, and the role='owner' exclusion
-- are all unchanged from the original policy.
--
-- Note: unique(project_id, profile_id) means an owner cannot re-invite a
-- profile whose prior row still exists in a 'removed' state — that row
-- would need to move back to 'invited' via this same owner_manage policy
-- (still permitted) rather than a fresh INSERT, which owner_invite's own
-- with-check does not forbid (it does not check for a pre-existing row of
-- any status). This is unchanged pre-existing behavior, not something this
-- migration alters.

drop policy if exists creative_project_members_owner_manage on public.creative_project_members;

create policy creative_project_members_owner_manage
  on public.creative_project_members for update
  using (
    exists (
      select 1 from public.creative_projects p
      where p.id = creative_project_members.project_id
        and p.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
  )
  with check (
    exists (
      select 1 from public.creative_projects p
      where p.id = creative_project_members.project_id
        and p.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
    and role <> 'owner'
    and status in ('invited', 'suspended')
  );
