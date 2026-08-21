// Map V2 Batch 3 — viewport (bounds) state: "Search this area" detection,
// client-side bounds filtering, and URL persistence for the map's layer +
// search-area state. Pure, dependency-free (no Next.js/Supabase/maplibre
// imports), matching lib/map-selectors.ts's own convention — see
// tests/unit/map-viewport.test.ts.
import { MAP_LAYERS, effectiveOrganizationCoordinates, isPublicMapEligible, type MapItem, type MapLayer } from "@/lib/map-selectors";
import type { MockEvent, MockOpportunity, MockOrganization } from "@/lib/types";

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// ~11m at this latitude — plenty of precision for "re-scope the results to
// roughly here," coarse enough to keep the URL short and stable rather than
// churning on every sub-meter camera adjustment.
const BOUNDS_DECIMALS = 4;

export function isValidBounds(b: MapBounds | null | undefined): b is MapBounds {
  if (!b) return false;
  const { west, south, east, north } = b;
  if (![west, south, east, north].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (west < -180 || west > 180 || east < -180 || east > 180) return false;
  if (south < -90 || south > 90 || north < -90 || north > 90) return false;
  if (west >= east || south >= north) return false;
  return true;
}

export function isWithinBounds(lat: number, lng: number, bounds: MapBounds): boolean {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

/** Intersection-over-union of two bounds: 0 (no overlap) to 1 (identical).
 * One metric that captures both panning and zooming, used to decide
 * whether the map has moved "meaningfully" away from the last-searched
 * area — see shouldShowSearchThisArea. */
export function boundsOverlapRatio(a: MapBounds, b: MapBounds): number {
  if (!isValidBounds(a) || !isValidBounds(b)) return 0;
  const ix1 = Math.max(a.west, b.west);
  const ix2 = Math.min(a.east, b.east);
  const iy1 = Math.max(a.south, b.south);
  const iy2 = Math.min(a.north, b.north);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  if (intersection <= 0) return 0;
  const areaA = (a.east - a.west) * (a.north - a.south);
  const areaB = (b.east - b.west) * (b.north - b.south);
  const union = areaA + areaB - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

/** Below this overlap ratio, the current viewport is considered
 * "meaningfully different" from the last-searched area. Deliberately not
 * near 0 or 1 — a small nudge (e.g. a slight pan that still shows >50% of
 * the same area) should not surface the control, but a real pan/zoom away
 * should. */
export const SEARCH_AREA_OVERLAP_THRESHOLD = 0.5;

/** `lastSearched === null` means nothing has been explicitly searched yet
 * (the initial city-wide fetch already covers everything), so there is
 * nothing meaningful to re-scope to yet — never show the control. */
export function shouldShowSearchThisArea(current: MapBounds, lastSearched: MapBounds | null): boolean {
  if (!lastSearched) return false;
  return boundsOverlapRatio(current, lastSearched) < SEARCH_AREA_OVERLAP_THRESHOLD;
}

function round(n: number) {
  return Math.round(n * 10 ** BOUNDS_DECIMALS) / 10 ** BOUNDS_DECIMALS;
}

export function roundBounds(b: MapBounds): MapBounds {
  return { west: round(b.west), south: round(b.south), east: round(b.east), north: round(b.north) };
}

/**
 * Map V2 Batch 4 — pure decision for LiveMap's "Clear Search Area" baseline
 * reset: given the previous and next `searchBounds` prop values on a given
 * render, should the comparison baseline ("Search this area" is judged
 * against this) be re-established from the map's live current viewport?
 *
 * True only for the explicit clear transition — a real, previously-set
 * bounds box going to `null` (LiveBrowser's `clearSearchArea`). Deliberately
 * false for:
 * - mount (`previous === next`, including the common `null === null` case
 *   and the restored-URL-bounds case) — handleLoad already establishes the
 *   baseline on first ready, this must not duplicate or race that.
 * - a commit or re-commit (`next !== null`) — handleSearchThisArea already
 *   sets the baseline itself at the moment of that click; this effect has
 *   nothing to add there.
 *
 * Extracted as a pure function (rather than inlined in the effect) so the
 * decision itself is unit-testable without a component-rendering harness —
 * see tests/unit/map-viewport.test.ts. The actual side effect (reading the
 * map's live bounds via mapRef and writing referenceBoundsRef) still lives
 * in LiveMap.tsx, since it depends on the maplibre instance.
 */
export function shouldResetSearchBaseline(previous: MapBounds | null, next: MapBounds | null): boolean {
  return previous !== null && next === null;
}

// ── URL persistence ──────────────────────────────────────────────────────
// Map V2's URL state is deliberately small and stable: the active layer and
// the last explicitly-searched viewport. This is never raw device
// geolocation — components/opportunities/LiveBrowser.tsx's one-shot
// getCurrentPosition result stays entirely in client state, never in the
// URL, never sent to the server, matching the existing geolocation posture
// documented in docs/MAP_V2_PLAN.md. A committed "Search this area" click
// is a different thing: an explicit, user-initiated action over a map
// viewport (not a precise personal coordinate) — encoding that in the URL
// is the whole point of the feature (shareable, reload-safe search state),
// not a privacy regression.

export const MAP_LAYER_PARAM = "layer";
export const MAP_BOUNDS_PARAM = "b";

/** Invalid/unrecognized values fail safe to "all" — a malformed or stale
 * URL param must never crash or leave the map showing nothing. */
export function parseMapLayerParam(value: string | null | undefined): MapLayer {
  if (value && (MAP_LAYERS as string[]).includes(value)) return value as MapLayer;
  return "all";
}

/** Invalid/malformed values fail safe to `null` (no viewport filter — the
 * full city-wide fetch), never a crash or a bogus/partial bounds box. */
export function parseBoundsParam(value: string | null | undefined): MapBounds | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts;
  const bounds: MapBounds = { west, south, east, north };
  return isValidBounds(bounds) ? bounds : null;
}

export function serializeBoundsParam(bounds: MapBounds): string {
  const r = roundBounds(bounds);
  return `${r.west},${r.south},${r.east},${r.north}`;
}

/** Builds the query string for /live given the current layer + search
 * bounds. "all" and null bounds are both the default and are omitted
 * entirely, so the common case (no filter, no search-area) keeps the URL
 * empty rather than always appending params. */
export function buildLiveMapSearchParams(layer: MapLayer, bounds: MapBounds | null): URLSearchParams {
  const params = new URLSearchParams();
  if (layer !== "all") params.set(MAP_LAYER_PARAM, layer);
  if (bounds && isValidBounds(bounds)) params.set(MAP_BOUNDS_PARAM, serializeBoundsParam(bounds));
  return params;
}

// ── Bounds filtering ────────────────────────────────────────────────────
// Mirrors lib/map-selectors.ts's result-list philosophy: a viewport filter
// only ever narrows down items that actually have a coordinate. An item
// with no coordinate (a remote opportunity, an organization with no
// geocoding yet) was never viewport-mappable to begin with, so a spatial
// filter doesn't apply to it — it stays visible in the list exactly as it
// did before Batch 3, bounds filter or not. `bounds === null` (no search
// committed yet) is a no-op passthrough on every function below.

export function filterMapItemsByBounds(items: MapItem[], bounds: MapBounds | null): MapItem[] {
  if (!bounds) return items;
  return items.filter((item) => isWithinBounds(item.latitude, item.longitude, bounds));
}

export function filterOpportunitiesByBounds(opportunities: MockOpportunity[], bounds: MapBounds | null): MockOpportunity[] {
  if (!bounds) return opportunities;
  return opportunities.filter((o) => o.lat === null || o.lng === null || isWithinBounds(o.lat, o.lng, bounds));
}

export function filterEventsByBounds(events: MockEvent[], bounds: MapBounds | null): MockEvent[] {
  if (!bounds) return events;
  return events.filter((e) => e.lat === null || e.lng === null || isWithinBounds(e.lat, e.lng, bounds));
}

/**
 * Organization bounds filtering re-derives the same effective (privacy-
 * redacted) point effectiveOrganizationCoordinates uses for the map pin
 * itself, and re-applies the same hidden/remote eligibility gate inside
 * that helper — so this can never leak a hidden/remote organization into
 * the list, even if called directly without the layer filter having
 * already excluded it upstream, and even when `bounds` is null. An
 * organization with no eligible coordinate is left in (never excluded by
 * viewport), same reasoning as opportunities/events above.
 *
 * The eligibility check runs unconditionally, before the bounds check, and
 * is NOT short-circuited by `bounds === null` — that early return only
 * ever skipped the *spatial* comparison in earlier versions of this
 * function; it must never skip the privacy gate too. This is
 * defense-in-depth only: the real enforcement boundary for organization
 * location privacy is the server-side `organizations_public` view (see
 * supabase/migrations/20260820163442_organization_location_privacy.sql),
 * which this function does not and cannot weaken.
 */
export function filterOrganizationsByBounds(organizations: MockOrganization[], bounds: MapBounds | null): MockOrganization[] {
  return organizations.filter((o) => {
    // Eligibility (hidden/remote) is checked unconditionally here, not just
    // via effectiveOrganizationCoordinates returning null — a hidden/remote
    // org must never pass through this function even if it's called in
    // isolation, before whatever layer filter would otherwise have removed
    // it, and even if bounds is null (no search committed yet). "No usable
    // coordinate" (eligible but ungeocoded) is a distinct case from
    // "ineligible" — only the former is kept unconditionally.
    if (!isPublicMapEligible(o)) return false;
    if (!bounds) return true;
    const coords = effectiveOrganizationCoordinates(o);
    if (!coords) return true;
    return isWithinBounds(coords.lat, coords.lng, bounds);
  });
}
