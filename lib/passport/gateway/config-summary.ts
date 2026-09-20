import type { GatewayScope } from "@flow/passport-contracts";
import { GatewayClientEntry, parseGatewayClients } from "./config";

/**
 * A description of the gateway client registry that is safe to show an
 * operator. It reports WHICH clients and keys exist, their status and scopes —
 * and never a secret. Validity is decided by parseGatewayClients (the same
 * function the gateway runs), so this can never disagree with what the gateway
 * will actually accept.
 */
export interface GatewayKeySummary {
  key_id: string;
  status: "active" | "retiring";
}

export interface GatewayClientSummary {
  client_id: string;
  /** Keys that currently verify. A disabled key is omitted: it cannot authenticate. */
  keys: GatewayKeySummary[];
  /** Union of the scopes across this client's verifying keys. */
  scopes: GatewayScope[];
}

export type GatewayConfigSummary =
  | { state: "not_configured" }
  | { state: "invalid_config" }
  | { state: "configured"; clients: GatewayClientSummary[] };

export function summarizeGatewayConfig(raw: string | undefined | null): GatewayConfigSummary {
  const result = parseGatewayClients(raw);
  if (!result.ok) return { state: result.reason };

  // parseGatewayClients already proved this parses and validates.
  const entries = (JSON.parse(raw as string) as unknown[]).map((entry) => GatewayClientEntry.parse(entry)).filter((entry) => entry.status !== "disabled");

  const byClient = new Map<string, GatewayClientSummary>();
  for (const entry of entries) {
    const summary = byClient.get(entry.client_id) ?? { client_id: entry.client_id, keys: [], scopes: [] };
    // Explicit field picks: `secret` is never copied.
    summary.keys.push({ key_id: entry.key_id, status: entry.status as "active" | "retiring" });
    for (const scope of entry.scopes) if (!summary.scopes.includes(scope)) summary.scopes.push(scope);
    byClient.set(entry.client_id, summary);
  }
  return { state: "configured", clients: [...byClient.values()] };
}
