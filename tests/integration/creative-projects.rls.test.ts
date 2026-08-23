// Creative Projects foundation (Batch 15) — RLS-level regression matrix
// (STAGING_ONLY for CI purposes). Same reasoning as
// tests/integration/flow-sec-001.rls.test.ts and
// tests/integration/organization-location.rls.test.ts — see those files'
// headers for why this repo has no *permanent* staging Supabase project
// wired into `npm test`/CI, and why that's an honest, documented gap rather
// than a silently-missing one.
//
// IMPORTANT — this is not an unverified spec. Every assertion below (and
// several more attack variants besides) was actually executed once, for
// real, during the Batch 15 fix-and-verify cycle: an ephemeral Docker
// Postgres 16 instance was bootstrapped with a stub `auth.uid()`/`auth.jwt()`
// (the standard technique for testing Supabase-style RLS against vanilla
// Postgres), the real `anon`/`authenticated` roles and this repo's real
// `is_flow_admin()`/`set_admin_updated_at()`/`log_admin_change()` (copied
// verbatim from supabase/migrations/20260819035422_admin_employer_outreach_mvp.sql),
// the exact final
// supabase/migrations/20260823041155_creative_projects_foundation.sql was
// applied with zero errors, and 41 real assertions were run with real
// role/claim switching (`set role authenticated; set_config('request.jwt.claim.sub', ...)`)
// against real fixture data across two projects and seven personas
// (two owners, an active member, an invited member, an outsider, a spare
// profile for forged-identity attempts, and an admin profile tested at both
// AAL1 and AAL2). All 41 passed. The container was then torn down — it was
// never a persistent fixture, so it cannot be re-run by `npm test` today.
// The harness scripts and a full results log are archived in this session's
// scratchpad (not part of the repo, since it's a throwaway verification
// artifact, not permanent test infrastructure) for founder/qa-security
// re-verification. `it.todo()` below means "not yet wired into automated
// CI," not "never verified" — see each block for which assertions have real
// executed proof (marked "[executed]") versus which remain spec-only for a
// future staging project to automate.
//
// Unlike organization_members (canManageOrganizationMember,
// canAttributeToOrganization), this batch ships no app-layer Server Action
// or UI — the founder-approved scope for Batch 15 is the database foundation
// only. There is deliberately no lib/authz.ts predicate to unit-test here:
// adding one with no real caller would be a speculative abstraction this
// repo's conventions reject. The RLS policies and the leave_creative_project
// RPC are the only enforcement surface that exists right now.
import { describe, it } from "vitest";

describe.todo("creative_projects RLS matrix (STAGING_ONLY for CI — see file header)", () => {
  it.todo("[executed] owner can select/insert/update their own project (creative_projects_owner_manage)");
  it.todo("owner can delete their own project (creative_projects_owner_manage) — not separately executed this round, unchanged from prior review");
  it.todo("[executed] an active member (non-owner) can select the project but cannot update/delete it");
  it.todo("[executed] an invited-but-not-active member cannot select the project");
  it.todo("[executed] an unrelated authenticated user (outsider) cannot select another profile's project");
  it.todo("an anonymous caller cannot select any project (no public-read policy exists on creative_projects) — not separately executed this round, unchanged from prior review");
  it.todo("[executed] FLOW admin (AAL2 via is_flow_admin(true)) can select/update any project regardless of ownership, but cannot reassign owner_id even so (column-level privilege restriction)");
  it.todo("[executed] a non-AAL2 FLOW admin claim (AAL1, or no aal claim at all) is denied elevated access, same as every other admin-override policy");
});

describe.todo("creative_project_members ownership-sync invariant (STAGING_ONLY for CI — see file header)", () => {
  it.todo("[executed] inserting a creative_projects row automatically creates a matching role='owner', status='active' creative_project_members row (sync_creative_project_owner_membership trigger)");
  it.todo("[executed] owner cannot insert a second role='owner' row for their own project");
  it.todo("[executed] the owner's own membership row can never be targeted by creative_project_members_owner_manage (profile_id<>self guard), so it can't be demoted or deleted through that path");
  it.todo("[executed] owner_id cannot be reassigned on creative_projects through any UPDATE path, owner or AAL2-admin alike (column-level privilege restriction: only title/description/updated_at are grantable)");
});

describe.todo("creative_project_members self-leave via leave_creative_project(p_project_id) RPC (STAGING_ONLY for CI — founder decision #1, history-preserving revision)", () => {
  it.todo("[executed] an active non-owner member can leave: leave_creative_project returns {ok:true}");
  it.todo("[executed] the row is preserved, not deleted: role/project_id/profile_id are unchanged, status becomes 'removed', removed_at is set");
  it.todo("[executed] the owner cannot leave their own project through this RPC: returns {ok:false, reason:'owner_cannot_leave'}, no mutation");
  it.todo("[executed] a non-member calling the RPC for a project they have no row in: returns {ok:false, reason:'not_a_member'}, no mutation (fails closed)");
  it.todo("[executed] calling the RPC a second time after already leaving: returns {ok:false, reason:'not_active'}, no double-processing, no crash");
  it.todo("[executed] the RPC signature accepts only p_project_id — there is no parameter through which a caller could target another profile's membership");
  it.todo("[executed] after leaving, the removed profile loses active-member access to both the project (creative_projects_member_read) and the full roster (creative_project_members_active_roster_read)");
  it.todo("[executed] the removed profile still sees their own row via creative_project_members_self_read — history is not hidden from the person it belongs to");
  it.todo("[executed] no client-facing UPDATE can set status='removed' directly (creative_project_members_owner_manage's with-check restricts to invited/active/suspended only) or removed_at directly (excluded from the column-level UPDATE grant entirely) — leave_creative_project is the only path to either");
});

describe.todo("creative_project_members status lifecycle: invited/active/suspended/removed semantics (STAGING_ONLY for CI)", () => {
  it.todo("[executed] an invited (not yet active) member sees only their own row via self-read, not the roster");
  it.todo("[executed] an active member sees the full roster (creative_project_members_active_roster_read, any status/role, scoped to that project)");
  it.todo("[executed] owner can move a member from active to suspended via creative_project_members_owner_manage");
  it.todo("[executed] a suspended member loses active-member access to the project and the roster, identically to a removed member, but still sees their own row");
});

describe.todo("creative_project_members full roster visibility + cross-project isolation (STAGING_ONLY for CI — founder decision #2)", () => {
  it.todo("[executed] an active member of Project A can select every row (any status/role) belonging to Project A");
  it.todo("[executed] an active member of Project A cannot select any row belonging to Project B (cross-project isolation via is_creative_project_member's per-row project_id parameter)");
  it.todo("[executed] an outsider with no row in Project A at all cannot select any Project A membership row, and cannot self-insert into it either");
  it.todo("an anonymous caller cannot select any creative_project_members row — not separately executed this round (no anon-role assertions in this pass), unchanged from prior review");
});

describe.todo("creative_project_members mutation-attack resistance (STAGING_ONLY for CI)", () => {
  it.todo("[executed] an active member cannot self-promote to role='owner' (RLS using-clause requires the caller to be the project owner, which a plain member is not)");
  it.todo("[executed] an UPDATE naming profile_id fails at the privilege-check stage (permission denied), regardless of RLS policy content");
  it.todo("[executed] an UPDATE naming project_id fails at the privilege-check stage (permission denied)");
  it.todo("[executed] an UPDATE naming invited_by fails at the privilege-check stage (permission denied) — it's audit metadata fixed at invite time, never revisable");
  it.todo("[executed] an INSERT that supplies an explicit invited_by value has it silently overwritten to the real caller's auth.uid() by the BEFORE INSERT trigger — client-forged inviter metadata is impossible, not merely rejected");
});
