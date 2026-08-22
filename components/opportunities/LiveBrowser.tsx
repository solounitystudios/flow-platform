"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { List, Map as MapIcon, X } from "lucide-react";
import { LiveMap } from "@/components/opportunities/LiveMap";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EventCard } from "@/components/events/EventCard";
import { OrganizationCard } from "@/components/social/OrganizationCard";
import { Button } from "@/components/ui/Button";
import { ChipToggleGroup, type ChipOption } from "@/components/ui/ChipToggleGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { distanceInfo, type DistanceInfo, type UserLocation } from "@/lib/geo";
import type { MockEvent, MockOpportunity, MockOrganization } from "@/lib/types";
// Type-only import — erased at compile time, so this never pulls
// lib/data/discover.ts's server-only Supabase client into the client bundle.
import {
  MAP_LAYERS,
  MAP_LAYER_EMPTY_COPY,
  MAP_LAYER_LABEL,
  filterEventsForLayer,
  filterOpportunitiesForLayer,
  filterOrganizationsForLayer,
  mapItemMatchesLayer,
  type MapItem,
  type MapLayer,
} from "@/lib/map-selectors";
import {
  MAP_BOUNDS_PARAM,
  MAP_LAYER_PARAM,
  MAP_VERSION_PARAM,
  MAP_VIEW_PARAM,
  MAP_VIEWPORT_PARAM,
  buildLiveMapSearchParams,
  filterEventsByBounds,
  filterMapItemsByBounds,
  filterOpportunitiesByBounds,
  filterOrganizationsByBounds,
  parseBoundsParam,
  parseMapLayerParam,
  parseMapViewParam,
  parseViewportParam,
  type MapBounds,
  type MapViewMode,
  type MapViewport,
} from "@/lib/map-viewport";

/** True user-relative DistanceInfo (miles + source: "user") for an
 * opportunity card, or `null` when it can't/shouldn't be overridden — no
 * user location yet, remote (no single point to measure to), or no
 * coordinates at all. `null` tells OpportunityCard to keep its existing
 * server-computed (city-center) `distance_mi`, tagged `source:
 * "city-center"` — never a fabricated "real" distance (Map V2 Batch 4:
 * carries `source` alongside the number so the card can render the same
 * source-aware wording LiveMap's pin detail sheet uses). */
function opportunityDistanceOverride(o: MockOpportunity, userLocation: UserLocation | null): DistanceInfo | null {
  if (!userLocation || o.is_remote || o.lat === null || o.lng === null) return null;
  return distanceInfo(o.lat, o.lng, userLocation);
}

/**
 * Owns the ONE selected Map V2 layer plus the committed "Search this area"
 * viewport, and derives everything downstream from them — LiveMap's pins
 * and this component's own result cards are both filtered through the
 * exact same lib/map-selectors.ts / lib/map-viewport.ts functions, so they
 * can never disagree about what's currently visible. There is no second,
 * competing filter/layer system anywhere in this tree.
 *
 * Layer, search-area, map/list view mode, and the map's live camera
 * (Map V2 Batch 5) all persist to the URL (see lib/map-viewport.ts) so a
 * reload or a shared link restores the same view — never the raw device
 * geolocation result, which stays in-memory only (see userLocation below)
 * and is never written into the URL or any other storage mechanism.
 */
export function LiveBrowser({
  opportunities,
  events,
  organizations,
  mapItems,
}: {
  opportunities: MockOpportunity[];
  events: MockEvent[];
  organizations: MockOrganization[];
  mapItems: MapItem[];
}) {
  const searchParams = useSearchParams();
  // Map V2 Batch 6 — the `v` state-version marker, read once and passed to
  // every version-guarded parser below so a URL stamped under some future,
  // incompatible Map V3 state shape falls back to safe defaults instead of
  // being mis-parsed under today's meaning (see lib/map-viewport.ts's
  // isCurrentMapStateVersion). A missing marker (every pre-Batch-6 URL) is
  // still trusted — see that function's own doc comment.
  const v = searchParams.get(MAP_VERSION_PARAM);
  const [layer, setLayerState] = useState<MapLayer>(() => parseMapLayerParam(searchParams.get(MAP_LAYER_PARAM)));
  const [searchBounds, setSearchBoundsState] = useState<MapBounds | null>(() => parseBoundsParam(searchParams.get(MAP_BOUNDS_PARAM), v));
  const [view, setView] = useState<MapViewMode>(() => parseMapViewParam(searchParams.get(MAP_VIEW_PARAM), v));
  // Map V2 Batch 5 — the map's actual live camera (center/zoom, plus
  // bearing/pitch if the user ever rotated/tilted it), restored from the
  // URL on mount and kept in sync as LiveMap reports settled moves. This is
  // a coarse, shareable "what part of the public map was open" position —
  // never the raw device geolocation coordinate below, which stays
  // in-memory only. See lib/map-viewport.ts's resolveInitialCameraSource
  // for the full precedence order against searchBounds/geolocation.
  const [viewport, setViewport] = useState<MapViewport | null>(() => parseViewportParam(searchParams.get(MAP_VIEWPORT_PARAM), v));
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isPending, startTransition] = useTransition();

  // One-shot, non-blocking, never-persisted geolocation — owned here (not
  // LiveMap) so it's available even when the map isn't currently mounted
  // (list view) and so this component's list distances and LiveMap's pin
  // sheet distance always agree, using the exact same source. Denied,
  // unavailable, or timed out silently leaves userLocation null — every
  // distance display falls back to the existing city-center basis (see
  // lib/geo.ts's distanceInfo). Never sent anywhere, never in the URL.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {
        // Denied, unavailable, or timed out — leave userLocation null.
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  // Keep the URL in sync via a shallow history update (no server
  // round-trip, no full-page navigation, no extra back-stack entry per
  // change — deliberately replaceState, not pushState, for all four
  // pieces of state here, matching the existing layer/bounds behavior:
  // back/forward should return the user to wherever they were before
  // /live, not step through intermediate map camera positions) — see
  // lib/map-viewport.ts's header comment for exactly what is/isn't
  // persisted and why.
  useEffect(() => {
    const qs = buildLiveMapSearchParams({ layer, bounds: searchBounds, view, viewport }).toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [layer, searchBounds, view, viewport]);

  const setLayer = useCallback((next: MapLayer) => {
    startTransition(() => setLayerState(next));
  }, []);

  // Fired only by LiveMap's explicit "Search this area" button click —
  // never automatically on pan/zoom. Deliberately does not touch the map
  // camera itself (LiveMap already didn't move it either) — re-scoping the
  // result set is the whole effect.
  const handleSearchThisArea = useCallback((bounds: MapBounds) => {
    startTransition(() => setSearchBoundsState(bounds));
  }, []);

  const clearSearchArea = useCallback(() => {
    startTransition(() => setSearchBoundsState(null));
  }, []);

  // Map V2 Batch 6 — LiveMap's in-map empty state "Clear filters and search
  // again" action (see onResetFilters below). Deliberately narrow: resets
  // only the two things that can actually cause a *zero-results* dead end
  // (the selected layer and any committed search area), not `view`/
  // `viewport` — the user's map/list preference and camera position are
  // real choices unrelated to why the result set came up empty, and
  // clearing them here would be a surprising, unrequested side effect (a
  // full "reset map" is evaluated separately; this is not that).
  const resetFilters = useCallback(() => {
    startTransition(() => {
      setLayerState("all");
      setSearchBoundsState(null);
    });
  }, []);

  // Fired on every settled camera move LiveMap reports (user gestures and
  // programmatic settles alike — see LiveMap.tsx's handleMoveEnd) so the
  // persisted viewport always reflects the actual current camera, whether
  // or not a "Search this area" is also committed. Plain state (not
  // wrapped in startTransition) — this never drives a result-filtering
  // computation, only the URL-sync effect above.
  const handleViewportChange = useCallback((next: MapViewport) => {
    setViewport(next);
  }, []);

  const visibleMapItems = useMemo(() => {
    const byLayer = mapItems.filter((item) => mapItemMatchesLayer(item, layer));
    return filterMapItemsByBounds(byLayer, searchBounds);
  }, [mapItems, layer, searchBounds]);

  const visibleOpportunities = useMemo(
    () => filterOpportunitiesByBounds(filterOpportunitiesForLayer(opportunities, layer), searchBounds),
    [opportunities, layer, searchBounds],
  );
  const visibleEvents = useMemo(() => filterEventsByBounds(filterEventsForLayer(events, layer), searchBounds), [events, layer, searchBounds]);
  const visibleOrganizations = useMemo(
    () => filterOrganizationsByBounds(filterOrganizationsForLayer(organizations, layer), searchBounds),
    [organizations, layer, searchBounds],
  );

  const layerOptions: ChipOption[] = MAP_LAYERS.map((l) => ({ id: l, label: MAP_LAYER_LABEL[l] }));

  // Map V2 Batch 6 — one combined count across all three result kinds,
  // shared by both the lightweight "N results" line below and the
  // has-any-results check that decides between the grid and the empty
  // state.
  const totalResults = visibleOpportunities.length + visibleEvents.length + visibleOrganizations.length;
  const hasResults = totalResults > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <ChipToggleGroup
          aria-label="Map layer"
          options={layerOptions}
          value={[layer]}
          onChange={([next]) => next && setLayer(next as MapLayer)}
          multiple={false}
          showSummary={false}
          className="min-w-0 flex-1"
        />
        <div className="flex shrink-0 gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-800">
          {/* Map V2 Batch 4: min-h/min-w-11 (44px) touch target without
              growing the visible control — padding + flex-centering hold
              the same compact rounded-md square (~28px) it already had, the
              icon stays h-4 w-4, only the tappable hit area grows. Matches
              this screen's other 44px controls (ChipToggleGroup's chips,
              "Search this area", "Clear search area"), all one size for
              both mobile and desktop — none of those introduce a separate
              sm: size, so this doesn't either. */}
          <button
            onClick={() => setView("map")}
            className={cn(
              "flex min-h-11 min-w-11 items-center justify-center rounded-md p-1.5",
              view === "map" && "bg-white shadow-sm dark:bg-ink-900",
            )}
            aria-label="Map view"
          >
            <MapIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex min-h-11 min-w-11 items-center justify-center rounded-md p-1.5",
              view === "list" && "bg-white shadow-sm dark:bg-ink-900",
            )}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Map V2 Batch 6 — lightweight result-count feedback. aria-live so
          screen reader users hear the count update as layer/search-area
          changes narrow or widen it, without it being announced so often
          it becomes noise (it only changes on an explicit layer switch or
          "Search this area" commit, never on every pan). Hidden in map
          view on small screens — the map itself is the priority there, and
          this line would otherwise sit awkwardly between the chips and a
          map that already fills the available space; list view (where the
          count is scanning a grid) and any sm+ screen always show it. */}
      {hasResults && (
        <p
          aria-live="polite"
          className={cn("text-xs font-medium text-ink-500 dark:text-ink-400", view === "map" && "hidden sm:block")}
        >
          {totalResults} result{totalResults === 1 ? "" : "s"}
          {searchBounds ? " in this area" : ""}
        </p>
      )}

      {searchBounds && (
        <button
          type="button"
          onClick={clearSearchArea}
          className="flex min-h-11 items-center gap-1 text-xs font-medium text-flow-600 hover:underline dark:text-flow-400"
        >
          <X className="h-3.5 w-3.5" /> Showing results for the area you searched — clear to see all of Buffalo
        </button>
      )}

      {view === "map" && (
        <LiveMap
          items={visibleMapItems}
          layer={layer}
          userLocation={userLocation}
          searchBounds={searchBounds}
          viewport={viewport}
          onViewportChange={handleViewportChange}
          onSearchThisArea={handleSearchThisArea}
          isSearchPending={isPending}
          onResetFilters={resetFilters}
        />
      )}

      {hasResults ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleOpportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} distanceOverride={opportunityDistanceOverride(o, userLocation)} />
          ))}
          {visibleEvents.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
          {visibleOrganizations.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={searchBounds ? "Nothing in this area yet." : MAP_LAYER_EMPTY_COPY[layer]}
          body={searchBounds ? "Try clearing the search area or panning the map somewhere else and searching again." : undefined}
          // Map V2 Batch 6 — mirrors LiveMap's own in-map empty state action
          // for consistency, but scoped narrower here: only offer "Clear
          // search area" when a searchBounds commit is actually the reason
          // the grid is empty (the button's job is undoing that specific
          // action, same as the "Showing results for..." banner above). The
          // plain-layer-empty case (MAP_LAYER_EMPTY_COPY[layer]) already has
          // its own explanatory copy and, in map view, LiveMap's broader
          // "Clear filters and search again" action to recover from — no
          // second, overlapping button invented here for that case.
          action={
            searchBounds ? (
              <Button type="button" size="md" variant="outline" onClick={clearSearchArea}>
                Clear search area
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
