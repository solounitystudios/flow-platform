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
  isCurrentMapStateVersion,
  isValidBounds,
  isValidViewport,
  isWithinBounds,
  MAP_STATE_VERSION,
  parseBoundsParam,
  parseMapLayerParam,
  parseMapViewParam,
  parseViewportParam,
  resolveInitialCameraSource,
  resolveSelectedMapItem,
  roundViewport,
  serializeBoundsParam,
  serializeViewportParam,
  shouldResetSearchBaseline,
  shouldShowSearchThisArea,
  type MapBounds,
  type MapViewport,
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

  it("buildLiveMapSearchParams omits default values (layer 'all', bounds null, view 'map', viewport null) to keep the URL clean", () => {
    expect(buildLiveMapSearchParams({ layer: "all", bounds: null, view: "map", viewport: null }).toString()).toBe("");
  });

  it("buildLiveMapSearchParams includes a non-default layer and/or bounds", () => {
    const params = buildLiveMapSearchParams({ layer: "business", bounds: BUFFALO_BOUNDS, view: "map", viewport: null });
    expect(params.get("layer")).toBe("business");
    expect(params.get("b")).toBe(serializeBoundsParam(BUFFALO_BOUNDS));
  });
});

describe("Map V2 Batch 5: view mode persistence (parseMapViewParam)", () => {
  it("accepts the known view modes", () => {
    expect(parseMapViewParam("map")).toBe("map");
    expect(parseMapViewParam("list")).toBe("list");
  });

  it("falls back to 'map' for null, missing, or garbage values — never crashes, never leaves both/neither view active", () => {
    expect(parseMapViewParam(null)).toBe("map");
    expect(parseMapViewParam(undefined)).toBe("map");
    expect(parseMapViewParam("")).toBe("map");
    expect(parseMapViewParam("grid")).toBe("map");
    expect(parseMapViewParam("<script>alert(1)</script>")).toBe("map");
    expect(parseMapViewParam("MAP")).toBe("map"); // case-sensitive — not a recognized value
  });
});

describe("Map V2 Batch 5: live camera persistence (MapViewport)", () => {
  const VALID_VIEWPORT: MapViewport = { lat: 42.8864, lng: -78.8784, zoom: 13.25, bearing: 0, pitch: 0 };
  const ROTATED_VIEWPORT: MapViewport = { lat: 42.8864, lng: -78.8784, zoom: 13.25, bearing: 45.3, pitch: 30.7 };

  describe("isValidViewport", () => {
    it("accepts a normal camera position", () => {
      expect(isValidViewport(VALID_VIEWPORT)).toBe(true);
      expect(isValidViewport(ROTATED_VIEWPORT)).toBe(true);
    });

    it("rejects null/undefined", () => {
      expect(isValidViewport(null)).toBe(false);
      expect(isValidViewport(undefined)).toBe(false);
    });

    it("rejects non-finite fields (NaN, Infinity)", () => {
      expect(isValidViewport({ ...VALID_VIEWPORT, lat: NaN })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, zoom: Infinity })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, bearing: -Infinity })).toBe(false);
    });

    it("rejects out-of-range latitude/longitude, including negative extremes", () => {
      expect(isValidViewport({ ...VALID_VIEWPORT, lat: 91 })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, lat: -91 })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, lng: 181 })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, lng: -181 })).toBe(false);
    });

    it("rejects invalid zoom: negative, zero is valid (min zoom), absurdly high", () => {
      expect(isValidViewport({ ...VALID_VIEWPORT, zoom: -1 })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, zoom: 0 })).toBe(true); // 0 is maplibre's own min zoom, a legitimate fully-zoomed-out camera
      expect(isValidViewport({ ...VALID_VIEWPORT, zoom: 999 })).toBe(false);
    });

    it("rejects out-of-range bearing/pitch", () => {
      expect(isValidViewport({ ...VALID_VIEWPORT, bearing: 200 })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, bearing: -200 })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, pitch: -1 })).toBe(false);
      expect(isValidViewport({ ...VALID_VIEWPORT, pitch: 200 })).toBe(false);
    });
  });

  describe("roundViewport / serializeViewportParam / parseViewportParam", () => {
    it("round-trips a valid viewport with no rotate/tilt through the 3-field shape", () => {
      const serialized = serializeViewportParam(VALID_VIEWPORT);
      expect(serialized.split(",")).toHaveLength(3);
      expect(parseViewportParam(serialized)).toEqual(roundViewport(VALID_VIEWPORT));
    });

    it("round-trips a rotated/tilted viewport through the 5-field shape", () => {
      const serialized = serializeViewportParam(ROTATED_VIEWPORT);
      expect(serialized.split(",")).toHaveLength(5);
      expect(parseViewportParam(serialized)).toEqual(roundViewport(ROTATED_VIEWPORT));
    });

    it("rounds coordinates to 4 decimals and zoom/bearing/pitch to coarser precision, keeping the round-trip stable within that precision", () => {
      const precise: MapViewport = { lat: 42.886412345, lng: -78.878398765, zoom: 13.2537, bearing: 12.34, pitch: 5.67 };
      const rounded = roundViewport(precise);
      expect(rounded.lat).toBe(42.8864);
      expect(rounded.lng).toBe(-78.8784);
      expect(rounded.zoom).toBe(13.25);
      expect(rounded.bearing).toBe(12.3);
      expect(rounded.pitch).toBe(5.7);
      expect(parseViewportParam(serializeViewportParam(precise))).toEqual(rounded);
    });
  });

  describe("parseViewportParam: fails safe on missing/malformed/extreme/adversarial input", () => {
    it("returns null for missing input", () => {
      expect(parseViewportParam(null)).toBeNull();
      expect(parseViewportParam(undefined)).toBeNull();
      expect(parseViewportParam("")).toBeNull();
    });

    it("returns null (never throws) for garbage/wrong-shape strings", () => {
      expect(parseViewportParam("not,a,viewport")).toBeNull();
      expect(parseViewportParam("1,2")).toBeNull(); // wrong count
      expect(parseViewportParam("1,2,3,4")).toBeNull(); // wrong count (neither 3 nor 5)
      expect(parseViewportParam("1,2,3,4,5,6")).toBeNull(); // wrong count
      expect(parseViewportParam("a,b,c")).toBeNull(); // non-numeric
      expect(parseViewportParam("<script>alert(1)</script>,1,1")).toBeNull(); // XSS-style, non-numeric
      expect(parseViewportParam(",,,")).toBeNull();
    });

    it("returns null for non-numeric/NaN fields even when the shape otherwise looks right", () => {
      expect(parseViewportParam("42.8,NaN,13")).toBeNull();
      expect(parseViewportParam("42.8,-78.8,Infinity")).toBeNull();
    });

    it("returns null for extreme/out-of-range coordinates (never lets an off-earth camera through)", () => {
      expect(parseViewportParam("91,-78.8,13")).toBeNull(); // lat > 90
      expect(parseViewportParam("-91,-78.8,13")).toBeNull(); // lat < -90
      expect(parseViewportParam("42.8,181,13")).toBeNull(); // lng > 180
      expect(parseViewportParam("42.8,-181,13")).toBeNull(); // lng < -180
    });

    it("returns null for invalid zoom (negative, absurdly high, non-numeric)", () => {
      expect(parseViewportParam("42.8,-78.8,-5")).toBeNull();
      expect(parseViewportParam("42.8,-78.8,500")).toBeNull();
      expect(parseViewportParam("42.8,-78.8,not-a-number")).toBeNull();
    });

    it("defaults a missing bearing/pitch to 0 for the 3-field shape rather than failing", () => {
      expect(parseViewportParam("42.8864,-78.8784,13.25")).toEqual({ lat: 42.8864, lng: -78.8784, zoom: 13.25, bearing: 0, pitch: 0 });
    });
  });

  describe("resolveInitialCameraSource: precedence between restored search bounds and restored live viewport", () => {
    it("prefers bounds when both a committed search area and a restored viewport are present", () => {
      expect(resolveInitialCameraSource(BUFFALO_BOUNDS, VALID_VIEWPORT)).toBe("bounds");
    });

    it("falls back to viewport when only a restored viewport is present", () => {
      expect(resolveInitialCameraSource(null, VALID_VIEWPORT)).toBe("viewport");
    });

    it("falls back to default (city center) when neither is present", () => {
      expect(resolveInitialCameraSource(null, null)).toBe("default");
    });

    it("ignores a malformed/invalid bounds or viewport rather than trusting it", () => {
      const invalidBounds = { west: 1, south: 1, east: 1, north: 1 }; // inverted (west === east)
      expect(resolveInitialCameraSource(invalidBounds, VALID_VIEWPORT)).toBe("viewport");
      const invalidViewport = { ...VALID_VIEWPORT, zoom: 999 };
      expect(resolveInitialCameraSource(null, invalidViewport)).toBe("default");
    });
  });

  describe("buildLiveMapSearchParams: view + viewport interaction with layer/bounds", () => {
    it("includes the view param only when non-default ('list')", () => {
      const mapView = buildLiveMapSearchParams({ layer: "all", bounds: null, view: "map", viewport: null });
      expect(mapView.get("view")).toBeNull();
      const listView = buildLiveMapSearchParams({ layer: "all", bounds: null, view: "list", viewport: VALID_VIEWPORT });
      expect(listView.get("view")).toBe("list");
    });

    it("includes the viewport param only when present, alongside an unaffected layer param (layer + viewport don't interfere)", () => {
      const params = buildLiveMapSearchParams({ layer: "job", bounds: null, view: "map", viewport: VALID_VIEWPORT });
      expect(params.get("layer")).toBe("job");
      expect(params.get("vp")).toBe(serializeViewportParam(VALID_VIEWPORT));
    });

    it("carries both a committed bounds and a restored viewport at once (e.g. searched, then panned further without re-committing) without either being dropped", () => {
      const params = buildLiveMapSearchParams({ layer: "all", bounds: BUFFALO_BOUNDS, view: "map", viewport: VALID_VIEWPORT });
      expect(params.get("b")).toBe(serializeBoundsParam(BUFFALO_BOUNDS));
      expect(params.get("vp")).toBe(serializeViewportParam(VALID_VIEWPORT));
      // ...and on a subsequent restore, bounds still wins for the initial camera — see resolveInitialCameraSource.
      expect(resolveInitialCameraSource(parseBoundsParam(params.get("b")), parseViewportParam(params.get("vp")))).toBe("bounds");
    });

    it("clearing viewport/view (absent from the URL) fails safe to defaults, not a crash", () => {
      expect(parseMapViewParam(new URLSearchParams("").get("view"))).toBe("map");
      expect(parseViewportParam(new URLSearchParams("").get("vp"))).toBeNull();
    });
  });
});

describe("Map V2 Batch 5: geolocation privacy — no raw device coordinate path into URL-building", () => {
  it("buildLiveMapSearchParams's inputs are a MapLayer, MapBounds, MapViewMode, and MapViewport — none of which is (or is derived from) the raw GeolocationCoordinates the browser reports", () => {
    // This is a structural/API-shape assertion, not a runtime one: LiveBrowser.tsx's
    // one-shot navigator.geolocation.getCurrentPosition result (`userLocation`) is
    // never passed as an argument anywhere in this file, and MapViewport's fields
    // (lat/lng/zoom/bearing/pitch) are sourced exclusively from the maplibre map
    // instance's own getCenter()/getZoom()/getBearing()/getPitch() — i.e. wherever
    // the *camera* is, which the user can reach via the geolocation fly-to but which
    // is never the raw coordinate itself once the map has settled somewhere. A grep
    // for "userLocation" across lib/map-viewport.ts (this module) confirms it: the
    // symbol does not appear here at all.
    const source = buildLiveMapSearchParams.toString();
    expect(source).not.toMatch(/userLocation|getCurrentPosition|geolocation/i);
  });
});

describe("shouldResetSearchBaseline: Batch 4's Clear Search Area baseline-reset decision", () => {
  it("is true for an explicit clear (a real bounds box -> null)", () => {
    expect(shouldResetSearchBaseline(BUFFALO_BOUNDS, null)).toBe(true);
  });

  it("is false on mount with no prior search (null -> null)", () => {
    expect(shouldResetSearchBaseline(null, null)).toBe(false);
  });

  it("is false on mount with a restored URL search area (bounds -> the same bounds)", () => {
    expect(shouldResetSearchBaseline(BUFFALO_BOUNDS, BUFFALO_BOUNDS)).toBe(false);
  });

  it("is false for a fresh commit (null -> bounds)", () => {
    expect(shouldResetSearchBaseline(null, BUFFALO_BOUNDS)).toBe(false);
  });

  it("is false for a re-commit to a different area (bounds -> different bounds) — handleSearchThisArea already owns that baseline update", () => {
    const elsewhere: MapBounds = { west: 10, south: 10, east: 11, north: 11 };
    expect(shouldResetSearchBaseline(BUFFALO_BOUNDS, elsewhere)).toBe(false);
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

  it("bounds === null still excludes hidden/remote organizations — the eligibility gate is unconditional, not just a bounds-comparison side effect (Batch 4 fix)", () => {
    const hidden = makeOrganization({ id: "hidden-org", location_visibility: "hidden" });
    const remote = makeOrganization({ id: "remote-org", location_visibility: "remote" });
    const eligible = makeOrganization({ id: "eligible-org", location_visibility: "exact" });
    const result = filterOrganizationsByBounds([hidden, remote, eligible], null);
    expect(result.map((o) => o.id)).toEqual(["eligible-org"]);
  });
});

describe("Map V2 Batch 6: state versioning (isCurrentMapStateVersion / buildLiveMapSearchParams)", () => {
  describe("isCurrentMapStateVersion", () => {
    it("trusts a missing version marker (null, undefined, or empty string) — every pre-Batch-6 /live URL has no 'v' param at all", () => {
      expect(isCurrentMapStateVersion(null)).toBe(true);
      expect(isCurrentMapStateVersion(undefined)).toBe(true);
      expect(isCurrentMapStateVersion("")).toBe(true);
    });

    it("trusts the current version value", () => {
      expect(isCurrentMapStateVersion(String(MAP_STATE_VERSION))).toBe(true);
    });

    it("does not trust an explicit, non-matching version value", () => {
      expect(isCurrentMapStateVersion(String(MAP_STATE_VERSION + 1))).toBe(false);
      expect(isCurrentMapStateVersion("not-a-version")).toBe(false);
      expect(isCurrentMapStateVersion("0")).toBe(false);
    });
  });

  describe("buildLiveMapSearchParams: 'v' param only appears alongside other non-default state", () => {
    it("omits 'v' entirely when every other value is default (the common empty-URL case doesn't grow)", () => {
      const params = buildLiveMapSearchParams({ layer: "all", bounds: null, view: "map", viewport: null });
      expect(params.toString()).toBe("");
      expect(params.get("v")).toBeNull();
    });

    it("includes 'v' once any non-default state is present", () => {
      const params = buildLiveMapSearchParams({ layer: "business", bounds: null, view: "map", viewport: null });
      expect(params.get("v")).toBe(String(MAP_STATE_VERSION));
    });
  });

  describe("parseBoundsParam / parseViewportParam / parseMapViewParam: version guard", () => {
    const serializedBounds = serializeBoundsParam(BUFFALO_BOUNDS);
    const viewport: MapViewport = { lat: 42.8864, lng: -78.8784, zoom: 13.25, bearing: 0, pitch: 0 };
    const serializedViewport = serializeViewportParam(viewport);

    it("restores normally when the version param is absent (backward-compatible with pre-Batch-6 URLs)", () => {
      expect(parseBoundsParam(serializedBounds)).toEqual(BUFFALO_BOUNDS);
      expect(parseViewportParam(serializedViewport)).toEqual(viewport);
      expect(parseMapViewParam("list")).toBe("list");
    });

    it("restores normally when the version param matches the current version", () => {
      expect(parseBoundsParam(serializedBounds, String(MAP_STATE_VERSION))).toEqual(BUFFALO_BOUNDS);
      expect(parseViewportParam(serializedViewport, String(MAP_STATE_VERSION))).toEqual(viewport);
      expect(parseMapViewParam("list", String(MAP_STATE_VERSION))).toBe("list");
    });

    it("falls back to defaults (never crashes) when the version param is present but doesn't match", () => {
      const staleVersion = String(MAP_STATE_VERSION + 1);
      expect(parseBoundsParam(serializedBounds, staleVersion)).toBeNull();
      expect(parseViewportParam(serializedViewport, staleVersion)).toBeNull();
      expect(parseMapViewParam("list", staleVersion)).toBe("map");
    });
  });
});

describe("resolveSelectedMapItem: pure form of LiveMap's selected-pin lookup", () => {
  it("returns null when selectedId is null", () => {
    expect(resolveSelectedMapItem([mapItem({ id: "a" })], null)).toBeNull();
  });

  it("returns the matching item when its id is present in items", () => {
    const a = mapItem({ id: "a" });
    const b = mapItem({ id: "b" });
    expect(resolveSelectedMapItem([a, b], "b")).toEqual(b);
  });

  it("auto-recovers to null once the previously-selected item's id is no longer present in items (e.g. a layer switch, a bounds filter, or the item expiring off the list)", () => {
    const a = mapItem({ id: "a" });
    expect(resolveSelectedMapItem([a], "gone")).toBeNull();
    expect(resolveSelectedMapItem([], "a")).toBeNull();
  });
});
