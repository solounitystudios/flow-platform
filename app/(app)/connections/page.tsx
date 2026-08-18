"use client";

import { useMemo, useState } from "react";
import { mockConnections } from "@/lib/mock/data";
import { ConnectionRow } from "@/components/social/ConnectionRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

const TABS = [
  { key: "connected", label: "Connected" },
  { key: "requests", label: "Requests" },
  { key: "suggested", label: "Suggested" },
] as const;

export default function ConnectionsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("connected");

  const results = useMemo(() => {
    if (tab === "connected") return mockConnections.filter((c) => c.status === "connected");
    if (tab === "requests") return mockConnections.filter((c) => c.status.startsWith("pending"));
    return mockConnections.filter((c) => c.status === "suggested");
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-colors",
              tab === t.key ? "bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-white" : "text-ink-500",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {results.length > 0 ? (
        <div className="space-y-2.5">
          {results.map((c) => (
            <ConnectionRow key={c.person.id} connection={c} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Nothing here yet" body="Connect with people you've worked with to build your network." />
      )}
    </div>
  );
}
