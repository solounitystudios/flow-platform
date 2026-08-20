"use client";

import { useMemo, useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { LiveMap } from "@/components/opportunities/LiveMap";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EventCard } from "@/components/events/EventCard";
import { cn } from "@/lib/utils";
import type { MockEvent, MockOpportunity } from "@/lib/types";
// Type-only import — erased at compile time, so this never pulls
// lib/data/discover.ts's server-only Supabase client into the client bundle.
import type { MapItem } from "@/lib/data/discover";

const FILTERS = ["All", "Gigs", "Jobs", "Volunteer", "Events"] as const;

export function LiveBrowser({
  opportunities,
  events,
  mapItems,
}: {
  opportunities: MockOpportunity[];
  events: MockEvent[];
  mapItems: MapItem[];
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [view, setView] = useState<"map" | "list">("map");

  const liveEvents = events;

  const filteredOpportunities = opportunities.filter((o) => {
    if (filter === "All") return true;
    if (filter === "Gigs") return o.opportunity_type === "gig" || o.opportunity_type === "project";
    if (filter === "Jobs") return o.opportunity_type === "job";
    if (filter === "Volunteer") return o.opportunity_type === "volunteer";
    return false;
  });
  const filteredEvents = filter === "All" || filter === "Events" ? liveEvents : [];

  // Map pins follow the same top-level filter as the list below (a business
  // pin, once real, stays visible regardless — it isn't part of this
  // gig/job/volunteer/event taxonomy). Which *types* of pin render at all is
  // then further controlled by LiveMap's own layer toggles.
  const filteredMapItems = useMemo(() => {
    if (filter === "All") return mapItems;
    const visibleIds = new Set<string>();
    for (const o of opportunities) {
      const included =
        filter === "Gigs" ? o.opportunity_type === "gig" || o.opportunity_type === "project" : filter === "Jobs" ? o.opportunity_type === "job" : filter === "Volunteer" ? o.opportunity_type === "volunteer" : false;
      if (included) visibleIds.add(o.id);
    }
    if (filter === "Events") for (const e of events) visibleIds.add(e.id);
    return mapItems.filter((item) => item.type === "business" || visibleIds.has(item.id));
  }, [mapItems, filter, opportunities, events]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === f
                  ? "border-flow-600 bg-flow-600 text-white"
                  : "border-ink-200 text-ink-500 hover:border-flow-300 dark:border-ink-700 dark:text-ink-400",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-800">
          <button onClick={() => setView("map")} className={cn("rounded-md p-1.5", view === "map" && "bg-white shadow-sm dark:bg-ink-900")} aria-label="Map view">
            <MapIcon className="h-4 w-4" />
          </button>
          <button onClick={() => setView("list")} className={cn("rounded-md p-1.5", view === "list" && "bg-white shadow-sm dark:bg-ink-900")} aria-label="List view">
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view === "map" && <LiveMap items={filteredMapItems} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {filteredOpportunities.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} />
        ))}
        {filteredEvents.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>

      {filteredOpportunities.length === 0 && filteredEvents.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-400">Nothing matches that filter right now. Check back soon.</p>
      )}
    </div>
  );
}
