import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

/**
 * The gateway's only path to Passport state: narrow, service_role-only RPCs
 * that enforce every rule themselves. The gateway holds no table access
 * beyond calling these, and never reads a client id from a payload.
 */
export type StoreResult<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string };

export interface GatewayStore {
  consumeNonce(clientId: string, nonce: string): Promise<boolean>;
  getCaptureRequest(id: string): Promise<StoreResult<{ request: unknown }>>;
  reportStatus(clientId: string, report: object, sha256: string): Promise<StoreResult<{ request_id: string; status: string; duplicate: boolean }>>;
  ingestPackage(clientId: string, pkg: object, sha256: string): Promise<StoreResult<{ evidence_id: string; package_id: string; capture_request_id: string; received_at: string; duplicate: boolean }>>;
  getEvidenceSummary(clientId: string, evidenceId: string): Promise<StoreResult<{ summary: unknown }>>;
  recordConnection(connector: string, ok: boolean, errorCategory?: string): Promise<void>;
}

function shape<T extends object>(fn: string, response: { data: unknown; error: { message: string } | null }): StoreResult<T> {
  if (response.error) throw new Error(`${fn}: ${response.error.message}`);
  const data = response.data as { ok?: unknown; reason?: unknown } | null;
  if (!data || typeof data !== "object" || typeof data.ok !== "boolean") throw new Error(`${fn}: unexpected response shape`);
  return data.ok ? (data as unknown as StoreResult<T>) : { ok: false, reason: typeof data.reason === "string" ? data.reason : "unknown" };
}

export function createSupabaseGatewayStore(client: SupabaseClient<Database>): GatewayStore {
  return {
    async consumeNonce(clientId, nonce) {
      const { data, error } = await client.rpc("passport_gateway_consume_nonce", { p_client: clientId, p_nonce: nonce });
      if (error) throw new Error(`consume_nonce: ${error.message}`);
      return data === true;
    },
    async getCaptureRequest(id) {
      return shape("get_capture_request", await client.rpc("passport_gateway_get_capture_request", { p_id: id }));
    },
    async reportStatus(clientId, report, sha256) {
      return shape("report_status", await client.rpc("passport_gateway_report_capture_status", { p_client: clientId, p_report: report as Json, p_payload_sha256: sha256 }));
    },
    async ingestPackage(clientId, pkg, sha256) {
      return shape("ingest_package", await client.rpc("passport_gateway_ingest_evidence_package", { p_client: clientId, p_package: pkg as Json, p_payload_sha256: sha256 }));
    },
    async getEvidenceSummary(clientId, evidenceId) {
      return shape("get_evidence_summary", await client.rpc("passport_gateway_get_evidence_summary", { p_client: clientId, p_evidence_id: evidenceId }));
    },
    async recordConnection(connector, ok, errorCategory) {
      const { error } = await client.rpc("passport_gateway_record_connection_result", { p_connector: connector, p_ok: ok, p_error_category: errorCategory });
      if (error) throw new Error(`record_connection: ${error.message}`);
    },
  };
}
