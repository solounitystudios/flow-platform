"use client";

import { useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { mockEvents } from "@/lib/mock/data";
import { LiveMap, type MapPin } from "@/components/opportunities/LiveMap";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EventCard } from "@/components/events/EventCard";
import { cn } from "@/lib/utils";
import type { MockOpportunity } from "@/lib/types";

const FILTERS = ["All", "Gigs", "Jobs", "Volunteer", "Events"] as const;

export function LiveBrowser({ opportunities }: { opportunities: MockOpportunity[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [view, setView] = useState<"map" | "list">("map");

  const liveEvents = mockEvents.filter((e) => e.status === "published");

  const filteredOpportunities = opportunities.filter((o) => {
    if (filter === "All") return true;
    if (filter === "Gigs") return o.opportunity_type === "gig" || o.opportunity_type === "project";
    if (filter === "Jobs") return o.opportunity_type === "job";
    if (filter === "Volunteer") return o.opportunity_type === "volunteer";
    return false;
  });
  const filteredEvents = filter === "All" || filter === "Events" ? liveEvents : [];

  const pins: MapPin[] = [
    ...filteredOpportunities.map((o) => ({
      id: o.id,
      kind: "opportunity" as const,
      title: o.title,
      subtitle: o.location_name,
      lat: o.lat,
      lng: o.lng,
      urgent: o.urgent,
      startsAt: o.starts_at,
      href: `/gigs/${o.id}`,
    })),
    ...filteredEvents.map((e) => ({
      id: e.id,
      kind: "event" as const,
      title: e.title,
      subtitle: e.venue,
      lat: e.lat,
      lng: e.lng,
      startsAt: e.starts_at,
      href: `/events/${e.id}`,
    })),
  ];

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

      {view === "map" && <LiveMap pins={pins} />}

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
