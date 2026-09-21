import { z } from "zod";
import { IsoTimestamp, Uuid } from "./common";
import { ClaimStatus, ClaimType, ClaimVisibility, Sensitivity } from "./claim";
import { EvidenceSourceKind, EvidenceType } from "./evidence";
import { VerificationMethod } from "./verification";
import { SubjectRef } from "./subject";

/**
 * "Why does Passport show this?" — the provenance chain
 *   SUBJECT -> CLAIM -> EVIDENCE -> SOURCE -> ISSUER -> VERIFICATION METHOD
 *           -> VERIFIER -> DECISION -> TIMESTAMP
 * disclosed by who is asking. There is NO field here that can carry a source
 * document, an artifact reference, an evidence note or provenance detail, so no
 * viewer — however privileged — receives one through this contract.
 */
export const EXPLANATION_VIEWERS = ["owner", "admin", "reviewer", "public"] as const;
export const ExplanationViewer = z.enum(EXPLANATION_VIEWERS);
export type ExplanationViewer = z.infer<typeof ExplanationViewer>;

export const ExplanationEvidenceItem = z.object({
  id: Uuid,
  evidence_type: EvidenceType,
  source_kind: EvidenceSourceKind,
  captured_at: IsoTimestamp.nullable(),
  sensitivity: Sensitivity,
  status: z.string(),
  artifact_count: z.number().int().nonnegative(),
  role: z.enum(["supports", "context", "contradicts"]),
});

export const ClaimExplanation = z.object({
  viewer: ExplanationViewer,
  claim: z.object({
    id: Uuid,
    claim_type: ClaimType,
    subject: SubjectRef,
    status: ClaimStatus,
    /** What a reader should act on now: a verified claim past its window reads `expired`. */
    effective_status: ClaimStatus,
    effective_at: IsoTimestamp.nullable(),
    expires_at: IsoTimestamp.nullable(),
    visibility: ClaimVisibility,
    created_at: IsoTimestamp,
    /** Only for owner / admin / reviewer. */
    sensitivity: Sensitivity.nullable(),
    status_reason_code: z.string().nullable(),
  }),
  source: z.object({ system: z.string(), ref: z.string().nullable() }),
  issuer: z.object({
    kind: z.enum(["subject", "external", "entity"]),
    entity_type: z.string().optional(),
    /** Organization names are public; a person issuer is named only to people with a relationship. */
    label: z.string().nullable(),
  }),
  verification: z
    .object({
      method: VerificationMethod,
      verifier: z.object({ kind: z.string(), label: z.string().nullable() }),
      decided_at: IsoTimestamp.nullable(),
      expires_at: IsoTimestamp.nullable(),
      reason_code: z.string().nullable(),
    })
    .nullable(),
  /** Full metadata for people with a relationship; only a COUNT for the public. */
  evidence: z.union([z.array(ExplanationEvidenceItem), z.object({ count: z.number().int().nonnegative() })]),
  pending_verifications: z.array(z.object({ method: VerificationMethod, status: z.string(), requested_at: IsoTimestamp })),
  history: z.array(z.object({ type: z.string(), at: IsoTimestamp })),
});
export type ClaimExplanation = z.infer<typeof ClaimExplanation>;
