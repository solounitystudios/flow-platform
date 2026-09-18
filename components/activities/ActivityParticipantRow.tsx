"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { checkInActivityParticipantAction, markActivityNoShowAction, completeActivityParticipantAction } from "@/lib/actions";
import { relativeTime, cn } from "@/lib/utils";
import type { ActivityParticipantRow as ParticipantRow } from "@/lib/data/activities";

const STATUS_TONE: Record<string, "neutral" | "verified" | "flow" | "danger"> = {
  registered: "flow",
  attended: "verified",
  completed: "verified",
  no_show: "danger",
  cancelled: "neutral",
};

/** Host-only roster row — check-in/no-show/complete each go through their
 * own SECURITY DEFINER RPC (never a raw client-side status update), same
 * division of responsibility as AttendeeCard for events. */
export function ActivityParticipantRow({ row, activityId }: { row: ParticipantRow; activityId: string }) {
  const [status, setStatus] = useState(row.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCheckIn() {
    setError(null);
    startTransition(async () => {
      const result = await checkInActivityParticipantAction(activityId, row.profile_id);
      if (result.error || result.result?.ok === false) {
        setError(result.error ?? "Couldn't check them in.");
        return;
      }
      setStatus("attended");
      router.refresh();
    });
  }

  function handleNoShow() {
    if (!confirm(`Mark ${row.profile.full_name ?? "this participant"} as a no-show?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await markActivityNoShowAction(activityId, row.profile_id);
      if (result.error || result.result?.ok === false) {
        setError(result.error ?? "Couldn't mark them as a no-show.");
        return;
      }
      setStatus("no_show");
      router.refresh();
    });
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeActivityParticipantAction(activityId, row.profile_id);
      if (result.error || result.result?.ok === false) {
        setError(result.error ?? "Couldn't mark them as completed.");
        return;
      }
      setStatus("completed");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-ink-100 p-3.5 dark:border-ink-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={row.profile.avatar_url} name={row.profile.full_name ?? "FLOW Member"} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900 dark:text-white">{row.profile.full_name}</p>
            <p className="text-xs text-ink-400">Joined {relativeTime(row.joined_at)}</p>
          </div>
        </div>
        <div className={cn("flex shrink-0 items-center gap-1.5", pending && "opacity-50")}>
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
          {status === "registered" && (
            <>
              <Button size="sm" onClick={handleCheckIn} disabled={pending}>
                <Check className="h-3.5 w-3.5" /> Check in
              </Button>
              <button
                onClick={handleNoShow}
                disabled={pending}
                aria-label="Mark no-show"
                className="rounded-lg border border-ink-200 p-2 text-red-500 hover:bg-red-50 dark:border-ink-700 dark:hover:bg-red-950/30"
              >
                <UserX className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {status === "attended" && (
            <Button size="sm" onClick={handleComplete} disabled={pending}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark completed
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
