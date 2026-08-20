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
