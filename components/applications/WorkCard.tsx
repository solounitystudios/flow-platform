"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, Calendar, Check, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { acknowledgeCompletionAction, cancelAcceptedApplicationAction, startOpportunityConversationAction } from "@/lib/actions";
import { MessageButton } from "@/components/messages/MessageButton";
import { formatCents, formatDateTime } from "@/lib/utils";
import type { MyApplicationRow } from "@/lib/data/applications";

export function WorkCard({ application }: { application: MyApplicationRow }) {
  const [ack, setAck] = useState(!!application.worker_ack_at);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const opp = application.opportunity;
  const org = opp.organization;

  function handleAck() {
    startTransition(async () => {
      const result = await acknowledgeCompletionAction(application.id);
      if (result.error) setError(result.error);
      else setAck(true);
    });
  }

  function handleCancel() {
    if (!confirm("Cancel this accepted gig? This may affect your reliability score.")) return;
    startTransition(async () => {
      const result = await cancelAcceptedApplicationAction(application.id);
      if (result.error) setError(result.error);
      else setCancelled(true);
    });
  }

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/gigs/${application.opportunity_id}`} className="font-semibold text-ink-900 hover:text-flow-600 dark:text-white">
            {opp.title}
          </Link>
          <p className="text-xs text-ink-400">{org?.name ?? "FLOW Business"}</p>
        </div>
        <Badge tone={application.status === "completed" ? "gold" : application.status === "accepted" ? "verified" : "danger"}>
          {application.status.replace("_", " ")}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-ink-500 dark:text-ink-400 sm:grid-cols-2">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {opp.location_name ?? opp.city}
        </span>
        {opp.starts_at && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDateTime(opp.starts_at)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-900 dark:text-white">{opp.pay_cents ? `${formatCents(opp.pay_cents)}/hr` : "Volunteer"}</span>
        {opp.is_remote && <Badge tone="neutral">Remote</Badge>}
      </div>

      {application.status === "accepted" && !cancelled && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
          <MessageButton start={startOpportunityConversationAction.bind(null, application.opportunity_id)} label="Message business" />
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={pending} className="shrink-0 text-red-500">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      )}

      {cancelled && <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-red-500 dark:border-ink-800">Cancelled.</p>}

      {application.status === "completed" && (
        <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
          {ack ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Acknowledged — this gig is on your Passport
            </p>
          ) : (
            <Button size="sm" onClick={handleAck} disabled={pending}>
              <Check className="h-3.5 w-3.5" /> Acknowledge completion
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
