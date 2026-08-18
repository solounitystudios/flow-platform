"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PersonCard } from "@/components/social/PersonCard";
import { OrganizationCard } from "@/components/social/OrganizationCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { MockOrganization, MockPerson } from "@/lib/types";

type DiscoverPerson = Pick<MockPerson, "id" | "username" | "full_name" | "avatar_url" | "city" | "state" | "bio" | "reliability_score" | "available_now">;

const TABS = ["People", "Businesses"] as const;

export function DiscoverBrowser({ people, orgs }: { people: DiscoverPerson[]; orgs: MockOrganization[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("People");
  const [query, setQuery] = useState("");

  const filteredPeople = useMemo(
    () => people.filter((p) => [p.full_name, p.username, p.bio].join(" ").toLowerCase().includes(query.toLowerCase())),
    [people, query],
  );

  const filteredOrgs = useMemo(
    () => orgs.filter((o) => [o.name, o.industry, o.description].join(" ").toLowerCase().includes(query.toLowerCase())),
    [orgs, query],
  );

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, skills, or businesses…"
          className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900"
        />
      </div>

      <div className="flex gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
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

      {tab === "People" ? (
        filteredPeople.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredPeople.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        ) : (
          <EmptyState title="No members found" body="Try a different search term." />
        )
      ) : filteredOrgs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredOrgs.map((o) => (
            <OrganizationCard key={o.id} org={o} />
          ))}
        </div>
      ) : (
        <EmptyState title="No businesses found" body="Try a different search term." />
      )}
    </div>
  );
}
