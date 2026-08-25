// Pure authorization predicates — no Next.js/Supabase imports, so these are
// safe to unit test in isolation and safe to import from any runtime. Each
// function here is the single source of truth for a rule that is *also*
// enforced independently by RLS (see the referenced migration/policy in each
// doc comment) — production code calls these directly rather than
// reimplementing the same boolean logic inline, so there is only one place
// this logic can drift from what the tests (and the database) expect.

/**
 * FLOW-SEC-001 — Cross-Organization Listing Attribution.
 *
 * The exact rule enforced by the `opportunities_creator_manage` /
 * `events_creator_manage` RLS policies' WITH CHECK clause (see
 * supabase/migrations/20260820134812_organization_attribution_authorization.sql):
 * an unattributed (`null`) target is always allowed — that's a personal
 * posting, unrelated to any organization. Otherwise the caller must own the
 * organization they're attributing content to; there is no member-level
 * posting right yet (intentionally deferred) and no admin bypass (none
 * exists for content creation today).
 *
 * Because the RLS WITH CHECK applies identically to INSERT and UPDATE, this
 * single predicate models both "can this user create an org-attributed
 * posting" and "can this user reassign an existing posting's organization" —
 * there is no separate rule for the two cases.
 */
export function canAttributeToOrganization(ownedOrganizationId: string | null, targetOrganizationId: string | null): boolean {
  if (targetOrganizationId === null) return true;
  return ownedOrganizationId === targetOrganizationId;
}

/**
 * FLOW-SEC-002 — Event ↔ Opportunity organization integrity (Batch A:
 * Event Team Builder).
 *
 * Founder-locked rule: a staffing opportunity may only be linked to an
 * event owned by the *same* organization — never UI-filtering alone.
 * `createOpportunityAction` (lib/actions.ts) independently fetches the
 * target event server-side (never trusts a client-supplied event row) and
 * calls this predicate exactly like `canAttributeToOrganization` above; it
 * is the single source of truth for the rule, so a client bypassing the
 * form can't reach a different outcome than the UI shows.
 *
 * `event === null` models "an event_id was supplied but no such event
 * exists" (the caller looked it up and got nothing back) — always DENY.
 * A `null` event_id itself (no link requested) is not this function's
 * concern; the caller skips calling it entirely in that case, same as
 * `canAttributeToOrganization` skips no-org postings.
 *
 * For an organization-owned event, the linked opportunity must be
 * attributed to that exact same organization. For a personal
 * (organization-less) event, only that event's own creator may link a
 * personal (organization-less) opportunity to it — treating "same
 * creator" as the personal-event equivalent of "same organization" closes
 * what would otherwise be an identity-spoofing gap: two different users'
 * organization-less rows would both satisfy a naive `null === null`
 * organization check.
 *
 * A `cancelled`/`completed` event is always rejected, matching the
 * eligible-events picker's own filter (app/(app)/business/post/page.tsx) —
 * before this check existed, a direct POST bypassing that picker could
 * still link to one of the organizer's own past/cancelled events even
 * though the UI never offered it. `draft`/`published` (and any other
 * status not yet in that terminal set) are unaffected.
 */
export function canLinkOpportunityToEvent(
  event: { organization_id: string | null; created_by: string; status: string } | null,
  opportunityOrganizationId: string | null,
  callerId: string,
): boolean {
  if (!event) return false;
  if (event.status === "cancelled" || event.status === "completed") return false;
  if (event.organization_id !== null) return opportunityOrganizationId === event.organization_id;
  return opportunityOrganizationId === null && event.created_by === callerId;
}

/**
 * Mirrors the `organization_members_owner_manage` RLS policy: the org owner
 * may suspend/reactivate/remove any non-owner member, but never the
 * `role = 'owner'` row and never their own row (self-management through
 * this path is blocked both here and in RLS — see
 * supabase/migrations/20260820091500_organization_members_foundation.sql).
 */
export function canManageOrganizationMember(target: { role: string; profile_id: string }, callerId: string): boolean {
  if (target.role === "owner") return false;
  if (target.profile_id === callerId) return false;
  return true;
}

/**
 * Roles grantable through the invite flow (app/(app)/business/team/actions.ts
 * inviteOrganizationMemberAction) — 'owner' is deliberately excluded, both
 * here and in the `organization_members_owner_invite` RLS policy's
 * `role <> 'owner'` check: that role is reserved for the row
 * sync_organization_owner_membership() creates from organizations.owner_id.
 */
export const INVITABLE_ORGANIZATION_ROLES = ["admin", "recruiter", "manager"] as const;

/**
 * Mirrors creative_project_members_owner_manage's RLS with-check after
 * supabase/migrations/20260823232600_creative_project_invite_consent.sql
 * tightened it: the project owner may suspend any non-owner member, but
 * never their own row and never the role='owner' row. Unlike
 * canManageOrganizationMember, there is deliberately no reactivate/remove
 * case to model here — that with-check no longer permits the owner to set
 * status='active' at all (only accept_creative_project_invite() can,
 * self-service only) and never permitted status='removed' even before that
 * batch. A suspended member currently has no path back to active in this
 * batch — a known, disclosed follow-up gap, not something this predicate
 * should paper over by pretending a reactivate action exists.
 */
export function canSuspendCreativeProjectMember(target: { role: string; profile_id: string }, callerId: string): boolean {
  if (target.role === "owner") return false;
  if (target.profile_id === callerId) return false;
  return true;
}

/**
 * Mirrors is_creative_project_member()'s exact condition (status='active') —
 * the same gate verifications_self_insert and confirm_verification_as_collaborator()
 * use to decide whether a project-linked evidence claim/confirmation is
 * allowed. A pending invitee, a suspended member, and a removed/declined
 * member must never see the project-linked evidence entry point — accepting
 * membership is never itself proof of a contribution. See
 * supabase/migrations/20260823145545_verifications_creative_project_reference.sql.
 */
export function canSubmitCreativeProjectEvidence(status: string): boolean {
  return status === "active";
}

/**
 * Mirrors is_application_participant()'s exact condition (caller is the
 * applicant, status='completed') — the same gate verifications_self_insert
 * uses to decide whether an application-linked evidence claim is allowed.
 * Deliberately NOT gated on worker_ack_at: that column has no effect
 * anywhere else in this codebase today (set only by
 * acknowledgeCompletionAction, read only by WorkCard.tsx to toggle a
 * checkmark string) and requiring it here would block a legitimate,
 * common case — an employer-confirmed completion the worker simply hasn't
 * clicked an optional secondary button for yet — for no corresponding trust
 * gain. `application` is `null` to model "no such application" (a bad/
 * tampered application_id) or "not this caller's application" the same
 * way; the caller supplies whichever is true, this function doesn't
 * distinguish them, mirroring canLinkOpportunityToEvent's `event === null`
 * convention. See
 * supabase/migrations/20260824230000_verifications_application_reference.sql.
 */
export function canSubmitApplicationEvidence(application: { applicant_id: string; status: string } | null, callerId: string): boolean {
  if (!application) return false;
  return application.applicant_id === callerId && application.status === "completed";
}

export type AdminAccessState = "signed-out" | "not-admin" | "mfa-not-enrolled" | "aal1" | "aal2";

/**
 * Which of the 5 Admin Access Gateway states applies, given the raw signals
 * lib/admin/auth.ts's getAdminAccessState() gathers from Supabase. Pure
 * decision logic only — never itself a source of truth for whether access
 * is actually granted (requireAdmin/requireSecureAdmin, both backed by the
 * database's is_flow_admin(), remain the only real gates). Precedence
 * matters: signed-out beats everything (nothing else can be known yet),
 * not-admin beats the MFA checks (an MFA factor doesn't imply admin
 * rights — see app/admin/access/page.tsx's copy for that same point made
 * to the visitor), and aal2 only applies once both isAdmin and aal2 are
 * true together.
 */
export function deriveAdminAccessState(signals: { hasUser: boolean; isAdmin: boolean; aal2: boolean; hasVerifiedMfaFactor: boolean }): AdminAccessState {
  if (!signals.hasUser) return "signed-out";
  if (!signals.isAdmin) return "not-admin";
  if (signals.aal2) return "aal2";
  return signals.hasVerifiedMfaFactor ? "aal1" : "mfa-not-enrolled";
}
