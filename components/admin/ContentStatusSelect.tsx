"use client";

import { useState, useTransition } from "react";

/**
 * Generic inline status-moderation control for admin content lists (jobs,
 * events). Mirrors StageSelect in components/admin/LeadWorkspace.tsx:
 * optimistic local update, reverts on error, the actual authorization and
 * validation happen entirely server-side in the bound `action` (a
 * lib/admin/actions.ts Server Action that re-checks requireSecureAdmin()
 * and calls the matching SECURITY DEFINER RPC) — this component never
 * decides on its own whether a change is allowed.
 */
export function ContentStatusSelect({
  id,
  currentStatus,
  statuses,
  action,
}: {
  id: string;
  currentStatus: string;
  statuses: readonly { value: string; label: string }[];
  action: (id: string, status: string) => Promise<{ error?: string }>;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const previous = status;
          setStatus(next);
          setError(null);
          startTransition(async () => {
            const result = await action(id, next);
            if (result.error) {
              setError(result.error);
              setStatus(previous);
            }
          });
        }}
        className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
