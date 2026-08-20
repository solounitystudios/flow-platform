// Admin Access Gateway — regression coverage for deriveAdminAccessState
// (lib/authz.ts), the pure decision logic behind app/admin/access/page.tsx.
// This is never itself an authorization gate — requireAdmin/requireSecureAdmin
// (lib/admin/auth.ts), both backed by the database's is_flow_admin(), remain
// the only real gates, unchanged by this page's existence. These tests exist
// to lock in the precedence rules: signed-out beats everything, not-admin
// beats the MFA checks (having a second factor never implies admin rights),
// and aal2 requires both isAdmin and aal2 true together.
import { describe, expect, it } from "vitest";
import { deriveAdminAccessState } from "@/lib/authz";
import { isSafeInternalPath } from "@/lib/redirect-safety";

describe("deriveAdminAccessState", () => {
  it("signed out: no user at all", () => {
    expect(deriveAdminAccessState({ hasUser: false, isAdmin: false, aal2: false, hasVerifiedMfaFactor: false })).toBe("signed-out");
  });

  it("signed out beats everything else, even if other signals look admin-like (defensive — should never actually happen)", () => {
    expect(deriveAdminAccessState({ hasUser: false, isAdmin: true, aal2: true, hasVerifiedMfaFactor: true })).toBe("signed-out");
  });

  it("authenticated but not admin: a verified MFA factor does NOT imply admin rights", () => {
    expect(deriveAdminAccessState({ hasUser: true, isAdmin: false, aal2: false, hasVerifiedMfaFactor: true })).toBe("not-admin");
  });

  it("admin, never enrolled a second factor", () => {
    expect(deriveAdminAccessState({ hasUser: true, isAdmin: true, aal2: false, hasVerifiedMfaFactor: false })).toBe("mfa-not-enrolled");
  });

  it("admin, has a verified factor, but this session is still AAL1 (e.g. new device)", () => {
    expect(deriveAdminAccessState({ hasUser: true, isAdmin: true, aal2: false, hasVerifiedMfaFactor: true })).toBe("aal1");
  });

  it("fully verified: admin and AAL2", () => {
    expect(deriveAdminAccessState({ hasUser: true, isAdmin: true, aal2: true, hasVerifiedMfaFactor: true })).toBe("aal2");
  });

  it("aal2 only applies when isAdmin is also true — an aal2 session alone never implies admin rights (defensive — is_flow_admin() gates isAdmin first in practice)", () => {
    expect(deriveAdminAccessState({ hasUser: true, isAdmin: false, aal2: true, hasVerifiedMfaFactor: true })).toBe("not-admin");
  });
});

describe("Admin Access Gateway: safe next-destination handling", () => {
  // The gateway (app/admin/access/page.tsx) and the extended /admin/mfa
  // (app/admin/(gated)/mfa/page.tsx) both validate their `next` query param
  // through this same function before ever using it in a redirect or
  // window.location.href — reusing tests/security/redirect-safety.test.ts's
  // coverage rather than duplicating it; this test just confirms the
  // gateway's own default fallback path resolves to something safe.
  it("a validated destination is always a same-origin path", () => {
    expect(isSafeInternalPath("/admin")).toBe(true);
    expect(isSafeInternalPath("/admin/verification")).toBe(true);
  });

  it("an external or malformed next is rejected, matching the gateway's fallback-to-/admin behavior", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
  });
});
