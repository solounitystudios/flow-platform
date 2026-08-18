"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ConnectionControl } from "@/components/social/ConnectionControl";
import { ConnectionMoreMenu } from "@/components/social/ConnectionMoreMenu";
import type { DiscoverPerson } from "@/lib/data/discover";
import type { ConnectionUiStatus } from "@/lib/data/connections";

export function RealConnectionRow({
  person,
  initialStatus,
  initialConnectionId,
  mutuals = 0,
  showMoreMenu = true,
}: {
  person: DiscoverPerson;
  initialStatus: ConnectionUiStatus;
  initialConnectionId: string | null;
  mutuals?: number;
  showMoreMenu?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center gap-3">
        <Link href={`/p/${person.username}`}>
          <Avatar src={person.avatar_url} name={person.full_name} size="md" />
        </Link>
        <Link href={`/p/${person.username}`} className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900 dark:text-white">{person.full_name}</p>
          <p className="truncate text-xs text-ink-400">
            {person.city}, {person.state} {mutuals > 0 && `· ${mutuals} mutual`}
          </p>
        </Link>

        <ConnectionControl
          personId={person.id}
          personName={person.full_name}
          initialStatus={initialStatus}
          initialConnectionId={initialConnectionId}
          onStatusChange={setStatus}
        />
      </div>

      {showMoreMenu && status !== "blocked" && (
        <div className="mt-2 flex justify-end">
          <button onClick={() => setMenuOpen((v) => !v)} className="text-xs font-medium text-ink-300 hover:text-ink-500">
            {menuOpen ? "Hide options" : "More"}
          </button>
        </div>
      )}

      {showMoreMenu && menuOpen && status !== "blocked" && (
        <div className="mt-2 border-t border-ink-100 pt-2 dark:border-ink-800">
          <ConnectionMoreMenu personId={person.id} personName={person.full_name} isBlocked={false} />
        </div>
      )}
    </div>
  );
}
