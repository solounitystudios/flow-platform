"use client";

import { useState, useTransition } from "react";
import { ShieldOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { unblockProfileAction } from "@/lib/actions";
import type { DiscoverPerson } from "@/lib/data/discover";

export function BlockedPersonRow({ person }: { person: DiscoverPerson }) {
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (removed) return null;

  function handleUnblock() {
    setError(null);
    startTransition(async () => {
      const result = await unblockProfileAction(person.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRemoved(true);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
      <Avatar src={person.avatar_url} name={person.full_name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900 dark:text-white">{person.full_name}</p>
        <p className="truncate text-xs text-ink-400">
          {person.city}, {person.state}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <button
        onClick={handleUnblock}
        disabled={pending}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
      >
        <ShieldOff className="h-3.5 w-3.5" /> {pending ? "Unblocking…" : "Unblock"}
      </button>
    </div>
  );
}
