"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateActivityStatusAction } from "@/lib/actions";
import { cn } from "@/lib/utils";
import type { ActivityStatus } from "@/lib/types";

/** Host-only publish/cancel/complete controls — goes through
 * updateActivityStatusAction, which re-checks canManageActivity server-side
 * before writing (never a raw client-side status update). */
export function ActivityStatusControls({ activityId, status }: { activityId: string; status: ActivityStatus }) {
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setStatus(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateActivityStatusAction(activityId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCurrent(next as ActivityStatus);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-50")}>
        {current === "draft" && (
          <button
            onClick={() => setStatus("published")}
            disabled={pending}
            className="rounded-lg bg-flow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-flow-700"
          >
            Publish
          </button>
        )}
        {current === "published" && (
          <button
            onClick={() => setStatus("completed")}
            disabled={pending}
            className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-ink-50 dark:border-ink-700 dark:text-white dark:hover:bg-ink-800"
          >
            Mark completed
          </button>
        )}
        {current !== "cancelled" && current !== "completed" && (
          <button
            onClick={() => {
              if (!confirm("Cancel this activity? Participants will no longer be able to join.")) return;
              setStatus("cancelled");
            }}
            disabled={pending}
            className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-ink-700 dark:hover:bg-red-950/30"
          >
            Cancel activity
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
