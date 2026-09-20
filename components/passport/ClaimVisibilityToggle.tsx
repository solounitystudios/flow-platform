"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { setClaimVisibilityAction } from "@/lib/passport/actions";

/**
 * The owner's disclosure switch for one claim. Public claims still only
 * appear on a Passport that is itself public, and only while verified and
 * unexpired — this control never overrides that.
 */
export function ClaimVisibilityToggle({ claimId, initialVisibility, disabledReason }: { claimId: string; initialVisibility: "private" | "public"; disabledReason?: string }) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isPublic = visibility === "public";

  function toggle() {
    const next = isPublic ? "private" : "public";
    setError(null);
    startTransition(async () => {
      const result = await setClaimVisibilityAction(claimId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setVisibility(next);
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason}
        aria-pressed={isPublic}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {isPublic ? "Shown on your public Passport" : "Only you can see this"}
      </button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
