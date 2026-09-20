import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  ArtifactRef,
  CaptureRequest,
  CaptureStatusReport,
  Claim,
  EvidencePackage,
  GATEWAY_ERRORS,
  GATEWAY_SCOPES,
  PASSPORT_EVENT_TYPES,
  PASSPORT_SCHEMA_VERSION,
  SUBJECT_TYPES,
  SubjectRef,
  WIRE_SCHEMAS,
  canonicalSubjectRef,
  computeArtifactsDigest,
  isSchemaVersionSupported,
  parseSchemaVersion,
  parseSigningHeaders,
  sameSubject,
  signRequest,
  verifyRequestSignature,
} from "@flow/passport-contracts";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-01T12:00:00Z";
const HEX = "a".repeat(64);

const artifact = (id = "art-1") => ({
  artifact_id: id,
  kind: "photo" as const,
  media_type: "image/jpeg",
  storage: { provider: "flow_capture" as const, ref: `capture://sessions/s1/${id}` },
  byte_size: 1234,
  sha256: HEX,
});

const validPackage = () => ({
  schema_version: "1.0",
  package_id: U1,
  producer: "flow_capture",
  capture_request_id: U2,
  subject: { type: "person", id: U3 },
  capture_session_id: "sess_abc",
  captured_at: NOW,
  artifacts: [artifact()],
  source_metadata: { captured_by_app: "flow-capture" },
  provenance: { producer_version: "0.1.0", capture_method: "in_app_camera" },
  correlation_id: "corr-1",
  idempotency_key: "idem-key-0001",
});

describe("subject contract", () => {
  it("covers every subject type the wave requires, not just people", () => {
    for (const t of ["person", "organization", "business", "program", "team", "vehicle", "asset", "venue", "event", "project", "agency"]) {
      expect(SUBJECT_TYPES).toContain(t);
      expect(SubjectRef.safeParse({ type: t, id: U1 }).success).toBe(true);
    }
  });

  it("rejects unknown subject types and non-uuid ids", () => {
    expect(SubjectRef.safeParse({ type: "robot", id: U1 }).success).toBe(false);
    expect(SubjectRef.safeParse({ type: "person", id: "not-a-uuid" }).success).toBe(false);
  });

  it("folds the business alias into organization so one entity cannot hold two Passports", () => {
    expect(canonicalSubjectRef({ type: "business", id: U1 })).toEqual({ type: "organization", id: U1 });
    expect(sameSubject({ type: "business", id: U1 }, { type: "organization", id: U1.toUpperCase() })).toBe(true);
    expect(sameSubject({ type: "person", id: U1 }, { type: "organization", id: U1 })).toBe(false);
  });
});

describe("claim contract", () => {
  const claim = {
    id: U1,
    subject: { type: "vehicle", id: U2 },
    claim_type: "credential.license",
    value: { class: "CDL-A" },
    issuer: { kind: "external", label: "State licensing authority" },
    source: { system: "external:dmv", ref: "lic-99" },
    evidence_ids: [],
    effective_at: NOW,
    expires_at: null,
    status: "verified",
    status_reason_code: null,
    visibility: "private",
    sensitivity: "standard",
    superseded_by: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it("accepts a claim about a non-person subject", () => {
    expect(Claim.safeParse(claim).success).toBe(true);
  });

  it("requires namespaced claim types and a known lifecycle status", () => {
    expect(Claim.safeParse({ ...claim, claim_type: "license" }).success).toBe(false);
    expect(Claim.safeParse({ ...claim, claim_type: "Credential.License" }).success).toBe(false);
    expect(Claim.safeParse({ ...claim, status: "approved" }).success).toBe(false);
  });
});

describe("evidence / artifact contract", () => {
  it("stores artifact references, never inline blobs", () => {
    expect(ArtifactRef.safeParse(artifact()).success).toBe(true);
    const inline = { ...artifact(), storage: { provider: "external", ref: "data:image/png;base64,AAAA" } };
    expect(ArtifactRef.safeParse(inline).success).toBe(false);
  });

  it("computes an order-independent, content-sensitive artifacts digest", async () => {
    const a = artifact("a");
    const b = { ...artifact("b"), sha256: "b".repeat(64) };
    const d1 = await computeArtifactsDigest([a, b]);
    const d2 = await computeArtifactsDigest([b, a]);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[a-f0-9]{64}$/);
    expect(await computeArtifactsDigest([a, { ...b, byte_size: 999 }])).not.toBe(d1);
  });
});

describe("Capture contracts", () => {
  it("accepts a valid EvidencePackage", () => {
    expect(EvidencePackage.safeParse(validPackage()).success).toBe(true);
  });

  it("only accepts flow_capture as producer", () => {
    expect(EvidencePackage.safeParse({ ...validPackage(), producer: "someone_else" }).success).toBe(false);
  });

  it("rejects empty and duplicate artifact lists", () => {
    expect(EvidencePackage.safeParse({ ...validPackage(), artifacts: [] }).success).toBe(false);
    expect(EvidencePackage.safeParse({ ...validPackage(), artifacts: [artifact("x"), artifact("x")] }).success).toBe(false);
  });

  it("ignores unknown additive fields (forward compatible within a major)", () => {
    const parsed = EvidencePackage.safeParse({ ...validPackage(), schema_version: "1.7", future_field: { anything: true } });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "future_field" in parsed.data).toBe(false);
  });

  it("requires idempotency + correlation ids on cross-repo writes", () => {
    const { idempotency_key: _i, ...noKey } = validPackage();
    expect(EvidencePackage.safeParse(noKey).success).toBe(false);
    expect(EvidencePackage.safeParse({ ...validPackage(), idempotency_key: "short" }).success).toBe(false);
  });

  it("CaptureStatusReport enforces the fields each status needs", () => {
    const base = { schema_version: "1.0", request_id: U1, occurred_at: NOW, idempotency_key: "idem-key-0002" };
    expect(CaptureStatusReport.safeParse({ ...base, status: "accepted" }).success).toBe(true);
    expect(CaptureStatusReport.safeParse({ ...base, status: "started" }).success).toBe(false);
    expect(CaptureStatusReport.safeParse({ ...base, status: "started", capture_session_id: "s1" }).success).toBe(true);
    expect(CaptureStatusReport.safeParse({ ...base, status: "failed" }).success).toBe(false);
    expect(CaptureStatusReport.safeParse({ ...base, status: "failed", reason_code: "device_error" }).success).toBe(true);
    // Capture cannot report the states only Passport drives.
    for (const status of ["completed", "cancelled", "expired", "requested"]) {
      expect(CaptureStatusReport.safeParse({ ...base, status }).success).toBe(false);
    }
  });

  it("CaptureRequest states its data policies explicitly", () => {
    const req = {
      schema_version: "1.0",
      request_id: U1,
      status: "requested",
      subject: { type: "person", id: U2 },
      requester: { type: "organization", id: U3 },
      purpose: "work_completion",
      evidence_type: "photo",
      related: { type: "application", id: U3 },
      required_metadata: ["captured_at"],
      location_policy: "forbidden",
      operator_identity_policy: "forbidden",
      expires_at: NOW,
      consent_context: { basis: "subject_initiated", consent_grant_id: null },
      correlation_id: "corr-9",
      idempotency_key: "idem-key-0003",
      capture_session_id: null,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(CaptureRequest.safeParse(req).success).toBe(true);
    expect(CaptureRequest.safeParse({ ...req, location_policy: "required" }).success).toBe(false);
    expect(CaptureRequest.safeParse({ ...req, evidence_type: "signed_record" }).success).toBe(false);
  });
});

describe("schema versioning", () => {
  it("accepts any minor of the supported major and rejects other majors", () => {
    expect(isSchemaVersionSupported("1.0")).toBe(true);
    expect(isSchemaVersionSupported("1.42")).toBe(true);
    expect(isSchemaVersionSupported("2.0")).toBe(false);
    expect(isSchemaVersionSupported("0.9")).toBe(false);
    expect(isSchemaVersionSupported("1")).toBe(false);
    expect(isSchemaVersionSupported(1.0)).toBe(false);
    expect(parseSchemaVersion(PASSPORT_SCHEMA_VERSION)).toEqual({ major: 1, minor: 0 });
  });
});

describe("event vocabulary", () => {
  it("includes the full lifecycle the wave requires", () => {
    const required = [
      "claim.created", "claim.submitted", "claim.verified", "claim.rejected", "claim.expired", "claim.revoked", "claim.superseded",
      "evidence.created", "evidence.attached", "evidence.removed",
      "verification.requested", "verification.completed",
      "consent.requested", "consent.granted", "consent.declined", "consent.revoked", "consent.expired",
      "authority.assigned", "authority.revoked",
      "relationship.created", "relationship.ended",
      "credential.shared",
      "capture.requested", "capture.completed", "capture.failed",
      "integration.connected", "integration.degraded", "integration.disconnected", "integration.sync_failed",
    ];
    for (const type of required) expect(PASSPORT_EVENT_TYPES).toContain(type);
  });
});

describe("gateway error vocabulary", () => {
  it("marks only transient failures as retryable", () => {
    const retryable = Object.entries(GATEWAY_ERRORS).filter(([, v]) => v.retryable).map(([k]) => k).sort();
    expect(retryable).toEqual(["internal_error", "not_configured", "rate_limited"]);
  });

  it("grants only bounded, named scopes (no wildcard)", () => {
    expect([...GATEWAY_SCOPES].sort()).toEqual(["capture_requests:read", "capture_requests:report", "evidence:read", "evidence_packages:write"]);
  });
});

describe("request signing protocol", () => {
  const secret = "test-secret-not-a-real-credential";
  const base = { method: "POST", pathWithQuery: "/api/passport/v2/evidence-packages", body: '{"a":1}', clientId: "flow_capture", keyId: "k1" };
  const now = new Date("2026-09-01T12:00:00Z");
  const resolve = (c: string, k: string) => (c === "flow_capture" && k === "k1" ? secret : null);

  const verify = async (headers: Record<string, string>, over: Partial<Parameters<typeof verifyRequestSignature>[0]> = {}) => {
    const parsed = parseSigningHeaders((n) => headers[n] ?? null);
    if (!parsed.ok) return parsed;
    return verifyRequestSignature({ method: base.method, pathWithQuery: base.pathWithQuery, body: base.body, headers: parsed.value, resolveSecret: resolve, now, ...over });
  };

  it("round-trips a signed request", async () => {
    const headers = await signRequest({ ...base, secret, now });
    expect(await verify(headers)).toEqual({ ok: true });
  });

  it("rejects a tampered body, path or method", async () => {
    const headers = await signRequest({ ...base, secret, now });
    expect(await verify(headers, { body: '{"a":2}' })).toEqual({ ok: false, code: "bad_signature" });
    expect(await verify(headers, { pathWithQuery: "/api/passport/v2/other" })).toEqual({ ok: false, code: "bad_signature" });
    expect(await verify(headers, { method: "GET" })).toEqual({ ok: false, code: "bad_signature" });
  });

  it("rejects a wrong secret and an unknown key without leaking which", async () => {
    const wrong = await signRequest({ ...base, secret: "another-secret", now });
    expect(await verify(wrong)).toEqual({ ok: false, code: "bad_signature" });
    const unknown = await signRequest({ ...base, keyId: "nope", secret, now });
    expect(await verify(unknown)).toEqual({ ok: false, code: "unknown_key" });
  });

  it("enforces the replay window in both directions", async () => {
    const old = await signRequest({ ...base, secret, now: new Date(now.getTime() - 10 * 60 * 1000) });
    expect(await verify(old)).toEqual({ ok: false, code: "timestamp_out_of_window" });
    const future = await signRequest({ ...base, secret, now: new Date(now.getTime() + 10 * 60 * 1000) });
    expect(await verify(future)).toEqual({ ok: false, code: "timestamp_out_of_window" });
  });

  it("flags missing and malformed headers distinctly", () => {
    expect(parseSigningHeaders(() => null)).toEqual({ ok: false, code: "missing_headers" });
    const headers: Record<string, string> = {
      "x-flow-client-id": "flow_capture",
      "x-flow-key-id": "k1",
      "x-flow-timestamp": "1788264000",
      "x-flow-nonce": "short",
      "x-flow-signature": "v1=abc",
    };
    expect(parseSigningHeaders((n) => headers[n] ?? null)).toEqual({ ok: false, code: "malformed_headers" });
  });

  it("does not verify with an empty secret", async () => {
    await expect(signRequest({ ...base, secret: "", now })).rejects.toThrow();
  });
});

describe("contracts package boundary", () => {
  const root = path.resolve(__dirname, "../../packages/passport-contracts");
  const sources = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts"));

  it("imports nothing but zod and its own modules (no DB, UI, Next, or Flow app code)", () => {
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const text = fs.readFileSync(path.join(root, "src", file), "utf8");
      const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        const ok = spec === "zod" || spec.startsWith("./");
        expect(ok, `${file} imports "${spec}"`).toBe(true);
      }
    }
  });
});

describe("generated JSON Schema stays in sync with the zod source", () => {
  const dir = path.resolve(__dirname, "../../packages/passport-contracts/schemas");

  for (const [name, schema] of Object.entries(WIRE_SCHEMAS)) {
    it(`${name}.schema.json`, () => {
      const generated = JSON.stringify(z.toJSONSchema(schema as z.ZodType), null, 2) + "\n";
      const file = path.join(dir, `${name}.schema.json`);
      if (process.env.UPDATE_SCHEMAS === "1") fs.writeFileSync(file, generated);
      expect(fs.existsSync(file), `${name}.schema.json missing — run npm run contracts:schemas`).toBe(true);
      expect(fs.readFileSync(file, "utf8"), `${name}.schema.json is stale — run npm run contracts:schemas`).toBe(generated);
    });
  }

  it("has no orphan schema files", () => {
    const expected = new Set(Object.keys(WIRE_SCHEMAS).map((n) => `${n}.schema.json`));
    const actual = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".schema.json")) : [];
    for (const f of actual) expect(expected.has(f), `orphan ${f}`).toBe(true);
  });
});
