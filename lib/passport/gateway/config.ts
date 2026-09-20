import { z } from "zod";
import { GATEWAY_SCOPES, type GatewayScope } from "@flow/passport-contracts";

/**
 * Gateway client registry, read from ONE environment variable
 * (PASSPORT_GATEWAY_CLIENTS = JSON array). Nothing here is ever committed:
 * secrets live only in deployment configuration.
 *
 * Rotation: give a client two entries with different `key_id`s — the new one
 * `active`, the old one `retiring` — both verify until the old one is
 * `disabled` (or removed). Scopes are per key and named; there is no wildcard.
 */
export const GatewayClientEntry = z.object({
  client_id: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  key_id: z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/),
  /** >= 32 chars: a short secret is refused rather than silently accepted. */
  secret: z.string().min(32),
  scopes: z.array(z.enum(GATEWAY_SCOPES)).min(1),
  status: z.enum(["active", "retiring", "disabled"]).default("active"),
});
export type GatewayClientEntry = z.infer<typeof GatewayClientEntry>;

export interface GatewayClients {
  resolveSecret(clientId: string, keyId: string): string | null;
  scopesFor(clientId: string, keyId: string): readonly GatewayScope[];
}

export type GatewayConfigResult = { ok: true; clients: GatewayClients } | { ok: false; reason: "not_configured" | "invalid_config" };

export function parseGatewayClients(raw: string | undefined | null): GatewayConfigResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "not_configured" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_config" };
  }
  const parsed = z.array(GatewayClientEntry).min(1).safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_config" };

  // A (client, key) pair must be unique. '|' can't occur in either id (see the regexes above).
  const seen = new Set<string>();
  for (const entry of parsed.data) {
    const id = `${entry.client_id}|${entry.key_id}`;
    if (seen.has(id)) return { ok: false, reason: "invalid_config" };
    seen.add(id);
  }
  const usable = parsed.data.filter((entry) => entry.status !== "disabled");
  if (usable.length === 0) return { ok: false, reason: "not_configured" };

  const find = (clientId: string, keyId: string) => usable.find((e) => e.client_id === clientId && e.key_id === keyId);
  return {
    ok: true,
    clients: {
      resolveSecret: (clientId, keyId) => find(clientId, keyId)?.secret ?? null,
      scopesFor: (clientId, keyId) => find(clientId, keyId)?.scopes ?? [],
    },
  };
}
