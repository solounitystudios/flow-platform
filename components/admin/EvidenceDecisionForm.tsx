"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Select, Textarea, Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideEvidenceAction, type AdminActionState } from "@/lib/admin/actions";
import { EVIDENCE_STATUSES, EVIDENCE_REASON_CODES, EVIDENCE_METHODS } from "@/lib/admin/constants";
import { formatDateTime } from "@/lib/utils";
import type { VerificationReviewRow } from "@/lib/data/verifications";

const initialState: AdminActionState = {};

/** Rejecting or revoking a claim removes a badge/verified skill the member
 * may already be relying on elsewhere in their passport — confirm in plain
 * English before saving, same as any other reject/revoke action here. */
const CONFIRM_STATUSES = new Set(["rejected", "revoked"]);

export function EvidenceDecisionForm({ verificationId, status, reviews }: { verificationId: string; status: string; reviews: VerificationReviewRow[] }) {
  const [state, formAction] = useActionState(decideEvidenceAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitOnUpdateRef = useRef(false);
  const [statusValue, setStatusValue] = useState(status);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const pendingLabel = pendingStatus ? (EVIDENCE_STATUSES.find((s) => s.value === pendingStatus)?.label ?? pendingStatus) : "";

  // Submitting the confirmed status has to wait for the controlled <select>
  // to actually re-render with the new value before the form reads it.
  useEffect(() => {
    if (submitOnUpdateRef.current) {
      submitOnUpdateRef.current = false;
      formRef.current?.requestSubmit();
    }
  }, [statusValue]);

  return (
    <div className="space-y-4">
      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="verification_id" value={verificationId} />
        <Select
          label="Status"
          name="status"
          value={statusValue}
          onChange={(e) => {
            const next = e.target.value;
            if (CONFIRM_STATUSES.has(next)) {
              setPendingStatus(next);
              return;
            }
            setStatusValue(next);
          }}
        >
          {EVIDENCE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select label="Method" name="method">
          <option value="">Not specified</option>
          {EVIDENCE_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select label="Reason code" name="reason_code">
          <option value="">None</option>
          {EVIDENCE_REASON_CODES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input label="Expires (optional)" name="expires_at" type="date" />
        <Textarea label="Internal notes" name="notes" hint="Never shown to the member." />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save decision
        </SubmitButton>
      </form>

      {reviews.length > 0 && (
        <div className="space-y-1.5 border-t border-ink-100 pt-3 dark:border-ink-800">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Review history</p>
          <ul className="space-y-1.5">
            {reviews.map((r) => (
              <li key={r.id} className="text-xs text-ink-500 dark:text-ink-400">
                {formatDateTime(r.created_at)} — {r.actor?.full_name ?? r.actor?.username ?? "Unknown"}: {r.from_status ?? "new"} → {r.to_status}
                {r.tier && ` [${r.tier.replace("_", " ")}]`}
                {r.reason_code && ` (${r.reason_code})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStatus(null);
        }}
        title={`Set this claim to "${pendingLabel}"?`}
        description={`This removes or denies the member's verified badge for this claim. Add clear internal notes above so the reason is on record.`}
        confirmLabel={`Yes, mark ${pendingLabel}`}
        onConfirm={() => {
          if (pendingStatus) {
            submitOnUpdateRef.current = true;
            setStatusValue(pendingStatus);
          }
          setPendingStatus(null);
        }}
      />
    </div>
  );
}
