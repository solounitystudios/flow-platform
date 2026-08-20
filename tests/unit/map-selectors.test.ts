// Map V2 location-safety regression coverage. The product rule across every
// selector in lib/map-selectors.ts is the same: never fabricate a
// coordinate. A missing lat/lng must render as "no pin", not a silent
// city-center guess — these tests exist because that guess used to be the
// default behavior (see lib/data/opportunities.ts / lib/data/events.ts git
// history) and must never silently come back.
import { describe, expect, it } from "vitest";
import { opportunitiesToMapItems, eventsToMapItems, organizationsToMapItems } from "@/lib/map-selectors";
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

  it("an urgent opportunity is bucketed as work_now, not opportunity", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ urgent: true })]);
    expect(items[0].type).toBe("work_now");
  });

  it("a volunteer opportunity is bucketed as community", () => {
    const items = opportunitiesToMapItems([makeOpportunity({ opportunity_type: "volunteer" })]);
    expect(items[0].type).toBe("community");
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
});

describe("organizationsToMapItems: business coordinates are never fabricated", () => {
  it("an organization with real coordinates produces exactly one pin", () => {
    const items = organizationsToMapItems([makeOrganization()]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("business");
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
});
