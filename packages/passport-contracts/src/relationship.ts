import { z } from "zod";
import { IsoTimestamp, OpaqueId, Uuid } from "./common";
import { SubjectRef } from "./subject";

/**
 * Canonical relationship vocabulary. A relationship is INFORMATION about how
 * two subjects relate — it is never itself an access decision. In particular
 * `guardian_of`, `owns` and `authorized_for` describe a relationship; the
 * authority to act is a separate AuthorityAssignment and must be checked
 * separately.
 */
export const RELATION_TYPES = [
  "works_at",
  "member_of",
  "guardian_of",
  "mentor_of",
  "owns",
  "authorized_for",
  "participates_in",
  "works_on",
  "issued_to",
  "approved_for",
  "attended",
  "connected_with",
] as const;
export const RelationType = z.enum(RELATION_TYPES);
export type RelationType = z.infer<typeof RelationType>;

export const RELATIONSHIP_STATUSES = ["pending", "active", "suspended", "ended", "declined"] as const;
export const RelationshipStatus = z.enum(RELATIONSHIP_STATUSES);
export type RelationshipStatus = z.infer<typeof RelationshipStatus>;

export const Relationship = z.object({
  id: Uuid,
  from: SubjectRef,
  relation: RelationType,
  to: SubjectRef,
  status: RelationshipStatus,
  started_at: IsoTimestamp.nullable(),
  ended_at: IsoTimestamp.nullable(),
  ended_reason: z.string().max(200).nullable(),
  /** Where the relationship is recorded: native, or a legacy Flow table adapted read-only. */
  origin: z.object({
    system: z.string().min(1).max(64),
    legacy_table: z.string().min(1).max(64).nullable(),
    legacy_id: OpaqueId.nullable(),
  }),
});
export type Relationship = z.infer<typeof Relationship>;
