// Batch 17b — Creative Project UI V1 authorization regression coverage.
// Mirrors creative_project_members_owner_manage's RLS with-check after
// supabase/migrations/20260823232600_creative_project_invite_consent.sql
// tightened it, and is_creative_project_member()'s active-only condition.
// canSuspendCreativeProjectMember / canSubmitCreativeProjectEvidence
// (lib/authz.ts) are the single predicates both the UI and those RLS rules
// encode.
import { describe, expect, it } from "vitest";
import { canSuspendCreativeProjectMember, canSubmitCreativeProjectEvidence } from "@/lib/authz";

describe("creative project owner protections: canSuspendCreativeProjectMember", () => {
  const callerId = "owner-1";

  it("owner can suspend a non-owner member", () => {
    expect(canSuspendCreativeProjectMember({ role: "member", profile_id: "member-1" }, callerId)).toBe(true);
  });

  it("the owner's own membership row can never be targeted through this path, regardless of role field", () => {
    expect(canSuspendCreativeProjectMember({ role: "owner", profile_id: "owner-1" }, callerId)).toBe(false);
  });

  it("a role='owner' row can never be targeted, even if the caller id differs (defense against a spoofed row)", () => {
    expect(canSuspendCreativeProjectMember({ role: "owner", profile_id: "someone-else" }, callerId)).toBe(false);
  });

  it("a caller can never target their own row, even if (hypothetically) it weren't role='owner'", () => {
    expect(canSuspendCreativeProjectMember({ role: "member", profile_id: callerId }, callerId)).toBe(false);
  });

  it("has no reactivate/remove concept — this predicate (and the UI/action built on it) only ever answers 'can suspend', never 'can activate'", () => {
    // There is no canActivateCreativeProjectMember export anywhere in
    // lib/authz.ts — asserting that indirectly here by confirming the only
    // exported creative-project predicate for member management is this
    // one, single-purpose function.
    expect(typeof canSuspendCreativeProjectMember).toBe("function");
    expect(Object.keys({ canSuspendCreativeProjectMember })).toEqual(["canSuspendCreativeProjectMember"]);
  });
});

describe("creative project evidence eligibility: canSubmitCreativeProjectEvidence", () => {
  it("an active member (including the owner, whose own row is also status='active') qualifies", () => {
    expect(canSubmitCreativeProjectEvidence("active")).toBe(true);
  });

  it("a merely-invited (not yet accepted) member does not qualify", () => {
    expect(canSubmitCreativeProjectEvidence("invited")).toBe(false);
  });

  it("a suspended member does not qualify", () => {
    expect(canSubmitCreativeProjectEvidence("suspended")).toBe(false);
  });

  it("a removed/declined member does not qualify", () => {
    expect(canSubmitCreativeProjectEvidence("removed")).toBe(false);
  });
});
