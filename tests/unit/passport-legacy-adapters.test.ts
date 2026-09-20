import { describe, expect, it } from "vitest";
import { Claim } from "@flow/passport-contracts";
import { adaptLegacyVerification, assessClaim, type LegacyVerificationInput } from "@/lib/passport/domain";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";

const row = (over: Partial<LegacyVerificationInput> = {}): LegacyVerificationInput => ({
  id: U1,
  profile_id: U2,
  credential_type: "skill",
  title: "Certified welder",
  source: "self_reported",
  status: "pending",
  evidence_url: null,
  evidence_note: "private note with my address 12 Main St",
  reference_table: "profile_skill",
  reference_id: U3,
  witness_profile_id: null,
  organization_id: null,
  resolved_tier: null,
  verified_at: null,
  expires_at: null,
  revoked_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  ...over,
});

describe("legacy verification -> canonical claim adapter", () => {
  it("always produces a contract-valid Claim", () => {
    for (const status of ["pending", "verified", "rejected", "expired", "revoked"]) {
      const { claim } = adaptLegacyVerification(row({ status, resolved_tier: status === "verified" ? "admin_verified" : null, verified_at: "2026-08-02T00:00:00Z" }));
      expect(Claim.safeParse(claim).success, status).toBe(true);
    }
  });

  it("maps legacy 'pending' to 'submitted' — asserted, not verified", () => {
    const { claim, verification } = adaptLegacyVerification(row());
    expect(claim.status).toBe("submitted");
    expect(verification).toBeNull();
    expect(assessClaim(claim, null, new Date("2026-09-01T00:00:00Z"))).toEqual({ kind: "unverified" });
  });

  it("namespaces the claim type from the credential type", () => {
    expect(adaptLegacyVerification(row({ credential_type: "work" })).claim.claim_type).toBe("credential.work");
    expect(adaptLegacyVerification(row({ credential_type: null })).claim.claim_type).toBe("credential.skill");
  });

  it("maps each legacy tier to a canonical method without inventing strength", () => {
    const method = (tier: string) => adaptLegacyVerification(row({ status: "verified", resolved_tier: tier, verified_at: "2026-08-02T00:00:00Z" })).verification?.method;
    expect(method("admin_verified")).toBe("platform_verified");
    expect(method("collaborator_verified")).toBe("peer_attested");
    expect(method("organization_verified")).toBe("organization_verified");
    expect(method("auto_verified")).toBe("platform_verified");
    expect(adaptLegacyVerification(row({ status: "verified", resolved_tier: "something_new" })).verification).toBeNull();
  });

  it("names a distinct issuer only for organization-resolved claims", () => {
    expect(adaptLegacyVerification(row({ status: "verified", resolved_tier: "organization_verified", organization_id: U3 })).claim.issuer).toEqual({ kind: "entity", ref: { type: "organization", id: U3 } });
    expect(adaptLegacyVerification(row({ status: "verified", resolved_tier: "admin_verified" })).claim.issuer).toEqual({ kind: "subject" });
  });

  it("never copies the member's private evidence note into the claim", () => {
    const { claim, evidence } = adaptLegacyVerification(row());
    expect(JSON.stringify(claim)).not.toContain("12 Main St");
    expect(evidence).toEqual({ type: "note", has_link: false });
    expect(adaptLegacyVerification(row({ evidence_url: "https://example.com/proof" })).evidence).toEqual({ type: "link", has_link: true });
    expect(adaptLegacyVerification(row({ evidence_note: null })).evidence).toBeNull();
  });

  it("keeps legacy claims private (the public face is the credential badge)", () => {
    expect(adaptLegacyVerification(row({ status: "verified" })).claim.visibility).toBe("private");
  });

  it("an overdue legacy verified claim assesses as expired, not invalid", () => {
    const { claim } = adaptLegacyVerification(row({ status: "verified", resolved_tier: "admin_verified", expires_at: "2026-08-15T00:00:00Z" }));
    expect(assessClaim(claim, null, new Date("2026-09-01T00:00:00Z"))).toEqual({ kind: "expired" });
  });
});
