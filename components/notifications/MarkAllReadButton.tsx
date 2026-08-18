"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsReadAction } from "@/lib/actions";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => markAllNotificationsReadAction())}
      disabled={pending}
      className="flex items-center gap-1.5 text-sm font-medium text-flow-600 hover:text-flow-700 disabled:opacity-50 dark:text-flow-400"
    >
      <CheckCheck className="h-4 w-4" /> Mark all as read
    </button>
  );
}
