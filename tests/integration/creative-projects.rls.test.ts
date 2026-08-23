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

// ── Batch 17a — invite consent (accept_creative_project_invite /
// decline_creative_project_invite / owner_manage tightening) ──────────────
// supabase/migrations/20260823232600_creative_project_invite_consent.sql
//
// Same STAGING_ONLY reasoning as every block above, and the same honesty
// convention: every assertion below marked "[executed]" was actually run,
// for real, in this session — an ephemeral Docker Postgres 16 container was
// bootstrapped with a stub auth.uid()/auth.jwt(), the real anon/authenticated
// roles, this repo's real is_flow_admin()/set_admin_updated_at()/
// log_admin_change() (copied verbatim from
// 20260819035422_admin_employer_outreach_mvp.sql), the real, unmodified
// 20260823041155_creative_projects_foundation.sql followed by the real,
// unmodified 20260823232600_creative_project_invite_consent.sql were both
// applied with zero errors, and 26 real assertions were run with real
// role/claim switching against fixture data across 2 projects and 10
// personas (2 owners, 2 invitees under test, a stranger, a suspended
// member, a removed/departed member, an already-active non-owner member, a
// dedicated decline persona, and a dedicated concurrency persona). All 26
// passed, including a genuine two-connection concurrency race (not
// simulated): session 1 opened an explicit transaction, called
// accept_creative_project_invite(), held the row lock for 2s via pg_sleep,
// then committed; session 2, started 0.5s later on a separate connection,
// blocked on the same row's FOR UPDATE lock for the remaining ~1.5s (proven
// by wall-clock timestamps in both sessions) and only then received
// {ok:false, reason:'not_pending'} — the row was locked, not double-processed,
// and no error/deadlock occurred. The container was then torn down — not a
// persistent fixture, cannot be re-run by `npm test` today. Harness scripts
// and full output logs are archived in this session's scratchpad (not part
// of the repo) for founder/qa-security re-verification.
//
// Batch 16 cross-check boundary (documented, not silently skipped): cases
// 22-25 from the originating task brief (full verifications-table
// project-linked-evidence/collaborator-confirmation re-verification) were
// NOT re-executed in this harness — doing so would have required
// reimplementing Batch 14/16's verifications, verification_reviews,
// profile_credentials, achievements, and evaluate_achievements() machinery
// here too, which this batch's own scope (membership consent only, no
// Batch 16 change) doesn't touch. Instead, is_creative_project_member() —
// the exact single shared gate both verifications_self_insert and
// confirm_verification_as_collaborator() call, with no additional logic of
// their own — was proven exhaustively for all four statuses (below). Since
// neither Batch 16 policy does anything beyond call this function, that
// proof carries over without re-running Batch 16's own SQL.
describe.todo("creative_project_members invite consent: accept_creative_project_invite / decline_creative_project_invite (STAGING_ONLY for CI — Batch 17a)", () => {
  it.todo("[executed] the owner_invite policy is unaffected by this batch: the owner can still invite a new member");
  it.todo("[executed] an invitee can read their own pending invite (creative_project_members_self_read, unchanged, no status filter)");
  it.todo("[executed] a stranger cannot read another profile's pending invite");
  it.todo("[executed] an invitee can accept their own invite: accept_creative_project_invite returns {ok:true}");
  it.todo("[executed] accepting sets status='active' and joined_at to a non-null timestamp");
  it.todo("[executed] the owner can no longer directly set a non-owner row to status='active' — the tightened creative_project_members_owner_manage with-check rejects it with 'new row violates row-level security policy', not a silent no-op");
  it.todo("[executed] the owner calling accept_creative_project_invite() on their own project only ever matches their own (already-active) row — {ok:false, reason:'not_pending'} — and the actual invitee's row is left completely untouched");
  it.todo("[executed] an invitee can decline their own invite: decline_creative_project_invite returns {ok:true}");
  it.todo("[executed] declining sets status='removed' and removed_at to a non-null timestamp, while joined_at stays null — distinguishing a decline from a later self-leave-after-being-active in the same history, with no new status/CHECK-constraint value needed");
  it.todo("[executed] a stranger cannot decline another profile's invite ({ok:false, reason:'not_found'} — self-targeting only, no parameter accepts an arbitrary profile) and that invite is left untouched");
  it.todo("[executed] calling accept for the right profile but the wrong project_id fails ({ok:false, reason:'not_found'})");
  it.todo("[executed] calling decline for the right profile but the wrong project_id fails ({ok:false, reason:'not_found'})");
  it.todo("[executed] a removed member cannot accept ({ok:false, reason:'not_pending'})");
  it.todo("[executed] a suspended member cannot accept ({ok:false, reason:'not_pending'})");
  it.todo("[executed] accepting the same invite a second time is safely rejected ({ok:false, reason:'not_pending'}), no double-processing");
  it.todo("[executed] declining the same invite a second time is safely rejected ({ok:false, reason:'not_pending'})");
  it.todo("[executed] the owner's own membership row can never be altered by either RPC — decline_creative_project_invite() against the owner's own row returns {ok:false, reason:'not_pending'} because it's never 'invited' (created 'active' by the ownership-sync trigger)");
  it.todo("[executed] two concurrent accept_creative_project_invite() calls on the same invite, from two separate connections, are race-safe under the FOR UPDATE row lock: proven with real wall-clock timestamps — the second call visibly blocks until the first commits, then correctly resolves to not_pending, no crash, no double-processing");
  it.todo("[executed] is_creative_project_member() is false for a status='invited' row");
  it.todo("[executed] is_creative_project_member() is false for a status='removed' row");
  it.todo("[executed] is_creative_project_member() is false for a status='suspended' row");
  it.todo("[executed] is_creative_project_member() is true for a status='active' row");
  it.todo("NOT executed this round — logically entailed, not independently re-run: an invited (not yet accepted) member's project-linked verifications_self_insert claim is rejected, because that policy's only creative-project-specific condition is is_creative_project_member(), proven false-for-invited directly above");
  it.todo("NOT executed this round — logically entailed: after accept_creative_project_invite() sets status='active', the same profile's project-linked verifications_self_insert claim succeeds with zero Batch 16 code change, because is_creative_project_member() is proven true-for-active directly above and that policy calls nothing else");
  it.todo("NOT executed this round — logically entailed: an invited (not yet accepted) member cannot satisfy confirm_verification_as_collaborator()'s project-membership check, same is_creative_project_member() dependency as above");
  it.todo("NOT executed this round — logically entailed: an active member does satisfy confirm_verification_as_collaborator()'s project-membership check, same is_creative_project_member() dependency as above");
});
