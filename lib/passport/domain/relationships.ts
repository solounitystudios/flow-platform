import type { Relationship, RelationType, RelationshipStatus, SubjectType } from "@flow/passport-contracts";

/**
 * Canonical relationship rules. A relationship is INFORMATION about how two
 * subjects relate; it is never an access decision, and no policy reads it to
 * grant anything. Mirrored in SQL (`passport_relation_rule`) — kept in
 * lockstep by tests/unit/passport-sql-parity.test.ts.
 *
 *   available          can be created natively today (both ends resolvable
 *                      and able to consent)
 *   managedElsewhere   already recorded in a legacy Flow table and adapted
 *                      read-only (no copy, no dual write)
 *   neither            designed in the vocabulary but refused for now (its
 *                      subjects have no ownership resolver, or it awaits the
 *                      guardian consent model)
 */
export interface RelationRule {
  from: SubjectType;
  to: SubjectType;
  available: boolean;
  managedElsewhere: boolean;
}

export const RELATION_RULES: Record<RelationType, RelationRule> = {
  mentor_of: { from: "person", to: "person", available: true, managedElsewhere: false },
  participates_in: { from: "organization", to: "event", available: true, managedElsewhere: false },
  guardian_of: { from: "person", to: "person", available: false, managedElsewhere: false },
  authorized_for: { from: "person", to: "vehicle", available: false, managedElsewhere: false },
  approved_for: { from: "vehicle", to: "event", available: false, managedElsewhere: false },
  works_on: { from: "team", to: "project", available: false, managedElsewhere: false },
  issued_to: { from: "program", to: "person", available: false, managedElsewhere: false },
  works_at: { from: "person", to: "organization", available: false, managedElsewhere: true },
  member_of: { from: "person", to: "organization", available: false, managedElsewhere: true },
  owns: { from: "person", to: "organization", available: false, managedElsewhere: true },
  attended: { from: "person", to: "event", available: false, managedElsewhere: true },
  connected_with: { from: "person", to: "person", available: false, managedElsewhere: true },
};

/** Relationship lifecycle. `ended`/`declined` are history and never reopen. */
export const RELATIONSHIP_TRANSITIONS: Record<RelationshipStatus, readonly RelationshipStatus[]> = {
  pending: ["active", "declined", "ended"],
  active: ["suspended", "ended"],
  suspended: ["active", "ended"],
  ended: [],
  declined: [],
};

export function canTransitionRelationship(from: RelationshipStatus, to: RelationshipStatus): boolean {
  return RELATIONSHIP_TRANSITIONS[from].includes(to);
}

/** Currently in force (not merely proposed, and not history). */
export function isRelationshipLive(status: RelationshipStatus): boolean {
  return status === "active";
}

// ── row mappers (native table + legacy view -> one contract) ────────────

export interface NativeRelationshipRow {
  id: string;
  from_type: string;
  from_id: string;
  relation: string;
  to_type: string;
  to_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  source_system: string;
}

export interface LegacyRelationshipRow {
  from_type: string | null;
  from_id: string | null;
  relation: string | null;
  to_type: string | null;
  to_id: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  origin_table: string | null;
  origin_id: string | null;
}

export function relationshipFromNative(row: NativeRelationshipRow): Relationship {
  return {
    id: row.id,
    from: { type: row.from_type as SubjectType, id: row.from_id },
    relation: row.relation as RelationType,
    to: { type: row.to_type as SubjectType, id: row.to_id },
    status: row.status as RelationshipStatus,
    started_at: row.started_at,
    ended_at: row.ended_at,
    ended_reason: row.ended_reason,
    origin: { system: row.source_system, legacy_table: null, legacy_id: null },
  };
}

/**
 * Legacy rows have no relationship id of their own; a deterministic synthetic
 * one (`legacy:<table>:<id>`) keeps React keys and de-duplication stable
 * without pretending the row exists in passport_relationships.
 */
export function relationshipFromLegacy(row: LegacyRelationshipRow): (Relationship & { id: string }) | null {
  if (!row.from_type || !row.from_id || !row.relation || !row.to_type || !row.to_id || !row.status || !row.origin_table || !row.origin_id) return null;
  return {
    id: `legacy:${row.origin_table}:${row.origin_id}`,
    from: { type: row.from_type as SubjectType, id: row.from_id },
    relation: row.relation as RelationType,
    to: { type: row.to_type as SubjectType, id: row.to_id },
    status: row.status as RelationshipStatus,
    started_at: row.started_at,
    ended_at: row.ended_at,
    ended_reason: null,
    origin: { system: "flow_platform", legacy_table: row.origin_table, legacy_id: row.origin_id },
  };
}

/** Live relationships first, then newest-started; history (ended/declined) last. */
export function sortRelationships<T extends Pick<Relationship, "status" | "started_at">>(rows: T[]): T[] {
  const rank: Record<RelationshipStatus, number> = { active: 0, pending: 1, suspended: 2, ended: 3, declined: 4 };
  return [...rows].sort((a, b) => rank[a.status] - rank[b.status] || (b.started_at ?? "").localeCompare(a.started_at ?? ""));
}
