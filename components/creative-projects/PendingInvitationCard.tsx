"use client";

import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PendingCreativeProjectInvitation } from "@/lib/data/creative-projects";
import { describePendingInvitation } from "@/lib/creative-project-display";
import { acceptCreativeProjectInviteAction, declineCreativeProjectInviteAction } from "@/lib/creative-project-actions";

/** Consent-boundary copy lives here, not just in the migration comments —
 * this is the one place a real person actually reads it before clicking. */
export function PendingInvitationCard({ invitation }: { invitation: PendingCreativeProjectInvitation }) {
  const { title, subtitle } = describePendingInvitation(invitation);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function respond(kind: "accept" | "decline") {
    setError(null);
    setAction(kind);
    startTransition(async () => {
      const result = kind === "accept" ? await acceptCreativeProjectInviteAction(invitation.project_id) : await declineCreativeProjectInviteAction(invitation.project_id);
      if (result.error) setError(result.error);
      setAction(null);
    });
  }

  return (
    <div className="rounded-2xl border border-gold-500/30 bg-gold-500/5 p-4 dark:border-gold-500/20">
      <p className="font-semibold text-ink-900 dark:text-white">{title}</p>
      {subtitle && <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}

      <p className="mt-3 text-xs text-ink-400">Accepting means you agree to be listed as a member of this project. It does not verify a contribution or grant any rights.</p>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => respond("accept")} disabled={pending}>
          {pending && action === "accept" ? "Accepting…" : "Accept"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => respond("decline")} disabled={pending}>
          {pending && action === "decline" ? "Declining…" : "Decline"}
        </Button>
      </div>
    </div>
  );
}
