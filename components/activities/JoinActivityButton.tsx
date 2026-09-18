"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { joinActivityAction, cancelActivityParticipationAction } from "@/lib/actions";
import type { MyParticipation } from "@/lib/data/activities";

/** Visiting-participant join/cancel control, mirroring RealRegisterButton's
 * shape exactly — a join here is a lightweight RSVP (upsert on
 * (activity_id, profile_id)), never an application, so there is no
 * price/accept step to model. */
export function JoinActivityButton({ activityId, initialParticipation }: { activityId: string; initialParticipation: MyParticipation | null }) {
  const [participation, setParticipation] = useState(initialParticipation);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinActivityAction(activityId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setParticipation({ id: result.participantId ?? "", status: "registered", checked_in_at: null });
    });
  }

  function handleCancel() {
    if (!participation) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelActivityParticipationAction(participation.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setParticipation({ ...participation, status: "cancelled" });
    });
  }

  return (
    <div className="space-y-2">
      {!participation && (
        <Button size="lg" fullWidth disabled={pending} onClick={handleJoin}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {pending ? "Joining…" : "Join this activity"}
        </Button>
      )}

      {participation?.status === "registered" && (
        <>
          <Button variant="outline" size="lg" fullWidth disabled className="border-emerald-300 text-emerald-600">
            <Check className="h-4 w-4" /> You&apos;re in
          </Button>
          <button onClick={handleCancel} disabled={pending} className="w-full text-center text-sm font-medium text-ink-400 hover:text-red-500">
            Cancel
          </button>
        </>
      )}

      {participation?.status === "attended" && (
        <Button variant="outline" size="lg" fullWidth disabled className="border-emerald-300 text-emerald-600">
          <Check className="h-4 w-4" /> You checked in — thanks for coming!
        </Button>
      )}

      {participation?.status === "completed" && (
        <Button variant="outline" size="lg" fullWidth disabled className="border-emerald-300 text-emerald-600">
          <Check className="h-4 w-4" /> Completed
        </Button>
      )}

      {participation?.status === "cancelled" && (
        <>
          <p className="flex items-center gap-1.5 text-sm text-ink-400">
            <X className="h-4 w-4" /> You cancelled your spot
          </p>
          <Button size="lg" fullWidth disabled={pending} onClick={handleJoin}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {pending ? "Joining…" : "Join again"}
          </Button>
        </>
      )}

      {participation?.status === "no_show" && (
        <Button variant="outline" size="lg" fullWidth disabled className="text-ink-400">
          Marked as a no-show for this activity
        </Button>
      )}

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
