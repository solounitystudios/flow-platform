import { z } from "zod";
import { CorrelationId, IdempotencyKey, IsoTimestamp, MetadataBag, OpaqueId, SchemaVersionString, Uuid } from "./common";
import { ArtifactRef, EvidenceIntegrity } from "./evidence";
import { SubjectRef } from "./subject";

/**
 * Flow Platform / Passport <-> Flow Creative Capture.
 *
 * Capture is an EVIDENCE PRODUCER. Passport is the evidence + claim
 * authority. Capture receives a bounded CaptureRequest, performs a capture,
 * and returns an EvidencePackage. Receiving a package NEVER verifies a claim:
 * it records evidence, and Passport decides what (if anything) happens next.
 */

export const CAPTURE_REQUEST_STATUSES = ["requested", "accepted", "started", "completed", "failed", "cancelled", "expired"] as const;
export const CaptureRequestStatus = z.enum(CAPTURE_REQUEST_STATUSES);
export type CaptureRequestStatus = z.infer<typeof CaptureRequestStatus>;

/** Statuses Capture is allowed to report back over the gateway. */
export const CAPTURE_REPORTABLE_STATUSES = ["accepted", "started", "failed"] as const;

export const CAPTURE_PURPOSES = [
  "skill_evidence",
  "work_completion",
  "activity_outcome",
  "event_participation",
  "project_contribution",
  "credential_document",
] as const;
export const CapturePurpose = z.enum(CAPTURE_PURPOSES);
export type CapturePurpose = z.infer<typeof CapturePurpose>;

/** What Capture can actually produce. A subset of Passport's EvidenceType. */
export const CAPTURE_EVIDENCE_TYPES = ["photo", "video", "audio", "document"] as const;
export const CaptureEvidenceType = z.enum(CAPTURE_EVIDENCE_TYPES);
export type CaptureEvidenceType = z.infer<typeof CaptureEvidenceType>;

export const CAPTURE_RELATED_TYPES = ["opportunity", "application", "event", "activity", "project", "work_item"] as const;
export const CaptureRelated = z.object({ type: z.enum(CAPTURE_RELATED_TYPES), id: Uuid });

export const CONSENT_BASES = ["subject_initiated", "consent_grant"] as const;

/** Optional-by-policy data: the request states up front what may be sent. */
export const DATA_POLICIES = ["forbidden", "optional"] as const;

export const CaptureRequest = z.object({
  schema_version: SchemaVersionString,
  request_id: Uuid,
  status: CaptureRequestStatus,
  subject: SubjectRef,
  /** The Flow entity asking for the capture. */
  requester: SubjectRef,
  purpose: CapturePurpose,
  evidence_type: CaptureEvidenceType,
  related: CaptureRelated.nullable(),
  /** Keys Capture must include in `source_metadata`. */
  required_metadata: z.array(z.string().min(1).max(64)).max(20),
  /** Location is sent only when the request explicitly permits it. */
  location_policy: z.enum(DATA_POLICIES),
  /** Operator/creator identity is sent only when the request explicitly permits it. */
  operator_identity_policy: z.enum(DATA_POLICIES),
  expires_at: IsoTimestamp,
  consent_context: z.object({
    basis: z.enum(CONSENT_BASES),
    consent_grant_id: Uuid.nullable(),
  }),
  correlation_id: CorrelationId,
  idempotency_key: IdempotencyKey,
  capture_session_id: OpaqueId.nullable(),
  created_at: IsoTimestamp,
  updated_at: IsoTimestamp,
});
export type CaptureRequest = z.infer<typeof CaptureRequest>;

export const CAPTURE_FAILURE_REASONS = ["user_declined", "permission_denied", "device_error", "upload_failed", "timeout", "other"] as const;

/** Capture -> Passport: lifecycle report for a request Capture has picked up. */
export const CaptureStatusReport = z
  .object({
    schema_version: SchemaVersionString,
    request_id: Uuid,
    status: z.enum(CAPTURE_REPORTABLE_STATUSES),
    capture_session_id: OpaqueId.optional(),
    reason_code: z.enum(CAPTURE_FAILURE_REASONS).optional(),
    occurred_at: IsoTimestamp,
    idempotency_key: IdempotencyKey,
  })
  .superRefine((report, ctx) => {
    if (report.status === "started" && !report.capture_session_id) {
      ctx.addIssue({ code: "custom", path: ["capture_session_id"], message: "required when status is 'started'" });
    }
    if (report.status === "failed" && !report.reason_code) {
      ctx.addIssue({ code: "custom", path: ["reason_code"], message: "required when status is 'failed'" });
    }
  });
export type CaptureStatusReport = z.infer<typeof CaptureStatusReport>;

export const PACKAGE_PRODUCER = "flow_capture" as const;

export const EvidencePackageLocation = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative().max(100000).optional(),
});

export const EvidencePackageOperator = z.object({
  type: z.enum(["person", "service"]),
  /** Capture's own operator reference, or a Flow profile id when known. Opaque to Passport. */
  id: OpaqueId,
});

/** Capture -> Passport: the captured evidence, by reference. */
export const EvidencePackage = z
  .object({
    schema_version: SchemaVersionString,
    package_id: Uuid,
    producer: z.literal(PACKAGE_PRODUCER),
    capture_request_id: Uuid,
    subject: SubjectRef,
    capture_session_id: OpaqueId,
    captured_at: IsoTimestamp,
    artifacts: z.array(ArtifactRef).min(1).max(50),
    source_metadata: MetadataBag,
    provenance: z.object({
      producer_version: z.string().min(1).max(64),
      capture_method: z.enum(["in_app_camera", "upload", "import"]).optional(),
      device: z.string().max(200).optional(),
    }),
    /** Present only when the CaptureRequest's location_policy is 'optional'. */
    location: EvidencePackageLocation.optional(),
    /** Present only when the CaptureRequest's operator_identity_policy is 'optional'. */
    operator: EvidencePackageOperator.optional(),
    integrity: EvidenceIntegrity.optional(),
    correlation_id: CorrelationId,
    idempotency_key: IdempotencyKey,
  })
  .superRefine((pkg, ctx) => {
    const seen = new Set<string>();
    pkg.artifacts.forEach((artifact, index) => {
      if (seen.has(artifact.artifact_id)) {
        ctx.addIssue({ code: "custom", path: ["artifacts", index, "artifact_id"], message: "duplicate artifact_id in package" });
      }
      seen.add(artifact.artifact_id);
    });
  });
export type EvidencePackage = z.infer<typeof EvidencePackage>;

/**
 * Passport's answer to a package. `verification` is always 'none' on receipt:
 * the package is recorded as unverified evidence. It is a field (not just a
 * doc note) so a client can never mistake "accepted" for "verified".
 */
export const EvidencePackageReceipt = z.object({
  schema_version: SchemaVersionString,
  package_id: Uuid,
  evidence_id: Uuid,
  capture_request_id: Uuid,
  /** true when this delivery was a retry of one already recorded. */
  duplicate: z.boolean(),
  evidence_status: z.literal("received"),
  verification: z.literal("none"),
  received_at: IsoTimestamp,
});
export type EvidencePackageReceipt = z.infer<typeof EvidencePackageReceipt>;

/** What Capture may read back about evidence it produced. Metadata only. */
export const EvidenceSummary = z.object({
  schema_version: SchemaVersionString,
  evidence_id: Uuid,
  package_id: Uuid,
  capture_request_id: Uuid,
  subject: SubjectRef,
  evidence_status: z.string(),
  artifact_count: z.number().int().nonnegative(),
  captured_at: IsoTimestamp.nullable(),
  received_at: IsoTimestamp,
});
export type EvidenceSummary = z.infer<typeof EvidenceSummary>;

