import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CLAIM_STATUSES, CONNECTION_STATUSES, CONSENT_PURPOSES, CONSENT_STATUSES, CAPTURE_REQUEST_STATUSES, DATA_CATEGORIES, SENSITIVE_DATA_CATEGORIES, VERIFICATION_METHODS, type ClaimStatus, type DataCategory } from "@flow/passport-contracts";
import {
  CAPTURE_TRANSITIONS,
  CLAIM_TRANSITIONS,
  CONSENT_MAX_GRANT_DAYS,
  CONSENT_TRANSITIONS,
  PURPOSE_ALLOWED_CATEGORIES,
  VERIFICATION_METHOD_POLICY,
  assessClaim,
  availableVerificationMethods,
  canTransitionCapture,
  canTransitionClaim,
  canTransitionConsent,
  canonicalJson,
  consentPermits,
  effectiveCaptureStatus,
  effectiveClaimStatus,
  effectiveConnectionStatus,
  effectiveConsentStatus,
  isCaptureOpen,
  isRelyable,
  isTerminalClaimStatus,
  payloadFingerprint,
  statusForFailure,
  validateConsentApproval,
  validateConsentRequest,
} from "@/lib/passport/domain";

const NOW = new Date("2026-09-01T12:00:00Z");
const past = "2026-08-01T00:00:00Z";
const future = "2027-01-01T00:00:00Z";

describe("claim lifecycle", () => {
  it("defines a transition row for every status", () => {
    for (const status of CLAIM_STATUSES) expect(CLAIM_TRANSITIONS[status]).toBeDefined();
  });

  it("only ever transitions to a real status", () => {
    for (const from of CLAIM_STATUSES) for (const to of CLAIM_TRANSITIONS[from]) expect(CLAIM_STATUSES).toContain(to);
  });

  it("does not let a claim jump from draft straight to verified", () => {
    expect(canTransitionClaim("draft", "verified")).toBe(false);
    expect(canTransitionClaim("draft", "submitted")).toBe(true);
  });

  it("keeps terminal history terminal: rejected/expired/revoked can only be superseded", () => {
    for (const status of ["rejected", "expired", "revoked"] as ClaimStatus[]) {
      expect(CLAIM_TRANSITIONS[status]).toEqual(["superseded"]);
      expect(canTransitionClaim(status, "verified")).toBe(false);
      expect(canTransitionClaim(status, "submitted")).toBe(false);
    }
    expect(isTerminalClaimStatus("superseded")).toBe(true);
    expect(CLAIM_TRANSITIONS.superseded).toEqual([]);
  });

  it("lets freshness states recover to verified or degrade further", () => {
    expect(canTransitionClaim("stale", "verified")).toBe(true);
    expect(canTransitionClaim("disconnected", "verified")).toBe(true);
    expect(canTransitionClaim("verified", "stale")).toBe(true);
  });

  it("reads an overdue verified claim as expired even before any sweep ran", () => {
    expect(effectiveClaimStatus({ status: "verified", expires_at: past }, NOW)).toBe("expired");
    expect(effectiveClaimStatus({ status: "verified", expires_at: future }, NOW)).toBe("verified");
    expect(effectiveClaimStatus({ status: "verified", expires_at: null }, NOW)).toBe("verified");
    // Expiry only ages live claims; a draft/rejected claim keeps its status.
    expect(effectiveClaimStatus({ status: "submitted", expires_at: past }, NOW)).toBe("submitted");
    expect(effectiveClaimStatus({ status: "rejected", expires_at: past }, NOW)).toBe("rejected");
  });
});

describe("claim assessment — the four 'can't rely on it' situations stay distinct", () => {
  const verified = { status: "verified" as ClaimStatus, expires_at: future };

  it("valid: verified, unexpired, source healthy or n/a", () => {
    expect(assessClaim(verified, null, NOW)).toEqual({ kind: "valid" });
    expect(assessClaim(verified, "healthy", NOW)).toEqual({ kind: "valid" });
    expect(isRelyable(assessClaim(verified, "healthy", NOW))).toBe(true);
  });

  it("CLAIM EXPIRED is not CLAIM INVALID", () => {
    expect(assessClaim({ status: "verified", expires_at: past }, null, NOW)).toEqual({ kind: "expired" });
    expect(assessClaim({ status: "rejected", expires_at: null }, null, NOW)).toEqual({ kind: "invalid", because: "rejected" });
    expect(assessClaim({ status: "revoked", expires_at: null }, null, NOW)).toEqual({ kind: "invalid", because: "revoked" });
  });

  it("SOURCE UNAVAILABLE / CONNECTION DISCONNECTED does not make a claim invalid or expired", () => {
    for (const connection of ["disconnected", "auth_required", "error", "degraded", "stale"] as const) {
      const assessment = assessClaim(verified, connection, NOW);
      expect(assessment).toEqual({ kind: "source_unavailable", connection });
      expect(assessment.kind).not.toBe("invalid");
      expect(assessment.kind).not.toBe("expired");
      expect(isRelyable(assessment)).toBe(false);
    }
    expect(assessClaim({ status: "disconnected", expires_at: future }, null, NOW)).toEqual({ kind: "source_unavailable", connection: "unknown" });
    expect(assessClaim({ status: "stale", expires_at: future }, "healthy", NOW).kind).toBe("source_unavailable");
  });

  it("an unreviewed claim is unverified, never relyable", () => {
    for (const status of ["draft", "submitted", "under_review"] as ClaimStatus[]) {
      const a = assessClaim({ status, expires_at: null }, "healthy", NOW);
      expect(a).toEqual({ kind: "unverified" });
      expect(isRelyable(a)).toBe(false);
    }
  });

  it("superseded is its own outcome", () => {
    expect(assessClaim({ status: "superseded", expires_at: null }, null, NOW)).toEqual({ kind: "superseded" });
  });
});

describe("verification policy — methods differ in kind, not by a score", () => {
  it("covers every method in the contract", () => {
    for (const method of VERIFICATION_METHODS) expect(VERIFICATION_METHOD_POLICY[method]).toBeDefined();
  });

  it("AI/self assertion never yields verified on its own", () => {
    expect(VERIFICATION_METHOD_POLICY.self_attested.canYieldVerified).toBe(false);
    expect(VERIFICATION_METHOD_POLICY.self_attested.independentVerifier).toBe(false);
  });

  it("every method that can yield verified requires an independent verifier", () => {
    for (const method of VERIFICATION_METHODS) {
      const policy = VERIFICATION_METHOD_POLICY[method];
      if (policy.canYieldVerified) expect(policy.independentVerifier, method).toBe(true);
    }
  });

  it("entity-backed methods demand an explicit authority, platform_verified demands an admin", () => {
    expect(VERIFICATION_METHOD_POLICY.organization_verified.requiredAuthority).toBe("evidence_reviewer");
    expect(VERIFICATION_METHOD_POLICY.licensed_provider.requiredAuthority).toBe("credential_issuer");
    expect(VERIFICATION_METHOD_POLICY.platform_verified.platformAdmin).toBe(true);
    expect(VERIFICATION_METHOD_POLICY.platform_verified.requiredAuthority).toBeNull();
  });

  it("refuses to pretend government / external-source verification exists", () => {
    expect(VERIFICATION_METHOD_POLICY.government_issued.available).toBe(false);
    expect(VERIFICATION_METHOD_POLICY.external_source_verified.available).toBe(false);
    expect(availableVerificationMethods()).not.toContain("government_issued");
    expect(availableVerificationMethods()).not.toContain("external_source_verified");
    expect(availableVerificationMethods()).toContain("platform_verified");
  });

  it("carries no numeric strength anywhere", () => {
    for (const method of VERIFICATION_METHODS) {
      for (const value of Object.values(VERIFICATION_METHOD_POLICY[method])) expect(typeof value).not.toBe("number");
    }
  });
});

describe("consent lifecycle", () => {
  it("has a transition row for every status and only real targets", () => {
    for (const status of CONSENT_STATUSES) {
      expect(CONSENT_TRANSITIONS[status]).toBeDefined();
      for (const to of CONSENT_TRANSITIONS[status]) expect(CONSENT_STATUSES).toContain(to);
    }
  });

  it("follows REQUEST -> APPROVE/DECLINE -> ACTIVE -> EXPIRE/REVOKE and nothing else", () => {
    expect(canTransitionConsent("requested", "active")).toBe(true);
    expect(canTransitionConsent("requested", "declined")).toBe(true);
    expect(canTransitionConsent("active", "revoked")).toBe(true);
    expect(canTransitionConsent("active", "expired")).toBe(true);
    // No resurrection: a decided/ended grant never comes back — a new request is needed.
    for (const dead of ["declined", "revoked", "expired", "withdrawn"] as const) {
      for (const to of CONSENT_STATUSES) expect(canTransitionConsent(dead, to), `${dead} -> ${to}`).toBe(false);
    }
    // A pending request can't be revoked (nothing granted yet) and an active grant can't be re-declined.
    expect(canTransitionConsent("requested", "revoked")).toBe(false);
    expect(canTransitionConsent("active", "declined")).toBe(false);
  });

  it("treats an overdue active grant as expired at read time", () => {
    expect(effectiveConsentStatus({ status: "active", expires_at: past }, NOW)).toBe("expired");
    expect(effectiveConsentStatus({ status: "requested", expires_at: past }, NOW)).toBe("expired");
    expect(effectiveConsentStatus({ status: "active", expires_at: future }, NOW)).toBe("active");
    expect(effectiveConsentStatus({ status: "revoked", expires_at: future }, NOW)).toBe("revoked");
  });

  it("permits a category only while active AND approved for exactly that category", () => {
    const grant = { status: "active" as const, expires_at: future, approved_categories: ["credentials"] as DataCategory[] };
    expect(consentPermits(grant, "credentials", NOW)).toBe(true);
    expect(consentPermits(grant, "skills", NOW)).toBe(false);
    expect(consentPermits({ ...grant, expires_at: past }, "credentials", NOW)).toBe(false);
    expect(consentPermits({ ...grant, status: "revoked" as never }, "credentials", NOW)).toBe(false);
    expect(consentPermits({ ...grant, status: "requested" as never }, "credentials", NOW)).toBe(false);
  });

  describe("purpose-bound minimisation", () => {
    it("defines allowed categories for every purpose, all of them real", () => {
      for (const purpose of CONSENT_PURPOSES) {
        expect(PURPOSE_ALLOWED_CATEGORIES[purpose].length).toBeGreaterThan(0);
        for (const category of PURPOSE_ALLOWED_CATEGORIES[purpose]) expect(DATA_CATEGORIES).toContain(category);
      }
    });

    it("rejects categories outside the purpose", () => {
      expect(validateConsentRequest("event_entry", ["credentials"])).toEqual({ ok: true });
      expect(validateConsentRequest("event_entry", ["work_history"])).toEqual({ ok: false, problem: "category_not_allowed_for_purpose" });
      expect(validateConsentRequest("hiring_review", ["location"])).toEqual({ ok: false, problem: "category_not_allowed_for_purpose" });
      expect(validateConsentRequest("credential_check", ["credentials", "contact"])).toEqual({ ok: false, problem: "category_not_allowed_for_purpose" });
      expect(validateConsentRequest("hiring_review", [])).toEqual({ ok: false, problem: "no_categories" });
      expect(validateConsentRequest("hiring_review", ["skills", "skills"])).toEqual({ ok: false, problem: "duplicate_category" });
    });

    it("no purpose bundles a sensitive category with a non-sensitive one implicitly", () => {
      // Sensitive categories exist only where the purpose actually needs them, and are still opt-in per request.
      expect(SENSITIVE_DATA_CATEGORIES).toEqual(["evidence_artifacts", "contact", "location"]);
      expect(PURPOSE_ALLOWED_CATEGORIES.credential_check).not.toContain("evidence_artifacts");
      expect(PURPOSE_ALLOWED_CATEGORIES.event_entry).not.toContain("location");
    });
  });

  describe("approval", () => {
    const base = { requested: ["credentials", "skills"] as DataCategory[], now: NOW };
    const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

    it("may narrow a request but never widen it", () => {
      expect(validateConsentApproval({ ...base, approved: ["credentials"], expiresAt: days(30) })).toEqual({ ok: true });
      expect(validateConsentApproval({ ...base, approved: ["credentials", "contact"], expiresAt: days(30) })).toEqual({ ok: false, problem: "approved_exceeds_request" });
      expect(validateConsentApproval({ ...base, approved: [], expiresAt: days(30) })).toEqual({ ok: false, problem: "nothing_approved" });
    });

    it("is always time-limited", () => {
      expect(validateConsentApproval({ ...base, approved: ["skills"], expiresAt: days(-1) })).toEqual({ ok: false, problem: "expiry_not_in_future" });
      expect(validateConsentApproval({ ...base, approved: ["skills"], expiresAt: days(CONSENT_MAX_GRANT_DAYS + 1) })).toEqual({ ok: false, problem: "expiry_too_far" });
      expect(validateConsentApproval({ ...base, approved: ["skills"], expiresAt: days(CONSENT_MAX_GRANT_DAYS) })).toEqual({ ok: true });
    });
  });
});

describe("capture request lifecycle", () => {
  it("covers every status", () => {
    for (const status of CAPTURE_REQUEST_STATUSES) expect(CAPTURE_TRANSITIONS[status]).toBeDefined();
  });

  it("has no way out of a closed request", () => {
    for (const closed of ["completed", "failed", "cancelled", "expired"] as const) {
      for (const to of CAPTURE_REQUEST_STATUSES) expect(canTransitionCapture(closed, to), `${closed} -> ${to}`).toBe(false);
    }
  });

  it("does not require Capture to report every intermediate state", () => {
    // Capture may deliver a package straight after 'requested' if it never sent 'accepted'/'started'.
    expect(canTransitionCapture("requested", "completed")).toBe(true);
    expect(canTransitionCapture("accepted", "started")).toBe(true);
    expect(canTransitionCapture("started", "accepted")).toBe(false);
  });

  it("treats an overdue open request as expired", () => {
    expect(effectiveCaptureStatus({ status: "started", expires_at: past }, NOW)).toBe("expired");
    expect(isCaptureOpen({ status: "started", expires_at: past }, NOW)).toBe(false);
    expect(isCaptureOpen({ status: "requested", expires_at: future }, NOW)).toBe(true);
    // A completed request stays completed even after its expiry passes.
    expect(effectiveCaptureStatus({ status: "completed", expires_at: past }, NOW)).toBe("completed");
  });
});

describe("connection health", () => {
  const conn = (over = {}) => ({ status: "healthy" as const, last_success_at: "2026-09-01T11:59:00Z", stale_after_seconds: 3600, ...over });

  it("reports healthy only while success is recent", () => {
    expect(effectiveConnectionStatus(conn(), NOW)).toBe("healthy");
    expect(effectiveConnectionStatus(conn({ last_success_at: "2026-09-01T09:00:00Z" }), NOW)).toBe("stale");
    expect(effectiveConnectionStatus(conn({ last_success_at: null }), NOW)).toBe("stale");
  });

  it("never upgrades an unhealthy stored status", () => {
    for (const status of CONNECTION_STATUSES.filter((s) => s !== "healthy")) {
      expect(effectiveConnectionStatus(conn({ status }), NOW)).toBe(status);
    }
  });

  it("maps failure categories to the status they cause", () => {
    expect(statusForFailure("auth")).toBe("auth_required");
    expect(statusForFailure("network")).toBe("degraded");
    expect(statusForFailure("source_unavailable")).toBe("degraded");
    expect(statusForFailure("schema")).toBe("error");
  });
});

describe("payload fingerprint (idempotency)", () => {
  it("is independent of key order", async () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] } })).toBe(canonicalJson({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
    expect(await payloadFingerprint({ a: 1, b: 2 })).toBe(await payloadFingerprint({ b: 2, a: 1 }));
  });

  it("changes when content changes, and ignores undefined fields", async () => {
    expect(await payloadFingerprint({ a: 1 })).not.toBe(await payloadFingerprint({ a: 2 }));
    expect(await payloadFingerprint({ a: 1, b: undefined })).toBe(await payloadFingerprint({ a: 1 }));
    expect(await payloadFingerprint([1, 2])).not.toBe(await payloadFingerprint([2, 1]));
  });
});

describe("domain layer stays extractable", () => {
  // lib/passport/domain must be importable by a future standalone Passport
  // service: no framework, no database client, no app code — only the shared
  // contracts and sibling domain modules.
  const dir = path.resolve(__dirname, "../../lib/passport/domain");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));

  it("imports only @flow/passport-contracts and sibling modules", () => {
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = match[1];
        expect(spec === "@flow/passport-contracts" || spec.startsWith("./"), `${file} imports "${spec}"`).toBe(true);
      }
    }
  });
});
