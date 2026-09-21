import { describe, expect, it, vi } from "vitest";
import { GATEWAY_SCOPES } from "@flow/passport-contracts";
import { readIntegrationConnections, readIntegrationEvents } from "@/lib/passport/data/connections";

/** A stand-in Supabase client: records every call in the chain and resolves to `result` when awaited. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "then") return (resolve: (value: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return builder;
        };
      },
    },
  );
  const client = {
    from: (table: string) => {
      calls.push(["from", [table]]);
      return builder;
    },
  };
  return { client: client as never, calls };
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  connector_key: "flow_capture",
  owner_type: null,
  owner_id: null,
  status: "healthy",
  scope: [...GATEWAY_SCOPES],
  last_success_at: "2026-09-20T10:00:00Z",
  last_attempt_at: "2026-09-20T10:00:00Z",
  last_error_category: null,
  stale_after_seconds: 604800,
  created_at: "2026-08-20T10:00:00Z",
};

describe("readIntegrationConnections", () => {
  it("maps rows to canonical records (owner pair -> owner | null)", async () => {
    const owned = { ...ROW, id: "22222222-2222-4222-8222-222222222222", owner_type: "person", owner_id: "33333333-3333-4333-8333-333333333333" };
    const { client } = fakeClient({ data: [ROW, owned], error: null });
    const read = await readIntegrationConnections(client);
    expect(read.ok && read.rows.map((r) => r.owner)).toEqual([null, { type: "person", id: "33333333-3333-4333-8333-333333333333" }]);
    expect(read.ok && read.unreadable).toBe(0);
  });

  it("reads only the connections table, as the caller (no rpc, no writes)", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await readIntegrationConnections(client);
    expect(calls.map(([name]) => name)).toEqual(["from", "select"]);
    expect(calls[0][1]).toEqual(["passport_integration_connections"]);
    expect(String(calls[1][1][0])).not.toMatch(/\*/);
  });

  it("an unrecognised status is counted as unreadable — never shown as a known state", async () => {
    const { client } = fakeClient({ data: [ROW, { ...ROW, id: "44444444-4444-4444-8444-444444444444", status: "connected_ish" }], error: null });
    const read = await readIntegrationConnections(client);
    expect(read.ok && read.rows).toHaveLength(1);
    expect(read.ok && read.unreadable).toBe(1);
  });

  it("malformed rows (bad id, non-array scope, non-positive window) are unreadable, not coerced", async () => {
    const bad = [{ ...ROW, id: "nope" }, { ...ROW, scope: "evidence:read" }, { ...ROW, stale_after_seconds: 0 }, { ...ROW, stale_after_seconds: null }];
    const { client } = fakeClient({ data: bad, error: null });
    const read = await readIntegrationConnections(client);
    expect(read.ok && read.rows).toEqual([]);
    expect(read.ok && read.unreadable).toBe(4);
  });

  it("a query error is { ok: false } — 'could not read', not an empty list — and logs no message body", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ data: null, error: { message: "relation \"secret_table\" does not exist; password=hunter2" } });
    expect(await readIntegrationConnections(client)).toEqual({ ok: false });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("hunter2");
    spy.mockRestore();
  });

  it("no rows for a viewer RLS excludes is an OK, empty read (distinct from a failed read)", async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await readIntegrationConnections(client)).toEqual({ ok: true, rows: [], unreadable: 0 });
  });
});

describe("readIntegrationEvents", () => {
  it("asks only for the four integration event types, for one connector, newest first, bounded", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await readIntegrationEvents(client, "flow_capture", 10);
    const byName = Object.fromEntries(calls.map(([name, args]) => [name, args]));
    expect(byName.from).toEqual(["passport_events"]);
    expect(byName.in).toEqual(["event_type", ["integration.connected", "integration.degraded", "integration.disconnected", "integration.sync_failed"]]);
    expect(calls.filter(([n]) => n === "eq").map(([, a]) => a)).toEqual([["actor_type", "service"], ["actor_id", "flow_capture"]]);
    expect(byName.order).toEqual(["seq", { ascending: false }]);
    expect(byName.limit).toEqual([10]);
  });

  it("clamps the limit", async () => {
    for (const [asked, sent] of [[0, 1], [-5, 1], [9999, 50]] as const) {
      const { client, calls } = fakeClient({ data: [], error: null });
      await readIntegrationEvents(client, "flow_capture", asked);
      expect(calls.find(([n]) => n === "limit")?.[1]).toEqual([sent]);
    }
  });

  it("returns rows as-is for the presenter to filter; a failure is { ok: false }", async () => {
    const rows = [{ id: "e1", event_type: "integration.connected", occurred_at: "2026-09-20T10:00:00Z", payload: { connector: "flow_capture" }, seq: 9 }];
    expect(await readIntegrationEvents(fakeClient({ data: rows, error: null }).client, "flow_capture")).toEqual({
      ok: true,
      rows: [{ id: "e1", event_type: "integration.connected", occurred_at: "2026-09-20T10:00:00Z", payload: { connector: "flow_capture" } }],
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readIntegrationEvents(fakeClient({ data: null, error: { message: "boom" } }).client, "flow_capture")).toEqual({ ok: false });
    spy.mockRestore();
  });
});
