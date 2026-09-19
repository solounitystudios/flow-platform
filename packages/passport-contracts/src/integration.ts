import { z } from "zod";
import { IsoTimestamp, Uuid } from "./common";
import { SubjectRef } from "./subject";

/**
 * Health of a connection to a source system. These four situations are
 * DIFFERENT and must never be collapsed into one "invalid" state:
 *   - source unavailable / connection disconnected: we can't currently check
 *   - claim invalid: the source (or a verifier) said no
 *   - claim expired: it was valid, its window closed
 * A disconnected source makes Passport data STALE, not false.
 */
export const CONNECTION_STATUSES = ["healthy", "stale", "degraded", "disconnected", "auth_required", "error"] as const;
export const ConnectionStatus = z.enum(CONNECTION_STATUSES);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

export const CONNECTION_ERROR_CATEGORIES = ["auth", "network", "schema", "rate_limit", "source_unavailable", "rejected", "unknown"] as const;
export const ConnectionErrorCategory = z.enum(CONNECTION_ERROR_CATEGORIES);
export type ConnectionErrorCategory = z.infer<typeof ConnectionErrorCategory>;

export const CONNECTOR_KEYS = ["flow_capture"] as const;

export const IntegrationConnection = z.object({
  id: Uuid,
  /** Which connector; only 'flow_capture' exists today. */
  connector_key: z.string().min(1).max(64),
  /** null = a platform-level connection rather than one owned by a subject. */
  owner: SubjectRef.nullable(),
  status: ConnectionStatus,
  scope: z.array(z.string().min(1).max(64)).max(50),
  last_success_at: IsoTimestamp.nullable(),
  last_attempt_at: IsoTimestamp.nullable(),
  last_error_category: ConnectionErrorCategory.nullable(),
  /** After this many seconds without a success a healthy connection reads as stale. */
  stale_after_seconds: z.number().int().positive(),
});
export type IntegrationConnection = z.infer<typeof IntegrationConnection>;
