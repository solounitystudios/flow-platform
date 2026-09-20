import { describe, expect, it } from "vitest";
import {
  CaptureRequest,
  EvidencePackage,
  EvidencePackageReceipt,
  GATEWAY_ERRORS,
  computeArtifactsDigest,
  signRequest,
  type GatewayScope,
} from "@flow/passport-contracts";
import { MAX_BODY_BYTES, handleGatewayRequest, parseGatewayClients, type GatewayDeps, type GatewayRoute, type GatewayStore, type StoreResult } from "@/lib/passport/gateway";

const SECRET = "test-secret-0123456789-abcdefghijklmnop-not-real";
const SECRET_V2 = "second-secret-0123456789-abcdefghijklmnop-not-real";
const NOW = new Date("2026-09-01T12:00:00Z");
const U = {
  req: "11111111-1111-4111-8111-111111111111",
  subject: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
  pkg: "44444444-4444-4444-8444-444444444444",
  ev: "55555555-5555-4555-8555-555555555555",
};
const ALL_SCOPES: GatewayScope[] = ["capture_requests:read", "capture_requests:report", "evidence_packages:write", "evidence:read"];

const configFor = (entries: object[]) => {
  const parsed = parseGatewayClients(JSON.stringify(entries));
  if (!parsed.ok) throw new Error("test config invalid");
  return parsed.clients;
};
const clients = configFor([{ client_id: "flow_capture", key_id: "k1", secret: SECRET, scopes: ALL_SCOPES }]);

interface Calls {
  nonces: string[];
  ingest: Array<{ clientId: string; pkg: Record<string, unknown>; sha: string }>;
  report: Array<{ clientId: string; report: Record<string, unknown>; sha: string }>;
  connection: Array<{ connector: string; ok: boolean; category?: string }>;
}

function fakeStore(over: Partial<GatewayStore> = {}) {
  const calls: Calls = { nonces: [], ingest: [], report: [], connection: [] };
  const seen = new Set<string>();
  const store: GatewayStore = {
    async consumeNonce(clientId, nonce) {
      calls.nonces.push(nonce);
      const key = `${clientId}:${nonce}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    async getCaptureRequest(id) {
      return { ok: true, request: captureRequestJson(id) };
    },
    async reportStatus(clientId, report, sha) {
      calls.report.push({ clientId, report: report as Record<string, unknown>, sha });
      return { ok: true, request_id: U.req, status: (report as { status: string }).status, duplicate: false };
    },
    async ingestPackage(clientId, pkg, sha) {
      calls.ingest.push({ clientId, pkg: pkg as Record<string, unknown>, sha });
      return { ok: true, evidence_id: U.ev, package_id: U.pkg, capture_request_id: U.req, received_at: "2026-09-01T12:00:01Z", duplicate: false };
    },
    async getEvidenceSummary() {
      return { ok: true, summary: evidenceSummaryJson() };
    },
    async recordConnection(connector, ok, category) {
      calls.connection.push({ connector, ok, category });
    },
    ...over,
  };
  return { store, calls };
}

const captureRequestJson = (id: string) => ({
  schema_version: "1.0",
  request_id: id,
  status: "requested",
  subject: { type: "person", id: U.subject },
  requester: { type: "person", id: U.subject },
  purpose: "skill_evidence",
  evidence_type: "photo",
  related: null,
  required_metadata: [],
  location_policy: "forbidden",
  operator_identity_policy: "forbidden",
  expires_at: "2026-09-04T12:00:00Z",
  consent_context: { basis: "subject_initiated", consent_grant_id: null },
  correlation_id: "corr-1",
  idempotency_key: "idem-key-0001",
  capture_session_id: null,
  created_at: "2026-09-01T11:00:00Z",
  updated_at: "2026-09-01T11:00:00Z",
});

const evidenceSummaryJson = () => ({
  schema_version: "1.0",
  evidence_id: U.ev,
  package_id: U.pkg,
  capture_request_id: U.req,
  subject: { type: "person", id: U.subject },
  evidence_status: "received",
  artifact_count: 1,
  captured_at: "2026-09-01T11:59:00Z",
  received_at: "2026-09-01T12:00:01Z",
});

const artifact = (over: object = {}) => ({
  artifact_id: "art-1",
  kind: "photo",
  media_type: "image/jpeg",
  storage: { provider: "flow_capture", ref: "capture://s/1" },
  byte_size: 100,
  sha256: "a".repeat(64),
  ...over,
});

const packageBody = (over: object = {}) => ({
  schema_version: "1.0",
  package_id: U.pkg,
  producer: "flow_capture",
  capture_request_id: U.req,
  subject: { type: "person", id: U.subject },
  capture_session_id: "sess-1",
  captured_at: "2026-09-01T11:59:00Z",
  artifacts: [artifact()],
  source_metadata: { captured_at: "x" },
  provenance: { producer_version: "0.1.0" },
  correlation_id: "corr-1",
  idempotency_key: "pkg-idem-0001",
  ...over,
});

async function send(route: GatewayRoute, opts: { method?: string; path: string; body?: unknown | string; secret?: string; keyId?: string; clientId?: string; now?: Date; tamperBody?: string; nonce?: string; headers?: Record<string, string> }, deps: Partial<GatewayDeps> & { store: GatewayStore }) {
  const method = opts.method ?? "POST";
  const bodyText = opts.body === undefined ? "" : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  const signed = await signRequest({
    method,
    pathWithQuery: opts.path,
    body: bodyText,
    clientId: opts.clientId ?? "flow_capture",
    keyId: opts.keyId ?? "k1",
    secret: opts.secret ?? SECRET,
    now: opts.now ?? NOW,
    nonce: opts.nonce,
  });
  const headers: Record<string, string> = { ...signed, ...(opts.headers ?? {}) };
  return handleGatewayRequest(
    route,
    { method, pathWithQuery: opts.path, getHeader: (n) => headers[n.toLowerCase()] ?? null, bodyText: opts.tamperBody ?? bodyText },
    { clients, now: () => NOW, ...deps },
  );
}

const post = (body: unknown, deps: Parameters<typeof send>[2], over: Partial<Parameters<typeof send>[1]> = {}) =>
  send({ name: "post_evidence_package" }, { path: "/api/passport/v2/evidence-packages", body, ...over }, deps);

const errorOf = (res: { body: unknown }) => (res.body as { error: { code: string; retryable: boolean; message: string } }).error;

describe("gateway client configuration", () => {
  const entry = { client_id: "flow_capture", key_id: "k1", secret: SECRET, scopes: ALL_SCOPES };

  it("is not configured without the variable", () => {
    expect(parseGatewayClients(undefined)).toEqual({ ok: false, reason: "not_configured" });
    expect(parseGatewayClients("   ")).toEqual({ ok: false, reason: "not_configured" });
  });

  it("refuses malformed, short-secret, unknown-scope, duplicate and empty-scope configs", () => {
    expect(parseGatewayClients("not json")).toEqual({ ok: false, reason: "invalid_config" });
    expect(parseGatewayClients(JSON.stringify([{ ...entry, secret: "too-short" }]))).toEqual({ ok: false, reason: "invalid_config" });
    expect(parseGatewayClients(JSON.stringify([{ ...entry, scopes: ["*"] }]))).toEqual({ ok: false, reason: "invalid_config" });
    expect(parseGatewayClients(JSON.stringify([{ ...entry, scopes: [] }]))).toEqual({ ok: false, reason: "invalid_config" });
    expect(parseGatewayClients(JSON.stringify([entry, entry]))).toEqual({ ok: false, reason: "invalid_config" });
    expect(parseGatewayClients("[]")).toEqual({ ok: false, reason: "invalid_config" });
  });

  it("supports rotation: an active and a retiring key both verify; a disabled key does not", () => {
    const result = parseGatewayClients(JSON.stringify([entry, { ...entry, key_id: "k2", secret: SECRET_V2, status: "retiring" }, { ...entry, key_id: "k0", secret: "old-old-old-0123456789-abcdefghijklmnop-x", status: "disabled" }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clients.resolveSecret("flow_capture", "k1")).toBe(SECRET);
    expect(result.clients.resolveSecret("flow_capture", "k2")).toBe(SECRET_V2);
    expect(result.clients.resolveSecret("flow_capture", "k0")).toBeNull();
    expect(result.clients.resolveSecret("someone_else", "k1")).toBeNull();
  });

  it("treats an all-disabled registry as not configured rather than open", () => {
    expect(parseGatewayClients(JSON.stringify([{ ...entry, status: "disabled" }]))).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("authentication", () => {
  it("answers 503 not_configured (never a weaker path) when there is no registry", async () => {
    const { store } = fakeStore();
    const res = await post(packageBody(), { store, clients: null });
    expect(res.status).toBe(503);
    expect(errorOf(res).code).toBe("not_configured");
    expect(errorOf(res).retryable).toBe(true);
  });

  it("rejects missing headers, a wrong secret, an unknown client/key, a tampered body and a stale timestamp — all identically", async () => {
    const { store, calls } = fakeStore();
    const good = packageBody();
    const responses = await Promise.all([
      handleGatewayRequest({ name: "post_evidence_package" }, { method: "POST", pathWithQuery: "/api/passport/v2/evidence-packages", getHeader: () => null, bodyText: JSON.stringify(good) }, { clients, store, now: () => NOW }),
      post(good, { store }, { secret: "wrong-secret-0123456789-abcdefghijklmnopqrst" }),
      post(good, { store }, { clientId: "intruder" }),
      post(good, { store }, { keyId: "nope" }),
      post(good, { store }, { tamperBody: JSON.stringify({ ...good, capture_request_id: U.other }) }),
      post(good, { store }, { now: new Date(NOW.getTime() - 20 * 60 * 1000) }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(errorOf(res).code).toBe("unauthorized");
    }
    // Indistinguishable: the response never reveals WHICH part was wrong.
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1);
    // An unauthenticated caller can't reach the store at all — not even to burn nonces.
    expect(calls.nonces).toEqual([]);
    expect(calls.ingest).toEqual([]);
  });

  it("rejects an exact replay of a signed request", async () => {
    const { store, calls } = fakeStore();
    const nonce = "replay-nonce-0123456789";
    const first = await post(packageBody(), { store }, { nonce });
    expect(first.status).toBe(201);
    const second = await post(packageBody(), { store }, { nonce });
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe("replayed_request");
    expect(calls.ingest).toHaveLength(1);
  });

  it("does not consume a nonce until the signature has verified", async () => {
    const { store, calls } = fakeStore();
    await post(packageBody(), { store }, { secret: "wrong-secret-0123456789-abcdefghijklmnopqrst" });
    expect(calls.nonces).toHaveLength(0);
  });

  it("enforces per-route scopes and never accepts a wildcard", async () => {
    const readOnly = configFor([{ client_id: "flow_capture", key_id: "k1", secret: SECRET, scopes: ["capture_requests:read"] }]);
    const { store, calls } = fakeStore();
    const res = await post(packageBody(), { store, clients: readOnly });
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("forbidden_scope");
    expect(calls.ingest).toHaveLength(0);
    const read = await send({ name: "get_capture_request", id: U.req }, { method: "GET", path: `/api/passport/v2/capture-requests/${U.req}` }, { store, clients: readOnly });
    expect(read.status).toBe(200);
  });

  it("fails closed (500, retryable) when the nonce ledger is unavailable", async () => {
    const { store } = fakeStore({ consumeNonce: async () => { throw new Error("db down"); } });
    const res = await post(packageBody(), { store });
    expect(res.status).toBe(500);
    expect(errorOf(res).retryable).toBe(true);
  });

  it("never logs secrets or signatures", async () => {
    const { store } = fakeStore();
    const lines: string[] = [];
    await post(packageBody(), { store, log: (e) => lines.push(JSON.stringify(e)) }, { secret: "wrong-secret-0123456789-abcdefghijklmnopqrst" });
    await post(packageBody({ producer: "flow_capture" }), { store, log: (e) => lines.push(JSON.stringify(e)) });
    await post({ nope: true }, { store, log: (e) => lines.push(JSON.stringify(e)) });
    const all = lines.join("\n");
    expect(all).not.toContain(SECRET);
    expect(all).not.toMatch(/v1=[a-f0-9]{16,}/);
  });
});

describe("request validation", () => {
  it("rejects bodies that are too large before authenticating them", async () => {
    const { store, calls } = fakeStore();
    const res = await post("x".repeat(MAX_BODY_BYTES + 10), { store });
    expect(res.status).toBe(413);
    expect(errorOf(res).code).toBe("payload_too_large");
    expect(calls.nonces).toHaveLength(0);
  });

  it("rejects non-JSON and non-object bodies", async () => {
    const { store } = fakeStore();
    expect((await post("{not json", { store })).status).toBe(400);
    expect((await post([1, 2], { store })).status).toBe(400);
    expect(errorOf(await post("null", { store })).code).toBe("invalid_request");
  });

  it("answers unsupported_schema_version for another major or a missing version", async () => {
    const { store } = fakeStore();
    for (const body of [packageBody({ schema_version: "2.0" }), packageBody({ schema_version: "0.9" }), (() => { const b: Record<string, unknown> = packageBody(); delete b.schema_version; return b; })()]) {
      const res = await post(body, { store });
      expect(res.status).toBe(422);
      expect(errorOf(res).code).toBe("unsupported_schema_version");
    }
  });

  it("accepts a later minor of the supported major and ignores fields it doesn't know", async () => {
    const { store, calls } = fakeStore();
    const res = await post(packageBody({ schema_version: "1.9", future_field: { x: 1 } }), { store });
    expect(res.status).toBe(201);
    expect("future_field" in calls.ingest[0].pkg).toBe(false);
  });

  it("returns invalid_schema naming only the failing fields — never the submitted values", async () => {
    const { store, calls } = fakeStore();
    const res = await post(packageBody({ subject: { type: "person", id: "SECRET-VALUE-not-a-uuid" }, artifacts: [] }), { store });
    expect(res.status).toBe(422);
    expect(errorOf(res).code).toBe("invalid_schema");
    expect(errorOf(res).message).toContain("subject.id");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-VALUE");
    expect(calls.ingest).toHaveLength(0);
  });

  it("rejects inline blobs and non-flow_capture producers at the schema layer", async () => {
    const { store } = fakeStore();
    expect(errorOf(await post(packageBody({ artifacts: [artifact({ storage: { provider: "external", ref: "data:image/png;base64,AAAA" } })] }), { store })).code).toBe("invalid_schema");
    expect(errorOf(await post(packageBody({ producer: "someone_else" }), { store })).code).toBe("invalid_schema");
  });

  it("a client may only deliver packages it produced", async () => {
    const other = configFor([{ client_id: "another_producer", key_id: "k1", secret: SECRET, scopes: ALL_SCOPES }]);
    const { store, calls } = fakeStore();
    const res = await post(packageBody(), { store, clients: other }, { clientId: "another_producer" });
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("forbidden_scope");
    expect(calls.ingest).toHaveLength(0);
  });

  it("verifies the integrity digest when one is supplied", async () => {
    const { store, calls } = fakeStore();
    const artifacts = [artifact()];
    const good = await computeArtifactsDigest(artifacts);
    expect((await post(packageBody({ artifacts, integrity: { algorithm: "sha256", artifacts_digest: good } }), { store })).status).toBe(201);
    const bad = await post(packageBody({ artifacts, integrity: { algorithm: "sha256", artifacts_digest: "0".repeat(64) } }), { store });
    expect(bad.status).toBe(422);
    expect(errorOf(bad).code).toBe("integrity_mismatch");
    expect(calls.ingest).toHaveLength(1);
  });
});

describe("evidence package submission", () => {
  it("accepts a valid package and reports it as RECEIVED, NOT VERIFIED", async () => {
    const { store, calls } = fakeStore();
    const res = await post(packageBody(), { store });
    expect(res.status).toBe(201);
    const receipt = EvidencePackageReceipt.parse(res.body);
    expect(receipt).toMatchObject({ evidence_status: "received", verification: "none", duplicate: false, package_id: U.pkg, evidence_id: U.ev });
    // Evidence != verified claim: nothing in the receipt or the store call mentions a claim.
    expect(JSON.stringify(res.body)).not.toMatch(/claim/i);
    expect(Object.keys(calls.ingest[0].pkg)).not.toContain("claim");
  });

  it("takes the client id from the verified signature, never from the payload", async () => {
    const { store, calls } = fakeStore();
    await post(packageBody({ client_id: "forged", producer: "flow_capture" }), { store });
    expect(calls.ingest[0].clientId).toBe("flow_capture");
    expect("client_id" in calls.ingest[0].pkg).toBe(false);
  });

  it("passes the validated (schema-stripped) package to the store", async () => {
    const { store, calls } = fakeStore();
    await post(packageBody(), { store });
    expect(EvidencePackage.safeParse(calls.ingest[0].pkg).success).toBe(true);
  });

  it("treats a duplicate delivery as a success (200), not a creation (201)", async () => {
    const { store } = fakeStore({ ingestPackage: async () => ({ ok: true, evidence_id: U.ev, package_id: U.pkg, capture_request_id: U.req, received_at: "2026-09-01T12:00:01Z", duplicate: true }) });
    const res = await post(packageBody(), { store });
    expect(res.status).toBe(200);
    expect((res.body as { duplicate: boolean }).duplicate).toBe(true);
  });

  it("fingerprints content, not delivery: a new idempotency key or correlation id is the same content", async () => {
    const { store, calls } = fakeStore();
    await post(packageBody({ idempotency_key: "pkg-idem-AAAA1", correlation_id: "c-1" }), { store });
    await post(packageBody({ idempotency_key: "pkg-idem-BBBB2", correlation_id: "c-2" }), { store });
    await post(packageBody({ captured_at: "2026-09-01T11:00:00Z" }), { store });
    expect(calls.ingest[0].sha).toBe(calls.ingest[1].sha);
    expect(calls.ingest[2].sha).not.toBe(calls.ingest[0].sha);
    expect(calls.ingest[0].sha).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["unknown_capture_request", 404, false],
    ["request_expired", 410, false],
    ["request_not_open", 409, false],
    ["subject_mismatch", 422, false],
    ["location_not_permitted", 422, false],
    ["operator_not_permitted", 422, false],
    ["metadata_missing", 422, false],
    ["invalid_schema", 422, false],
    ["idempotency_conflict", 409, false],
  ])("maps the store reason %s to HTTP %i (retryable: %s)", async (reason, status, retryable) => {
    const { store } = fakeStore({ ingestPackage: async () => ({ ok: false, reason }) as StoreResult<never> });
    const res = await post(packageBody(), { store });
    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(reason);
    expect(errorOf(res).retryable).toBe(retryable);
    expect(GATEWAY_ERRORS[reason as keyof typeof GATEWAY_ERRORS].status).toBe(status);
  });

  it("turns an unknown store reason or a thrown error into a retryable 500 — and logs it, never swallows it", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const unknown = fakeStore({ ingestPackage: async () => ({ ok: false, reason: "something_new" }) as StoreResult<never> });
    const res = await post(packageBody(), { store: unknown.store, log: (e) => lines.push(e) });
    expect(res.status).toBe(500);
    expect(errorOf(res).retryable).toBe(true);
    const thrown = fakeStore({ ingestPackage: async () => { throw new Error("connection reset"); } });
    const res2 = await post(packageBody(), { store: thrown.store, log: (e) => lines.push(e) });
    expect(res2.status).toBe(500);
    expect(lines.some((l) => l.event === "gateway.internal_error" && l.message === "connection reset")).toBe(true);
    // The public response never leaks the internal message.
    expect(JSON.stringify(res2.body)).not.toContain("connection reset");
  });

  it("echoes the package's correlation id on errors", async () => {
    const { store } = fakeStore({ ingestPackage: async () => ({ ok: false, reason: "request_expired" }) as StoreResult<never> });
    const res = await post(packageBody({ correlation_id: "trace-me-1" }), { store });
    expect((res.body as { error: { correlation_id: string } }).error.correlation_id).toBe("trace-me-1");
  });
});

describe("capture request reads and status reports", () => {
  it("returns a contract-valid capture request", async () => {
    const { store } = fakeStore();
    const res = await send({ name: "get_capture_request", id: U.req }, { method: "GET", path: `/api/passport/v2/capture-requests/${U.req}` }, { store });
    expect(res.status).toBe(200);
    expect(CaptureRequest.safeParse(res.body).success).toBe(true);
  });

  it("answers 404 for an unknown request and 400 for a malformed id (without touching the store)", async () => {
    const { store } = fakeStore({ getCaptureRequest: async () => ({ ok: false, reason: "unknown_capture_request" }) });
    const unknown = await send({ name: "get_capture_request", id: U.other }, { method: "GET", path: `/api/passport/v2/capture-requests/${U.other}` }, { store });
    expect(unknown.status).toBe(404);
    const bad = await send({ name: "get_capture_request", id: "not-a-uuid" }, { method: "GET", path: "/api/passport/v2/capture-requests/not-a-uuid" }, { store });
    expect(bad.status).toBe(400);
  });

  it("refuses to serve a payload that violates the contract", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const { store } = fakeStore({ getCaptureRequest: async () => ({ ok: true, request: { ...captureRequestJson(U.req), status: "teleported" } }) });
    const res = await send({ name: "get_capture_request", id: U.req }, { method: "GET", path: `/api/passport/v2/capture-requests/${U.req}` }, { store, log: (e) => lines.push(e) });
    expect(res.status).toBe(500);
    expect(lines.some((l) => l.event === "gateway.contract_violation")).toBe(true);
  });

  it("accepts a status report, and requires request_id to match the URL", async () => {
    const { store, calls } = fakeStore();
    const path = `/api/passport/v2/capture-requests/${U.req}/status`;
    const report = { schema_version: "1.0", request_id: U.req, status: "started", capture_session_id: "sess-1", occurred_at: "2026-09-01T12:00:00Z", idempotency_key: "rep-key-0001" };
    const ok = await send({ name: "report_capture_status", id: U.req }, { path, body: report }, { store });
    expect(ok.status).toBe(200);
    expect(calls.report[0].clientId).toBe("flow_capture");
    const mismatch = await send({ name: "report_capture_status", id: U.req }, { path, body: { ...report, request_id: U.other } }, { store });
    expect(mismatch.status).toBe(422);
    // Capture cannot claim states only Passport drives.
    const completed = await send({ name: "report_capture_status", id: U.req }, { path, body: { ...report, status: "completed" } }, { store });
    expect(completed.status).toBe(422);
    expect(calls.report).toHaveLength(1);
  });

  it("returns a contract-valid evidence summary, metadata only", async () => {
    const { store } = fakeStore();
    const res = await send({ name: "get_evidence", id: U.ev }, { method: "GET", path: `/api/passport/v2/evidence/${U.ev}` }, { store });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("capture://");
    const missing = fakeStore({ getEvidenceSummary: async () => ({ ok: false, reason: "unknown_evidence" }) });
    expect((await send({ name: "get_evidence", id: U.ev }, { method: "GET", path: `/api/passport/v2/evidence/${U.ev}` }, { store: missing.store })).status).toBe(404);
  });
});

describe("connection health bookkeeping", () => {
  it("records success after an authenticated success", async () => {
    const { store, calls } = fakeStore();
    await post(packageBody(), { store });
    expect(calls.connection).toEqual([{ connector: "flow_capture", ok: true, category: undefined }]);
  });

  it("records a schema failure when Capture sends data Passport can't accept", async () => {
    const { store, calls } = fakeStore();
    await post(packageBody({ artifacts: [] }), { store });
    expect(calls.connection).toEqual([{ connector: "flow_capture", ok: false, category: "schema" }]);
    calls.connection.length = 0;
    await post(packageBody({ schema_version: "9.0" }), { store });
    expect(calls.connection).toEqual([{ connector: "flow_capture", ok: false, category: "schema" }]);
  });

  it("records 'rejected' for policy violations but nothing for ordinary business outcomes", async () => {
    const rejected = fakeStore({ ingestPackage: async () => ({ ok: false, reason: "subject_mismatch" }) as StoreResult<never> });
    await post(packageBody(), { store: rejected.store });
    expect(rejected.calls.connection).toEqual([{ connector: "flow_capture", ok: false, category: "rejected" }]);
    const expired = fakeStore({ ingestPackage: async () => ({ ok: false, reason: "request_expired" }) as StoreResult<never> });
    await post(packageBody(), { store: expired.store });
    expect(expired.calls.connection).toEqual([]);
  });

  it("never lets a failure to record health fail the request", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const { store } = fakeStore({ recordConnection: async () => { throw new Error("health table locked"); } });
    const res = await post(packageBody(), { store, log: (e) => lines.push(e) });
    expect(res.status).toBe(201);
    expect(lines.some((l) => l.event === "gateway.record_connection_failed")).toBe(true);
  });

  it("an unauthenticated request can never change recorded connection health", async () => {
    const { store, calls } = fakeStore();
    await post(packageBody({ artifacts: [] }), { store }, { secret: "wrong-secret-0123456789-abcdefghijklmnopqrst" });
    expect(calls.connection).toEqual([]);
  });
});
