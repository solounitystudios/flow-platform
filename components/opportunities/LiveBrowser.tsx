"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { List, Map as MapIcon, X } from "lucide-react";
import { LiveMap } from "@/components/opportunities/LiveMap";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EventCard } from "@/components/events/EventCard";
import { OrganizationCard } from "@/components/social/OrganizationCard";
import { ChipToggleGroup, type ChipOption } from "@/components/ui/ChipToggleGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { distanceInfo, type UserLocation } from "@/lib/geo";
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
  buildLiveMapSearchParams,
  filterEventsByBounds,
  filterMapItemsByBounds,
  filterOpportunitiesByBounds,
  filterOrganizationsByBounds,
  parseBoundsParam,
  parseMapLayerParam,
  type MapBounds,
} from "@/lib/map-viewport";

/** True user-relative distance for an opportunity card, or `null` when it
 * can't/shouldn't be overridden — no user location yet, remote (no single
 * point to measure to), or no coordinates at all. `null` tells
 * OpportunityCard to keep its existing server-computed (city-center)
 * `distance_mi`, never a fabricated number. */
function opportunityDistanceOverrideMi(o: MockOpportunity, userLocation: UserLocation | null): number | null {
  if (!userLocation || o.is_remote || o.lat === null || o.lng === null) return null;
  return distanceInfo(o.lat, o.lng, userLocation).miles;
}

/**
 * Owns the ONE selected Map V2 layer plus the committed "Search this area"
 * viewport, and derives everything downstream from them — LiveMap's pins
 * and this component's own result cards are both filtered through the
 * exact same lib/map-selectors.ts / lib/map-viewport.ts functions, so they
 * can never disagree about what's currently visible. There is no second,
 * competing filter/layer system anywhere in this tree.
 *
 * Layer and search-area both persist to the URL (see lib/map-viewport.ts)
 * so a reload or a shared link restores the same view — never the raw
 * device geolocation result, which stays in-memory only (see userLocation
 * below).
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
  const [layer, setLayerState] = useState<MapLayer>(() => parseMapLayerParam(searchParams.get(MAP_LAYER_PARAM)));
  const [searchBounds, setSearchBoundsState] = useState<MapBounds | null>(() => parseBoundsParam(searchParams.get(MAP_BOUNDS_PARAM)));
  const [view, setView] = useState<"map" | "list">("map");
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
  // change) — see lib/map-viewport.ts's header comment for exactly what
  // is/isn't persisted and why.
  useEffect(() => {
    const qs = buildLiveMapSearchParams(layer, searchBounds).toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [layer, searchBounds]);

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

  const hasResults = visibleOpportunities.length > 0 || visibleEvents.length > 0 || visibleOrganizations.length > 0;

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
          <button onClick={() => setView("map")} className={cn("rounded-md p-1.5", view === "map" && "bg-white shadow-sm dark:bg-ink-900")} aria-label="Map view">
            <MapIcon className="h-4 w-4" />
          </button>
          <button onClick={() => setView("list")} className={cn("rounded-md p-1.5", view === "list" && "bg-white shadow-sm dark:bg-ink-900")} aria-label="List view">
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

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
          onSearchThisArea={handleSearchThisArea}
          isSearchPending={isPending}
        />
      )}

      {hasResults ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleOpportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} distanceOverrideMi={opportunityDistanceOverrideMi(o, userLocation)} />
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
        />
      )}
    </div>
  );
}
