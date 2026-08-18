"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleAvailableNowAction } from "@/lib/actions";

export function AvailabilityToggle({ initial }: { initial: boolean }) {
  const [available, setAvailable] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !available;
    setAvailable(next);
    startTransition(() => toggleAvailableNowAction(next));
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={cn(
        "flex items-center gap-2 self-start rounded-full border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60",
        available
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "border-ink-200 bg-white text-ink-500 dark:border-ink-700 dark:bg-ink-900",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", available ? "bg-emerald-500" : "bg-ink-300")} />
      {available ? "Available now" : "Not available"}
    </button>
  );
}
