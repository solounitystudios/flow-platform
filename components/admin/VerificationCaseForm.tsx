"use client";

import { useActionState } from "react";
import { Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { decideVerificationCaseAction, type AdminActionState } from "@/lib/admin/actions";
import { VERIFICATION_STATUSES, DECISION_REASON_CODES } from "@/lib/admin/constants";
import { formatDateTime } from "@/lib/utils";
import type { VerificationDecisionRow } from "@/lib/data/admin";

const initialState: AdminActionState = {};

export function VerificationCaseForm({
  caseId,
  status,
  decisionReason,
  decisionReasonCode,
  assignedTo,
  admins,
  decisions,
}: {
  caseId: string;
  status: string;
  decisionReason: string | null;
  decisionReasonCode: string | null;
  assignedTo: string | null;
  admins: { profile_id: string; full_name: string | null; username: string | null }[];
  decisions: VerificationDecisionRow[];
}) {
  const [state, formAction] = useActionState(decideVerificationCaseAction, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="case_id" value={caseId} />
        <Select label="Status" name="status" defaultValue={status}>
          {VERIFICATION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select label="Assigned reviewer" name="assigned_to" defaultValue={assignedTo ?? ""}>
          <option value="">Unassigned</option>
          {admins.map((a) => (
            <option key={a.profile_id} value={a.profile_id}>
              {a.full_name ?? a.username ?? a.profile_id.slice(0, 8)}
            </option>
          ))}
        </Select>
        <Select label="Decision reason code" name="decision_reason_code" defaultValue={decisionReasonCode ?? ""}>
          <option value="">None</option>
          {DECISION_REASON_CODES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Textarea label="Notes" name="decision_reason" defaultValue={decisionReason ?? ""} hint="Internal only — never shown publicly." />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save decision
        </SubmitButton>
      </form>

      {decisions.length > 0 && (
        <div className="space-y-1.5 border-t border-ink-100 pt-3 dark:border-ink-800">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Decision history</p>
          <ul className="space-y-1.5">
            {decisions.map((d) => (
              <li key={d.id} className="text-xs text-ink-500 dark:text-ink-400">
                {formatDateTime(d.created_at)} — {d.actor?.full_name ?? d.actor?.username ?? "Unknown"}: {d.from_status ?? "new"} → {d.to_status}
                {d.reason_code && ` (${d.reason_code})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
