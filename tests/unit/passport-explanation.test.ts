import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ClaimExplanation, VERIFICATION_METHODS } from "@flow/passport-contracts";
import {
  PASSPORT_VIEWS,
  PUBLIC_VALUE_FIELDS,
  VERIFICATION_METHOD_LABEL,
  buildCredentialCheckView,
  claimTitle,
  explainClaim,
  presentPublicClaim,
  projectClaimForOwner,
  reasonLabel,
  type ClaimRowInput,
  type PublicClaimRow,
} from "@/lib/passport/domain";
import { getPublicClaimById, getPublicClaimsForProfile } from "@/lib/passport/data/claims";

const U = { claim: "11111111-1111-4111-8111-111111111111", subject: "22222222-2222-4222-8222-222222222222", ev: "33333333-3333-4333-8333-333333333333" };
const NOW = new Date("2026-09-01T12:00:00Z");

const base = (over: Record<string, unknown> = {}) => ({
  viewer: "owner",
  claim: {
    id: U.claim, claim_type: "credential.license", subject: { type: "person", id: U.subject }, status: "verified", effective_status: "verified",
    effective_at: "2026-08-01T00:00:00Z", expires_at: "2027-03-01T00:00:00Z", visibility: "public", created_at: "2026-07-30T00:00:00Z",
    sensitivity: "standard", status_reason_code: null,
  },
  source: { system: "manual", ref: "INTERNAL-REF-77" },
  issuer: { kind: "entity", entity_type: "organization", label: "Buffalo Welding Guild" },
  verification: { method: "organization_verified", verifier: { kind: "organization", label: "Buffalo Welding Guild" }, decided_at: "2026-08-02T00:00:00Z", expires_at: "2027-03-01T00:00:00Z", reason_code: "documents_checked" },
  evidence: [{ id: U.ev, evidence_type: "document", source_kind: "manual_upload", captured_at: "2026-07-30T00:00:00Z", sensitivity: "sensitive", status: "received", artifact_count: 1, role: "supports" }],
  pending_verifications: [],
  history: [{ type: "claim.created", at: "2026-07-30T00:00:00Z" }, { type: "claim.verified", at: "2026-08-02T00:00:00Z" }],
  ...over,
});

const publicView = () =>
  base({
    viewer: "public",
    claim: { ...base().claim, sensitivity: null, status_reason_code: null },
    source: { system: "manual", ref: null },
    verification: { ...base().verification, reason_code: null },
    evidence: { count: 1 },
    history: [],
  });

describe("ClaimExplanation contract", () => {
  it("accepts an owner view and a public view", () => {
    expect(ClaimExplanation.safeParse(base()).success).toBe(true);
    expect(ClaimExplanation.safeParse(publicView()).success).toBe(true);
  });

  it("has no field that could carry a source document, artifact reference or evidence note", () => {
    const keys = JSON.stringify(Object.keys(ClaimExplanation.shape)) + JSON.stringify(Object.keys((ClaimExplanation.shape.claim as unknown as { shape: object }).shape));
    for (const forbidden of ["artifacts", "artifact", "storage", "provenance", "note", "notes", "url", "value"]) expect(keys).not.toContain(`"${forbidden}"`);
  });

  it("the wire-shape key lists asserted by the DB suite equal the zod contract", () => {
    const dbTest = fs.readFileSync(path.resolve(__dirname, "../db/passport_v2_explanation.test.sql"), "utf8");
    const keys = (label: string) => {
      const line = dbTest.split("\n").find((l) => l.includes(`'${label}'`));
      expect(line, label).toBeTruthy();
      const list = (line as string).match(/unnest\(array\[([^\]]*)\]\)/)?.[1] ?? "";
      return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    };
    const shape = (schema: unknown) => Object.keys((schema as { shape: object }).shape).sort();
    expect(keys("explanation top-level keys")).toEqual(["ok", ...shape(ClaimExplanation)].sort());
    expect(keys("explanation claim keys")).toEqual(shape(ClaimExplanation.shape.claim));
    const verification = (ClaimExplanation.shape.verification as unknown as { unwrap(): unknown }).unwrap();
    expect(keys("explanation verification keys")).toEqual(shape(verification));
  });
});

describe("explainClaim", () => {
  it("answers 'why does Passport show this?' for the owner, with the whole chain", () => {
    const view = explainClaim(ClaimExplanation.parse(base()));
    expect(view.headline).toBe("Passport shows this because it was verified by Buffalo Welding Guild.");
    const detail = Object.fromEntries(view.steps.map((s) => [s.label, s.detail]));
    expect(detail).toMatchObject({ Source: "Added by the member", "Issued by": "Buffalo Welding Guild", Evidence: "1 item", Basis: "Documents were checked" });
    expect(detail["Verification"]).toContain("Verified by an organization");
    expect(view.evidenceLines).toEqual(["Document · Jul 30, 2026 · restricted"]);
    expect(view.timeline.map((t) => t.what)).toEqual(["claim · created", "claim · verified"]);
  });

  it("tells the public only what the response allowed — a count, never the items or the reason", () => {
    const view = explainClaim(ClaimExplanation.parse(publicView()));
    expect(view.evidenceLines).toEqual([]);
    expect(view.timeline).toEqual([]);
    const text = JSON.stringify(view);
    expect(text).toContain("1 item (not shown)");
    expect(text).not.toContain("Documents were checked");
    expect(text).not.toContain("INTERNAL-REF");
    expect(text).not.toContain("restricted");
  });

  it("distinguishes expired, rejected and never-verified — different situations, different words", () => {
    const expired = explainClaim(ClaimExplanation.parse(base({ claim: { ...base().claim, effective_status: "expired" } })));
    expect(expired.status).toEqual({ label: "Expired", tone: "warning" });
    expect(expired.headline).toBe("This was verified by Buffalo Welding Guild, but it has since expired.");
    const rejected = explainClaim(ClaimExplanation.parse(base({ claim: { ...base().claim, status: "rejected", effective_status: "rejected", status_reason_code: "insufficient_evidence" }, verification: null })));
    expect(rejected.status.tone).toBe("danger");
    expect(rejected.steps.find((s) => s.label === "Reason")?.detail).toBe("There wasn't enough evidence");
    const unverified = explainClaim(ClaimExplanation.parse(base({ claim: { ...base().claim, status: "submitted", effective_status: "submitted" }, verification: null })));
    expect(unverified.steps.find((s) => s.label === "Verification")?.detail).toBe("No one has verified this");
    const stale = explainClaim(ClaimExplanation.parse(base({ claim: { ...base().claim, effective_status: "stale" } })));
    expect(stale.status.tone).toBe("warning");
    expect(stale.status.label).toBe("Source not recently confirmed");
  });

  it("says a claim waiting on a reviewer is waiting, not verified", () => {
    const view = explainClaim(ClaimExplanation.parse(base({ claim: { ...base().claim, status: "under_review", effective_status: "under_review" }, verification: null, pending_verifications: [{ method: "peer_attested", status: "requested", requested_at: "2026-08-01T00:00:00Z" }] })));
    expect(view.steps.find((s) => s.label === "Verification")?.detail).toBe("Waiting on 1 reviewer");
    expect(view.status.tone).toBe("neutral");
  });

  it("describes a Flow source-record verification honestly (not as an admin or a peer)", () => {
    const view = explainClaim(ClaimExplanation.parse(base({ source: { system: "flow_platform", ref: null }, issuer: { kind: "entity", entity_type: "person", label: "Sam Host" }, verification: { method: "platform_verified", verifier: { kind: "system", label: "Flow" }, decided_at: "2026-08-02T00:00:00Z", expires_at: null, reason_code: "source_record" } })));
    expect(view.headline).toBe("Passport shows this because it was verified by Flow.");
    const detail = Object.fromEntries(view.steps.map((s) => [s.label, s.detail]));
    expect(detail.Source).toBe("Flow's own records");
    expect(detail.Basis).toBe("Confirmed from the source record");
  });

  it("labels every verification method and never ranks them", () => {
    for (const method of VERIFICATION_METHODS) expect(VERIFICATION_METHOD_LABEL[method]).toBeTruthy();
    expect(Object.values(VERIFICATION_METHOD_LABEL).some((l) => /\d/.test(l) || /score|rank|level|tier/i.test(l))).toBe(false);
  });

  it("falls back to a readable phrase for an unknown reason code", () => {
    expect(reasonLabel("some_new_code")).toBe("some new code");
  });
});

describe("contextual projections", () => {
  const row = (over: Partial<ClaimRowInput> = {}): ClaimRowInput => ({
    id: U.claim, claim_type: "participation.activity", value: { title: "Welding workshop", activity_type: "workshop", activity_id: "SECRET-ACTIVITY-ID", internal: "x" },
    status: "verified", effective_at: "2026-08-01T00:00:00Z", expires_at: null, visibility: "public", sensitivity: "standard", source_system: "flow_platform", created_at: "2026-08-01T00:00:00Z", ...over,
  });

  it("names the implemented views and marks every other as designed — nothing pretends to exist", () => {
    expect(Object.entries(PASSPORT_VIEWS).filter(([, v]) => v.implemented).map(([k]) => k).sort()).toEqual(["credential_check", "owner", "public"]);
    for (const designed of ["employer", "business", "event", "program", "guardian", "agency", "crew"] as const) expect(PASSPORT_VIEWS[designed].implemented).toBe(false);
    expect(PASSPORT_VIEWS.agency.basis).toMatch(/never full-Passport browsing/);
  });

  it("owner view keeps everything the owner needs", () => {
    const view = projectClaimForOwner(row({ visibility: "private" }), NOW);
    expect(view).toMatchObject({ title: "Welding workshop (Workshop)", status: "verified", visibility: "private" });
  });

  // The public read path is passport_public_claims() (M1): it returns rows already restricted to eligible claims
  // (public + verified + unexpired + standard + Passport-derived, public Passport, not blocked). Eligibility is
  // asserted in tests/db; here we prove the presenter/data layer add no widening of their own.
  const publicRow = (over: Partial<PublicClaimRow> = {}): PublicClaimRow => ({
    id: U.claim, claim_type: "participation.activity", effective_at: "2026-08-01T00:00:00Z", expires_at: null,
    // deliberately OVER-returned: a private id and an unlisted key the presenter must never surface
    public_value: { title: "Welding workshop", activity_type: "workshop", activity_id: "SECRET-ACTIVITY-ID", internal: "x" }, ...over,
  });

  it("public view exposes only allow-listed value fields", () => {
    const view = presentPublicClaim(publicRow());
    expect(view.title).toBe("Welding workshop (Workshop)");
    expect(JSON.stringify(view)).not.toContain("SECRET-ACTIVITY-ID");
    expect(JSON.stringify(view)).not.toContain("internal");
    expect(Object.keys(view).sort()).toEqual(["claim_type", "effective_at", "expires_at", "id", "title"]);
  });

  it("default-denies unlisted claim types: no value fields at all reach the public", () => {
    const unlisted = presentPublicClaim(publicRow({ claim_type: "credential.license", public_value: { title: "Secret licence number 12345", class: "CDL-A" } }));
    expect(unlisted.title).toBe("Credential — license");
    expect(JSON.stringify(unlisted)).not.toContain("12345");
    expect(Object.keys(PUBLIC_VALUE_FIELDS)).toEqual(["participation.activity"]);
    expect(presentPublicClaim(publicRow({ public_value: null })).title).toBe("Completed a Flow activity");
  });

  it("the public data layer reads ONLY the allow-listed projection, never the raw claims table", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...publicRow(), source_ref: "INTERNAL-REF-77", created_by: "someone", value: { class: "CDL-A" } }], error: null });
    const from = vi.fn(() => { throw new Error("the public path must not read a table"); });
    const client = { rpc, from } as never;

    const list = await getPublicClaimsForProfile(client, U.subject);
    expect(rpc).toHaveBeenCalledWith("passport_public_claims", { p_profile_id: U.subject, p_limit: 20 });
    expect(from).not.toHaveBeenCalled();
    // columns the database might one day over-return are stripped before any component can see them
    expect(Object.keys(list[0]).sort()).toEqual(["claim_type", "effective_at", "expires_at", "id", "public_value"]);
    expect(JSON.stringify(list)).not.toContain("INTERNAL-REF-77");

    const one = await getPublicClaimById(client, U.claim, U.subject);
    expect(rpc).toHaveBeenLastCalledWith("passport_public_claims", { p_claim_id: U.claim, p_profile_id: U.subject, p_limit: 1 });
    expect(one?.id).toBe(U.claim);
    expect(from).not.toHaveBeenCalled();
  });

  it("the public data layer fails closed: a database error or a malformed row yields nothing", async () => {
    const errored = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) } as never;
    expect(await getPublicClaimsForProfile(errored, U.subject)).toEqual([]);
    expect(await getPublicClaimById(errored, U.claim)).toBeNull();
    const malformed = { rpc: vi.fn().mockResolvedValue({ data: [{ id: "not-a-uuid", claim_type: "x" }], error: null }) } as never;
    expect(await getPublicClaimsForProfile(malformed, U.subject)).toEqual([]);
    // a hidden claim and a nonexistent one are the same empty answer (no existence oracle)
    const empty = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never;
    expect(await getPublicClaimById(empty, U.claim)).toBeNull();
  });

  it("owner view shows an overdue verified claim as expired even before any sweep", () => {
    expect(projectClaimForOwner(row({ expires_at: "2026-08-15T00:00:00Z" }), NOW).status).toBe("expired");
  });

  it("titles never use a value field the audience may not see", () => {
    expect(claimTitle("participation.activity", { title: "T" }, "public")).toBe("T");
    expect(claimTitle("credential.license", { title: "T" }, "public")).toBe("Credential — license");
    expect(claimTitle("credential.license", { title: "T" }, "owner")).toBe("T");
    expect(claimTitle("participation.activity", {}, "owner")).toBe("Completed a Flow activity");
  });

  it("credential-check view is answers only, and satisfied means EVERY question — never a score", () => {
    const view = buildCredentialCheckView([
      { question: "claim_valid", answer: true, about: "credential.license", expires_at: "2027-01-01T00:00:00Z" },
      { question: "credential_held", answer: false, about: "work", expires_at: "2027-01-01T00:00:00Z" },
    ]);
    expect(view.all_satisfied).toBe(false);
    expect(view.items[1].expires_at).toBeNull();
    expect(buildCredentialCheckView([]).all_satisfied).toBe(false);
    expect(buildCredentialCheckView([{ question: "claim_valid", answer: true, about: "x.y", expires_at: null }]).all_satisfied).toBe(true);
    expect(Object.keys(view).sort()).toEqual(["all_satisfied", "items"]);
  });
});
