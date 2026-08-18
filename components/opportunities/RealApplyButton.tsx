"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Clock, Loader2, Users2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { applyToOpportunityAction, claimOpportunityAction, withdrawApplicationAction } from "@/lib/actions";

export function RealApplyButton({
  opportunityId,
  isOwner,
  instantBook,
  initialStatus,
  initialApplicationId,
}: {
  opportunityId: string;
  isOwner: boolean;
  instantBook: boolean;
  initialStatus: string | null;
  initialApplicationId: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isOwner) {
    return (
      <Button href={`/business/opportunities/${opportunityId}`} size="lg" fullWidth>
        <Users2 className="h-4 w-4" /> Manage applicants
      </Button>
    );
  }

  function handleApply() {
    setError(null);
    startTransition(async () => {
      const action = instantBook ? claimOpportunityAction : applyToOpportunityAction;
      const result = await action(opportunityId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus(instantBook ? "accepted" : "pending");
    });
  }

  function handleWithdraw() {
    if (!applicationId) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawApplicationAction(applicationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("withdrawn");
    });
  }

  return (
    <div className="space-y-2">
      {status === null && (
        <Button size="lg" fullWidth disabled={pending} onClick={handleApply}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : instantBook ? <Zap className="h-4 w-4" /> : null}
          {pending ? "Please wait…" : instantBook ? "Claim this opportunity" : "Apply now"}
        </Button>
      )}

      {status === "pending" && (
        <>
          <Button variant="outline" size="lg" fullWidth disabled className="border-flow-300 text-flow-600">
            <Clock className="h-4 w-4" /> Applied — waiting on the business
          </Button>
          <button onClick={handleWithdraw} disabled={pending} className="w-full text-center text-sm font-medium text-ink-400 hover:text-red-500">
            Withdraw application
          </button>
        </>
      )}

      {status === "accepted" && (
        <Button href="/work" variant="outline" size="lg" fullWidth className="border-emerald-300 text-emerald-600">
          <Check className="h-4 w-4" /> You&apos;re confirmed — view in My Work
        </Button>
      )}

      {status === "rejected" && (
        <Button variant="outline" size="lg" fullWidth disabled className="text-ink-400">
          <X className="h-4 w-4" /> You weren&apos;t selected this time
        </Button>
      )}

      {status === "withdrawn" && (
        <Button variant="outline" size="lg" fullWidth disabled className="text-ink-400">
          You withdrew this application
        </Button>
      )}

      {(status === "completed" || status === "no_show" || status === "cancelled") && (
        <Button href="/passport" variant="outline" size="lg" fullWidth className="text-ink-400">
          This gig is on your Passport
        </Button>
      )}

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
