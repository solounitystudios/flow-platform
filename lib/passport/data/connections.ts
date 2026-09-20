import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CONNECTION_STATUSES } from "@flow/passport-contracts";
import type { Database } from "@/lib/database.types";
import { INTEGRATION_EVENT_TYPES, type ConnectionRecord, type IntegrationEventRow } from "@/lib/passport/domain";

type Client = SupabaseClient<Database>;

/**
 * Reads of the canonical integration state. Everything runs as the CALLER —
 * never a service role — so the database's own RLS decides what comes back:
 * an AAL2 platform admin sees platform-level connections and their health
 * events; a subject owner would see only connections they own; anyone else
 * sees nothing. (The policies are pinned by tests/db.) Nothing here can write.
 */

const CONNECTION_COLUMNS = "id, connector_key, owner_type, owner_id, status, scope, last_success_at, last_attempt_at, last_error_category, stale_after_seconds, created_at";

const ConnectionRow = z.object({
  id: z.string().uuid(),
  connector_key: z.string().min(1),
  owner_type: z.string().nullable(),
  owner_id: z.string().uuid().nullable(),
  // An unrecognised status FAILS validation on purpose: an unknown state must never be shown as a known one.
  status: z.enum(CONNECTION_STATUSES),
  scope: z.array(z.string()),
  last_success_at: z.string().nullable(),
  last_attempt_at: z.string().nullable(),
  last_error_category: z.string().nullable(),
  stale_after_seconds: z.number().int().positive(),
  created_at: z.string(),
});

export type ConnectionsRead = { ok: true; rows: ConnectionRecord[]; unreadable: number } | { ok: false };

export async function readIntegrationConnections(supabase: Client): Promise<ConnectionsRead> {
  const { data, error } = await supabase.from("passport_integration_connections").select(CONNECTION_COLUMNS);
  if (error || !data) {
    // Log the fact, not the message body: it can carry schema detail.
    console.error("[readIntegrationConnections] query failed");
    return { ok: false };
  }
  const rows: ConnectionRecord[] = [];
  let unreadable = 0;
  for (const raw of data) {
    const parsed = ConnectionRow.safeParse(raw);
    if (!parsed.success) {
      unreadable += 1;
      continue;
    }
    const r = parsed.data;
    rows.push({
      id: r.id,
      connector_key: r.connector_key,
      owner: r.owner_type && r.owner_id ? { type: r.owner_type, id: r.owner_id } : null,
      status: r.status,
      scope: r.scope,
      last_success_at: r.last_success_at,
      last_attempt_at: r.last_attempt_at,
      last_error_category: r.last_error_category,
      stale_after_seconds: r.stale_after_seconds,
      created_at: r.created_at,
    });
  }
  return { ok: true, rows, unreadable };
}

export type IntegrationEventsRead = { ok: true; rows: IntegrationEventRow[] } | { ok: false };

/**
 * Recent integration events for one connector, newest first and bounded. Only
 * the four integration.* types are requested, and `payload` is handed to
 * presentIntegrationEvents, which never passes it through to a screen.
 */
export async function readIntegrationEvents(supabase: Client, connectorKey: string, limit = 15): Promise<IntegrationEventsRead> {
  const { data, error } = await supabase
    .from("passport_events")
    .select("id, event_type, occurred_at, payload")
    .in("event_type", [...INTEGRATION_EVENT_TYPES])
    .eq("actor_type", "service")
    .eq("actor_id", connectorKey)
    .order("seq", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error || !data) {
    console.error("[readIntegrationEvents] query failed");
    return { ok: false };
  }
  return { ok: true, rows: data.map((row) => ({ id: row.id, event_type: row.event_type, occurred_at: row.occurred_at, payload: row.payload })) };
}
