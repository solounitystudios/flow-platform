import { z } from "zod";
import { IsoTimestamp, Uuid } from "./common";
import { SubjectRef } from "./subject";

/**
 * How a claim was (or is being) verified. These are labels for DIFFERENT
 * kinds of assurance — there is deliberately no numeric strength, ranking or
 * trust score attached, and consumers must not invent one.
 */
export const VERIFICATION_METHODS = [
  "self_attested",
  "peer_attested",
  "employer_verified",
  "organization_verified",
  "licensed_provider",
  "education_provider",
  "platform_verified",
  "government_issued",
  "external_source_verified",
] as const;
export const VerificationMethod = z.enum(VERIFICATION_METHODS);
export type VerificationMethod = z.infer<typeof VerificationMethod>;

export const VERIFICATION_STATUSES = ["requested", "completed", "cancelled"] as const;
export const VerificationStatus = z.enum(VERIFICATION_STATUSES);

export const VERIFICATION_DECISIONS = ["verified", "rejected", "revoked"] as const;
export const VerificationDecision = z.enum(VERIFICATION_DECISIONS);
export type VerificationDecision = z.infer<typeof VerificationDecision>;

export const VerificationRecord = z.object({
  id: Uuid,
  claim_id: Uuid,
  method: VerificationMethod,
  /**
   * The person or entity that decided (or was asked to decide), or the
   * platform itself (`system`) for platform_verified decisions.
   */
  verifier: z.union([SubjectRef, z.object({ type: z.literal("system") })]),
  status: VerificationStatus,
  decision: VerificationDecision.nullable(),
  reason_code: z.string().max(64).nullable(),
  requested_at: IsoTimestamp,
  decided_at: IsoTimestamp.nullable(),
  expires_at: IsoTimestamp.nullable(),
  /** Why a prior verification was withdrawn, when decision = 'revoked'. */
  revocation_context: z.record(z.string(), z.unknown()).nullable(),
});
export type VerificationRecord = z.infer<typeof VerificationRecord>;
