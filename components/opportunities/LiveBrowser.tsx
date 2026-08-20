"use client";

import { useMemo, useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { LiveMap } from "@/components/opportunities/LiveMap";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EventCard } from "@/components/events/EventCard";
import { OrganizationCard } from "@/components/social/OrganizationCard";
import { ChipToggleGroup, type ChipOption } from "@/components/ui/ChipToggleGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
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

/**
 * Owns the ONE selected Map V2 layer and derives everything downstream
 * from it — LiveMap's pins and this component's own result cards are both
 * filtered through the exact same lib/map-selectors.ts functions, so they
 * can never disagree about what's currently visible. There is no second,
 * competing filter/layer state anywhere in this tree.
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
  const [layer, setLayer] = useState<MapLayer>("all");
  const [view, setView] = useState<"map" | "list">("map");

  const visibleMapItems = useMemo(() => mapItems.filter((item) => mapItemMatchesLayer(item, layer)), [mapItems, layer]);
  const visibleOpportunities = useMemo(() => filterOpportunitiesForLayer(opportunities, layer), [opportunities, layer]);
  const visibleEvents = useMemo(() => filterEventsForLayer(events, layer), [events, layer]);
  const visibleOrganizations = useMemo(() => filterOrganizationsForLayer(organizations, layer), [organizations, layer]);

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

      {view === "map" && <LiveMap items={visibleMapItems} layer={layer} />}

      {hasResults ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleOpportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} />
          ))}
          {visibleEvents.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
          {visibleOrganizations.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      ) : (
        <EmptyState title={MAP_LAYER_EMPTY_COPY[layer]} />
      )}
    </div>
  );
}
