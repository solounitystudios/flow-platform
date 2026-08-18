"use client";

import { useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { updateEventStatusAction } from "@/lib/actions";
import { relativeTime, cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

const TONES: Record<string, "neutral" | "verified" | "flow" | "danger"> = {
  draft: "neutral",
  published: "verified",
  completed: "flow",
  cancelled: "danger",
};

export function EventRow({ event, attendeeCount }: { event: Tables<"events">; attendeeCount: number }) {
  const [pending, startTransition] = useTransition();

  function setStatus(status: string) {
    startTransition(() => updateEventStatusAction(event.id, status));
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-ink-100 p-3.5 dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-ink-900 dark:text-white">{event.title}</p>
          <Badge tone={TONES[event.status] ?? "neutral"}>{event.status}</Badge>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
          <CalendarDays className="h-3 w-3" /> {relativeTime(event.starts_at)} · {event.capacity ? `${event.capacity} capacity` : "Unlimited capacity"}
        </p>
      </div>
      <div className={cn("flex shrink-0 items-center gap-1.5", pending && "opacity-50")}>
        <Button href={`/business/events/${event.id}`} size="sm" variant="outline">
          <CalendarDays className="h-3.5 w-3.5" /> Attendees {attendeeCount > 0 && `(${attendeeCount})`}
        </Button>
        {event.status !== "cancelled" && event.status !== "completed" && (
          <button
            onClick={() => setStatus("cancelled")}
            className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-ink-700 dark:hover:bg-red-950/30"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
