"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { generateReferralAction, revokeReferralAction, type ReferralActionState } from "@/lib/referral-actions";
import { relativeTime } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

type Referral = Tables<"referrals">;

function referralStatus(r: Referral): "accepted" | "revoked" | "expired" | "active" {
  if (r.accepted_at) return "accepted";
  if (r.revoked_at) return "revoked";
  if (new Date(r.expires_at) < new Date()) return "expired";
  return "active";
}

const initialState: ReferralActionState = {};

export function ReferralPanel({ referrals }: { referrals: Referral[] }) {
  const [state, formAction] = useActionState(generateReferralAction, initialState);
  const [copied, setCopied] = useState(false);
  const [revoking, startRevoke] = useTransition();

  const active = referrals.filter((r) => referralStatus(r) === "active");
  const history = referrals.filter((r) => referralStatus(r) !== "active");

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <ul className="space-y-2">
          {active.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800">
              <span className="text-ink-500 dark:text-ink-400">
                {r.intended_email ?? "Any email"} · expires {relativeTime(r.expires_at)}
              </span>
              <button
                type="button"
                disabled={revoking}
                onClick={() => startRevoke(async () => { await revokeReferralAction(r.id); })}
                className="flex items-center gap-1 text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <ul className="space-y-1 border-t border-ink-100 pt-2 dark:border-ink-800">
          {history.map((r) => (
            <li key={r.id} className="text-xs text-ink-400">
              {r.intended_email ?? "Any email"} · {referralStatus(r)}
            </li>
          ))}
        </ul>
      )}

      {state.inviteUrl ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-500 dark:text-ink-400">Copy this link — it&apos;s shown once.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={state.inviteUrl} className="w-full truncate rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs dark:border-ink-700 dark:bg-ink-800" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(state.inviteUrl!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <Input label="Friend's email (optional)" name="intended_email" type="email" hint="Leave blank to allow any email to claim it." />
          <Input label="Expires in (days)" name="expires_days" type="number" defaultValue={30} min={1} max={90} />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <SubmitButton size="sm" pendingLabel="Generating…">
            Generate referral link
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
