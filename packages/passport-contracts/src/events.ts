import { z } from "zod";
import { CorrelationId, IsoTimestamp, Uuid } from "./common";
import { SchemaVersionString } from "./common";
import { ActorRef, SubjectRef } from "./subject";

/**
 * The Passport event vocabulary. Append-only history of consequential
 * Passport actions, usable for audit and integration. It is NOT the system of
 * record — the tables are; events describe what happened to them.
 */
export const PASSPORT_EVENT_TYPES = [
  "claim.created",
  "claim.submitted",
  "claim.under_review",
  "claim.verified",
  "claim.rejected",
  "claim.expired",
  "claim.revoked",
  "claim.superseded",
  "claim.stale",
  "claim.disconnected",
  "evidence.created",
  "evidence.attached",
  "evidence.removed",
  "verification.requested",
  "verification.completed",
  "consent.requested",
  "consent.granted",
  "consent.declined",
  "consent.revoked",
  "consent.expired",
  "consent.withdrawn",
  "authority.assigned",
  "authority.revoked",
  "relationship.created",
  "relationship.accepted",
  "relationship.declined",
  "relationship.ended",
  "credential.shared",
  "dispute.opened",
  "dispute.under_review",
  "dispute.resolved",
  "dispute.rejected",
  "dispute.withdrawn",
  "capture.requested",
  "capture.accepted",
  "capture.started",
  "capture.completed",
  "capture.failed",
  "capture.cancelled",
  "capture.expired",
  "integration.connected",
  "integration.degraded",
  "integration.disconnected",
  "integration.sync_failed",
] as const;
export const PassportEventType = z.enum(PASSPORT_EVENT_TYPES);
export type PassportEventType = z.infer<typeof PassportEventType>;

export const PassportEvent = z.object({
  id: Uuid,
  schema_version: SchemaVersionString,
  type: PassportEventType,
  occurred_at: IsoTimestamp,
  actor: ActorRef,
  subject: SubjectRef,
  /** Ids of the objects the event is about; all optional, at least one is expected. */
  refs: z.object({
    claim_id: Uuid.optional(),
    evidence_id: Uuid.optional(),
    verification_id: Uuid.optional(),
    consent_id: Uuid.optional(),
    authority_id: Uuid.optional(),
    relationship_id: Uuid.optional(),
    capture_request_id: Uuid.optional(),
    dispute_id: Uuid.optional(),
    connection_id: Uuid.optional(),
  }),
  /** Small, non-sensitive facts (reason codes, method names). Never document contents. */
  payload: z.record(z.string(), z.unknown()),
  correlation_id: CorrelationId.nullable(),
  source_system: z.string().min(1).max(64),
});
export type PassportEvent = z.infer<typeof PassportEvent>;
