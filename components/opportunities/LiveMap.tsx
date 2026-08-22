"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MapGL, {
  GeolocateControl,
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { BadgeCheck, Briefcase, Building2, CalendarDays, DollarSign, HandHeart, Loader2, LocateFixed, MapPin as MapPinIcon, TriangleAlert, Users2, Zap } from "lucide-react";
import { CITY_CENTER } from "@/lib/mock/data";
import { distanceInfo, formatDistanceLabel, type UserLocation } from "@/lib/geo";
import { formatCents, formatDateTime, relativeTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DetailSheet, type DetailSheetAction } from "@/components/ui/DetailSheet";
import { MAP_LAYER_EMPTY_COPY, type MapEntityType, type MapItem, type MapLayer } from "@/lib/map-selectors";
import {
  isValidViewport,
  resolveInitialCameraSource,
  resolveSelectedMapItem,
  roundBounds,
  roundViewport,
  shouldResetSearchBaseline,
  shouldShowSearchThisArea,
  type MapBounds,
  type MapViewport,
} from "@/lib/map-viewport";
import type { OpportunityType } from "@/lib/types";

/** Raw opportunity-type label for the detail sheet's type badge — kept
 * separate from MAP_LAYER_LABEL because that one buckets "project" under
 * "Gigs" for layer purposes; this preserves the exact underlying label. */
const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  gig: "Gig",
  job: "Job",
  project: "Project",
  volunteer: "Volunteer",
};

/**
 * Free, no-API-key vector basemap (OpenFreeMap — donation-supported, no rate
 * limit or key required: https://openfreemap.org). Suitable as a real,
 * usable placeholder for this environment. A real deployment should set
 * NEXT_PUBLIC_MAP_STYLE_URL to a provider with an SLA (MapTiler, Stadia
 * Maps, Mapbox, or a self-hosted style) — see .env.example.
 */
const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

const DEFAULT_ZOOM = 11.5;
const USER_LOCATION_ZOOM = 12.5;

/** Which color/icon a pin renders with. Keyed by entityType plus a special
 * "work_now" bucket — see displayBucketFor below for when each applies. */
const DISPLAY_META: Record<MapEntityType | "work_now", { icon: typeof Briefcase; hex: string }> = {
  gig: { icon: Briefcase, hex: "#4a2af5" },
  job: { icon: Briefcase, hex: "#2a6ff5" },
  volunteer: { icon: HandHeart, hex: "#22c55e" },
  event: { icon: CalendarDays, hex: "#f5b731" },
  business: { icon: Building2, hex: "#707a90" },
  work_now: { icon: Zap, hex: "#ef4444" },
};

const DISPLAY_BUCKETS: (MapEntityType | "work_now")[] = ["gig", "job", "volunteer", "event", "business", "work_now"];

/**
 * Which visual bucket a given (already layer-filtered) item renders under.
 * Viewing "Work Now" specifically: every visible item is by definition
 * isWorkNow already (mapItemMatchesLayer guaranteed that), so they all get
 * the shared urgent/red treatment regardless of whether they're a gig or a
 * job underneath — the point of that view is "what's urgent right now",
 * not "what category is it". Viewing anything else (including "all"):
 * each item keeps its own entityType's color, so a mixed "all" view still
 * visually distinguishes a gig pin from a job pin from an event pin.
 */
function displayBucketFor(item: MapItem, layer: MapLayer): MapEntityType | "work_now" {
  return layer === "work_now" ? "work_now" : item.entityType;
}

/** "City, State · 2.1 mi away" (real geolocation) or "City, State · ~2.1 mi
 * from city center" (fallback) — or just the distance label alone if
 * city/state are missing — for the pin detail sheet's location line.
 * Wording comes from lib/geo.ts's formatDistanceLabel (shared verbatim with
 * OpportunityCard's results-list distance so the two surfaces never
 * disagree about source). Every MapItem is guaranteed a real
 * latitude/longitude (the selectors that build MapItem[] never fabricate
 * one), so this never needs a "no distance" branch. */
function formatLocationWithDistance(item: MapItem, userLocation: UserLocation | null): string {
  const place = [item.city, item.state].filter(Boolean).join(", ");
  const milesLabel = formatDistanceLabel(distanceInfo(item.latitude, item.longitude, userLocation));
  return place ? `${place} · ${milesLabel}` : milesLabel;
}

function toFeatureCollection(items: MapItem[]): FeatureCollection<Point, { id: string }> {
  return {
    type: "FeatureCollection",
    features: items.map(
      (item): Feature<Point, { id: string }> => ({
        type: "Feature",
        id: item.id,
        geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
        properties: { id: item.id },
      }),
    ),
  };
}

function sourceId(bucket: string) {
  return `flow-${bucket}-source`;
}
function clusterLayerId(bucket: string) {
  return `flow-${bucket}-clusters`;
}
function clusterCountLayerId(bucket: string) {
  return `flow-${bucket}-cluster-count`;
}
function pointLayerId(bucket: string) {
  return `flow-${bucket}-point`;
}

/**
 * Renders map pins for `items` — the caller (LiveBrowser) has already
 * filtered `items` down to the currently-selected `layer` via
 * mapItemMatchesLayer, so this component has no filtering state of its
 * own: one layer selection, owned by the parent, drives both this and the
 * results list identically.
 */
export function LiveMap({
  items,
  layer,
  userLocation,
  searchBounds,
  viewport,
  onViewportChange,
  onSearchThisArea,
  isSearchPending = false,
  onResetFilters,
}: {
  items: MapItem[];
  layer: MapLayer;
  /** The browser's one-shot geolocation result, lifted up to LiveBrowser so
   * it's available whether or not the map is currently mounted (map/list
   * toggle) — see LiveBrowser.tsx. Null when unavailable/denied/not yet
   * resolved; every distance shown here falls back to city-center in that
   * case (see lib/geo.ts's distanceInfo). */
  userLocation: UserLocation | null;
  /** The currently-committed "Search this area" viewport, if any — restored
   * from the URL on first load (see LiveBrowser.tsx). Used once, on mount,
   * to fit the initial camera to it (and to skip the auto-fly-to-user-
   * location below, since an explicit prior search should win). Not used
   * for anything after mount — LiveMap tracks its own live camera bounds
   * internally from then on. */
  searchBounds: MapBounds | null;
  /** Map V2 Batch 5 — the map's last-known live camera (center/zoom/
   * bearing/pitch), restored from the URL on first load. Used once, on
   * mount, as the initial camera when there's no `searchBounds` to fit to
   * instead (see lib/map-viewport.ts's resolveInitialCameraSource for the
   * full precedence order) — and, like `searchBounds`, to skip the
   * auto-fly-to-user-location below. Not read again after mount; LiveMap
   * reports every subsequent settle back up via `onViewportChange` instead
   * of re-reading this prop. */
  viewport: MapViewport | null;
  /** Fired on every settled camera move (moveend) — user gestures and
   * programmatic settles (initial load, fitBounds, flyTo) alike — so the
   * parent always has the actual current camera to persist, regardless of
   * whether a "Search this area" is also committed. */
  onViewportChange: (viewport: MapViewport) => void;
  /** Fired when the user explicitly clicks "Search this area." Never called
   * automatically on pan/zoom. */
  onSearchThisArea: (bounds: MapBounds) => void;
  /** True while the parent is applying a just-committed search (a
   * near-instant client-side filter, but still worth a lightweight pending
   * affordance on the button itself). */
  isSearchPending?: boolean;
  /** Map V2 Batch 6 — optional callback for the in-map empty state's action
   * button ("Clear filters and search again"). LiveMap has no filter or
   * searchBounds state of its own to reset (both `layer` and `searchBounds`
   * are owned and lifted by LiveBrowser — see this component's other props),
   * so this only renders the button and reports the click; the caller
   * decides what "reset" actually means. Optional so LiveMap keeps working
   * exactly as before for any caller that hasn't wired this up. */
  onResetFilters?: () => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // Bumped to force MapGL to fully remount on "Try again" after a tile/map
  // load error — react-map-gl/maplibre has no supported "retry the same
  // instance" API, and a fresh instance is the reliable way to get a clean
  // onLoad/onError cycle again.
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canSearchThisArea, setCanSearchThisArea] = useState(false);
  // The viewport this batch compares future moves against — starts at the
  // restored search area (if any); otherwise gets established from the
  // first *programmatic* settle (initial load / the geolocation fly-to
  // below), never from a user gesture, so opening the map never shows
  // "Search this area" before the user has actually moved anything.
  const referenceBoundsRef = useRef<MapBounds | null>(searchBounds);
  const currentBoundsRef = useRef<MapBounds | null>(searchBounds);
  const hasFlownToUserRef = useRef(false);
  // Captured once, from the very first render's `viewport` prop (i.e.
  // whatever LiveBrowser parsed out of the URL on mount, before this
  // component has ever reported a settle back up) — never re-derived from
  // later, live-tracked viewport updates. Used only to decide whether the
  // geolocation fly-to below should defer to an explicitly *restored*
  // camera; if this read the live `viewport` prop instead, it would always
  // be true shortly after mount (this component reports every settle,
  // including the very first one), which would wrongly suppress the
  // fly-to even when nothing was ever restored from the URL.
  const hadRestoredViewportRef = useRef(isValidViewport(viewport));
  // Tracks the searchBounds value seen on the previous render, purely so
  // the effect below can detect an explicit clear (bounds -> null) instead
  // of reacting to mount or a fresh commit — see shouldResetSearchBaseline.
  const prevSearchBoundsRef = useRef<MapBounds | null>(searchBounds);

  const itemsByBucket = useMemo(() => {
    const map = new Map<MapEntityType | "work_now", MapItem[]>();
    for (const bucket of DISPLAY_BUCKETS) map.set(bucket, []);
    for (const item of items) map.get(displayBucketFor(item, layer))?.push(item);
    return map;
  }, [items, layer]);

  const selected = useMemo(() => resolveSelectedMapItem(items, selectedId), [items, selectedId]);

  // Selected-pin emphasis: a single-feature source/layer pair drawn after
  // (so on top of) every category source below — same coordinates, larger
  // radius, thicker white stroke, plus a soft category-colored ring. Static
  // (no animation), shape/size-based rather than color-only, so it reads at
  // a glance without competing with the base pin styling or clusters, which
  // this never touches (clusters aren't individually selectable).
  const selectedBucket = useMemo(() => (selected ? displayBucketFor(selected, layer) : null), [selected, layer]);
  const selectedFeatureCollection = useMemo(() => (selected ? toFeatureCollection([selected]) : null), [selected]);

  // Best-effort, non-blocking geolocation fly-to: the map renders at the
  // city center (or a restored search area / restored live viewport)
  // immediately regardless of outcome, then flies to the user's location
  // only once, only if `userLocation` becomes available (LiveBrowser's
  // one-shot getCurrentPosition call resolved) and only if there's no
  // explicit restored camera to respect instead — a prior committed
  // "Search this area" (checked live, since a commit can land while this
  // effect is still waiting on geolocation) or a URL-restored live
  // viewport (checked from the mount-time ref above — see its comment)
  // are both stronger signals than "recenter on me now." Denied/
  // unavailable geolocation never blocks or errors the map itself.
  useEffect(() => {
    if (!userLocation || hasFlownToUserRef.current) return;
    hasFlownToUserRef.current = true;
    if (searchBounds) return;
    if (hadRestoredViewportRef.current) return;
    mapRef.current?.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: USER_LOCATION_ZOOM,
      duration: 1200,
    });
    // searchBounds is intentionally excluded — this effect only ever
    // considers the value present at mount (captured once via the ref
    // guard above), matching the existing "one-shot" geolocation posture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  // Map V2 Batch 4: LiveBrowser's "Clear search area" restores the full
  // result set and drops the URL bounds param, but nothing previously told
  // this component's internal comparison baseline (referenceBoundsRef)
  // about it — the next "Search this area" visibility check could still be
  // judged against the old, now-cleared committed area instead of the
  // map's actual current viewport. shouldResetSearchBaseline isolates the
  // "was this an explicit clear?" decision (bounds -> null, not mount, not
  // a fresh commit) as a pure, unit-testable function; this effect supplies
  // the one piece that actually needs the live map instance — reading its
  // current bounds and writing them as the new baseline, exactly the same
  // shape of update handleLoad already does on first ready.
  useEffect(() => {
    const previous = prevSearchBoundsRef.current;
    prevSearchBoundsRef.current = searchBounds;
    if (!shouldResetSearchBaseline(previous, searchBounds)) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    const current = roundBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    referenceBoundsRef.current = current;
    currentBoundsRef.current = current;
    setCanSearchThisArea(false);
  }, [searchBounds]);

  // "Search this area": every settle of the camera (moveend fires for both
  // real user gestures and programmatic flyTo/fitBounds calls) records the
  // live bounds. A *programmatic* settle (evt.originalEvent is undefined —
  // maplibre/mapbox's own signal for "this wasn't a user gesture") resets
  // the reference baseline instead of ever triggering the control, so the
  // initial load and the geolocation fly-to above never surface "Search
  // this area" on their own. A genuine user pan/zoom/drag compares the new
  // bounds against that baseline and only shows the control once the
  // overlap has dropped meaningfully — never on every small nudge.
  const handleMoveEnd = useCallback(
    (evt: ViewStateChangeEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const b = map.getBounds();
      const current = roundBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
      currentBoundsRef.current = current;

      // Map V2 Batch 5 — report every settle (gesture or programmatic
      // alike) as the current live camera, independent of the
      // search-baseline logic below (which deliberately treats those two
      // cases differently for a different purpose — see the comments on
      // that logic). Persisting "wherever the camera actually is now" is
      // unconditional.
      const center = map.getCenter();
      onViewportChange(roundViewport({ lat: center.lat, lng: center.lng, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }));

      if (!evt.originalEvent) {
        referenceBoundsRef.current = current;
        setCanSearchThisArea(false);
        return;
      }
      if (referenceBoundsRef.current === null) {
        referenceBoundsRef.current = current;
        setCanSearchThisArea(false);
        return;
      }
      setCanSearchThisArea(shouldShowSearchThisArea(current, referenceBoundsRef.current));
    },
    [onViewportChange],
  );

  // "Try again" after a map/tile load error — no in-place retry API exists
  // on the underlying map instance, so this forces a full remount (see
  // mapInstanceKey above) and resets status back to "loading" so the usual
  // loading spinner reappears while the fresh instance connects.
  const handleRetry = useCallback(() => {
    setStatus("loading");
    setMapInstanceKey((k) => k + 1);
  }, []);

  const handleSearchThisArea = useCallback(() => {
    const current = currentBoundsRef.current;
    if (!current) return;
    // Deliberately does not move the camera — the user just moved it
    // themselves; re-centering now would undo their own action.
    referenceBoundsRef.current = current;
    setCanSearchThisArea(false);
    onSearchThisArea(current);
  }, [onSearchThisArea]);

  // Map V2 Batch 5 — the camera MapGL mounts with. Computed once, via a
  // lazy useState initializer (not useRef — react-hooks/refs correctly
  // flags reading a ref's .current during render, and `initialViewState`
  // is itself a one-shot prop from react-map-gl/maplibre's own
  // perspective, so recomputing this on every render would be pointless
  // and could disagree with what actually got used anyway). Follows
  // resolveInitialCameraSource's precedence: a restored
  // searchBounds always gets fit explicitly in handleLoad regardless of
  // what's set here (so "bounds" and "default" intentionally render the
  // same initial camera — the fitBounds call, at duration 0, replaces it
  // before the user ever sees it); only "viewport" changes what's rendered
  // here, restoring the last live camera when there's no explicit search
  // commit to fit to instead.
  const [initialViewState] = useState(() =>
    resolveInitialCameraSource(searchBounds, viewport) === "viewport" && viewport
      ? { longitude: viewport.lng, latitude: viewport.lat, zoom: viewport.zoom, bearing: viewport.bearing, pitch: viewport.pitch }
      : { longitude: CITY_CENTER.lng, latitude: CITY_CENTER.lat, zoom: DEFAULT_ZOOM },
  );

  const interactiveLayerIds = useMemo(
    () =>
      DISPLAY_BUCKETS.filter((b) => (itemsByBucket.get(b)?.length ?? 0) > 0).flatMap((b) => [
        clusterLayerId(b),
        pointLayerId(b),
      ]),
    [itemsByBucket],
  );

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) {
        setSelectedId(null);
        return;
      }
      const layerId = feature.layer?.id ?? "";
      const bucket = DISPLAY_BUCKETS.find((b) => layerId === clusterLayerId(b));

      if (bucket) {
        // Clicked a cluster bubble — zoom in toward its expansion zoom rather
        // than trying to pick an individual pin out of the cluster.
        const clusterId = feature.properties?.cluster_id;
        const map = mapRef.current?.getMap();
        const source = map?.getSource(sourceId(bucket)) as GeoJSONSource | undefined;
        if (!source || clusterId === undefined) return;
        source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            if (!map) return;
            const geometry = feature.geometry as Point;
            map.easeTo({ center: geometry.coordinates as [number, number], zoom: zoom ?? map.getZoom() + 2, duration: 500 });
          })
          .catch(() => {
            // Cluster expansion lookup failed — leave the viewport as-is rather than erroring the map.
          });
        return;
      }

      const id = feature.properties?.id as string | undefined;
      setSelectedId(id ?? null);
    },
    [],
  );

  const handleLoad = useCallback(() => {
    setStatus("ready");
    // Establish the reference baseline from the map's actual settled bounds
    // as soon as it's ready to interact with — unconditionally, even when
    // there's no restored search area to fit to. Without this, a user whose
    // geolocation is slow/denied/unavailable (very common) would have their
    // very first pan silently adopted as the new baseline by handleMoveEnd's
    // own null-guard, instead of ever being compared against one — the
    // opposite of "never from a user gesture" above. When a searchBounds
    // restore *does* run below, its own fitBounds call fires a later,
    // still-programmatic moveend that correctly supersedes this baseline.
    const map = mapRef.current?.getMap();
    if (map) {
      const b = map.getBounds();
      referenceBoundsRef.current = roundBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
      // Map V2 Batch 5 — report the initial settled camera too, so a
      // reload that never had a searchBounds to fit to (the common case)
      // still ends up with a persisted viewport reflecting where the map
      // actually opened (city center, or the restored viewport used as
      // initialViewState below) rather than staying null until the user's
      // first pan. If a searchBounds restore *does* run below, its
      // fitBounds call fires its own later moveend that reports (and
      // supersedes) this one with the post-fit camera — see handleMoveEnd.
      const center = map.getCenter();
      onViewportChange(roundViewport({ lat: center.lat, lng: center.lng, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }));
    }
    // Restore a URL-persisted search area on first load — an explicit
    // prior "Search this area" is a stronger signal than a restored live
    // viewport or the default city-wide view (see
    // lib/map-viewport.ts's resolveInitialCameraSource), and this
    // fitBounds call is itself the programmatic settle that establishes
    // the reference baseline (see handleMoveEnd). When there's no
    // searchBounds, the map already opened at the restored viewport (or
    // city center) via initialViewState below — nothing further to do
    // here in that case.
    if (searchBounds) {
      mapRef.current?.fitBounds(
        [
          [searchBounds.west, searchBounds.south],
          [searchBounds.east, searchBounds.north],
        ],
        { padding: 40, duration: 0 },
      );
    }
    // searchBounds is intentionally excluded — this only ever applies the
    // value present at mount (this is a one-shot restore, not a live sync).
    // onViewportChange is stable (see LiveBrowser.tsx's handleViewportChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onViewportChange]);

  return (
    <div className="space-y-3">
      <div className="flow-live-map-controls relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-ink-100 bg-flow-50 dark:border-ink-800 dark:bg-ink-900 sm:aspect-[16/9]">
        {/* maplibre-gl's own NavigationControl/GeolocateControl buttons render
            at a fixed 29x29px — short of the 44px (min-h-11/min-w-11) touch
            target used elsewhere in this file (e.g. "Search this area"
            below). Scoped to this component's own map container rather than
            a bare global .maplibregl-ctrl-group override, since this is the
            only maplibre map in the app today but a global override would
            still be an easy-to-miss footgun for a future one. Widening the
            hit area only (not the icon's background-size) keeps the icon's
            visual size unchanged — just more generous padding around it. */}
        <style>{`
          .flow-live-map-controls .maplibregl-ctrl-group button {
            width: 44px;
            height: 44px;
          }
        `}</style>
        {status === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <EmptyState
              icon={<TriangleAlert className="h-8 w-8" />}
              title="Map failed to load"
              body="The map tiles couldn't be reached. Your connection or the tile provider may be down — try again shortly."
              action={
                <Button type="button" size="md" variant="outline" onClick={handleRetry}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {status === "loading" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-flow-50 dark:bg-ink-900">
                <Loader2 className="h-6 w-6 animate-spin text-flow-500" />
              </div>
            )}
            {status === "ready" && canSearchThisArea && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
                <button
                  type="button"
                  onClick={handleSearchThisArea}
                  disabled={isSearchPending}
                  className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 shadow-card transition hover:bg-ink-50 disabled:opacity-70 dark:border-ink-700 dark:bg-ink-900 dark:text-white dark:hover:bg-ink-800"
                >
                  {isSearchPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  Search this area
                </button>
              </div>
            )}
            <MapGL
              key={mapInstanceKey}
              ref={mapRef}
              mapStyle={MAP_STYLE_URL}
              initialViewState={initialViewState}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={interactiveLayerIds}
              onClick={handleClick}
              onLoad={handleLoad}
              onMoveEnd={handleMoveEnd}
              onError={() => setStatus("error")}
              cursor="pointer"
            >
              <NavigationControl position="bottom-right" showCompass={false} />
              <GeolocateControl position="bottom-right" positionOptions={{ enableHighAccuracy: false }} trackUserLocation={false} />

              {DISPLAY_BUCKETS.map((bucket) => {
                const bucketItems = itemsByBucket.get(bucket) ?? [];
                if (bucketItems.length === 0) return null;
                const collection = toFeatureCollection(bucketItems);
                const color = DISPLAY_META[bucket].hex;
                return (
                  <Source key={bucket} id={sourceId(bucket)} type="geojson" data={collection} cluster clusterMaxZoom={14} clusterRadius={50}>
                    <Layer
                      id={clusterLayerId(bucket)}
                      type="circle"
                      filter={["has", "point_count"]}
                      paint={{
                        "circle-color": color,
                        "circle-opacity": 0.85,
                        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26],
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                      }}
                    />
                    <Layer
                      id={clusterCountLayerId(bucket)}
                      type="symbol"
                      filter={["has", "point_count"]}
                      layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12, "text-font": ["Noto Sans Bold"] }}
                      paint={{ "text-color": "#ffffff" }}
                    />
                    <Layer
                      id={pointLayerId(bucket)}
                      type="circle"
                      filter={["!", ["has", "point_count"]]}
                      paint={{
                        "circle-color": color,
                        "circle-radius": 8,
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                      }}
                    />
                  </Source>
                );
              })}

              {selected && selectedFeatureCollection && selectedBucket && (
                <Source id="flow-selected-source" type="geojson" data={selectedFeatureCollection}>
                  <Layer
                    id="flow-selected-ring"
                    type="circle"
                    paint={{
                      "circle-radius": 16,
                      "circle-color": "transparent",
                      "circle-stroke-width": 2,
                      "circle-stroke-color": DISPLAY_META[selectedBucket].hex,
                      "circle-stroke-opacity": 0.55,
                    }}
                  />
                  <Layer
                    id="flow-selected-point"
                    type="circle"
                    paint={{
                      "circle-radius": 11,
                      "circle-color": DISPLAY_META[selectedBucket].hex,
                      "circle-stroke-width": 3,
                      "circle-stroke-color": "#ffffff",
                    }}
                  />
                </Source>
              )}
            </MapGL>
          </>
        )}

        {status === "ready" && items.length === 0 && (
          // z-10 (not the default z-auto): without this, the "Search this
          // area" pill above (z-20) would still correctly paint on top, but
          // this overlay could otherwise end up ambiguously stacked relative
          // to future z-indexed additions to the map — matching the loading
          // spinner's own z-10 keeps both of this container's non-map
          // overlays on one consistent, explicit layer, one below the pill.
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="pointer-events-auto">
              <EmptyState
                title={MAP_LAYER_EMPTY_COPY[layer]}
                action={
                  onResetFilters ? (
                    <Button type="button" size="md" variant="outline" onClick={onResetFilters}>
                      Clear filters and search again
                    </Button>
                  ) : undefined
                }
              />
            </div>
          </div>
        )}
      </div>

      {selected &&
        (() => {
          const bucket = displayBucketFor(selected, layer);
          const displayMeta = DISPLAY_META[bucket];
          const Icon = displayMeta.icon;
          const locationLabel = formatLocationWithDistance(selected, userLocation);

          let subtitle: ReactNode;
          let action: DetailSheetAction;
          const tag: ReactNode[] = [];
          const meta: ReactNode[] = [];

          if (selected.entityType === "business") {
            // Business — name (title), verified (tag), industry (subtitle),
            // public-safe location, member perk. "View organization" is the
            // only action; there's no separate business flow to distinguish
            // a second CTA from.
            if (selected.verified) tag.push(<Badge key="verified" tone="verified">Verified</Badge>);
            subtitle = selected.industry ?? undefined;
            action = { label: "View organization", href: selected.href };
            if (locationLabel) {
              meta.push(
                <span key="loc" className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" /> {locationLabel}
                </span>,
              );
            }
            if (selected.memberPerk) {
              meta.push(
                <span key="perk" className="font-medium text-flow-600 dark:text-flow-400">
                  {selected.memberPerk}
                </span>,
              );
            }
          } else if (selected.entityType === "event") {
            // Event — title, host (subtitle), date/time, location, capacity.
            // A real registration flow (RegisterButton/RealRegisterButton)
            // needs auth state and mutation logic this map component
            // shouldn't duplicate, so "View & Register" routes straight to
            // the event detail page — one strong CTA, not a second button
            // that would resolve to the exact same URL with no distinct
            // behavior.
            if (selected.verified) tag.push(<Badge key="verified" tone="verified">Verified</Badge>);
            subtitle = selected.organizationName ?? undefined;
            action = { label: "View & Register", href: selected.href };
            if (selected.starts_at) {
              meta.push(
                <span key="time" className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {formatDateTime(selected.starts_at)}
                </span>,
              );
            }
            if (locationLabel) {
              meta.push(
                <span key="loc" className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" /> {locationLabel}
                </span>,
              );
            }
            if (selected.capacity != null && selected.registered != null) {
              const spotsLeft = selected.capacity - selected.registered;
              meta.push(
                <span key="attend" className="flex items-center gap-1">
                  <Users2 className="h-3 w-3" /> {selected.registered} going{spotsLeft > 0 ? ` · ${spotsLeft} spots left` : ""}
                </span>,
              );
            }
          } else {
            // Opportunity (gig/job/volunteer) — title, organization
            // (subtitle, with inline verification so it never has to
            // compete with the Urgent badge for the single old tag slot),
            // type + Work Now status badges, compensation, timing,
            // location, positions remaining. Same one-strong-CTA reasoning
            // as events: "View & Apply" routes to the detail page where the
            // real ApplyButton/RealApplyButton flow lives, with no second
            // button pointing at the same URL.
            tag.push(
              <Badge key="type" tone="flow">
                {OPPORTUNITY_TYPE_LABEL[selected.opportunityType ?? selected.entityType]}
              </Badge>,
            );
            if (selected.isWorkNow) tag.push(<Badge key="urgent" tone="urgent">Urgent</Badge>);
            subtitle = selected.organizationName ? (
              <>
                {selected.organizationName}
                {selected.verified && <BadgeCheck className="ml-1 inline h-3 w-3 align-text-bottom text-flow-600" />}
              </>
            ) : undefined;
            action = { label: "View & Apply", href: selected.href };
            meta.push(
              <span key="pay" className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> {selected.payCents ? `${formatCents(selected.payCents)}/hr` : "Volunteer"}
              </span>,
            );
            if (selected.starts_at) {
              meta.push(<span key="time">{relativeTime(selected.starts_at)}</span>);
            }
            if (locationLabel) {
              meta.push(
                <span key="loc" className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" /> {locationLabel}
                </span>,
              );
            }
            if (selected.slots != null && selected.slotsFilled != null) {
              const spotsLeft = selected.slots - selected.slotsFilled;
              meta.push(
                <span key="spots" className="flex items-center gap-1">
                  <Users2 className="h-3 w-3" /> {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left` : "Full"}
                </span>,
              );
            }
          }

          return (
            <DetailSheet
              open={!!selected}
              onClose={() => setSelectedId(null)}
              icon={<Icon className="h-4 w-4" />}
              tag={tag.length > 0 ? tag : undefined}
              title={selected.title}
              subtitle={subtitle}
              meta={meta}
              action={action}
              desktopPosition="bottom-left"
            />
          );
        })()}
    </div>
  );
}
