import { z } from "zod";
import { IsoTimestamp, MetadataBag, OpaqueId, Sha256Hex, Uuid } from "./common";
import { Sensitivity } from "./claim";
import { SubjectRef } from "./subject";

export const EVIDENCE_TYPES = [
  "document",
  "photo",
  "video",
  "audio",
  "form",
  "signed_record",
  "checkin",
  "activity_outcome",
  "api_record",
  "link",
  "note",
] as const;
export const EvidenceType = z.enum(EVIDENCE_TYPES);
export type EvidenceType = z.infer<typeof EvidenceType>;

/** Where the evidence came from — the coarse origin, not the system id. */
export const EVIDENCE_SOURCE_KINDS = [
  "manual_upload",
  "flow_activity",
  "event_checkin",
  "organization",
  "employer",
  "capture",
  "qr_flow",
  "external_source",
  "api",
  "connector",
] as const;
export const EvidenceSourceKind = z.enum(EVIDENCE_SOURCE_KINDS);
export type EvidenceSourceKind = z.infer<typeof EvidenceSourceKind>;

export const EVIDENCE_STATUSES = ["received", "accepted", "rejected", "withdrawn", "quarantined"] as const;
export const EvidenceStatus = z.enum(EVIDENCE_STATUSES);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const ARTIFACT_KINDS = ["photo", "video", "audio", "document", "form", "other"] as const;

/**
 * A reference to a stored artifact. Never the artifact itself: Passport rows
 * carry pointers + integrity metadata, and the bytes stay wherever the
 * producer (Capture) or Flow's storage keeps them.
 */
export const ArtifactRef = z.object({
  artifact_id: OpaqueId,
  kind: z.enum(ARTIFACT_KINDS),
  media_type: z.string().min(3).max(127).regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
  storage: z.object({
    provider: z.enum(["flow_capture", "flow_storage", "external"]),
    /** Opaque locator. `data:` URIs are rejected — no inline blobs. */
    ref: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => !/^\s*data:/i.test(value), "inline data: URIs are not allowed"),
  }),
  byte_size: z.number().int().nonnegative().max(50 * 1024 * 1024 * 1024).optional(),
  sha256: Sha256Hex.optional(),
  captured_at: IsoTimestamp.optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ArtifactRef = z.infer<typeof ArtifactRef>;

export const EvidenceIntegrity = z.object({
  algorithm: z.literal("sha256"),
  /** See `computeArtifactsDigest` in integrity.ts. */
  artifacts_digest: Sha256Hex,
});
export type EvidenceIntegrity = z.infer<typeof EvidenceIntegrity>;

export const Evidence = z.object({
  id: Uuid,
  subject: SubjectRef,
  evidence_type: EvidenceType,
  source_kind: EvidenceSourceKind,
  source_system: z.string().min(1).max(64),
  source_ref: OpaqueId.nullable(),
  artifacts: z.array(ArtifactRef).max(50),
  captured_at: IsoTimestamp.nullable(),
  issued_at: IsoTimestamp.nullable(),
  created_at: IsoTimestamp,
  integrity: EvidenceIntegrity.nullable(),
  provenance: MetadataBag,
  sensitivity: Sensitivity,
  status: EvidenceStatus,
});
export type Evidence = z.infer<typeof Evidence>;
