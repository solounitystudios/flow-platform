"use client";

import { useState } from "react";
import { EventCard } from "@/components/events/EventCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { MockEvent } from "@/lib/types";

const TABS = ["Upcoming", "Past"] as const;

export function EventsBrowser({ upcoming, past }: { upcoming: MockEvent[]; past: MockEvent[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Upcoming");
  const results = tab === "Upcoming" ? upcoming : past;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800 sm:w-64">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-colors",
              tab === t ? "bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-white" : "text-ink-500",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {results.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <EmptyState title="No events here yet" body="Check back soon for new community events." />
      )}
    </div>
  );
}
