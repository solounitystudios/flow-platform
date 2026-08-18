"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import type { MockConnection } from "@/lib/types";

export function ConnectionRow({ connection }: { connection: MockConnection }) {
  const [status, setStatus] = useState(connection.status);
  const { person } = connection;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
      <Link href={`/p/${person.username}`}>
        <Avatar src={person.avatar_url} name={person.full_name} size="md" />
      </Link>
      <Link href={`/p/${person.username}`} className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900 dark:text-white">{person.full_name}</p>
        <p className="truncate text-xs text-ink-400">
          {person.city}, {person.state} {connection.mutuals > 0 && `· ${connection.mutuals} mutual`}
        </p>
      </Link>

      {status === "connected" && <span className="shrink-0 text-xs font-medium text-ink-400">Connected</span>}

      {status === "pending_incoming" && (
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" onClick={() => setStatus("connected")}>
            <Check className="h-3.5 w-3.5" /> Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStatus("suggested")}>
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
        <Button size="sm" variant="outline" onClick={() => setStatus("pending_outgoing")} className="shrink-0">
          <UserPlus className="h-3.5 w-3.5" /> Connect
        </Button>
      )}
    </div>
  );
}
