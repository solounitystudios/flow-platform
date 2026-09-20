import { describe, expect, it } from "vitest";
import { RELATION_TYPES, RELATIONSHIP_STATUSES, Relationship } from "@flow/passport-contracts";
import {
  RELATION_RULES,
  RELATIONSHIP_TRANSITIONS,
  canTransitionRelationship,
  isRelationshipLive,
  relationshipFromLegacy,
  relationshipFromNative,
  sortRelationships,
} from "@/lib/passport/domain";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

describe("relationship rules", () => {
  it("covers every relation type in the contract", () => {
    for (const relation of RELATION_TYPES) expect(RELATION_RULES[relation]).toBeDefined();
  });

  it("only offers natively-creatable relations whose both ends can consent", () => {
    const available = RELATION_TYPES.filter((r) => RELATION_RULES[r].available).sort();
    expect(available).toEqual(["mentor_of", "participates_in"]);
  });

  it("refuses to fake relations whose subjects have no resolver, or that await a consent model", () => {
    for (const relation of ["guardian_of", "authorized_for", "approved_for", "works_on", "issued_to"] as const) {
      expect(RELATION_RULES[relation].available, relation).toBe(false);
      expect(RELATION_RULES[relation].managedElsewhere, relation).toBe(false);
    }
  });

  it("does not duplicate relationships that already live in legacy tables", () => {
    for (const relation of ["works_at", "member_of", "owns", "attended", "connected_with"] as const) {
      expect(RELATION_RULES[relation].managedElsewhere, relation).toBe(true);
      expect(RELATION_RULES[relation].available, relation).toBe(false);
    }
  });

  it("supports non-person subjects (the model is not people-only)", () => {
    expect(RELATION_RULES.participates_in).toMatchObject({ from: "organization", to: "event" });
    expect(RELATION_RULES.approved_for).toMatchObject({ from: "vehicle", to: "event" });
    expect(RELATION_RULES.works_on).toMatchObject({ from: "team", to: "project" });
  });
});

describe("relationship lifecycle", () => {
  it("distinguishes active from ended and never reopens history", () => {
    expect(isRelationshipLive("active")).toBe(true);
    for (const status of ["pending", "suspended", "ended", "declined"] as const) expect(isRelationshipLive(status)).toBe(false);
    for (const dead of ["ended", "declined"] as const) {
      expect(RELATIONSHIP_TRANSITIONS[dead]).toEqual([]);
      for (const to of RELATIONSHIP_STATUSES) expect(canTransitionRelationship(dead, to), `${dead}->${to}`).toBe(false);
    }
    expect(canTransitionRelationship("pending", "active")).toBe(true);
    expect(canTransitionRelationship("active", "ended")).toBe(true);
    expect(canTransitionRelationship("suspended", "active")).toBe(true);
    expect(canTransitionRelationship("active", "pending")).toBe(false);
  });
});

describe("row mappers", () => {
  it("maps a native row to a contract-valid Relationship", () => {
    const rel = relationshipFromNative({
      id: U1, from_type: "person", from_id: U2, relation: "mentor_of", to_type: "person", to_id: U1,
      status: "ended", started_at: "2026-01-01T00:00:00Z", ended_at: "2026-06-01T00:00:00Z", ended_reason: "program finished", source_system: "flow_platform",
    });
    expect(Relationship.safeParse(rel).success).toBe(true);
    expect(rel.origin).toEqual({ system: "flow_platform", legacy_table: null, legacy_id: null });
  });

  it("maps a legacy row with a stable synthetic id and its origin table", () => {
    const rel = relationshipFromLegacy({
      from_type: "person", from_id: U1, relation: "member_of", to_type: "organization", to_id: U2, status: "ended",
      started_at: "2026-01-01T00:00:00Z", ended_at: "2026-02-01T00:00:00Z", origin_table: "organization_members", origin_id: "row-9",
    });
    expect(rel?.id).toBe("legacy:organization_members:row-9");
    expect(rel?.origin).toEqual({ system: "flow_platform", legacy_table: "organization_members", legacy_id: "row-9" });
    expect(Relationship.safeParse({ ...rel, id: U1 }).success).toBe(true);
  });

  it("drops a legacy row that is missing anything it needs rather than guessing", () => {
    expect(relationshipFromLegacy({ from_type: null, from_id: U1, relation: "member_of", to_type: "organization", to_id: U2, status: "active", started_at: null, ended_at: null, origin_table: "x", origin_id: "1" })).toBeNull();
  });

  it("sorts live relationships first and history last", () => {
    const rows = [
      { status: "ended" as const, started_at: "2026-05-01T00:00:00Z", n: "ended" },
      { status: "active" as const, started_at: "2026-01-01T00:00:00Z", n: "old-active" },
      { status: "pending" as const, started_at: null, n: "pending" },
      { status: "active" as const, started_at: "2026-03-01T00:00:00Z", n: "new-active" },
    ];
    expect(sortRelationships(rows).map((r) => r.n)).toEqual(["new-active", "old-active", "pending", "ended"]);
  });
});
