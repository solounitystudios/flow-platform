// Map V2 Batch 3 — viewport (bounds) state coverage: client-side "Search
// this area" filtering, the meaningfully-different-viewport heuristic that
// decides when to show the control, and URL param parse/serialize
// (including malformed/invalid input, which must fail safe — never crash,
// never leave the map in a broken state). Also re-confirms the Batch
// 1/Batch 2 privacy contract (hidden/remote organizations never produce a
// pin or a list row) still holds when a bounds filter is layered on top.
import { describe, expect, it } from "vitest";
import {
  boundsOverlapRatio,
  buildLiveMapSearchParams,
  filterEventsByBounds,
  filterMapItemsByBounds,
  filterOpportunitiesByBounds,
  filterOrganizationsByBounds,
  isValidBounds,
  isWithinBounds,
  parseBoundsParam,
  parseMapLayerParam,
  serializeBoundsParam,
  shouldShowSearchThisArea,
  type MapBounds,
} from "@/lib/map-viewport";
import { organizationsToMapItems } from "@/lib/map-selectors";
import type { MapItem } from "@/lib/map-selectors";
import type { MockEvent, MockOpportunity, MockOrganization } from "@/lib/types";

const BUFFALO_BOUNDS: MapBounds = { west: -78.95, south: 42.83, east: -78.8, north: 42.93 };

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

function mapItem(overrides: Partial<MapItem> = {}): MapItem {
  return {
    id: "item-1",
    entityType: "gig",
    isWorkNow: false,
    title: "Test item",
    latitude: 42.8864,
    longitude: -78.8784,
    href: "/gigs/item-1",
    ...overrides,
  };
}

describe("isValidBounds / isWithinBounds", () => {
  it("accepts a normal bounds box", () => {
    expect(isValidBounds(BUFFALO_BOUNDS)).toBe(true);
  });

  it("rejects inverted bounds (west >= east or south >= north)", () => {
    expect(isValidBounds({ west: -78.8, south: 42.83, east: -78.95, north: 42.93 })).toBe(false);
    expect(isValidBounds({ west: -78.95, south: 42.93, east: -78.8, north: 42.83 })).toBe(false);
  });

  it("rejects out-of-range latitude/longitude", () => {
    expect(isValidBounds({ west: -200, south: 42.83, east: -78.8, north: 42.93 })).toBe(false);
    expect(isValidBounds({ west: -78.95, south: -100, east: -78.8, north: 42.93 })).toBe(false);
  });

  it("rejects null/undefined/non-finite input", () => {
    expect(isValidBounds(null)).toBe(false);
    expect(isValidBounds(undefined)).toBe(false);
    expect(isValidBounds({ west: NaN, south: 42.83, east: -78.8, north: 42.93 })).toBe(false);
  });

  it("a point inside the box is within bounds; a point outside is not", () => {
    expect(isWithinBounds(42.88, -78.87, BUFFALO_BOUNDS)).toBe(true);
    expect(isWithinBounds(43.5, -78.87, BUFFALO_BOUNDS)).toBe(false);
  });
});

describe("boundsOverlapRatio / shouldShowSearchThisArea", () => {
  it("is 1 for identical bounds", () => {
    expect(boundsOverlapRatio(BUFFALO_BOUNDS, BUFFALO_BOUNDS)).toBe(1);
  });

  it("is 0 for non-overlapping bounds", () => {
    const elsewhere: MapBounds = { west: 10, south: 10, east: 11, north: 11 };
    expect(boundsOverlapRatio(BUFFALO_BOUNDS, elsewhere)).toBe(0);
  });

  it("is between 0 and 1 for a partially-overlapping pan", () => {
    const panned: MapBounds = { west: -78.9, south: 42.88, east: -78.75, north: 42.98 };
    const ratio = boundsOverlapRatio(BUFFALO_BOUNDS, panned);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });

  it("is 0 for invalid input rather than dividing by zero / NaN", () => {
    expect(boundsOverlapRatio(BUFFALO_BOUNDS, { west: 1, south: 1, east: 1, north: 1 })).toBe(0);
  });

  it("never shows the control when nothing has been searched yet (lastSearched === null)", () => {
    const farAway: MapBounds = { west: 10, south: 10, east: 11, north: 11 };
    expect(shouldShowSearchThisArea(farAway, null)).toBe(false);
  });

  it("does not show the control for a tiny nudge that still mostly overlaps", () => {
    const tinyNudge: MapBounds = { west: -78.951, south: 42.831, east: -78.801, north: 42.931 };
    expect(shouldShowSearchThisArea(tinyNudge, BUFFALO_BOUNDS)).toBe(false);
  });

  it("shows the control once the viewport has moved meaningfully away", () => {
    const farAway: MapBounds = { west: 10, south: 10, east: 11, north: 11 };
    expect(shouldShowSearchThisArea(farAway, BUFFALO_BOUNDS)).toBe(true);
  });
});

describe("URL param parsing: fails safe on invalid/stale/malformed input", () => {
  it("parseMapLayerParam accepts a known layer", () => {
    expect(parseMapLayerParam("business")).toBe("business");
    expect(parseMapLayerParam("work_now")).toBe("work_now");
  });

  it("parseMapLayerParam falls back to 'all' for null, unknown, or garbage values", () => {
    expect(parseMapLayerParam(null)).toBe("all");
    expect(parseMapLayerParam(undefined)).toBe("all");
    expect(parseMapLayerParam("")).toBe("all");
    expect(parseMapLayerParam("<script>alert(1)</script>")).toBe("all");
    expect(parseMapLayerParam("jobs")).toBe("all"); // not a real MapLayer id (the real one is "job")
  });

  it("parseBoundsParam round-trips through serializeBoundsParam", () => {
    const serialized = serializeBoundsParam(BUFFALO_BOUNDS);
    expect(parseBoundsParam(serialized)).toEqual(BUFFALO_BOUNDS);
  });

  it("parseBoundsParam returns null for missing input", () => {
    expect(parseBoundsParam(null)).toBeNull();
    expect(parseBoundsParam(undefined)).toBeNull();
    expect(parseBoundsParam("")).toBeNull();
  });

  it("parseBoundsParam returns null (never throws) for malformed input", () => {
    expect(parseBoundsParam("not,valid,bounds")).toBeNull();
    expect(parseBoundsParam("1,2,3")).toBeNull(); // wrong count
    expect(parseBoundsParam("1,2,3,4,5")).toBeNull(); // wrong count
    expect(parseBoundsParam("a,b,c,d")).toBeNull(); // non-numeric
  });

  it("parseBoundsParam returns null for a structurally-valid but geographically-invalid box (stale/tampered param)", () => {
    expect(parseBoundsParam("-78.8,42.93,-78.95,42.83")).toBeNull(); // inverted west/east, south/north
    expect(parseBoundsParam("-500,42.83,-78.8,42.93")).toBeNull(); // out-of-range longitude
  });

  it("buildLiveMapSearchParams omits default values (layer 'all', bounds null) to keep the URL clean", () => {
    expect(buildLiveMapSearchParams("all", null).toString()).toBe("");
  });

  it("buildLiveMapSearchParams includes a non-default layer and/or bounds", () => {
    const params = buildLiveMapSearchParams("business", BUFFALO_BOUNDS);
    expect(params.get("layer")).toBe("business");
    expect(params.get("b")).toBe(serializeBoundsParam(BUFFALO_BOUNDS));
  });
});

describe("filterMapItemsByBounds", () => {
  it("passes everything through when bounds is null (no search committed yet)", () => {
    const items = [mapItem({ id: "a", latitude: 42.88, longitude: -78.87 }), mapItem({ id: "b", latitude: 50, longitude: 50 })];
    expect(filterMapItemsByBounds(items, null)).toHaveLength(2);
  });

  it("excludes items outside the committed bounds", () => {
    const inside = mapItem({ id: "in", latitude: 42.88, longitude: -78.87 });
    const outside = mapItem({ id: "out", latitude: 50, longitude: 50 });
    expect(filterMapItemsByBounds([inside, outside], BUFFALO_BOUNDS)).toEqual([inside]);
  });
});

describe("filterOpportunitiesByBounds / filterEventsByBounds: coordinate-less items are never excluded by a viewport filter", () => {
  it("keeps a remote/coordinate-less opportunity regardless of bounds — it was never viewport-mappable to begin with", () => {
    const remote = makeOpportunity({ id: "remote", lat: null, lng: null, is_remote: true });
    const outsideBounds = makeOpportunity({ id: "far", lat: 50, lng: 50 });
    const insideBounds = makeOpportunity({ id: "near", lat: 42.88, lng: -78.87 });
    const result = filterOpportunitiesByBounds([remote, outsideBounds, insideBounds], BUFFALO_BOUNDS);
    expect(result.map((o) => o.id).sort()).toEqual(["near", "remote"]);
  });

  it("keeps a coordinate-less event regardless of bounds", () => {
    const noCoords = makeEvent({ id: "no-coords", lat: null, lng: null });
    const outsideBounds = makeEvent({ id: "far", lat: 50, lng: 50 });
    const result = filterEventsByBounds([noCoords, outsideBounds], BUFFALO_BOUNDS);
    expect(result.map((e) => e.id)).toEqual(["no-coords"]);
  });
});

describe("filterOrganizationsByBounds: privacy contract holds under the new bounds-filtering path", () => {
  it("a 'hidden' organization is excluded even when its raw coordinates fall inside the searched bounds", () => {
    const hidden = makeOrganization({ id: "hidden-org", location_visibility: "hidden", lat: 42.88, lng: -78.87 });
    expect(filterOrganizationsByBounds([hidden], BUFFALO_BOUNDS)).toHaveLength(0);
  });

  it("a 'remote' organization is excluded even when its raw coordinates fall inside the searched bounds", () => {
    const remote = makeOrganization({ id: "remote-org", location_visibility: "remote", lat: 42.88, lng: -78.87 });
    expect(filterOrganizationsByBounds([remote], BUFFALO_BOUNDS)).toHaveLength(0);
  });

  it("an 'exact' organization inside the bounds is included; outside is excluded", () => {
    const inside = makeOrganization({ id: "inside", location_visibility: "exact", lat: 42.88, lng: -78.87 });
    const outside = makeOrganization({ id: "outside", location_visibility: "exact", lat: 50, lng: 50 });
    const result = filterOrganizationsByBounds([inside, outside], BUFFALO_BOUNDS);
    expect(result.map((o) => o.id)).toEqual(["inside"]);
  });

  it("an 'approximate' organization is filtered using its rounded (fuzzed) point, matching the pin's own precision — never gains precision from the bounds check", () => {
    // Raw (42.884, -78.874) rounds to (42.88, -78.87) — see
    // effectiveOrganizationCoordinates. Bounds chosen so the *raw* point
    // falls just outside (lat 42.884 > north 42.882) while the *rounded*
    // point falls just inside — a real, falsifiable check that the bounds
    // filter is using the same redacted coordinate the map pin renders at,
    // not the raw underlying one (which would fail this bounds check).
    const approx = makeOrganization({ id: "approx", location_visibility: "approximate", lat: 42.884, lng: -78.874 });
    const bounds: MapBounds = { west: -78.875, south: 42.875, east: -78.865, north: 42.882 };

    const [pinItem] = organizationsToMapItems([approx]);
    expect(pinItem.latitude).toBe(42.88);
    expect(pinItem.longitude).toBe(-78.87);
    expect(isWithinBounds(42.884, -78.874, bounds)).toBe(false); // the raw point would have been excluded
    expect(filterOrganizationsByBounds([approx], bounds)).toEqual([approx]); // the redacted pin point is included
  });

  it("an organization with no coordinates set is never excluded by a viewport filter", () => {
    const noCoords = makeOrganization({ id: "no-coords", lat: null, lng: null });
    expect(filterOrganizationsByBounds([noCoords], BUFFALO_BOUNDS)).toHaveLength(1);
  });

  it("bounds === null passes every organization through unfiltered (privacy gate is orthogonal to this function, not bypassed by it)", () => {
    const hidden = makeOrganization({ id: "hidden-org", location_visibility: "hidden" });
    // This function alone does not apply the layer/eligibility gate — that
    // is filterOrganizationsForLayer's job upstream — but callers apply
    // both in sequence (see LiveBrowser.tsx), and effectiveOrganizationCoordinates
    // (used internally above) always re-enforces the privacy rule anyway.
    expect(filterOrganizationsByBounds([hidden], null)).toEqual([hidden]);
  });
});
