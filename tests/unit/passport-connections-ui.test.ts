import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GATEWAY_SCOPES } from "@flow/passport-contracts";
import { ConnectionsCenterView } from "@/components/passport/connections/ConnectionsCenterView";
import { ConnectorDetail } from "@/components/passport/connections/ConnectorDetail";
import { allConnectors, buildConnectionsCenter, presentIntegrationEvents, type ConnectionRecord, type ConnectionsCenterInput, type GatewayConfigFacts } from "@/lib/passport/domain";

/** What an operator actually reads. These pin honesty and secrecy at the level of the rendered HTML. */

const NOW = new Date("2026-09-20T12:00:00Z");
const ago = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();
const rec = (over: Partial<ConnectionRecord> = {}): ConnectionRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  connector_key: "flow_capture",
  owner: null,
  status: "healthy",
  scope: [...GATEWAY_SCOPES],
  last_success_at: ago(7200),
  last_attempt_at: ago(7200),
  last_error_category: null,
  stale_after_seconds: 604800,
  created_at: ago(30 * 86400),
  ...over,
});
const CONFIGURED: GatewayConfigFacts = { state: "configured", clients: [{ client_id: "flow_capture", keys: [{ key_id: "k1", status: "active" }], scopes: [...GATEWAY_SCOPES] }] };
const center = (over: Partial<ConnectionsCenterInput> = {}) => buildConnectionsCenter({ now: NOW, records: { ok: true, rows: [], unreadable: 0 }, gateway: { credentialsPresent: true, config: CONFIGURED }, ...over });
const html = (c = center()) => renderToStaticMarkup(createElement(ConnectionsCenterView, { center: c }));
const detail = (c = center(), history: Parameters<typeof ConnectorDetail>[0]["history"] = { state: "ok", events: [] }) => renderToStaticMarkup(createElement(ConnectorDetail, { view: allConnectors(c)[0], history }));

describe("Connections Center — empty and not-connected states", () => {
  it("with no records, Flow Capture reads 'Not connected' and NEVER as connected, healthy or active", () => {
    const out = html();
    expect(out).toContain("Flow Capture");
    expect(out).toContain(">Not connected<");
    expect(out).not.toMatch(/>Connected</); // the healthy badge label
    expect(out).not.toMatch(/>Healthy</i);
    expect(out).not.toMatch(/>Active</i);
    expect(out).toContain("No connected systems");
    // With nothing connected there is nothing being watched, so no reassuring "Nothing needs attention".
    expect(out).not.toContain("Nothing needs attention");
  });

  it("reassures only when there is something healthy to be reassured about", () => {
    expect(html(center({ records: { ok: true, rows: [rec()], unreadable: 0 } }))).toContain("Nothing needs attention");
  });

  it("shows the contract and the connection as SEPARATE facts: 'Contract Ready' beside 'Connection Not connected'", () => {
    const out = html();
    expect(out).toMatch(/Contract<\/dt><dd[^>]*>Ready</);
    expect(out).toMatch(/Connection<\/dt><dd[^>]*>Not connected</);
    expect(out).toMatch(/Gateway configuration<\/dt><dd[^>]*>Configured</);
  });

  it("says 'Not configured' when the gateway isn't, and names what to set", () => {
    const out = html(center({ gateway: { credentialsPresent: true, config: { state: "not_configured" } } }));
    expect(out).toMatch(/Gateway configuration<\/dt><dd[^>]*>Not configured</);
    expect(out).toContain("gateway is not configured for this connector");
  });

  it("says 'Misconfigured' for an invalid registry, distinct from not configured", () => {
    const out = html(center({ gateway: { credentialsPresent: true, config: { state: "invalid_config" } } }));
    expect(out).toMatch(/Gateway configuration<\/dt><dd[^>]*>Misconfigured</);
  });
});

describe("Connections Center — health unavailable is not health", () => {
  const out = html(center({ records: { ok: false } }));
  it("raises an alert, labels the connector 'Health unavailable', and renders no healthy/not-connected claim", () => {
    expect(out).toContain('role="alert"');
    expect(out).toContain("Connection health is unavailable");
    expect(out).toContain(">Health unavailable<");
    expect(out).not.toMatch(/>Connected</);
    expect(out).not.toContain(">Not connected<");
    expect(out).not.toContain("No connected systems");
  });
  it("still tells the truth about what IS known: the contract and the configuration", () => {
    expect(out).toMatch(/Contract<\/dt><dd[^>]*>Ready</);
    expect(out).toMatch(/Gateway configuration<\/dt><dd[^>]*>Configured</);
  });
  it("surfaces records it couldn't read, without calling them healthy", () => {
    const withBad = html(center({ records: { ok: true, rows: [], unreadable: 1 } }));
    expect(withBad).toContain("1 connection record could not be read");
    expect(withBad).toContain("not the same as healthy");
  });
});

describe("Connections Center — recorded connections", () => {
  it("a healthy, configured record appears under 'Connected systems' with last-seen", () => {
    const out = html(center({ records: { ok: true, rows: [rec()], unreadable: 0 } }));
    expect(out).toContain(">Connected<");
    expect(out).toContain("2 hours ago");
    expect(out).toContain("Last successful contact was 2 hours ago, within the expected 7 days window.");
    expect(out).not.toContain("Action needed");
  });

  it("stale, degraded and disconnected each show their own words and an action", () => {
    const stale = html(center({ records: { ok: true, rows: [rec({ last_success_at: ago(8 * 86400) })], unreadable: 0 } }));
    expect(stale).toContain(">No recent activity<");
    expect(stale).toContain("Action needed");
    const degraded = html(center({ records: { ok: true, rows: [rec({ status: "degraded", last_error_category: "network" })], unreadable: 0 } }));
    expect(degraded).toContain(">Degraded<");
    expect(degraded).toContain("Network problem");
    expect(degraded).toContain("usually temporary");
    const disconnected = html(center({ records: { ok: true, rows: [rec({ status: "disconnected" })], unreadable: 0 } }));
    expect(disconnected).toContain(">Disconnected<");
    expect(disconnected).toContain("no longer active or authorized");
    expect(degraded).not.toContain("no longer active or authorized");
  });

  it("never prints a raw error, only the category label", () => {
    const out = html(center({ records: { ok: true, rows: [rec({ status: "error", last_error_category: "TypeError: x at /srv/app.js:9 token=abc" })], unreadable: 0 } }));
    expect(out).toContain("Unknown error");
    for (const leaked of ["TypeError", "/srv/app.js", "token=abc"]) expect(out).not.toContain(leaked);
  });
});

describe("Connector detail — capabilities and authority", () => {
  it("shows what Capture CAN do, and states plainly what it CANNOT", () => {
    const out = detail(center({ records: { ok: true, rows: [rec()], unreadable: 0 } }));
    expect(out).toContain("Receive the capture requests Passport creates for it");
    expect(out).toContain("Submit an evidence package");
    expect(out).toContain("never as verification");
    expect(out).toContain("Cannot — no scope grants this");
    for (const cannot of ["Verify, reject or revoke a Passport claim", "Grant or approve consent on someone&#x27;s behalf", "Assign or change Passport authority", "Rewrite identity or any other Passport record", "Start a capture request"]) expect(out).toContain(cannot);
  });

  it("gives the three authority answers: can submit evidence (yes), can request evidence (no), can make verification decisions (no)", () => {
    const out = detail(center({ records: { ok: true, rows: [rec()], unreadable: 0 } }));
    expect(out).toMatch(/Can submit evidence<\/dt><dd[^>]*>Yes</);
    expect(out).toMatch(/Can request evidence<\/dt><dd[^>]*>No</);
    expect(out).toMatch(/Can make verification decisions<\/dt><dd[^>]*>No</);
    expect(out).toContain("Produces evidence; never a verifier");
  });

  it("a connector with no scopes can do nothing, and is not shown as able to submit evidence", () => {
    const out = detail(center({ gateway: { credentialsPresent: true, config: { state: "not_configured" } } }));
    expect(out).toContain("Nothing is currently permitted.");
    expect(out).toMatch(/Can submit evidence<\/dt><dd[^>]*>No</);
  });

  it("reports the connector's own schema version as 'Not recorded'", () => {
    expect(detail(center({ records: { ok: true, rows: [rec()], unreadable: 0 } }))).toMatch(/Connector schema version<\/dt><dd[^>]*>Not recorded</);
  });

  it("lists key ids and status — and states that secrets are never displayed", () => {
    const out = detail(center({ records: { ok: true, rows: [rec()], unreadable: 0 } }));
    expect(out).toContain("k1");
    expect(out).toContain("Secrets are never displayed anywhere.");
  });
});

describe("Connector detail — integration history", () => {
  const view = (rows: Parameters<typeof presentIntegrationEvents>[0]) => detail(center({ records: { ok: true, rows: [rec()], unreadable: 0 } }), { state: "ok", events: presentIntegrationEvents(rows, NOW) });

  it("shows a bounded, plain history", () => {
    const out = view([
      { id: "a", event_type: "integration.connected", occurred_at: ago(3600), payload: { was: "auth_required" } },
      { id: "b", event_type: "integration.sync_failed", occurred_at: ago(7200), payload: { category: "rate_limit" } },
    ]);
    expect(out).toContain("Recovered from “Re-authorization needed”.");
    expect(out).toContain("Rate limited.");
    expect(out).toContain("Event payloads are never shown.");
  });

  it("does not render any payload content, even hostile", () => {
    const out = view([{ id: "a", event_type: "integration.sync_failed", occurred_at: ago(60), payload: { category: "network", secret: "SECRET-HMAC", authorization: "Bearer T0KEN", stack: "at /srv/x.js:1" } }]);
    for (const leaked of ["SECRET-HMAC", "T0KEN", "/srv/x.js"]) expect(out).not.toContain(leaked);
  });

  it("distinguishes 'no events' from 'history unavailable'", () => {
    expect(detail(center(), { state: "ok", events: [] })).toContain("No integration events recorded for this connector.");
    const unavailable = detail(center(), { state: "unavailable" });
    expect(unavailable).toContain("History is unavailable");
    expect(unavailable).not.toContain("No integration events recorded");
  });
});

describe("no secret can reach a screen", () => {
  it("a full render of a busy center contains none of the sensitive vocabulary as data", () => {
    const busy = center({
      records: { ok: true, rows: [rec({ status: "error", last_error_category: "auth: Authorization: Bearer abc" }), rec({ id: "22222222-2222-4222-8222-222222222222", connector_key: "other", scope: ["x:secret_scope"] })], unreadable: 0 },
    });
    const out = html(busy) + detail(busy);
    for (const leaked of ["Bearer abc", "x:secret_scope", "hmac_secret", "SUPABASE_SERVICE_ROLE_KEY", "sb_secret", "x-flow-signature"]) expect(out).not.toContain(leaked);
  });
});
