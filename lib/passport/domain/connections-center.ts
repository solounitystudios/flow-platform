import {
  CONNECTION_ERROR_CATEGORIES,
  CONNECTION_STATUSES,
  CONNECTOR_KEYS,
  GATEWAY_SCOPES,
  PASSPORT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_MAJOR,
  type ConnectionErrorCategory,
  type ConnectionStatus,
  type GatewayScope,
} from "@flow/passport-contracts";
import { CONNECTION_STATUS_LABEL, effectiveConnectionStatus } from "./connection-health";

/**
 * The Connections Center's view model. It PROJECTS canonical Passport
 * integration state (the connection record, the gateway client registry, the
 * event ledger); it owns no state of its own and invents no status. The
 * canonical vocabulary is CONNECTION_STATUSES — "never seen" and
 * "misconfigured" are NOT connection statuses, so they appear here as what
 * they are: a connection that has no record yet, and a gateway configuration
 * fact. Nothing here ever turns "we could not read it" into "healthy".
 */

// ── raw inputs ───────────────────────────────────────────────────────────

export interface ConnectionRecord {
  id: string;
  connector_key: string;
  owner: { type: string; id: string } | null;
  status: ConnectionStatus;
  scope: string[];
  last_success_at: string | null;
  last_attempt_at: string | null;
  /** Raw from the database; narrowed by safeErrorCategory before it is ever shown. */
  last_error_category: string | null;
  stale_after_seconds: number;
  created_at: string;
}

/** Structurally what lib/passport/gateway summarizeGatewayConfig returns (no secret can be in it). */
export type GatewayConfigFacts =
  | { state: "not_configured" }
  | { state: "invalid_config" }
  | { state: "configured"; clients: Array<{ client_id: string; keys: Array<{ key_id: string; status: "active" | "retiring" }>; scopes: string[] }> };

export interface IntegrationEventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  payload: unknown;
}

// ── time formatting ──────────────────────────────────────────────────────

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** "7 days", "1 hour", "90 minutes" — exact, never rounded. */
export function formatWindow(seconds: number): string {
  if (seconds % 86400 === 0) return plural(seconds / 86400, "day");
  if (seconds % 3600 === 0) return plural(seconds / 3600, "hour");
  if (seconds % 60 === 0) return plural(seconds / 60, "minute");
  return plural(seconds, "second");
}

/** "3 days ago" — largest whole unit. Anything under a minute, or in the future (clock skew), is "just now". */
export function formatAge(iso: string, now: Date): string {
  const seconds = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) return "just now";
  if (seconds < 3600) return `${plural(Math.floor(seconds / 60), "minute")} ago`;
  if (seconds < 86400) return `${plural(Math.floor(seconds / 3600), "hour")} ago`;
  return `${plural(Math.floor(seconds / 86400), "day")} ago`;
}

// ── errors: a category, never a message ─────────────────────────────────

export const ERROR_CATEGORY_LABEL: Record<ConnectionErrorCategory, string> = {
  auth: "Authentication failed",
  network: "Network problem",
  schema: "Unsupported or invalid schema",
  rate_limit: "Rate limited",
  source_unavailable: "Source unavailable",
  rejected: "Rejected by Passport",
  unknown: "Unknown error",
};

/**
 * The only error information that ever reaches a screen: one of the known
 * categories. An unrecognised value collapses to "unknown" and is NOT echoed.
 */
export function safeErrorCategory(raw: unknown): ConnectionErrorCategory | null {
  if (raw === null || raw === undefined) return null;
  return (CONNECTION_ERROR_CATEGORIES as readonly unknown[]).includes(raw) ? (raw as ConnectionErrorCategory) : "unknown";
}

const isStatus = (value: unknown): value is ConnectionStatus => (CONNECTION_STATUSES as readonly unknown[]).includes(value);

// ── health, explained deterministically ─────────────────────────────────

export type Tone = "verified" | "warning" | "neutral" | "danger";

export const STATUS_TONE: Record<ConnectionStatus, Tone> = {
  healthy: "verified",
  stale: "warning",
  degraded: "warning",
  disconnected: "danger",
  auth_required: "danger",
  error: "danger",
};

export interface ConnectionHealthView {
  /** What to believe now: a stored `healthy` with no recent success reads as `stale`. */
  status: ConnectionStatus;
  storedStatus: ConnectionStatus;
  label: string;
  tone: Tone;
  /** Deterministic: the same record and clock always yield the same sentence. */
  explanation: string;
  /** null = nothing to do. */
  action: string | null;
  lastSuccess: { at: string; ago: string } | null;
  lastAttempt: { at: string; ago: string } | null;
  lastError: { category: ConnectionErrorCategory; label: string } | null;
  staleWindow: string;
}

const ACTION_BY_ERROR: Partial<Record<ConnectionErrorCategory, string>> = {
  schema: `Check that the connector sends schema version ${SUPPORTED_SCHEMA_MAJOR}.x messages.`,
  rejected: "Review what the connector submitted; Passport refused it.",
};

export function explainConnection(record: ConnectionRecord, now: Date): ConnectionHealthView {
  const status = effectiveConnectionStatus(record, now);
  const category = safeErrorCategory(record.last_error_category);
  const window = formatWindow(record.stale_after_seconds);
  const lastSuccess = record.last_success_at ? { at: record.last_success_at, ago: formatAge(record.last_success_at, now) } : null;
  const lastAttempt = record.last_attempt_at ? { at: record.last_attempt_at, ago: formatAge(record.last_attempt_at, now) } : null;
  const because = category ? ` (${ERROR_CATEGORY_LABEL[category].toLowerCase()})` : "";

  let explanation: string;
  let action: string | null = null;
  switch (status) {
    case "healthy":
      explanation = `Last successful contact was ${lastSuccess?.ago ?? "recorded"}, within the expected ${window} window.`;
      break;
    case "stale":
      explanation = !lastSuccess
        ? "No successful contact is on record."
        : record.status === "stale"
          ? `Marked as having no recent activity. The last successful contact was ${lastSuccess.ago}.`
          : `Nothing has been received since ${lastSuccess.ago}; contact is expected at least every ${window}.`;
      action = "Check that the connector is running and can reach the gateway.";
      break;
    case "degraded":
      explanation = `Recent operations failed${because}. This is usually temporary.${lastSuccess ? ` The last successful contact was ${lastSuccess.ago}.` : ""}`;
      action = "No action is needed if it recovers on its own; investigate if it persists.";
      break;
    case "disconnected":
      explanation = "This connection is no longer active or authorized.";
      action = "Re-establish the connection, or confirm it was removed on purpose.";
      break;
    case "auth_required":
      explanation = "The connector's credentials were rejected. It cannot contribute again until it is re-authorized.";
      action = "Verify or rotate the gateway key for this connector.";
      break;
    case "error":
      explanation = `The last operation failed${because}.`;
      action = (category && ACTION_BY_ERROR[category]) || "Check the gateway logs for the failing request.";
      break;
  }

  return {
    status,
    storedStatus: record.status,
    label: CONNECTION_STATUS_LABEL[status],
    tone: STATUS_TONE[status],
    explanation,
    action,
    lastSuccess,
    lastAttempt,
    lastError: category ? { category, label: ERROR_CATEGORY_LABEL[category] } : null,
    staleWindow: window,
  };
}

// ── what a connector may and may not do ─────────────────────────────────

/**
 * Presentation of each gateway scope. Typed as a total Record over
 * GATEWAY_SCOPES: adding a scope to the contract without saying what it
 * permits is a compile error, so this prose cannot drift behind the scopes.
 */
export const SCOPE_CAPABILITY: Record<GatewayScope, string> = {
  "capture_requests:read": "Receive the capture requests Passport creates for it",
  "capture_requests:report": "Report the status of a capture (accepted, started, failed)",
  "evidence_packages:write": "Submit an evidence package — recorded as evidence received, never as verification",
  "evidence:read": "Read back the receipt for evidence it submitted (metadata only)",
};

/**
 * Powers that NO gateway scope grants. The gateway's whole surface is four
 * routes over `passport_gateway_*` RPCs (asserted by tests), and none of them
 * creates a request, records a verification, grants consent, assigns
 * authority or edits identity. Listed so the boundary is visible, not implied.
 */
export const NEVER_GRANTED_TO_CONNECTORS = [
  "Start a capture request (requests are created inside Passport)",
  "Verify, reject or revoke a Passport claim",
  "Grant or approve consent on someone's behalf",
  "Assign or change Passport authority",
  "Rewrite identity or any other Passport record",
] as const;

export interface CapabilityView {
  can: Array<{ scope: GatewayScope; label: string }>;
  /** Known scopes this connector does not hold. */
  lacks: Array<{ scope: GatewayScope; label: string }>;
  /** Scopes we don't recognise are counted, never echoed. */
  unrecognisedScopes: number;
  never: readonly string[];
  flags: {
    canSubmitEvidence: boolean;
    canReceiveCaptureRequests: boolean;
    /** Structural: no gateway scope creates a request. */
    canRequestEvidence: false;
    /** Structural: no gateway scope records a verification decision. */
    canMakeVerificationDecisions: false;
  };
}

export function describeCapabilities(scopes: readonly string[]): CapabilityView {
  const held = new Set(scopes);
  const known = GATEWAY_SCOPES.map((scope) => ({ scope, label: SCOPE_CAPABILITY[scope] }));
  return {
    can: known.filter((k) => held.has(k.scope)),
    lacks: known.filter((k) => !held.has(k.scope)),
    unrecognisedScopes: scopes.filter((s) => !(GATEWAY_SCOPES as readonly string[]).includes(s)).length,
    never: NEVER_GRANTED_TO_CONNECTORS,
    flags: {
      canSubmitEvidence: held.has("evidence_packages:write"),
      canReceiveCaptureRequests: held.has("capture_requests:read"),
      canRequestEvidence: false,
      canMakeVerificationDecisions: false,
    },
  };
}

// ── the catalog of connectors that really exist ─────────────────────────

/** Total over CONNECTOR_KEYS: only connectors with a real contract are listed. Not a marketplace. */
export const CONNECTOR_CATALOG: Record<(typeof CONNECTOR_KEYS)[number], { name: string; summary: string; role: string }> = {
  flow_capture: {
    name: "Flow Capture",
    summary: "Captures photos, video, audio and documents as evidence for a Passport.",
    role: "Produces evidence. Passport owns claims, verification, consent and authority.",
  },
};

const isKnownConnector = (key: string): key is keyof typeof CONNECTOR_CATALOG => Object.prototype.hasOwnProperty.call(CONNECTOR_CATALOG, key);

// ── events: a bounded history, never a payload ──────────────────────────

export const INTEGRATION_EVENT_TYPES = ["integration.connected", "integration.degraded", "integration.disconnected", "integration.sync_failed"] as const;
export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];

const EVENT_LABEL: Record<IntegrationEventType, string> = {
  "integration.connected": "Connected",
  "integration.degraded": "Degraded",
  "integration.disconnected": "Disconnected or re-authorization needed",
  "integration.sync_failed": "An operation failed",
};

export interface IntegrationEventView {
  id: string;
  type: IntegrationEventType;
  label: string;
  at: string;
  ago: string;
  /** A sentence built only from validated enum values in the payload. */
  note: string | null;
}

const isEventType = (value: string): value is IntegrationEventType => (INTEGRATION_EVENT_TYPES as readonly string[]).includes(value);

/**
 * Turns ledger rows into a short, safe history. Only the four integration
 * event types survive; the payload is NEVER passed through — a note is built
 * from at most two validated enum fields (`status`, `was`, `category`), so a
 * secret, header or stack trace that ended up in a payload cannot be shown.
 */
export function presentIntegrationEvents(rows: readonly IntegrationEventRow[], now: Date, limit = 15): IntegrationEventView[] {
  return rows
    .filter((row): row is IntegrationEventRow & { event_type: IntegrationEventType } => isEventType(row.event_type))
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, Math.max(0, limit))
    .map((row) => {
      const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {};
      const category = safeErrorCategory(payload.category);
      const status = isStatus(payload.status) ? payload.status : null;
      const was = isStatus(payload.was) ? payload.was : null;
      let note: string | null = null;
      if (row.event_type === "integration.connected") note = was ? `Recovered from “${CONNECTION_STATUS_LABEL[was]}”.` : "First authenticated contact.";
      else if (row.event_type === "integration.sync_failed") note = category ? `${ERROR_CATEGORY_LABEL[category]}.` : null;
      else if (status) note = `Status changed to “${CONNECTION_STATUS_LABEL[status]}”.`;
      return { id: row.id, type: row.event_type, label: EVENT_LABEL[row.event_type], at: row.occurred_at, ago: formatAge(row.occurred_at, now), note };
    });
}

// ── the center ───────────────────────────────────────────────────────────

export interface ConnectorView {
  key: string;
  name: string;
  summary: string | null;
  role: string | null;
  /** In the catalog of connectors Passport has a contract for. */
  supported: boolean;
  /** Fact 1 — is the Flow-side contract implemented in this deployment? Says nothing about a connection. */
  contract: { ready: boolean; text: string };
  /** Fact 2 — will the gateway accept this connector's credentials? */
  configuration: { state: "configured" | "not_configured" | "misconfigured"; text: string; keys: Array<{ key_id: string; status: "active" | "retiring" }> };
  /** Fact 3 — has it actually connected? Only a real record can say so. */
  connection:
    | {
        kind: "recorded";
        health: ConnectionHealthView;
        level: "platform" | "owned";
        registeredAt: string;
        registeredAgo: string;
        /** The connector's own schema version is not stored anywhere; we say so rather than guess. */
        connectorSchemaVersion: "not_recorded";
      }
    | { kind: "none"; text: string }
    | { kind: "unavailable"; text: string };
  capabilities: CapabilityView;
  capabilitySource: "gateway_configuration" | "connection_record" | "none";
  capabilityNote: string | null;
  needsAttention: boolean;
  attentionReasons: string[];
}

export interface ConnectionsCenterInput {
  now: Date;
  records: { ok: true; rows: ConnectionRecord[]; unreadable: number } | { ok: false };
  gateway: { credentialsPresent: boolean; config: GatewayConfigFacts };
}

export interface ConnectionsCenterView {
  read: "ok" | "unavailable";
  /** Records that exist but could not be validated. They are counted, never treated as healthy. */
  unreadableRecords: number;
  /** Healthy AND the gateway is configured to keep them that way. */
  connected: ConnectorView[];
  needsAttention: ConnectorView[];
  /** Connectors Passport has a contract for and no record of. */
  notConnected: ConnectorView[];
  /** Read failed: contract and configuration are still true, but the connection state is unknown. */
  healthUnavailable: ConnectorView[];
}

function configurationFor(key: string, gateway: ConnectionsCenterInput["gateway"]): ConnectorView["configuration"] {
  if (gateway.config.state === "invalid_config") {
    return { state: "misconfigured", text: "PASSPORT_GATEWAY_CLIENTS is set but is not valid, so the gateway rejects every request.", keys: [] };
  }
  if (!gateway.credentialsPresent) {
    return { state: "misconfigured", text: "The server's Supabase service credentials are missing, so the gateway cannot record anything.", keys: [] };
  }
  if (gateway.config.state === "not_configured") {
    return { state: "not_configured", text: "PASSPORT_GATEWAY_CLIENTS is not set (or every key is disabled), so the gateway answers every request with “not configured”.", keys: [] };
  }
  const client = gateway.config.clients.find((c) => c.client_id === key);
  if (!client) return { state: "not_configured", text: "No gateway client is registered for this connector.", keys: [] };
  const rotating = client.keys.some((k) => k.status === "retiring");
  return {
    state: "configured",
    text: `${plural(client.keys.length, "key")} registered${rotating ? " (one is retiring)" : ""}.`,
    keys: client.keys,
  };
}

function buildConnector(key: string, record: ConnectionRecord | null, readOk: boolean, input: ConnectionsCenterInput): ConnectorView {
  const supported = isKnownConnector(key);
  const catalog = supported ? CONNECTOR_CATALOG[key] : null;
  const configuration = configurationFor(key, input.gateway);
  const configured = input.gateway.config.state === "configured" ? input.gateway.config.clients.find((c) => c.client_id === key) : undefined;

  // Capabilities come from what the gateway ENFORCES now, else from what the record says.
  let capabilities: CapabilityView;
  let capabilitySource: ConnectorView["capabilitySource"];
  let capabilityNote: string | null = null;
  if (configuration.state === "configured" && configured) {
    capabilities = describeCapabilities(configured.scopes);
    capabilitySource = "gateway_configuration";
  } else if (record) {
    capabilities = describeCapabilities(record.scope);
    capabilitySource = "connection_record";
    capabilityNote = "Recorded on the connection. The gateway is not currently configured to accept this connector, so none of this can be used until it is.";
  } else {
    capabilities = describeCapabilities([]);
    capabilitySource = "none";
  }

  let connection: ConnectorView["connection"];
  const attentionReasons: string[] = [];
  if (record) {
    const health = explainConnection(record, input.now);
    connection = {
      kind: "recorded",
      health,
      level: record.owner ? "owned" : "platform",
      registeredAt: record.created_at,
      registeredAgo: formatAge(record.created_at, input.now),
      connectorSchemaVersion: "not_recorded",
    };
    if (health.status !== "healthy" && health.action) attentionReasons.push(health.action);
    if (configuration.state !== "configured") attentionReasons.push("Restore the gateway configuration for this connector; without it the connector cannot make new contact.");
  } else if (!readOk) {
    connection = { kind: "unavailable", text: "Connection health is unavailable: the connection records could not be read. This is not a healthy or unhealthy result." };
  } else {
    connection = {
      kind: "none",
      text: configuration.state === "configured" ? "Not connected. The gateway is configured for this connector, but it has never made an authenticated request." : "Not connected. The gateway is not configured for this connector.",
    };
  }

  return {
    key,
    name: catalog?.name ?? key,
    summary: catalog?.summary ?? null,
    role: catalog?.role ?? null,
    supported,
    contract: supported
      ? { ready: true, text: `Ready — Passport accepts schema ${SUPPORTED_SCHEMA_MAJOR}.x messages (current ${PASSPORT_SCHEMA_VERSION}) from this connector. This says nothing about whether it is connected.` }
      : { ready: false, text: "Passport has no contract for this connector." },
    configuration,
    connection,
    capabilities,
    capabilitySource,
    capabilityNote,
    needsAttention: attentionReasons.length > 0,
    attentionReasons,
  };
}

export function buildConnectionsCenter(input: ConnectionsCenterInput): ConnectionsCenterView {
  const center: ConnectionsCenterView = { read: input.records.ok ? "ok" : "unavailable", unreadableRecords: input.records.ok ? input.records.unreadable : 0, connected: [], needsAttention: [], notConnected: [], healthUnavailable: [] };

  if (!input.records.ok) {
    center.healthUnavailable = CONNECTOR_KEYS.map((key) => buildConnector(key, null, false, input));
    return center;
  }

  // One platform-level record per connector (owned records, if any, are listed after).
  const rows = [...input.records.rows].sort((a, b) => Number(Boolean(a.owner)) - Number(Boolean(b.owner)) || a.connector_key.localeCompare(b.connector_key));
  for (const row of rows) {
    const view = buildConnector(row.connector_key, row, true, input);
    (view.needsAttention ? center.needsAttention : center.connected).push(view);
  }
  const recorded = new Set(rows.map((r) => r.connector_key));
  for (const key of CONNECTOR_KEYS) if (!recorded.has(key)) center.notConnected.push(buildConnector(key, null, true, input));
  return center;
}

/** Every connector view in the center, whichever section it landed in. */
export const allConnectors = (center: ConnectionsCenterView): ConnectorView[] => [...center.connected, ...center.needsAttention, ...center.notConnected, ...center.healthUnavailable];

/** The one badge a connector shows: its health when a record exists, otherwise the honest absence of one. */
export function connectorBadge(view: ConnectorView): { label: string; tone: Tone } {
  switch (view.connection.kind) {
    case "recorded":
      return { label: view.connection.health.label, tone: view.connection.health.tone };
    case "none":
      return { label: "Not connected", tone: "neutral" };
    case "unavailable":
      return { label: "Health unavailable", tone: "warning" };
  }
}
