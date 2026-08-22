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

// ── State versioning (Map V2 Batch 6) ───────────────────────────────────
// A tiny marker, not a migration framework: bump MAP_STATE_VERSION only if
// a future change makes an *existing* bounds/viewport/view param value mean
// something different (not just "a new field was added" — buildLiveMapSearchParams
// already handles that case safely on its own, since every param here is
// independently optional). When that happens, a URL stamped with an older
// (or, defensively, any non-matching) version number has its persisted
// bounds/viewport/view ignored in favor of defaults rather than being
// mis-parsed under the new meaning — see isCurrentMapStateVersion below.
export const MAP_STATE_VERSION = 1;
export const MAP_VERSION_PARAM = "v";

/**
 * Should a URL's persisted bounds/viewport/view be trusted? A *missing*
 * version param (every /live URL from Batches 3-5, before this marker
 * existed) is treated as trustworthy — those params' meaning hasn't
 * changed, so there is nothing to distrust yet, and treating "no marker" as
 * untrusted would silently break every already-shared/bookmarked Map V2 URL
 * the day this ships. Only an explicit, non-matching value (a URL stamped
 * under a later, incompatible version) is untrusted. Never throws.
 */
export function isCurrentMapStateVersion(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return true;
  return value === String(MAP_STATE_VERSION);
}

/** Invalid/unrecognized values fail safe to "all" — a malformed or stale
 * URL param must never crash or leave the map showing nothing. */
export function parseMapLayerParam(value: string | null | undefined): MapLayer {
  if (value && (MAP_LAYERS as string[]).includes(value)) return value as MapLayer;
  return "all";
}

/** Invalid/malformed values fail safe to `null` (no viewport filter — the
 * full city-wide fetch), never a crash or a bogus/partial bounds box.
 * `version` is optional (see isCurrentMapStateVersion) — omitting it keeps
 * every existing call site's behavior exactly as before; a caller that
 * passes the URL's `v` param gets the version guard applied too. */
export function parseBoundsParam(value: string | null | undefined, version?: string | null): MapBounds | null {
  if (!isCurrentMapStateVersion(version)) return null;
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

// ── Map V2 Batch 5 — view mode + live camera persistence ───────────────
// Two more small, shareable pieces of state, following exactly the
// MAP_*_PARAM / parse*/build* / fail-safe conventions above: which of
// map/list the user was looking at, and the map's actual camera position
// (center + zoom, plus bearing/pitch since maplibre's default drag-rotate
// and touch-pitch handlers are never disabled here, so a user *can* rotate
// or tilt the map with a gesture even though there's no dedicated compass/
// tilt UI — losing that silently on reload would be a real regression, not
// a simplification). Like the committed search bounds, this is a coarse,
// non-identifying "what part of the public map was open" position — never
// the raw device geolocation coordinate, which stays exactly as
// unpersisted as it already was (see LiveBrowser.tsx's userLocation and
// the header comment above).

export const MAP_VIEW_PARAM = "view";
export const MAP_VIEWPORT_PARAM = "vp";

export const MAP_VIEW_MODES = ["map", "list"] as const;
export type MapViewMode = (typeof MAP_VIEW_MODES)[number];

/** Invalid/unrecognized values fail safe to "map" — same reasoning as
 * parseMapLayerParam: a malformed or stale param must never crash or leave
 * the page rendering neither view. `version` is optional — see
 * parseBoundsParam's doc comment for why omitting it is safe. */
export function parseMapViewParam(value: string | null | undefined, version?: string | null): MapViewMode {
  if (!isCurrentMapStateVersion(version)) return "map";
  if (value && (MAP_VIEW_MODES as readonly string[]).includes(value)) return value as MapViewMode;
  return "map";
}

export interface MapViewport {
  lat: number;
  lng: number;
  zoom: number;
  /** Degrees, maplibre's own normalized range. Always 0 unless the user
   * explicitly rotated the map (right-click-drag / two-finger twist) —
   * there is no compass/rotate control in this UI. */
  bearing: number;
  /** Degrees. Always 0 unless the user explicitly tilted the map
   * (ctrl-drag / two-finger drag) — there is no tilt control in this UI. */
  pitch: number;
}

// maplibre-gl's own defaults (no custom minZoom/maxZoom/maxPitch configured
// anywhere in LiveMap) — bounds chosen to reject "absurdly high/negative"
// values, not to be a tight product-specific range.
const VIEWPORT_ZOOM_MIN = 0;
const VIEWPORT_ZOOM_MAX = 22;
const VIEWPORT_PITCH_MIN = 0;
const VIEWPORT_PITCH_MAX = 85;
const VIEWPORT_BEARING_MIN = -180;
const VIEWPORT_BEARING_MAX = 180;

export function isValidViewport(v: MapViewport | null | undefined): v is MapViewport {
  if (!v) return false;
  const { lat, lng, zoom, bearing, pitch } = v;
  if (![lat, lng, zoom, bearing, pitch].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (zoom < VIEWPORT_ZOOM_MIN || zoom > VIEWPORT_ZOOM_MAX) return false;
  if (bearing < VIEWPORT_BEARING_MIN || bearing > VIEWPORT_BEARING_MAX) return false;
  if (pitch < VIEWPORT_PITCH_MIN || pitch > VIEWPORT_PITCH_MAX) return false;
  return true;
}

// Coordinates share BOUNDS_DECIMALS' ~11m precision/reasoning. Zoom/bearing/
// pitch get coarser rounding than that — a fraction of a zoom level or a
// degree of rotation is never perceptible enough to be worth extra URL
// characters, and rounding this way keeps repeated small camera nudges from
// endlessly churning the URL.
const VIEWPORT_ZOOM_DECIMALS = 2;
const VIEWPORT_ANGLE_DECIMALS = 1;

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function roundViewport(v: MapViewport): MapViewport {
  return {
    lat: roundTo(v.lat, BOUNDS_DECIMALS),
    lng: roundTo(v.lng, BOUNDS_DECIMALS),
    zoom: roundTo(v.zoom, VIEWPORT_ZOOM_DECIMALS),
    bearing: roundTo(v.bearing, VIEWPORT_ANGLE_DECIMALS),
    pitch: roundTo(v.pitch, VIEWPORT_ANGLE_DECIMALS),
  };
}

/** "lat,lng,zoom" in the overwhelmingly common case (no rotate/tilt — this
 * UI has no control for either); bearing/pitch are only appended when
 * actually non-zero, so the default camera shape never carries two extra,
 * always-0 fields around in every /live URL. */
export function serializeViewportParam(viewport: MapViewport): string {
  const r = roundViewport(viewport);
  const base = `${r.lat},${r.lng},${r.zoom}`;
  if (r.bearing === 0 && r.pitch === 0) return base;
  return `${base},${r.bearing},${r.pitch}`;
}

/** Invalid/malformed values fail safe to `null` (no restored camera — the
 * default city center applies), never a crash, never a partial/NaN
 * viewport reaching the map. Accepts both the 3-field (no rotate/tilt) and
 * 5-field (rotate and/or tilt present) shapes serializeViewportParam
 * produces; a missing bearing/pitch defaults to 0 rather than failing.
 * `version` is optional — see parseBoundsParam's doc comment for why
 * omitting it is safe. */
export function parseViewportParam(value: string | null | undefined, version?: string | null): MapViewport | null {
  if (!isCurrentMapStateVersion(version)) return null;
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 3 && parts.length !== 5) return null;
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng, zoom, bearing = 0, pitch = 0] = parts;
  const viewport: MapViewport = { lat, lng, zoom, bearing, pitch };
  return isValidViewport(viewport) ? viewport : null;
}

/**
 * Which signal should win for the map's *initial* camera position on
 * mount/reload — the precedence order this batch establishes:
 *
 * 1. A restored committed "Search this area" (`bounds`) — an explicit,
 *    named search commit is the strongest signal a user has given about
 *    where they want to be, same reasoning Batch 3 already used to make it
 *    outrank the geolocation fly-to (see LiveMap.tsx's handleLoad/effect).
 * 2. A restored live viewport (`viewport`) — no explicit "search" was
 *    committed, but the user's last camera position (from ordinary pan/
 *    zoom) is still a real, specific choice, and a closer match to "back
 *    where I left off" than recentering on their current physical location
 *    would be. This is also why the one-shot geolocation fly-to
 *    (LiveMap.tsx) skips itself whenever this resolves to "viewport", not
 *    just "bounds" — flying away from a position the user explicitly
 *    panned/zoomed to on every reload would be more surprising than
 *    helpful, the same reasoning that already applied to `bounds`.
 * 3. Neither present — falls through to LiveMap's own default (city
 *    center), and the geolocation fly-to is free to run once `userLocation`
 *    resolves, exactly as before this batch.
 *
 * When both `bounds` and `viewport` are present (e.g. the user searched an
 * area, then panned further without re-committing), `bounds` wins — the
 * explicit commit is still the stronger signal, and the live viewport
 * continues to be tracked and persisted underneath it so that if the user
 * later clears the search area, the most recently viewed camera position
 * (not the city center) becomes the new starting point.
 */
export type InitialCameraSource = "bounds" | "viewport" | "default";

export function resolveInitialCameraSource(bounds: MapBounds | null, viewport: MapViewport | null): InitialCameraSource {
  if (isValidBounds(bounds)) return "bounds";
  if (isValidViewport(viewport)) return "viewport";
  return "default";
}

export interface LiveMapUrlState {
  layer: MapLayer;
  bounds: MapBounds | null;
  view: MapViewMode;
  viewport: MapViewport | null;
}

/** Builds the query string for /live given the current layer, search
 * bounds, view mode, and live camera. Every default value ("all" layer, no
 * bounds, "map" view, no viewport) is omitted entirely, so the common case
 * (nothing customized yet) keeps the URL empty rather than always
 * appending params. The `v` version marker (see MAP_STATE_VERSION above)
 * follows the same rule: it's only worth stamping a URL that actually
 * carries some persisted state to be versioned, so it's appended last, only
 * when at least one of the other params was — never on its own. */
export function buildLiveMapSearchParams(state: LiveMapUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.layer !== "all") params.set(MAP_LAYER_PARAM, state.layer);
  if (state.bounds && isValidBounds(state.bounds)) params.set(MAP_BOUNDS_PARAM, serializeBoundsParam(state.bounds));
  if (state.view !== "map") params.set(MAP_VIEW_PARAM, state.view);
  if (state.viewport && isValidViewport(state.viewport)) params.set(MAP_VIEWPORT_PARAM, serializeViewportParam(state.viewport));
  if (params.toString().length > 0) params.set(MAP_VERSION_PARAM, String(MAP_STATE_VERSION));
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
// ── Selected-pin lookup ──────────────────────────────────────────────────

/**
 * Map V2 Batch 6 — pure form of LiveMap.tsx's `selected` derivation
 * (`items.find((i) => i.id === selectedId) ?? null`), extracted so its
 * "selection survives across a rerender until its underlying item actually
 * disappears from `items`" behavior — e.g. a layer switch, a bounds filter,
 * or an item expiring off the list — is unit-testable without a
 * component-rendering harness (this repo doesn't have one set up; see
 * tests/unit/map-viewport.test.ts). Not new behavior: LiveMap.tsx's
 * `selected` useMemo calls this instead of duplicating the lookup inline,
 * so the two can never drift.
 */
export function resolveSelectedMapItem(items: MapItem[], selectedId: string | null): MapItem | null {
  if (!selectedId) return null;
  return items.find((i) => i.id === selectedId) ?? null;
}

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
