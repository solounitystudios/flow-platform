"use client";

import { useActionState } from "react";
import { Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateVerificationCaseAction, type AdminActionState } from "@/lib/admin/actions";
import { VERIFICATION_STATUSES } from "@/lib/admin/constants";

const initialState: AdminActionState = {};

export function VerificationCaseForm({ caseId, status, decisionReason }: { caseId: string; status: string; decisionReason: string | null }) {
  const [state, formAction] = useActionState(updateVerificationCaseAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="case_id" value={caseId} />
      <Select label="Status" name="status" defaultValue={status}>
        {VERIFICATION_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Textarea label="Decision reason" name="decision_reason" defaultValue={decisionReason ?? ""} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
