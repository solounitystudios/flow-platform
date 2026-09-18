// Activities V1 — authorization predicate regression coverage.
//
// Permanent regression coverage for the three Activities-related predicates
// added to lib/authz.ts alongside
// supabase/migrations/20260826020000_activities_foundation.sql (PR A:
// foundation). Mirrors the existing tests/security/flow-sec-001.test.ts and
// tests/security/flow-sec-002.test.ts pattern exactly.
//
// `canManageActivity` mirrors `activities_creator_manage`'s
// `USING ((select auth.uid()) = created_by)` (migration section B) —
// creator-only manage (host check-in/complete/no-show, edit, cancel).
//
// `canLinkActivityToOrganization` is `canAttributeToOrganization` under an
// Activities-specific name, enforcing the same FLOW-SEC-001 rule the
// `activities_creator_manage` policy's WITH CHECK clause applies to
// `organization_id` (migration section B): an unattributed (`null`) target
// is always allowed; otherwise the caller must own the target organization.
//
// `canLinkActivityToEvent` mirrors `canLinkOpportunityToEvent` (FLOW-SEC-002)
// exactly, including its personal/organization-less-event creator fallback
// and its cancelled/completed rejection (migration section A's commentary on
// why `event_id` integrity is app-layer only, not a DB-level check).
import { describe, expect, it } from "vitest";
import { canLinkActivityToEvent, canLinkActivityToOrganization, canManageActivity } from "@/lib/authz";

describe("Activities V1: canManageActivity (creator-only manage)", () => {
  it("creator managing their own activity: PASS", () => {
    const activity = { created_by: "user-1" };
    expect(canManageActivity(activity, "user-1")).toBe(true);
  });

  it("a different caller attempting to manage someone else's activity: DENY", () => {
    const activity = { created_by: "user-1" };
    expect(canManageActivity(activity, "user-2")).toBe(false);
  });

  it("nonexistent activity (activity_id supplied but lookup found nothing): DENY", () => {
    expect(canManageActivity(null, "user-1")).toBe(false);
  });
});

describe("Activities V1: canLinkActivityToOrganization (FLOW-SEC-001 attribution)", () => {
  it("owner attributing to their own organization: PASS", () => {
    expect(canLinkActivityToOrganization("org-1", "org-1")).toBe(true);
  });

  it("owner attributing to a DIFFERENT organization they don't own: DENY", () => {
    expect(canLinkActivityToOrganization("org-1", "org-2")).toBe(false);
  });

  it("unrelated authenticated user (owns no organization) attributing to any organization: DENY", () => {
    expect(canLinkActivityToOrganization(null, "org-2")).toBe(false);
  });

  it("no organization attribution requested (personal/unattributed activity): PASS regardless of ownership", () => {
    expect(canLinkActivityToOrganization(null, null)).toBe(true);
    expect(canLinkActivityToOrganization("org-1", null)).toBe(true);
  });
});

describe("Activities V1: canLinkActivityToEvent (organization-owned event)", () => {
  it("same-organization event link: PASS", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkActivityToEvent(event, "org-1", "owner-1")).toBe(true);
  });

  it("cross-organization event link: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkActivityToEvent(event, "org-2", "owner-2")).toBe(false);
  });

  it("caller cannot link another organization's event even as the event's own creator (org mismatch dominates)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkActivityToEvent(event, "org-2", "owner-1")).toBe(false);
  });

  it("a personal (organization-less) activity cannot link to an organization-owned event: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkActivityToEvent(event, null, "owner-1")).toBe(false);
  });
});

describe("Activities V1: canLinkActivityToEvent (personal / organization-less event)", () => {
  it("same creator linking their own personal activity to their own personal event: PASS", () => {
    const event = { organization_id: null, created_by: "user-1", status: "published" };
    expect(canLinkActivityToEvent(event, null, "user-1")).toBe(true);
  });

  it("a different user cannot link to someone else's personal event, even with a matching null organization_id: DENY", () => {
    const event = { organization_id: null, created_by: "user-1", status: "published" };
    expect(canLinkActivityToEvent(event, null, "user-2")).toBe(false);
  });

  it("an organization-attributed activity cannot link to a personal (organization-less) event: DENY", () => {
    const event = { organization_id: null, created_by: "user-1", status: "published" };
    expect(canLinkActivityToEvent(event, "org-1", "user-1")).toBe(false);
  });
});

describe("Activities V1: canLinkActivityToEvent (nonexistent event_id)", () => {
  it("event_id was supplied but the event lookup found nothing: DENY", () => {
    expect(canLinkActivityToEvent(null, "org-1", "owner-1")).toBe(false);
    expect(canLinkActivityToEvent(null, null, "user-1")).toBe(false);
  });
});

describe("Activities V1: canLinkActivityToEvent (event status — cancelled/completed rejection)", () => {
  it("cancelled event, otherwise valid same-organization link: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "cancelled" };
    expect(canLinkActivityToEvent(event, "org-1", "owner-1")).toBe(false);
  });

  it("completed event, otherwise valid same-organization link: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "completed" };
    expect(canLinkActivityToEvent(event, "org-1", "owner-1")).toBe(false);
  });

  it("cancelled personal event, otherwise valid same-creator link: DENY", () => {
    const event = { organization_id: null, created_by: "user-1", status: "cancelled" };
    expect(canLinkActivityToEvent(event, null, "user-1")).toBe(false);
  });

  it("completed event stays denied even for a cross-organization attempt (status check doesn't leak an org-mismatch PASS)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "completed" };
    expect(canLinkActivityToEvent(event, "org-2", "owner-2")).toBe(false);
  });

  it("draft event, otherwise valid same-organization link: PASS (draft is not a terminal status, unaffected by this fix)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "draft" };
    expect(canLinkActivityToEvent(event, "org-1", "owner-1")).toBe(true);
  });

  it("published event, otherwise valid same-organization link: PASS (unaffected by this fix)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkActivityToEvent(event, "org-1", "owner-1")).toBe(true);
  });
});
