"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { filterOpportunities } from "@/lib/opportunity-filters";
import { SKILL_CATEGORIES } from "@/lib/mock/data";
import { cn } from "@/lib/utils";
import type { MockOpportunity } from "@/lib/types";

const TYPE_FILTERS = ["All", "gig", "job", "project", "volunteer"] as const;
const TYPE_LABEL: Record<(typeof TYPE_FILTERS)[number], string> = { All: "All", gig: "Gigs", job: "Jobs", project: "Projects", volunteer: "Volunteer" };

export function OpportunityBrowser({ opportunities }: { opportunities: MockOpportunity[] }) {
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]>("All");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const results = useMemo(
    () =>
      filterOpportunities(opportunities, {
        query,
        type: type === "All" ? undefined : type,
        category: category || undefined,
        remote: remoteOnly || undefined,
        urgentOnly: urgentOnly || undefined,
        verifiedOnly: verifiedOnly || undefined,
      }),
    [opportunities, query, type, category, remoteOnly, urgentOnly, verifiedOnly],
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
        {TYPE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setType(f)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              type === f ? "border-flow-600 bg-flow-600 text-white" : "border-ink-200 text-ink-500 hover:border-flow-300 dark:border-ink-700 dark:text-ink-400",
            )}
          >
            {TYPE_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300"
        >
          <option value="">All categories</option>
          {SKILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <FilterChip active={remoteOnly} onClick={() => setRemoteOnly((v) => !v)} label="Remote" />
        <FilterChip active={urgentOnly} onClick={() => setUrgentOnly((v) => !v)} label="Starting soon" />
        <FilterChip active={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)} label="Verified businesses" />
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

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-flow-600 bg-flow-50 text-flow-700 dark:bg-flow-950 dark:text-flow-300" : "border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400",
      )}
    >
      {label}
    </button>
  );
}
