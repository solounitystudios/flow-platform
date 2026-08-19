"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { acceptReferralAction } from "./actions";

export function ReferralFlow({ token }: { token: string }) {
  const [phase, setPhase] = useState<"pending" | "accepted">("pending");
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [foundingClassGranted, setFoundingClassGranted] = useState(false);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    const result = await acceptReferralAction(token);
    setAccepting(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong. Try again.");
      return;
    }
    setFoundingClassGranted(Boolean(result.foundingClassGranted));
    setPhase("accepted");
  }

  if (phase === "accepted") {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Referral accepted — welcome to FLOW.
        </p>
        {foundingClassGranted && (
          <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <Star className="h-4 w-4 shrink-0" /> You joined during FLOW&apos;s founding class.
          </p>
        )}
        <Button href="/passport" fullWidth>
          Go to your Passport
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      <Button fullWidth disabled={accepting} onClick={handleAccept}>
        {accepting ? "Accepting…" : "Accept referral"}
      </Button>
      <p className="text-center text-xs text-ink-400">
        Not the right account? <Link href="/settings" className="font-medium text-flow-600">Switch in Settings</Link>
      </p>
    </div>
  );
}
