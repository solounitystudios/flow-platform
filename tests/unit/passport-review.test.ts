import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { presentPublicClaim, type PublicClaimRow } from "@/lib/passport/domain";
import { getPublicClaimsForProfile } from "@/lib/passport/data/claims";
import { readBodyCapped } from "@/lib/passport/gateway/body";
import { MAX_BODY_BYTES } from "@/lib/passport/gateway";

/**
 * Regression tests added by the independent security review. Each is tied to a finding that was
 * reproduced first (see tests/db/repros/) and fails if the corresponding fix is reverted.
 */

const publicRow = (over: Partial<PublicClaimRow> = {}): PublicClaimRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  claim_type: "participation.activity",
  effective_at: "2026-08-01T00:00:00Z",
  expires_at: null,
  public_value: { title: "Welding workshop", activity_type: "workshop" },
  ...over,
});

// M4 (review id R11) was first fixed in TypeScript (projectClaimForPublic + the public query). The M1 rework moved
// eligibility into the database projection, the only public read path, so every caller inherits it. These tests pin
// that the guarantee still holds at that lower layer; the behavioural proof is tests/db (core §15 and M1-01/M1-13).
describe("M4 (R11) — a member cannot headline a forged claim on a public Passport", () => {
  it("CONTROL: a row from the projection is presented with its allow-listed title", () => {
    expect(presentPublicClaim(publicRow()).title).toBe("Welding workshop (Workshop)");
  });

  it("eligibility is decided in the database: the projection admits ONLY Passport-derived claims", () => {
    const sql = readFileSync("supabase/migrations/20260919120200_passport_v2_activity_claims_and_visibility.sql", "utf8");
    const fn = sql.slice(sql.indexOf("create or replace function public.passport_public_claims"));
    for (const predicate of [/c\.source_system\s*=\s*'flow_platform'/, /c\.status\s*=\s*'verified'/, /c\.visibility\s*=\s*'public'/, /c\.sensitivity\s*=\s*'standard'/, /passport_subject_is_public\(/]) {
      expect(fn, String(predicate)).toMatch(predicate);
    }
  });

  it("the public data layer asks only the projection RPC and never reads the raw claims table", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await getPublicClaimsForProfile({ from, rpc } as never, "22222222-2222-4222-8222-222222222222");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("passport_public_claims", expect.objectContaining({ p_profile_id: "22222222-2222-4222-8222-222222222222" }));
  });
});

const streamOf = (chunks: Uint8Array[], onPull?: () => void) => {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
};
const post = (body: ReadableStream<Uint8Array> | string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/passport/v2/evidence-packages", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("gateway body cap — enforced BEFORE the body is buffered", () => {
  it("CONTROL: an ordinary body is read intact", async () => {
    expect(await readBodyCapped(post('{"a":1}'))).toEqual({ ok: true, text: '{"a":1}' });
  });

  it("refuses on a declared Content-Length over the cap WITHOUT reading a single byte", async () => {
    const pulled = vi.fn();
    const request = post(streamOf([new Uint8Array(10), new Uint8Array(10), new Uint8Array(10)], pulled), { "content-length": String(MAX_BODY_BYTES + 1) });
    // A ReadableStream primes itself asynchronously after construction: let that settle, then measure
    // only the reads made BY readBodyCapped.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const primed = pulled.mock.calls.length;
    expect(await readBodyCapped(request)).toEqual({ ok: false });
    expect(pulled.mock.calls.length).toBe(primed);
  });

  it("stops reading a chunked body (no Content-Length) as soon as it passes the cap, and cancels the stream", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(200_000);
    const request = post(streamOf(Array.from({ length: 500 }, () => chunk), () => (pulls += 1)));
    expect(await readBodyCapped(request)).toEqual({ ok: false });
    // 200 KB chunks against a 1 MB cap: it must stop within a few pulls, not consume all 500 (100 MB).
    expect(pulls).toBeLessThan(10);
  });

  it("is not fooled by a Content-Length that lies low", async () => {
    const chunk = new Uint8Array(300_000);
    expect(await readBodyCapped(post(streamOf([chunk, chunk, chunk, chunk]), { "content-length": "10" }))).toEqual({ ok: false });
  });

  it("the limit is exact: MAX bytes pass, MAX+1 fail", async () => {
    expect((await readBodyCapped(post("a".repeat(MAX_BODY_BYTES)))).ok).toBe(true);
    expect((await readBodyCapped(post("a".repeat(MAX_BODY_BYTES + 1)))).ok).toBe(false);
  });

  it("decodes multi-byte UTF-8 correctly across chunk boundaries", async () => {
    const bytes = new TextEncoder().encode("café ☕ 🎉 naïve");
    const split = [bytes.slice(0, 5), bytes.slice(5, 9), bytes.slice(9)]; // cuts through multi-byte sequences
    expect(await readBodyCapped(post(streamOf(split)))).toEqual({ ok: true, text: "café ☕ 🎉 naïve" });
  });

  it("an empty body is an empty string, not a failure", async () => {
    expect(await readBodyCapped(new Request("http://localhost/x", { method: "POST" }))).toEqual({ ok: true, text: "" });
  });
});
