import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONNECTION_ERROR_CATEGORIES, CONNECTION_STATUSES, CONNECTOR_KEYS, GATEWAY_SCOPES } from "@flow/passport-contracts";
import {
  CONNECTOR_CATALOG,
  NEVER_GRANTED_TO_CONNECTORS,
  SCOPE_CAPABILITY,
  allConnectors,
  buildConnectionsCenter,
  connectorBadge,
  describeCapabilities,
  explainConnection,
  formatAge,
  formatWindow,
  presentIntegrationEvents,
  safeErrorCategory,
  type ConnectionRecord,
  type ConnectionsCenterInput,
  type GatewayConfigFacts,
} from "@/lib/passport/domain";
import { summarizeGatewayConfig } from "@/lib/passport/gateway/config-summary";

const NOW = new Date("2026-09-20T12:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();
const H = 3600;
const D = 86400;
const ROOT = path.resolve(__dirname, "../..");

const rec = (over: Partial<ConnectionRecord> = {}): ConnectionRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  connector_key: "flow_capture",
  owner: null,
  status: "healthy",
  scope: [...GATEWAY_SCOPES],
  last_success_at: ago(2 * H),
  last_attempt_at: ago(2 * H),
  last_error_category: null,
  stale_after_seconds: 7 * D,
  created_at: ago(30 * D),
  ...over,
});

const CONFIGURED: GatewayConfigFacts = { state: "configured", clients: [{ client_id: "flow_capture", keys: [{ key_id: "k1", status: "active" }], scopes: [...GATEWAY_SCOPES] }] };
const input = (over: Partial<ConnectionsCenterInput> = {}): ConnectionsCenterInput => ({
  now: NOW,
  records: { ok: true, rows: [], unreadable: 0 },
  gateway: { credentialsPresent: true, config: CONFIGURED },
  ...over,
});

describe("health states — explained deterministically", () => {
  it("covers every canonical status; only `healthy` asks for no action", () => {
    for (const status of CONNECTION_STATUSES) {
      const view = explainConnection(rec({ status, last_error_category: status === "healthy" ? null : "network" }), NOW);
      expect(view.status).toBe(status);
      expect(view.explanation.length).toBeGreaterThan(10);
      expect(view.label).toBeTruthy();
      expect(view.action === null, status).toBe(status === "healthy");
    }
  });

  it("uses only the canonical vocabulary — no invented 'misconfigured' or 'never_seen' connection status", () => {
    expect([...CONNECTION_STATUSES].sort()).toEqual(["auth_required", "degraded", "disconnected", "error", "healthy", "stale"]);
  });

  it("is a pure function of the record and the clock", () => {
    expect(explainConnection(rec(), NOW)).toEqual(explainConnection(rec(), NOW));
  });

  it("healthy says when it last succeeded and the window it is judged against", () => {
    expect(explainConnection(rec(), NOW).explanation).toBe("Last successful contact was 2 hours ago, within the expected 7 days window.");
  });

  it("distinguishes degraded, disconnected and auth_required — three different situations", () => {
    const degraded = explainConnection(rec({ status: "degraded", last_error_category: "network" }), NOW);
    const disconnected = explainConnection(rec({ status: "disconnected" }), NOW);
    const auth = explainConnection(rec({ status: "auth_required", last_error_category: "auth" }), NOW);
    expect(new Set([degraded.explanation, disconnected.explanation, auth.explanation]).size).toBe(3);
    expect(degraded.explanation).toContain("network problem");
    expect(degraded.explanation).toContain("usually temporary");
    expect(degraded.tone).toBe("warning");
    expect(disconnected.explanation).toContain("no longer active or authorized");
    expect(disconnected.tone).toBe("danger");
    expect(auth.explanation).toContain("credentials were rejected");
    expect(auth.action).toMatch(/gateway key/);
    expect(degraded.action).not.toBe(disconnected.action);
  });

  it("gives an `error` category-specific guidance, including for an unsupported schema", () => {
    expect(explainConnection(rec({ status: "error", last_error_category: "schema" }), NOW).action).toBe("Check that the connector sends schema version 1.x messages.");
    expect(explainConnection(rec({ status: "error", last_error_category: "rejected" }), NOW).action).toMatch(/Passport refused it/);
    expect(explainConnection(rec({ status: "error", last_error_category: "unknown" }), NOW).action).toMatch(/gateway logs/);
    expect(explainConnection(rec({ status: "error", last_error_category: "schema" }), NOW).lastError).toEqual({ category: "schema", label: "Unsupported or invalid schema" });
  });
});

describe("stale-window logic", () => {
  const window = 7 * D;
  it("a healthy connection inside its window stays healthy, up to and including the boundary", () => {
    expect(explainConnection(rec({ last_success_at: ago(window - 1) }), NOW).status).toBe("healthy");
    expect(explainConnection(rec({ last_success_at: ago(window) }), NOW).status).toBe("healthy");
  });
  it("one second past the window it reads as stale — silence is information, not health", () => {
    const view = explainConnection(rec({ last_success_at: ago(window + 1) }), NOW);
    expect(view.status).toBe("stale");
    expect(view.storedStatus).toBe("healthy");
    expect(view.explanation).toBe("Nothing has been received since 7 days ago; contact is expected at least every 7 days.");
    expect(view.action).toMatch(/connector is running/);
  });
  it("a 'healthy' record with no success on record is stale, never healthy", () => {
    const view = explainConnection(rec({ last_success_at: null }), NOW);
    expect(view.status).toBe("stale");
    expect(view.explanation).toBe("No successful contact is on record.");
  });
  it("honours a custom window", () => {
    expect(explainConnection(rec({ stale_after_seconds: H, last_success_at: ago(2 * H) }), NOW).status).toBe("stale");
    expect(explainConnection(rec({ stale_after_seconds: H, last_success_at: ago(H / 2) }), NOW).explanation).toContain("expected 1 hour window");
  });
  it("only a healthy record decays to stale; a failing one keeps its own state", () => {
    expect(explainConnection(rec({ status: "degraded", last_error_category: "network", last_success_at: ago(30 * D) }), NOW).status).toBe("degraded");
  });
});

describe("last-seen and window formatting", () => {
  it("formats ages in the largest whole unit", () => {
    expect(formatAge(ago(5), NOW)).toBe("just now");
    expect(formatAge(ago(59), NOW)).toBe("just now");
    expect(formatAge(ago(60), NOW)).toBe("1 minute ago");
    expect(formatAge(ago(90 * 60), NOW)).toBe("1 hour ago");
    expect(formatAge(ago(5 * H), NOW)).toBe("5 hours ago");
    expect(formatAge(ago(D), NOW)).toBe("1 day ago");
    expect(formatAge(ago(45 * D), NOW)).toBe("45 days ago");
  });
  it("treats a timestamp in the future (clock skew) or garbage as 'just now', never a negative age", () => {
    expect(formatAge(ago(-3600), NOW)).toBe("just now");
    expect(formatAge("not a date", NOW)).toBe("just now");
  });
  it("states windows exactly", () => {
    expect(formatWindow(604800)).toBe("7 days");
    expect(formatWindow(86400)).toBe("1 day");
    expect(formatWindow(7200)).toBe("2 hours");
    expect(formatWindow(5400)).toBe("90 minutes");
    expect(formatWindow(45)).toBe("45 seconds");
  });
});

describe("safe error presentation", () => {
  it("passes through only known categories", () => {
    for (const category of CONNECTION_ERROR_CATEGORIES) expect(safeErrorCategory(category)).toBe(category);
    expect(safeErrorCategory(null)).toBeNull();
  });
  it("collapses anything else to 'unknown' and never echoes it", () => {
    const hostile = "ECONNRESET at /srv/app/gateway.js:88 Authorization: Bearer abc123 secret=hunter2";
    expect(safeErrorCategory(hostile)).toBe("unknown");
    const view = explainConnection(rec({ status: "error", last_error_category: hostile }), NOW);
    const text = JSON.stringify(view);
    for (const leaked of ["ECONNRESET", "gateway.js", "Bearer", "abc123", "hunter2"]) expect(text).not.toContain(leaked);
    expect(view.lastError?.label).toBe("Unknown error");
  });
});

describe("Flow Capture is never shown as connected unless a record proves it", () => {
  it("no record + gateway not configured => Not connected, contract Ready, configuration Not configured — three separate facts", () => {
    const center = buildConnectionsCenter(input({ gateway: { credentialsPresent: true, config: { state: "not_configured" } } }));
    expect(center.connected).toEqual([]);
    expect(center.needsAttention).toEqual([]);
    const capture = center.notConnected.find((v) => v.key === "flow_capture")!;
    expect(capture.name).toBe("Flow Capture");
    expect(connectorBadge(capture)).toEqual({ label: "Not connected", tone: "neutral" });
    expect(capture.contract.ready).toBe(true);
    expect(capture.configuration.state).toBe("not_configured");
    expect(capture.connection.kind).toBe("none");
    expect((capture.connection as { text: string }).text).toContain("gateway is not configured");
  });

  it("no record + configured => still Not connected: it has never made an authenticated request", () => {
    const capture = buildConnectionsCenter(input()).notConnected[0];
    expect(capture.configuration.state).toBe("configured");
    expect(connectorBadge(capture).label).toBe("Not connected");
    expect((capture.connection as { text: string }).text).toContain("never made an authenticated request");
    expect(capture.needsAttention).toBe(false);
  });

  it("a record with healthy status is the ONLY route into 'connected'", () => {
    const center = buildConnectionsCenter(input({ records: { ok: true, rows: [rec()], unreadable: 0 } }));
    expect(center.connected.map((v) => v.key)).toEqual(["flow_capture"]);
    expect(center.notConnected).toEqual([]);
    expect(connectorBadge(center.connected[0])).toEqual({ label: "Connected", tone: "verified" });
  });

  it("the contract being ready never implies a connection", () => {
    const capture = buildConnectionsCenter(input()).notConnected[0];
    expect(capture.contract.text).toContain("says nothing about whether it is connected");
  });

  it("the connector's own schema version is reported as not recorded, not guessed", () => {
    const view = buildConnectionsCenter(input({ records: { ok: true, rows: [rec()], unreadable: 0 } })).connected[0];
    expect(view.connection.kind === "recorded" && view.connection.connectorSchemaVersion).toBe("not_recorded");
  });
});

describe("could not read is never healthy", () => {
  it("a failed read yields 'health unavailable' for every connector and puts nothing in connected / not connected", () => {
    const center = buildConnectionsCenter(input({ records: { ok: false } }));
    expect(center.read).toBe("unavailable");
    expect(center.connected).toEqual([]);
    expect(center.needsAttention).toEqual([]);
    expect(center.notConnected).toEqual([]);
    expect(center.healthUnavailable.map((v) => v.key)).toEqual([...CONNECTOR_KEYS]);
    const view = center.healthUnavailable[0];
    expect(view.connection.kind).toBe("unavailable");
    expect(connectorBadge(view).label).toBe("Health unavailable");
    expect(JSON.stringify(view.connection)).not.toMatch(/healthy"|Connected/);
  });
  it("counts records it could not validate instead of dropping them silently or calling them healthy", () => {
    const center = buildConnectionsCenter(input({ records: { ok: true, rows: [], unreadable: 2 } }));
    expect(center.unreadableRecords).toBe(2);
    expect(center.connected).toEqual([]);
  });
});

describe("sections", () => {
  it("empty: no records at all => nothing connected, nothing needing attention, every supported connector listed as available", () => {
    const center = buildConnectionsCenter(input());
    expect([center.connected.length, center.needsAttention.length, center.notConnected.length]).toEqual([0, 0, CONNECTOR_KEYS.length]);
  });
  it("any non-healthy status lands in needs-attention with an action", () => {
    for (const status of CONNECTION_STATUSES.filter((s) => s !== "healthy")) {
      const center = buildConnectionsCenter(input({ records: { ok: true, rows: [rec({ status, last_error_category: "network" })], unreadable: 0 } }));
      expect(center.needsAttention).toHaveLength(1);
      expect(center.connected).toHaveLength(0);
      expect(center.needsAttention[0].attentionReasons.length).toBeGreaterThan(0);
    }
  });
  it("a healthy record whose gateway configuration is gone needs attention (it cannot make new contact)", () => {
    const center = buildConnectionsCenter(input({ records: { ok: true, rows: [rec()], unreadable: 0 }, gateway: { credentialsPresent: true, config: { state: "not_configured" } } }));
    expect(center.connected).toHaveLength(0);
    const view = center.needsAttention[0];
    expect(view.connection.kind === "recorded" && view.connection.health.status).toBe("healthy");
    expect(view.attentionReasons.join(" ")).toMatch(/Restore the gateway configuration/);
  });
  it("reports 'misconfigured' as a configuration fact for an invalid registry or missing service credentials", () => {
    const invalid = buildConnectionsCenter(input({ gateway: { credentialsPresent: true, config: { state: "invalid_config" } } })).notConnected[0];
    expect(invalid.configuration.state).toBe("misconfigured");
    expect(invalid.configuration.text).toContain("not valid");
    const noKey = buildConnectionsCenter(input({ gateway: { credentialsPresent: false, config: CONFIGURED } })).notConnected[0];
    expect(noKey.configuration.state).toBe("misconfigured");
    expect(noKey.configuration.text).toContain("service credentials");
  });
  it("a configured registry that has no client for this connector is 'not configured' for it", () => {
    const other: GatewayConfigFacts = { state: "configured", clients: [{ client_id: "someone_else", keys: [{ key_id: "k", status: "active" }], scopes: ["evidence:read"] }] };
    expect(buildConnectionsCenter(input({ gateway: { credentialsPresent: true, config: other } })).notConnected[0].configuration.state).toBe("not_configured");
  });
  it("shows a record for a connector Passport has no contract for, without pretending a contract exists", () => {
    const center = buildConnectionsCenter(input({ records: { ok: true, rows: [rec({ connector_key: "mystery_system" })], unreadable: 0 } }));
    const mystery = allConnectors(center).find((v) => v.key === "mystery_system")!;
    expect(mystery.supported).toBe(false);
    expect(mystery.contract.ready).toBe(false);
    expect(mystery.name).toBe("mystery_system");
    expect(mystery.summary).toBeNull();
  });
});

describe("capabilities and scopes", () => {
  it("every gateway scope is described (the Record is total), and every connector key has a catalog entry", () => {
    for (const scope of GATEWAY_SCOPES) expect(SCOPE_CAPABILITY[scope].length).toBeGreaterThan(10);
    for (const key of CONNECTOR_KEYS) expect(CONNECTOR_CATALOG[key].name).toBeTruthy();
  });
  it("a fully-scoped connector can submit evidence and receive requests — and still cannot request evidence or decide verification", () => {
    const cap = describeCapabilities(GATEWAY_SCOPES);
    expect(cap.can).toHaveLength(GATEWAY_SCOPES.length);
    expect(cap.lacks).toHaveLength(0);
    expect(cap.flags).toEqual({ canSubmitEvidence: true, canReceiveCaptureRequests: true, canRequestEvidence: false, canMakeVerificationDecisions: false });
  });
  it("a narrower connector shows exactly what it lacks", () => {
    const cap = describeCapabilities(["evidence:read"]);
    expect(cap.can.map((c) => c.scope)).toEqual(["evidence:read"]);
    expect(cap.lacks.map((c) => c.scope)).toEqual(["capture_requests:read", "capture_requests:report", "evidence_packages:write"]);
    expect(cap.flags.canSubmitEvidence).toBe(false);
  });
  it("counts scopes it does not recognise and never echoes them", () => {
    const cap = describeCapabilities(["evidence:read", "admin:everything"]);
    expect(cap.unrecognisedScopes).toBe(1);
    expect(JSON.stringify(cap)).not.toContain("admin:everything");
  });
  it("always lists what no scope grants: verifying, consent, authority, identity, starting requests", () => {
    const text = NEVER_GRANTED_TO_CONNECTORS.join(" | ");
    for (const phrase of ["Start a capture request", "Verify, reject or revoke", "Grant or approve consent", "Assign or change Passport authority", "Rewrite identity"]) expect(text).toContain(phrase);
  });
  it("shows what the gateway ENFORCES now when configured, not the (older) recorded scopes", () => {
    const narrowed: GatewayConfigFacts = { state: "configured", clients: [{ client_id: "flow_capture", keys: [{ key_id: "k1", status: "active" }], scopes: ["evidence:read"] }] };
    const view = buildConnectionsCenter(input({ records: { ok: true, rows: [rec({ scope: [...GATEWAY_SCOPES] })], unreadable: 0 }, gateway: { credentialsPresent: true, config: narrowed } })).connected[0];
    expect(view.capabilitySource).toBe("gateway_configuration");
    expect(view.capabilities.can.map((c) => c.scope)).toEqual(["evidence:read"]);
  });
  it("does NOT present the record's default scopes as capabilities when the gateway is not configured for the connector", () => {
    // The DB writes those scopes as a fixed default at first contact; they are not a grant. With no
    // configuration the gateway accepts nothing from this connector, so the truthful answer is "nothing".
    const view = buildConnectionsCenter(input({ records: { ok: true, rows: [rec({ scope: [...GATEWAY_SCOPES] })], unreadable: 0 }, gateway: { credentialsPresent: true, config: { state: "not_configured" } } })).needsAttention[0];
    expect(view.capabilitySource).toBe("none");
    expect(view.capabilities.can).toEqual([]);
    expect(view.capabilities.flags.canSubmitEvidence).toBe(false);
    expect(view.capabilityNote).toContain("not a grant");
  });
});

describe("the capability boundary is pinned to the real gateway surface", () => {
  const listRoutes = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listRoutes(path.join(dir, e.name)) : e.name === "route.ts" ? [path.relative(path.join(ROOT, "app/api/passport/v2"), path.join(dir, e.name))] : []));

  it("the gateway exposes exactly four routes — none creates a request, verifies, consents or assigns authority", () => {
    expect(listRoutes(path.join(ROOT, "app/api/passport/v2")).sort()).toEqual(
      ["capture-requests/[id]/route.ts", "capture-requests/[id]/status/route.ts", "evidence-packages/route.ts", "evidence/[id]/route.ts"].sort(),
    );
    expect(GATEWAY_SCOPES).toHaveLength(4);
  });

  it("the service_role-only database surface is exactly the six gateway RPCs — a new one fails this test until the Connections Center describes it", () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260919120500_passport_v2_capture_gateway.sql"), "utf8");
    const names = [...sql.matchAll(/create or replace function public\.(passport_gateway_\w+)/g)].map((m) => m[1]).sort();
    expect(names).toEqual(
      ["passport_gateway_consume_nonce", "passport_gateway_get_capture_request", "passport_gateway_get_evidence_summary", "passport_gateway_ingest_evidence_package", "passport_gateway_record_connection_result", "passport_gateway_report_capture_status"].sort(),
    );
    for (const name of names) expect(name).not.toMatch(/verif|consent|authority|identity|claim/);
  });
});

describe("integration history", () => {
  const ev = (over: Record<string, unknown>) => ({ id: "e" + Math.random().toString(36).slice(2), event_type: "integration.connected", occurred_at: ago(H), payload: {}, ...over }) as Parameters<typeof presentIntegrationEvents>[0][number];

  it("keeps only the four integration event types", () => {
    const rows = [
      ev({ event_type: "integration.connected" }),
      ev({ event_type: "integration.degraded", payload: { status: "degraded" } }),
      ev({ event_type: "integration.disconnected", payload: { status: "auth_required" } }),
      ev({ event_type: "integration.sync_failed", payload: { category: "rate_limit" } }),
      ev({ event_type: "claim.verified" }),
      ev({ event_type: "capture.requested" }),
      ev({ event_type: "integration.request_received" }),
    ];
    expect(presentIntegrationEvents(rows, NOW).map((e) => e.type).sort()).toEqual(["integration.connected", "integration.degraded", "integration.disconnected", "integration.sync_failed"]);
  });

  it("is newest first and bounded", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ev({ id: `e${i}`, occurred_at: ago((i + 1) * H) }));
    const out = presentIntegrationEvents(rows, NOW, 5);
    expect(out.map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(presentIntegrationEvents(rows, NOW)).toHaveLength(15);
    expect(presentIntegrationEvents(rows, NOW, 0)).toEqual([]);
  });

  it("builds notes only from validated enum fields", () => {
    const [connected, recovered, failed, degraded] = presentIntegrationEvents(
      [
        ev({ id: "a", occurred_at: ago(4 * H), payload: {} }),
        ev({ id: "b", occurred_at: ago(3 * H), payload: { was: "auth_required" } }),
        ev({ id: "c", event_type: "integration.sync_failed", occurred_at: ago(2 * H), payload: { category: "network" } }),
        ev({ id: "d", event_type: "integration.degraded", occurred_at: ago(H), payload: { status: "degraded" } }),
      ],
      NOW,
    ).reverse();
    expect(connected.note).toBe("First authenticated contact.");
    expect(recovered.note).toBe("Recovered from “Re-authorization needed”.");
    expect(failed.note).toBe("Network problem.");
    expect(degraded.note).toBe("Status changed to “Degraded”.");
  });

  it("never passes a payload through: secrets, headers, traces and unknown enum values cannot appear", () => {
    const out = presentIntegrationEvents(
      [
        ev({
          event_type: "integration.sync_failed",
          payload: { category: "network", connector: "flow_capture", secret: "SECRET-HMAC-KEY", authorization: "Bearer TOKEN-123", nonce: "NONCE-9", stack: "at Object.<anonymous> (/srv/x.js:1:1)", headers: { "x-flow-signature": "SIG" } },
        }),
        ev({ event_type: "integration.degraded", payload: { status: "<script>alert(1)</script>" } }),
      ],
      NOW,
    );
    const text = JSON.stringify(out);
    for (const leaked of ["SECRET-HMAC-KEY", "TOKEN-123", "NONCE-9", "x.js", "SIG", "<script>"]) expect(text).not.toContain(leaked);
    expect(out.find((e) => e.type === "integration.degraded")?.note).toBeNull();
  });

  it("tolerates a null / array / scalar payload", () => {
    for (const payload of [null, [], "text", 42]) expect(presentIntegrationEvents([ev({ payload })], NOW)[0].note).toBe("First authenticated contact.");
  });
});

describe("gateway configuration summary — safe to show", () => {
  const SECRET = "hunter2-this-secret-is-definitely-long-enough-0123456789";
  const entry = (over: object = {}) => ({ client_id: "flow_capture", key_id: "k1", secret: SECRET, scopes: ["capture_requests:read", "evidence_packages:write"], ...over });

  it("reports not_configured when nothing is set", () => {
    for (const raw of [undefined, null, "", "   "]) expect(summarizeGatewayConfig(raw)).toEqual({ state: "not_configured" });
  });
  it("reports invalid_config for malformed JSON, short secrets, and duplicate keys — without echoing any of it", () => {
    for (const raw of ["{not json", JSON.stringify([entry({ secret: "short" })]), JSON.stringify([entry(), entry()]), JSON.stringify([{ client_id: "Bad Id", key_id: "k", secret: SECRET, scopes: ["evidence:read"] }])]) {
      const summary = summarizeGatewayConfig(raw);
      expect(summary).toEqual({ state: "invalid_config" });
    }
  });
  it("lists clients, key ids, key status and scopes — and NEVER a secret", () => {
    const summary = summarizeGatewayConfig(JSON.stringify([entry(), entry({ key_id: "k0", status: "retiring", scopes: ["evidence:read"] })]));
    expect(summary).toEqual({
      state: "configured",
      clients: [{ client_id: "flow_capture", keys: [{ key_id: "k1", status: "active" }, { key_id: "k0", status: "retiring" }], scopes: ["capture_requests:read", "evidence_packages:write", "evidence:read"] }],
    });
    expect(JSON.stringify(summary)).not.toContain(SECRET);
    expect(JSON.stringify(summary)).not.toContain("hunter2");
  });
  it("omits disabled keys (they cannot authenticate), and is not_configured if every key is disabled", () => {
    const mixed = summarizeGatewayConfig(JSON.stringify([entry(), entry({ key_id: "old", status: "disabled" })]));
    expect(mixed.state === "configured" && mixed.clients[0].keys.map((k) => k.key_id)).toEqual(["k1"]);
    expect(summarizeGatewayConfig(JSON.stringify([entry({ status: "disabled" })]))).toEqual({ state: "not_configured" });
  });
  it("agrees with the gateway's own parser about validity (it is the same function)", () => {
    expect(summarizeGatewayConfig(JSON.stringify([entry()])).state).toBe("configured");
    expect(summarizeGatewayConfig(JSON.stringify([]))).toEqual({ state: "invalid_config" });
  });
});
