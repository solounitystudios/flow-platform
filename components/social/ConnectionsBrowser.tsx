"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { RealConnectionRow } from "@/components/social/RealConnectionRow";
import { BlockedPersonRow } from "@/components/social/BlockedPersonRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { ConnectionEntry, BlockedEntry } from "@/lib/data/connections";
import type { DiscoverPerson } from "@/lib/data/discover";

const TABS = [
  { key: "connected", label: "Connected" },
  { key: "requests", label: "Requests" },
  { key: "suggested", label: "Suggested" },
  { key: "blocked", label: "Blocked" },
] as const;

export function ConnectionsBrowser({
  connections,
  suggested,
  blocked,
}: {
  connections: ConnectionEntry[];
  suggested: DiscoverPerson[];
  blocked: BlockedEntry[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("connected");

  const connected = connections.filter((c) => c.status === "accepted");
  const incoming = connections.filter((c) => c.status === "pending" && c.direction === "incoming");
  const outgoing = connections.filter((c) => c.status === "pending" && c.direction === "outgoing");
  const requests = [...incoming, ...outgoing];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 no-scrollbar dark:bg-ink-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === t.key ? "bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-white" : "text-ink-500",
            )}
          >
            {t.label}
            {t.key === "requests" && incoming.length > 0 && ` (${incoming.length})`}
            {t.key === "blocked" && blocked.length > 0 && ` (${blocked.length})`}
          </button>
        ))}
      </div>

      {tab === "connected" &&
        (connected.length > 0 ? (
          <div className="space-y-2.5">
            {connected.map((c) => (
              <RealConnectionRow key={c.id} person={c.person} initialStatus="connected" initialConnectionId={c.id} mutuals={c.mutuals} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="h-6 w-6" />} title="Nothing here yet" body="Connect with people you've worked with to build your network." />
        ))}

      {tab === "requests" &&
        (requests.length > 0 ? (
          <div className="space-y-2.5">
            {requests.map((c) => (
              <RealConnectionRow
                key={c.id}
                person={c.person}
                initialStatus={c.direction === "incoming" ? "pending_incoming" : "pending_outgoing"}
                initialConnectionId={c.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No pending requests" body="Connection requests you send or receive will show up here." />
        ))}

      {tab === "suggested" &&
        (suggested.length > 0 ? (
          <div className="space-y-2.5">
            {suggested.map((p) => (
              <RealConnectionRow key={p.id} person={p} initialStatus="suggested" initialConnectionId={null} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No suggestions right now" body="Check back once more FLOW members join." />
        ))}

      {tab === "blocked" &&
        (blocked.length > 0 ? (
          <div className="space-y-2.5">
            {blocked.map((b) => (
              <BlockedPersonRow key={b.id} person={b.person} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No one's blocked" body="Members you block won't be able to find your profile or message you." />
        ))}
    </div>
  );
}
