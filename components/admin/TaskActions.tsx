"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { completeTaskAction, cancelTaskAction } from "@/lib/admin/actions";

export function TaskActions({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();

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
