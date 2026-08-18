"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { mockOpportunities } from "@/lib/mock/data";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

const FILTERS = ["All", "gig", "job", "project", "volunteer"] as const;
const FILTER_LABEL: Record<(typeof FILTERS)[number], string> = { All: "All", gig: "Gigs", job: "Jobs", project: "Projects", volunteer: "Volunteer" };

export default function GigsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = useState("");

  const results = useMemo(
    () =>
      mockOpportunities
        .filter((o) => o.status === "open")
        .filter((o) => filter === "All" || o.opportunity_type === filter)
        .filter((o) => [o.title, o.description, o.organization.name].join(" ").toLowerCase().includes(query.toLowerCase())),
    [filter, query],
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gigs and jobs…"
          className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f ? "border-flow-600 bg-flow-600 text-white" : "border-ink-200 text-ink-500 hover:border-flow-300 dark:border-ink-700 dark:text-ink-400",
            )}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {results.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} />
          ))}
        </div>
      ) : (
        <EmptyState title="No gigs match your filters" body="Try a different search or check back soon." />
      )}
    </div>
  );
}
