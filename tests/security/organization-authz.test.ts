// Employer Multi-Admin authorization regression coverage — organization
// owner protections and member status handling. Mirrors the
// `organization_members_owner_manage` RLS policy (see
// supabase/migrations/20260820091500_organization_members_foundation.sql);
// canManageOrganizationMember (lib/authz.ts) is the single predicate both
// app/(app)/business/team/actions.ts and that RLS policy encode.
import { describe, expect, it } from "vitest";
import { canManageOrganizationMember, INVITABLE_ORGANIZATION_ROLES } from "@/lib/authz";

describe("organization owner protections: canManageOrganizationMember", () => {
  const callerId = "owner-1";

  it("owner can suspend/remove/reactivate a non-owner member", () => {
    expect(canManageOrganizationMember({ role: "admin", profile_id: "member-1" }, callerId)).toBe(true);
    expect(canManageOrganizationMember({ role: "recruiter", profile_id: "member-2" }, callerId)).toBe(true);
    expect(canManageOrganizationMember({ role: "manager", profile_id: "member-3" }, callerId)).toBe(true);
  });

  it("the owner's own membership row can never be targeted through this path, regardless of role field", () => {
    expect(canManageOrganizationMember({ role: "owner", profile_id: "owner-1" }, callerId)).toBe(false);
  });

  it("a role='owner' row can never be targeted, even if the caller id differs (defense against a spoofed row)", () => {
    expect(canManageOrganizationMember({ role: "owner", profile_id: "someone-else" }, callerId)).toBe(false);
  });

  it("a caller can never target their own row, even if (hypothetically) it weren't role='owner'", () => {
    expect(canManageOrganizationMember({ role: "admin", profile_id: callerId }, callerId)).toBe(false);
  });
});

describe("organization member status handling: invite role restrictions", () => {
  it("'owner' is never an invitable role — it's reserved for the organizations.owner_id-synced row", () => {
    expect(INVITABLE_ORGANIZATION_ROLES).not.toContain("owner");
    expect([...INVITABLE_ORGANIZATION_ROLES].sort()).toEqual(["admin", "manager", "recruiter"]);
  });
});
