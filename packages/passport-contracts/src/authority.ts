import { z } from "zod";
import { IsoTimestamp, Uuid } from "./common";
import { SubjectRef } from "./subject";

/**
 * AUTHORITY is permission to make a consequential assertion or decision on
 * behalf of another entity. It is NOT a role. An organization's `admin` or
 * `recruiter` membership role says what someone does day-to-day in the
 * product; none of those roles ever implies any of these authorities.
 * Authorities exist only as explicit, scoped, expiring, revocable
 * assignments — with one derivation: record ownership proves `owner`.
 */
export const AUTHORITY_TYPES = [
  "owner",
  "credential_issuer",
  "evidence_reviewer",
  "hiring_approver",
  "data_requester",
  "program_administrator",
  "event_operator",
  "guardian",
  "delegated_operator",
  /** Reserved. No assignment path exists in this wave. */
  "agency_program_authority",
] as const;
export const AuthorityType = z.enum(AUTHORITY_TYPES);
export type AuthorityType = z.infer<typeof AuthorityType>;

/** How the assignment came to exist. */
export const AUTHORITY_SOURCES = ["record_ownership", "assigned", "delegated", "system"] as const;
export const AuthoritySource = z.enum(AUTHORITY_SOURCES);

export const AUTHORITY_STATUSES = ["active", "revoked", "expired"] as const;

/**
 * Narrowing of an assignment. Empty arrays mean "no restriction on that
 * axis" only for `owner`; every other type must name at least one purpose or
 * claim-type prefix (enforced by the domain, not just documented).
 */
export const AuthorityScope = z.object({
  purposes: z.array(z.string().min(1).max(64)).max(20).default([]),
  claim_type_prefixes: z.array(z.string().min(1).max(80)).max(20).default([]),
});
export type AuthorityScope = z.infer<typeof AuthorityScope>;

export const AuthorityAssignment = z.object({
  id: Uuid,
  principal: SubjectRef,
  entity: SubjectRef,
  authority_type: AuthorityType,
  scope: AuthorityScope,
  source: AuthoritySource,
  delegator_id: Uuid.nullable(),
  starts_at: IsoTimestamp,
  expires_at: IsoTimestamp.nullable(),
  status: z.enum(AUTHORITY_STATUSES),
  revoke_reason: z.string().max(200).nullable(),
  revoked_at: IsoTimestamp.nullable(),
});
export type AuthorityAssignment = z.infer<typeof AuthorityAssignment>;
