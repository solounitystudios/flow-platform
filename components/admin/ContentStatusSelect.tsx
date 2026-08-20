"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Generic inline status-moderation control for admin content lists (jobs,
 * events). Mirrors StageSelect in components/admin/LeadWorkspace.tsx:
 * optimistic local update, reverts on error, the actual authorization and
 * validation happen entirely server-side in the bound `action` (a
 * lib/admin/actions.ts Server Action that re-checks requireSecureAdmin()
 * and calls the matching SECURITY DEFINER RPC) — this component never
 * decides on its own whether a change is allowed.
 *
 * `confirmStatuses` names status values (e.g. "cancelled") that should ask
 * for a plain-English confirmation before applying — everything else still
 * applies immediately, same as before.
 */
export function ContentStatusSelect({
  id,
  currentStatus,
  statuses,
  action,
  confirmStatuses = [],
  confirmDescription,
}: {
  id: string;
  currentStatus: string;
  statuses: readonly { value: string; label: string }[];
  action: (id: string, status: string) => Promise<{ error?: string }>;
  confirmStatuses?: string[];
  confirmDescription?: (label: string) => string;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<string | null>(null);

  function apply(next: string) {
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
  }

  const pendingLabel = pendingValue ? (statuses.find((s) => s.value === pendingValue)?.label ?? pendingValue) : "";

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (confirmStatuses.includes(next)) {
            setPendingValue(next);
            return;
          }
          apply(next);
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
      <ConfirmDialog
        open={pendingValue !== null}
        onOpenChange={(open) => {
          if (!open) setPendingValue(null);
        }}
        title={`Change status to "${pendingLabel}"?`}
        description={
          confirmDescription
            ? confirmDescription(pendingLabel)
            : `This changes the visible status to "${pendingLabel}". You can change it again later if needed.`
        }
        confirmLabel={`Yes, set to ${pendingLabel}`}
        onConfirm={() => {
          if (pendingValue) apply(pendingValue);
          setPendingValue(null);
        }}
      />
    </div>
  );
}
