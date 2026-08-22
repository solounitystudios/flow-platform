"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { confirmVerificationAsCollaborator } from "@/lib/verification-actions";

/** The action button on app/(app)/passport/confirm/[id]/page.tsx. Calls
 * confirm_verification_as_collaborator() through the server action — the
 * RPC re-checks, server-side, that the signed-in user is exactly the
 * witness_profile_id named on this specific pending claim; nothing here
 * decides that. */
export function ConfirmCollaboratorClaim({ verificationId }: { verificationId: string }) {
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; ok?: boolean } | null>(null);

  if (result?.ok) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <ShieldCheck className="h-4 w-4" /> Confirmed — thanks for vouching for this claim.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Textarea
        label="Note (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything you'd like on record about how you know this is true"
      />
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await confirmVerificationAsCollaborator(verificationId, notes.trim() || undefined);
            setResult(outcome);
          })
        }
      >
        {pending ? "Confirming…" : "Confirm this claim"}
      </Button>
    </div>
  );
}
