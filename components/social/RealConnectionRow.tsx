"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { sendConnectionRequestAction, acceptConnectionRequestAction, removeConnectionAction } from "@/lib/actions";
import type { DiscoverPerson } from "@/lib/data/discover";

type Status = "connected" | "pending_incoming" | "pending_outgoing" | "suggested";

export function RealConnectionRow({
  person,
  initialStatus,
  initialConnectionId,
  mutuals = 0,
}: {
  person: DiscoverPerson;
  initialStatus: Status;
  initialConnectionId: string | null;
  mutuals?: number;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [connectionId, setConnectionId] = useState(initialConnectionId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await sendConnectionRequestAction(person.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConnectionId(result.connectionId ?? null);
      setStatus("pending_outgoing");
    });
  }

  function handleAccept() {
    if (!connectionId) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptConnectionRequestAction(connectionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("connected");
    });
  }

  function handleRemove() {
    if (!connectionId) return;
    setError(null);
    startTransition(async () => {
      const result = await removeConnectionAction(connectionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("suggested");
      setConnectionId(null);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
      <Link href={`/p/${person.username}`}>
        <Avatar src={person.avatar_url} name={person.full_name} size="md" />
      </Link>
      <Link href={`/p/${person.username}`} className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900 dark:text-white">{person.full_name}</p>
        <p className="truncate text-xs text-ink-400">
          {person.city}, {person.state} {mutuals > 0 && `· ${mutuals} mutual`}
        </p>
      </Link>

      {status === "connected" && (
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-xs font-medium text-ink-400">Connected</span>
          <button onClick={handleRemove} disabled={pending} className="text-xs font-medium text-ink-300 hover:text-red-500">
            Remove
          </button>
        </div>
      )}

      {status === "pending_incoming" && (
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" onClick={handleAccept} disabled={pending}>
            <Check className="h-3.5 w-3.5" /> Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={handleRemove} disabled={pending}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {status === "pending_outgoing" && (
        <Button size="sm" variant="outline" disabled className="shrink-0">
          Pending
        </Button>
      )}

      {status === "suggested" && (
        <Button size="sm" variant="outline" onClick={handleConnect} disabled={pending} className="shrink-0">
          <UserPlus className="h-3.5 w-3.5" /> Connect
        </Button>
      )}

      {error && <p className="shrink-0 text-xs text-red-600">{error}</p>}
    </div>
  );
}
