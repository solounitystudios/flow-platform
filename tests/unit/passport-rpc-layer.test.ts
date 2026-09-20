import { describe, expect, it, vi } from "vitest";
import { assignAuthority, claimFromActivity, createClaim, normalizeRpc, recordVerification, requestVerification } from "@/lib/passport/data";

type Rpc = (fn: string, args?: Record<string, unknown>) => { then: (cb: (r: { data: unknown; error: { message: string } | null }) => unknown) => Promise<unknown> };

function fakeClient(response: { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
  const rpc: Rpc = (fn, args) => {
    calls.push({ fn, args });
    return Promise.resolve(response) as never;
  };
  return { client: { rpc } as never, calls };
}

describe("normalizeRpc", () => {
  it("passes ok results through with their extra fields", () => {
    expect(normalizeRpc<{ id: string }>("x", { data: { ok: true, id: "abc" }, error: null })).toEqual({ ok: true, id: "abc" });
  });

  it("passes a business failure through as its reason", () => {
    expect(normalizeRpc("x", { data: { ok: false, reason: "not_authorized" }, error: null })).toEqual({ ok: false, reason: "not_authorized" });
    expect(normalizeRpc("x", { data: { ok: false }, error: null })).toEqual({ ok: false, reason: "unknown" });
  });

  it("turns transport errors and malformed responses into rpc_error without leaking detail", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(normalizeRpc("x", { data: null, error: { message: "connection refused to 10.0.0.5" } })).toEqual({ ok: false, reason: "rpc_error" });
    expect(normalizeRpc("x", { data: "nope", error: null })).toEqual({ ok: false, reason: "rpc_error" });
    expect(normalizeRpc("x", { data: { reason: "x" }, error: null })).toEqual({ ok: false, reason: "rpc_error" });
    spy.mockRestore();
  });
});

describe("RPC wrappers send the argument names the migrations define", () => {
  it("createClaim", async () => {
    const { client, calls } = fakeClient({ data: { ok: true, id: "c1", status: "draft" }, error: null });
    const result = await createClaim(client, { subjectType: "business", subjectId: "s1", claimType: "credential.license", value: { a: 1 }, submit: true });
    expect(result).toEqual({ ok: true, id: "c1", status: "draft" });
    expect(calls[0].fn).toBe("passport_create_claim");
    expect(calls[0].args).toMatchObject({ p_subject_type: "business", p_subject_id: "s1", p_claim_type: "credential.license", p_value: { a: 1 }, p_visibility: "private", p_sensitivity: "standard", p_submit: true });
  });

  it("requestVerification / recordVerification", async () => {
    const a = fakeClient({ data: { ok: true, id: "v1" }, error: null });
    await requestVerification(a.client, { claimId: "c", method: "peer_attested", verifierType: "person", verifierId: "p" });
    expect(a.calls[0]).toEqual({ fn: "passport_request_verification", args: { p_claim_id: "c", p_method: "peer_attested", p_verifier_type: "person", p_verifier_id: "p" } });
    const b = fakeClient({ data: { ok: false, reason: "not_authorized" }, error: null });
    expect(await recordVerification(b.client, { verificationId: "v", decision: "verified" })).toEqual({ ok: false, reason: "not_authorized" });
    expect(b.calls[0].fn).toBe("passport_record_verification");
  });

  it("assignAuthority defaults empty scope arrays rather than omitting them", async () => {
    const { client, calls } = fakeClient({ data: { ok: true, id: "a" }, error: null });
    await assignAuthority(client, { principalId: "p", entityType: "organization", entityId: "o", authority: "evidence_reviewer", claimTypePrefixes: ["credential"], expiresAt: "2027-01-01T00:00:00Z" });
    expect(calls[0].args).toMatchObject({ p_purposes: [], p_claim_type_prefixes: ["credential"] });
  });

  it("claimFromActivity sends only the activity id — the client supplies nothing else to trust", async () => {
    const { client, calls } = fakeClient({ data: { ok: true, id: "c", already_exists: false }, error: null });
    await claimFromActivity(client, "act-1");
    expect(calls[0]).toEqual({ fn: "passport_claim_from_activity", args: { p_activity_id: "act-1" } });
  });
});
