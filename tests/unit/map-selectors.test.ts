// Map V2 location-safety regression coverage. The product rule across every
// selector in lib/map-selectors.ts is the same: never fabricate a
// coordinate. A missing lat/lng must render as "no pin", not a silent
// city-center guess — these tests exist because that guess used to be the
// default behavior (see lib/data/opportunities.ts / lib/data/events.ts git
// history) and must never silently come back.
import { describe, expect, it } from "vitest";
import { opportunitiesToMapItems, eventsToMapItems, organizationsToMapItems, mapItemMatchesLayer } from "@/lib/map-selectors";
import type { MockOpportunity, MockEvent, MockOrganization } from "@/lib/types";

const org = { id: "org-1", name: "Test Org", logo_url: "", verified: true };

function makeOpportunity(overrides: Partial<MockOpportunity> = {}): MockOpportunity {
  return {
    id: "opp-1",
    organization: org,
    title: "Test gig",
    description: "",
    opportunity_type: "gig",
    status: "open",
    city: "Buffalo",
    state: "NY",
    location_name: "Somewhere",
    lat: 42.8864,
    lng: -78.8784,
    starts_at: new Date().toISOString(),
    ends_at: null,
    pay_cents: 2000,
    slots: 1,
    slots_filled: 0,
    distance_mi: 1,
    urgent: false,
    is_remote: false,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return {
    id: "evt-1",
    organization: org,
    title: "Test event",
    description: "",
    city: "Buffalo",
    state: "NY",
    venue: "Somewhere",
    lat: 42.8864,
    lng: -78.8784,
    starts_at: new Date().toISOString(),
    ends_at: new Date().toISOString(),
    capacity: 100,
    registered: 0,
    status: "published",
    cover_url: "",
    price_cents: 0,
    category: "Networking",
    ...overrides,
  };
}

function makeOrganization(overrides: Partial<MockOrganization> = {}): MockOrganization {
  return {
    id: "org-1",
    name: "Test Org",
    logo_url: "",
    city: "Buffalo",
    state: "NY",
    description: "",
    verified: true,
    industry: "Business",
    member_perk: null,
    rating: null,
    lat: 42.8864,
    lng: -78.8784,
    location_visibility: "exact",
    ...overrides,
  };
}

describe("opportunitiesToMapItems: never fabricates a location", () => {
  it("a real on-site opportunity with coordinates produces exactly one pin", () => {
    const items = opportunitiesToMapItems([makeOpportunity()]);
    expect(items).toHaveLength(1);
    expect(items[0].latitude).toBe(42.8864);
    expect(items[0].longitude).toBe(-78.8784);
  });

  it("null coordinates produce no pin (not a city-center fallback)", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ lat: null, lng: null })]);
    expect(items).toHaveLength(0);
  });

  it("a remote opportunity produces no geographic pin, even with real coordinates set", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ is_remote: true, lat: 42.8864, lng: -78.8784 })]);
    expect(items).toHaveLength(0);
  });

});

describe("opportunitiesToMapItems: entityType vs isWorkNow are separate axes", () => {
  it("a gig opportunity_type maps to entityType 'gig'", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ opportunity_type: "gig" })]);
    expect(items[0].entityType).toBe("gig");
  });

  it("a job opportunity_type maps to entityType 'job'", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ opportunity_type: "job" })]);
    expect(items[0].entityType).toBe("job");
  });

  it("a volunteer opportunity_type maps to entityType 'volunteer'", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ opportunity_type: "volunteer" })]);
    expect(items[0].entityType).toBe("volunteer");
  });

  it("a non-urgent opportunity has isWorkNow === false", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ urgent: false })]);
    expect(items[0].isWorkNow).toBe(false);
  });

  it("an urgent opportunity preserves its underlying entityType (a job stays a job) and has isWorkNow === true", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ opportunity_type: "job", urgent: true })]);
    expect(items[0].entityType).toBe("job");
    expect(items[0].isWorkNow).toBe(true);
  });

  it("an urgent opportunity is represented exactly once — viewing 'All' does not duplicate it into a second work_now pin", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ opportunity_type: "job", urgent: true })]);
    expect(items).toHaveLength(1);
    // "All" is a strict superset: the same single MapItem matches it,
    // it never gets cloned into a second entry to also satisfy "work_now".
    const visibleUnderAll = items.filter((item) => mapItemMatchesLayer(item, "all"));
    expect(visibleUnderAll).toHaveLength(1);
    expect(visibleUnderAll[0]).toBe(items[0]);
    // It also matches its own entityType layer and the work_now layer —
    // three true layer matches, still zero duplication of the underlying item.
    expect(mapItemMatchesLayer(items[0], "job")).toBe(true);
    expect(mapItemMatchesLayer(items[0], "work_now")).toBe(true);
    expect(mapItemMatchesLayer(items[0], "volunteer")).toBe(false);
  });
});

describe("eventsToMapItems: never fabricates a location", () => {
  it("a real event with coordinates produces exactly one pin", () => {
    const items = eventsToMapItems([makeEvent()]);
    expect(items).toHaveLength(1);
  });

  it("null coordinates produce no pin (not a city-center fallback)", () => {
    expect(eventsToMapItems([makeEvent({ lat: null, lng: null })])).toHaveLength(0);
  });

  it("a partially-null coordinate (only one axis missing) still produces no pin", () => {
    expect(eventsToMapItems([makeEvent({ lat: 42.8864, lng: null })])).toHaveLength(0);
  });

  it("an event maps to entityType 'event'", () => {
    const items = eventsToMapItems([makeEvent()]);
    expect(items[0].entityType).toBe("event");
  });
});

describe("organizationsToMapItems: business coordinates are never fabricated", () => {
  it("an organization with real coordinates produces exactly one pin, mapped to entityType 'business'", () => {
    const items = organizationsToMapItems([makeOrganization()]);
    expect(items).toHaveLength(1);
    expect(items[0].entityType).toBe("business");
  });

  it("an organization with no coordinates set produces no pin — acceptable, not a bug", () => {
    expect(organizationsToMapItems([makeOrganization({ lat: null, lng: null })])).toHaveLength(0);
  });

  it("most organizations having no coordinates yet correctly yields zero business pins overall", () => {
    const items = organizationsToMapItems([
      makeOrganization({ id: "org-1", lat: null, lng: null }),
      makeOrganization({ id: "org-2", lat: null, lng: null }),
    ]);
    expect(items).toHaveLength(0);
  });

  it("a pin links to the public organization page, not /discover", () => {
    const items = organizationsToMapItems([makeOrganization({ id: "org-42" })]);
    expect(items[0].href).toBe("/o/org-42");
  });
});

describe("organizationsToMapItems: location_visibility privacy", () => {
  it("'hidden' produces no pin, even with real coordinates set", () => {
    expect(organizationsToMapItems([makeOrganization({ location_visibility: "hidden" })])).toHaveLength(0);
  });

  it("'remote' produces no physical pin, even with real coordinates set", () => {
    expect(organizationsToMapItems([makeOrganization({ location_visibility: "remote" })])).toHaveLength(0);
  });

  it("'exact' shows the real, unrounded coordinates", () => {
    const items = organizationsToMapItems([makeOrganization({ location_visibility: "exact", lat: 42.88641234, lng: -78.87841234 })]);
    expect(items[0].latitude).toBe(42.88641234);
    expect(items[0].longitude).toBe(-78.87841234);
  });

  it("'approximate' rounds coordinates to 2 decimal places rather than showing the exact point", () => {
    const items = organizationsToMapItems([makeOrganization({ location_visibility: "approximate", lat: 42.88641234, lng: -78.87841234 })]);
    expect(items[0].latitude).toBe(42.89);
    expect(items[0].longitude).toBe(-78.88);
  });
});
