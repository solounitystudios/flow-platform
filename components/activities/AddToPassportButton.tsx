"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, BadgeCheck, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { claimActivityToPassportAction } from "@/lib/passport/actions";

/**
 * Shown only to a participant whose HOST has marked them completed. It puts
 * that host-recorded outcome on their Passport as a verified claim (private
 * until they choose to share it). Never shown for an activity that isn't
 * completed — the database would refuse it anyway.
 */
export function AddToPassportButton({ activityId, existingClaimId }: { activityId: string; existingClaimId: string | null }) {
  const [claimId, setClaimId] = useState(existingClaimId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await claimActivityToPassportAction(activityId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setClaimId(result.claimId ?? null);
    });
  }

  if (claimId) {
    return (
      <div className="space-y-1.5 rounded-xl border border-verified-500/30 bg-verified-500/5 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-verified-600 dark:text-verified-400">
          <BadgeCheck className="h-4 w-4" /> On your Passport — verified from the host&apos;s record
        </p>
        <Link href={`/passport/claims/${claimId}`} className="text-sm font-medium text-flow-600">
          Why does Passport show this? · choose who can see it
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button size="lg" fullWidth disabled={pending} onClick={handleAdd}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {pending ? "Adding…" : "Add to my Passport"}
      </Button>
      <p className="text-xs text-ink-400">Only you can see it until you choose to share it.</p>
      {error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
