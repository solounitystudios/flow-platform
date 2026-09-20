import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CaptureRequest, EvidencePackageReceipt, EvidenceSummary, signRequest } from "@flow/passport-contracts";

/**
 * END-TO-END: signed HTTP -> the real Next server (route handlers) ->
 * supabase-js with the service role -> PostgREST -> a real, fully-migrated
 * throwaway Postgres. Nothing is mocked. Skipped unless the runner
 * (tests/e2e/run-gateway-e2e.sh) provides the rig — it is deliberately NOT
 * part of `npm run test` or CI.
 */
const BASE = process.env.E2E_BASE_URL;
const REST = process.env.E2E_REST_URL;
const CLIENT_SECRET = process.env.E2E_CLIENT_SECRET ?? "";
const JWT_SECRET = process.env.E2E_JWT_SECRET ?? "";
const enabled = Boolean(BASE && REST && CLIENT_SECRET && JWT_SECRET);

const SUBJECT = "a0000000-0000-4000-8000-000000000001";
const OTHER = "b0000000-0000-4000-8000-000000000002";

const b64 = (input: string | Buffer) => Buffer.from(input).toString("base64url");
function jwt(claims: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${head}.${body}.${b64(createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest())}`;
}
const asUser = (sub: string) => jwt({ sub, role: "authenticated", aal: "aal1" });
const asService = () => jwt({ role: "service_role" });

async function rpcAsUser<T>(sub: string, fn: string, args: object): Promise<T> {
  const res = await fetch(`${REST}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${asUser(sub)}`, apikey: asUser(sub) }, body: JSON.stringify(args) });
  return (await res.json()) as T;
}
async function tableAsService<T>(table: string, query = ""): Promise<T[]> {
  const res = await fetch(`${REST}/rest/v1/${table}?${query}`, { headers: { authorization: `Bearer ${asService()}`, apikey: asService() } });
  return (await res.json()) as T[];
}

async function gateway(method: string, path: string, body?: unknown, over: { secret?: string; nonce?: string } = {}) {
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const headers = await signRequest({ method, pathWithQuery: path, body: bodyText, clientId: "flow_capture", keyId: "k1", secret: over.secret ?? CLIENT_SECRET, nonce: over.nonce });
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : bodyText });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const pkg = (requestId: string, over: object = {}) => ({
  schema_version: "1.0",
  package_id: crypto.randomUUID(),
  producer: "flow_capture",
  capture_request_id: requestId,
  subject: { type: "person", id: SUBJECT },
  capture_session_id: "sess-e2e",
  captured_at: new Date().toISOString(),
  artifacts: [{ artifact_id: "art-1", kind: "photo", media_type: "image/jpeg", storage: { provider: "flow_capture", ref: "capture://e2e/art-1" }, byte_size: 10 }],
  source_metadata: { captured_at: "now" },
  provenance: { producer_version: "e2e" },
  correlation_id: "corr-e2e",
  idempotency_key: `idem-${crypto.randomUUID()}`,
  ...over,
});

async function newRequest(key: string, over: object = {}): Promise<string> {
  const result = await rpcAsUser<{ ok: boolean; id: string }>(SUBJECT, "passport_create_capture_request", {
    p_subject_type: "person", p_subject_id: SUBJECT, p_purpose: "skill_evidence", p_evidence_type: "photo", p_idempotency_key: key, p_required_metadata: ["captured_at"], ...over,
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.id;
}

// Next dev compiles each route on first hit, so allow generous per-test time.
vi.setConfig({ testTimeout: 120_000 });

describe.skipIf(!enabled)("Passport gateway end-to-end (real HTTP, real PostgREST, real Postgres)", () => {
  it("rejects an unsigned request and a request signed with the wrong secret", async () => {
    const unsigned = await fetch(`${BASE}/api/passport/v2/capture-requests/${crypto.randomUUID()}`);
    expect(unsigned.status).toBe(401);
    const wrong = await gateway("GET", `/api/passport/v2/capture-requests/${crypto.randomUUID()}`, undefined, { secret: "wrong-secret-0123456789-abcdefghijklmnopqrst" });
    expect(wrong.status).toBe(401);
  });

  it("full lifecycle: read request -> report status -> deliver package -> evidence recorded UNVERIFIED", async () => {
    const claimsBefore = (await tableAsService<{ id: string }>("passport_claims", "select=id")).length;
    const requestId = await newRequest(`e2e-key-${crypto.randomUUID()}`);

    const read = await gateway("GET", `/api/passport/v2/capture-requests/${requestId}`);
    expect(read.status).toBe(200);
    expect(CaptureRequest.safeParse(read.json).success, JSON.stringify(read.json)).toBe(true);
    expect(read.json).toMatchObject({ status: "requested", subject: { type: "person", id: SUBJECT }, location_policy: "forbidden" });

    const report = { schema_version: "1.0", request_id: requestId, status: "started", capture_session_id: "sess-e2e", occurred_at: new Date().toISOString(), idempotency_key: "rep-e2e-0001" };
    expect((await gateway("POST", `/api/passport/v2/capture-requests/${requestId}/status`, report)).status).toBe(200);
    const retried = await gateway("POST", `/api/passport/v2/capture-requests/${requestId}/status`, report);
    expect(retried.status).toBe(200);
    expect(retried.json.duplicate).toBe(true);

    const body = pkg(requestId);
    const first = await gateway("POST", "/api/passport/v2/evidence-packages", body);
    expect(first.status, JSON.stringify(first.json)).toBe(201);
    const receipt = EvidencePackageReceipt.parse(first.json);
    expect(receipt).toMatchObject({ duplicate: false, evidence_status: "received", verification: "none" });

    // duplicate delivery: same body, new nonce (a genuine retry) -> the SAME record, 200
    const dup = await gateway("POST", "/api/passport/v2/evidence-packages", body);
    expect(dup.status).toBe(200);
    expect(dup.json.duplicate).toBe(true);
    expect(dup.json.evidence_id).toBe(receipt.evidence_id);

    // the same package under a NEW idempotency key is still one record
    const dup2 = await gateway("POST", "/api/passport/v2/evidence-packages", { ...body, idempotency_key: `idem-${crypto.randomUUID()}` });
    expect(dup2.json.evidence_id).toBe(receipt.evidence_id);

    // same key, different content -> conflict
    const conflict = await gateway("POST", "/api/passport/v2/evidence-packages", { ...body, captured_at: "2020-01-01T00:00:00.000Z" });
    expect(conflict.status).toBe(409);
    expect((conflict.json.error as { code: string }).code).toBe("idempotency_conflict");

    // the request is closed now
    const late = await gateway("POST", "/api/passport/v2/evidence-packages", pkg(requestId));
    expect(late.status).toBe(409);
    expect((late.json.error as { code: string }).code).toBe("request_not_open");

    // what the database actually holds
    const evidence = await tableAsService<{ status: string; source_kind: string; producer: string; capture_request_id: string }>("passport_evidence", `id=eq.${receipt.evidence_id}&select=status,source_kind,producer,capture_request_id`);
    expect(evidence).toEqual([{ status: "received", source_kind: "capture", producer: "flow_capture", capture_request_id: requestId }]);
    expect(await tableAsService<{ id: string }>("passport_evidence", `capture_request_id=eq.${requestId}&select=id`)).toHaveLength(1);
    expect((await tableAsService<{ id: string }>("passport_claims", "select=id")).length, "evidence != claim").toBe(claimsBefore);
    const [row] = await tableAsService<{ status: string }>("passport_capture_requests", `id=eq.${requestId}&select=status`);
    expect(row.status).toBe("completed");

    // metadata-only readback
    const summary = await gateway("GET", `/api/passport/v2/evidence/${receipt.evidence_id}`);
    expect(summary.status).toBe(200);
    expect(EvidenceSummary.safeParse(summary.json).success).toBe(true);
    expect(JSON.stringify(summary.json)).not.toContain("capture://");
    expect((await gateway("GET", `/api/passport/v2/evidence/${crypto.randomUUID()}`)).status).toBe(404);
  });

  it("refuses a replayed signed request and evidence about the wrong subject; health follows", async () => {
    const requestId = await newRequest(`e2e-key-${crypto.randomUUID()}`);
    const nonce = `replay-${crypto.randomUUID().replace(/-/g, "")}`;
    expect((await gateway("GET", `/api/passport/v2/capture-requests/${requestId}`, undefined, { nonce })).status).toBe(200);
    const replay = await gateway("GET", `/api/passport/v2/capture-requests/${requestId}`, undefined, { nonce });
    expect(replay.status).toBe(409);
    expect((replay.json.error as { code: string }).code).toBe("replayed_request");

    const wrong = await gateway("POST", "/api/passport/v2/evidence-packages", pkg(requestId, { subject: { type: "person", id: OTHER } }));
    expect(wrong.status).toBe(422);
    expect((wrong.json.error as { code: string }).code).toBe("subject_mismatch");
    expect(await tableAsService("passport_evidence", `capture_request_id=eq.${requestId}&select=id`)).toHaveLength(0);

    const invalid = await gateway("POST", "/api/passport/v2/evidence-packages", pkg(requestId, { artifacts: [] }));
    expect(invalid.status).toBe(422);
    expect((invalid.json.error as { code: string }).code).toBe("invalid_schema");

    const [conn] = await tableAsService<{ status: string; last_error_category: string | null }>("passport_integration_connections", "connector_key=eq.flow_capture&select=status,last_error_category");
    expect(conn.status).toBe("error");

    // a subsequent good exchange recovers the connection
    expect((await gateway("GET", `/api/passport/v2/capture-requests/${requestId}`)).status).toBe(200);
    const [after] = await tableAsService<{ status: string; last_error_category: string | null }>("passport_integration_connections", "connector_key=eq.flow_capture&select=status,last_error_category");
    expect(after).toEqual({ status: "healthy", last_error_category: null });
  });

  it("an unknown request is a 404, and unsigned traffic never touches the nonce ledger", async () => {
    const before = (await tableAsService("passport_gateway_nonces", "select=nonce")).length;
    await fetch(`${BASE}/api/passport/v2/capture-requests/${crypto.randomUUID()}`, { headers: { "x-flow-nonce": "0123456789abcdef0123456789" } });
    await gateway("GET", `/api/passport/v2/capture-requests/${crypto.randomUUID()}`, undefined, { secret: "wrong-secret-0123456789-abcdefghijklmnopqrst" });
    expect((await tableAsService("passport_gateway_nonces", "select=nonce")).length).toBe(before);
    const unknown = await gateway("GET", `/api/passport/v2/capture-requests/${crypto.randomUUID()}`);
    expect(unknown.status).toBe(404);
  });
});
