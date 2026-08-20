"use client";

import { useState, useTransition } from "react";
import { Check, X, CalendarClock, RotateCcw } from "lucide-react";
import { completeTaskAction, cancelTaskAction, rescheduleTaskAction, reopenTaskAction, generateOnboardingTasksAction } from "@/lib/admin/actions";

export function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "open") {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await reopenTaskAction(taskId);
            })
          }
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reopen
        </button>
      </div>
    );
  }

  if (rescheduling) {
    return (
      <form
        className="flex shrink-0 items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const dueAt = new FormData(e.currentTarget).get("due_at");
          startTransition(async () => {
            const result = await rescheduleTaskAction(taskId, String(dueAt ?? ""));
            if (result.error) setError(result.error);
            else setRescheduling(false);
          });
        }}
      >
        <input type="datetime-local" name="due_at" required className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
        <button type="submit" disabled={pending} className="rounded-lg bg-flow-600 px-2 py-1 text-xs font-medium text-white hover:bg-flow-700 disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setRescheduling(false)} className="text-xs text-ink-400 hover:text-ink-600">
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await completeTaskAction(taskId);
          })
        }
        className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40"
      >
        <Check className="h-3.5 w-3.5" /> Done
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setRescheduling(true)}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
      >
        <CalendarClock className="h-3.5 w-3.5" /> Reschedule
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await cancelTaskAction(taskId);
          })
        }
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
      >
        <X className="h-3.5 w-3.5" /> Cancel
      </button>
    </div>
  );
}

export function GenerateFollowupsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await generateOnboardingTasksAction();
            setMessage(result.error ?? `Created ${result.created ?? 0} follow-up task${result.created === 1 ? "" : "s"}.`);
          })
        }
        className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
      >
        {pending ? "Scanning…" : "Generate follow-ups"}
      </button>
      {message && <span className="text-xs text-ink-500 dark:text-ink-400">{message}</span>}
    </div>
  );
}
