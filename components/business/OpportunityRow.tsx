"use client";

import { useTransition } from "react";
import { Users2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { updateOpportunityStatusAction } from "@/lib/actions";
import { formatCents, relativeTime, cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

const TONES: Record<string, "neutral" | "verified" | "flow" | "danger"> = {
  open: "verified",
  filled: "flow",
  completed: "neutral",
  cancelled: "danger",
  draft: "neutral",
};

export function OpportunityRow({ opportunity }: { opportunity: Tables<"opportunities"> }) {
  const [pending, startTransition] = useTransition();

  function setStatus(status: string) {
    startTransition(() => updateOpportunityStatusAction(opportunity.id, status));
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-ink-100 p-3.5 dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-ink-900 dark:text-white">{opportunity.title}</p>
          <Badge tone={TONES[opportunity.status]}>{opportunity.status}</Badge>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
          <Users2 className="h-3 w-3" /> {opportunity.slots} slot{opportunity.slots === 1 ? "" : "s"} ·{" "}
          {opportunity.pay_cents ? `${formatCents(opportunity.pay_cents)}/hr` : "Volunteer"} ·{" "}
          {opportunity.starts_at ? relativeTime(opportunity.starts_at) : "No start time set"}
        </p>
      </div>
      <div className={cn("flex shrink-0 gap-1.5", pending && "opacity-50")}>
        {opportunity.status === "open" && (
          <button onClick={() => setStatus("filled")} className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800">
            Mark filled
          </button>
        )}
        {(opportunity.status === "open" || opportunity.status === "filled") && (
          <button onClick={() => setStatus("completed")} className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800">
            Mark completed
          </button>
        )}
        {opportunity.status !== "cancelled" && opportunity.status !== "completed" && (
          <button onClick={() => setStatus("cancelled")} className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-ink-700 dark:hover:bg-red-950/30">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
