// FLOW-SEC-002 — Event ↔ Opportunity organization integrity (Batch A:
// Event Team Builder).
//
// Permanent regression coverage for the founder-locked rule that a
// staffing opportunity may only be linked to an event owned by the same
// organization — never UI-filtering alone. `canLinkOpportunityToEvent`
// (lib/authz.ts) is the single predicate `createOpportunityAction`
// (lib/actions.ts) calls after independently re-fetching the event
// server-side; this file is the TypeScript-side regression, mirroring the
// existing FLOW-SEC-001 pattern (tests/security/flow-sec-001.test.ts).
//
// Also covers the cancelled/completed-event consistency fix: the eligible-
// events picker (app/(app)/business/post/page.tsx) already excluded
// cancelled/completed events from the UI, but the server-side check didn't
// re-enforce that — a direct POST bypassing the picker could still link to
// one of the organizer's own past/cancelled events. `status` cases below
// prove that gap is closed while draft/published remain unaffected.
import { describe, expect, it } from "vitest";
import { canLinkOpportunityToEvent } from "@/lib/authz";

describe("FLOW-SEC-002: canLinkOpportunityToEvent (organization-owned event)", () => {
  it("same-organization event link: PASS", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, "org-1", "owner-1")).toBe(true);
  });

  it("cross-organization event link: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, "org-2", "owner-2")).toBe(false);
  });

  it("organizer cannot link another organization's event even as the event's own creator (org mismatch dominates)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, "org-2", "owner-1")).toBe(false);
  });

  it("a personal (organization-less) opportunity cannot link to an organization-owned event: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, null, "owner-1")).toBe(false);
  });
});

describe("FLOW-SEC-002: canLinkOpportunityToEvent (personal / organization-less event)", () => {
  it("same creator linking their own personal opportunity to their own personal event: PASS", () => {
    const event = { organization_id: null, created_by: "user-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, null, "user-1")).toBe(true);
  });

  it("a different user cannot link to someone else's personal event, even with a matching null organization_id: DENY", () => {
    const event = { organization_id: null, created_by: "user-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, null, "user-2")).toBe(false);
  });

  it("an organization-attributed opportunity cannot link to a personal (organization-less) event: DENY", () => {
    const event = { organization_id: null, created_by: "user-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, "org-1", "user-1")).toBe(false);
  });
});

describe("FLOW-SEC-002: canLinkOpportunityToEvent (nonexistent event_id)", () => {
  it("event_id was supplied but the event lookup found nothing: DENY", () => {
    expect(canLinkOpportunityToEvent(null, "org-1", "owner-1")).toBe(false);
    expect(canLinkOpportunityToEvent(null, null, "user-1")).toBe(false);
  });
});

describe("FLOW-SEC-002: canLinkOpportunityToEvent (event status — UI/server consistency fix)", () => {
  it("cancelled event, otherwise valid same-organization link: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "cancelled" };
    expect(canLinkOpportunityToEvent(event, "org-1", "owner-1")).toBe(false);
  });

  it("completed event, otherwise valid same-organization link: DENY", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "completed" };
    expect(canLinkOpportunityToEvent(event, "org-1", "owner-1")).toBe(false);
  });

  it("cancelled personal event, otherwise valid same-creator link: DENY", () => {
    const event = { organization_id: null, created_by: "user-1", status: "cancelled" };
    expect(canLinkOpportunityToEvent(event, null, "user-1")).toBe(false);
  });

  it("completed event stays denied even for a cross-organization attempt (status check doesn't leak an org-mismatch PASS)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "completed" };
    expect(canLinkOpportunityToEvent(event, "org-2", "owner-2")).toBe(false);
  });

  it("draft event, otherwise valid same-organization link: PASS (draft is not a terminal status, unaffected by this fix)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "draft" };
    expect(canLinkOpportunityToEvent(event, "org-1", "owner-1")).toBe(true);
  });

  it("published event, otherwise valid same-organization link: PASS (unaffected by this fix)", () => {
    const event = { organization_id: "org-1", created_by: "owner-1", status: "published" };
    expect(canLinkOpportunityToEvent(event, "org-1", "owner-1")).toBe(true);
  });
});
