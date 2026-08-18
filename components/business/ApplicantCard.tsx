"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, BadgeCheck, Check, MessageSquareQuote, ShieldCheck, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  acceptApplicantAction,
  markCompletedAction,
  markNoShowAction,
  rejectApplicantAction,
} from "@/lib/actions";
import { relativeTime, cn } from "@/lib/utils";
import type { ApplicantRow } from "@/lib/data/applications";
import { RecommendationForm } from "@/components/business/RecommendationForm";

const STATUS_TONE: Record<string, "neutral" | "verified" | "flow" | "danger" | "gold"> = {
  pending: "flow",
  accepted: "verified",
  rejected: "neutral",
  withdrawn: "neutral",
  completed: "gold",
  no_show: "danger",
  cancelled: "danger",
};

export function ApplicantCard({ row, opportunityId, hasRecommendation }: { row: ApplicantRow; opportunityId: string; hasRecommendation: boolean }) {
  const [status, setStatus] = useState(row.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showRecommend, setShowRecommend] = useState(false);
  const [recommended, setRecommended] = useState(hasRecommendation);
  const passport = row.passport;

  function act(action: (id: string, oppId: string) => Promise<{ error?: string }>, next: string, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action(row.id, opportunityId);
      if (result.error) setError(result.error);
      else setStatus(next);
    });
  }

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/p/${row.applicant.username ?? row.applicant_id}`} className="flex items-center gap-3">
          <Avatar src={row.applicant.avatar_url} name={row.applicant.full_name ?? "FLOW Member"} size="lg" />
          <div>
            <p className="flex items-center gap-1 font-semibold text-ink-900 dark:text-white">
              {row.applicant.full_name}
              {(passport?.skills_verified ?? 0) > 0 && <BadgeCheck className="h-3.5 w-3.5 text-flow-600" />}
            </p>
            <p className="text-xs text-ink-400">
              {row.applicant.city}, {row.applicant.state} · Applied {relativeTime(row.created_at)}
            </p>
          </div>
        </Link>
        <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
      </div>

      {passport && (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Stat value={`${passport.reliability_score ?? 100}%`} label="Reliable" />
          <Stat value={passport.gigs_completed ?? 0} label="Gigs" />
          <Stat value={passport.skills_verified ?? 0} label="Skills" />
          <Stat value={passport.recommendations ?? 0} label="Recs" />
        </div>
      )}

      <div className={cn("mt-3 flex flex-wrap gap-2", pending && "opacity-50")}>
        {status === "pending" && (
          <>
            <Button size="sm" onClick={() => act(acceptApplicantAction, "accepted")} disabled={pending}>
              <Check className="h-3.5 w-3.5" /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(rejectApplicantAction, "rejected", `Reject ${row.applicant.full_name}'s application?`)} disabled={pending}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </>
        )}
        {status === "accepted" && (
          <>
            <Button size="sm" onClick={() => act(markCompletedAction, "completed")} disabled={pending}>
              <Check className="h-3.5 w-3.5" /> Mark completed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => act(markNoShowAction, "no_show", `Report ${row.applicant.full_name} as a no-show? This affects their reliability score.`)}
              disabled={pending}
              className="text-red-500"
            >
              Report no-show
            </Button>
          </>
        )}
        {status === "completed" && !recommended && !showRecommend && (
          <Button size="sm" variant="outline" onClick={() => setShowRecommend(true)}>
            <MessageSquareQuote className="h-3.5 w-3.5" /> Leave a recommendation
          </Button>
        )}
        {status === "completed" && recommended && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Recommendation left
          </span>
        )}
      </div>

      {showRecommend && (
        <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
          <RecommendationForm
            opportunityId={opportunityId}
            recipientId={row.applicant_id}
            recipientName={row.applicant.full_name ?? "this member"}
            onDone={() => {
              setRecommended(true);
              setShowRecommend(false);
            }}
          />
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

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg bg-ink-50 py-1.5 dark:bg-ink-800">
      <p className="text-sm font-bold text-ink-900 dark:text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  );
}
