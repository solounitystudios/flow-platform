import { z } from "zod";
import { IsoTimestamp, Uuid, OpaqueId } from "./common";
import { SubjectRef } from "./subject";

/**
 * A claim is a structured assertion about a Passport subject — not a profile
 * field. Whether it is *true* is a separate question answered by
 * verification (see verification.ts), and the two are never conflated:
 * `submitted` means "asserted", only `verified` means "a trusted verifier
 * decided so".
 */
export const CLAIM_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "verified",
  "rejected",
  "expired",
  "revoked",
  "superseded",
  "stale",
  "disconnected",
] as const;
export const ClaimStatus = z.enum(CLAIM_STATUSES);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

/** Namespaced, dot-separated, lowercase: 'credential.license', 'attendance.event'. */
export const ClaimType = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "must be dot-namespaced, e.g. 'credential.license'");

/**
 * Claim types Flow produces today (adapters exist for each). Informational:
 * the wire format accepts any well-formed ClaimType so a future connector can
 * introduce its own without a contract bump.
 */
export const KNOWN_CLAIM_TYPES = [
  "credential.identity",
  "credential.skill",
  "credential.work",
  "credential.education",
  "credential.community",
  "credential.reliability",
  "credential.founding_member",
  "credential.mentor",
  "credential.organization_issued",
  "attendance.event",
  "participation.activity",
  "attestation.recommendation",
  "skill.claim",
] as const;

export const CLAIM_VISIBILITIES = ["private", "public"] as const;
export const ClaimVisibility = z.enum(CLAIM_VISIBILITIES);

/** How careful a consumer must be with the claim's underlying material. */
export const SENSITIVITIES = ["standard", "sensitive", "restricted"] as const;
export const Sensitivity = z.enum(SENSITIVITIES);
export type Sensitivity = z.infer<typeof Sensitivity>;

/**
 * Who stands behind the assertion. `subject` is a self-assertion; otherwise an
 * entity ref. `external` covers issuers Flow has no row for (a licensing body):
 * only a label, never an implied Flow identity.
 */
export const IssuerRef = z.union([
  z.object({ kind: z.literal("subject") }),
  z.object({ kind: z.literal("entity"), ref: SubjectRef }),
  z.object({ kind: z.literal("external"), label: z.string().min(1).max(200) }),
]);
export type IssuerRef = z.infer<typeof IssuerRef>;

export const SourceRef = z.object({
  /** 'flow_platform' | 'flow_capture' | 'manual' | 'external:<connector>' */
  system: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*(:[a-z0-9_\-]+)?$/),
  /** Stable id of the object in the source system, when it has one. */
  ref: OpaqueId.optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const Claim = z.object({
  id: Uuid,
  subject: SubjectRef,
  claim_type: ClaimType,
  /** Structured payload; bounded so it can never carry a document. */
  value: z.record(z.string(), z.unknown()),
  issuer: IssuerRef,
  source: SourceRef,
  evidence_ids: z.array(Uuid).max(100),
  effective_at: IsoTimestamp.nullable(),
  expires_at: IsoTimestamp.nullable(),
  status: ClaimStatus,
  status_reason_code: z.string().max(64).nullable(),
  visibility: ClaimVisibility,
  sensitivity: Sensitivity,
  superseded_by: Uuid.nullable(),
  created_at: IsoTimestamp,
  updated_at: IsoTimestamp,
});
export type Claim = z.infer<typeof Claim>;
