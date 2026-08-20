"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Ban, Check, Flag, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { blockProfileAction, unblockProfileAction, reportProfileAction } from "@/lib/actions";

const REPORT_REASONS = ["Spam or scam", "Harassment or abuse", "Fake profile", "Inappropriate content", "Other"];

export function ConnectionMoreMenu({
  personId,
  personName,
  isBlocked,
  onBlockedChange,
}: {
  personId: string;
  personName: string;
  isBlocked: boolean;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const [blocked, setBlocked] = useState(isBlocked);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleBlock() {
    if (!confirm(`Block ${personName}? They won't be able to find your profile, send you requests, or message you.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await blockProfileAction(personId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBlocked(true);
      onBlockedChange?.(true);
    });
  }

  function handleUnblock() {
    setError(null);
    startTransition(async () => {
      const result = await unblockProfileAction(personId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBlocked(false);
      onBlockedChange?.(false);
    });
  }

  function handleReport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await reportProfileAction(personId, reason, details.trim() || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setReportDone(true);
      setReportOpen(false);
    });
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {blocked ? (
          <button onClick={handleUnblock} disabled={pending} className="flex items-center gap-1 font-medium text-ink-500 hover:text-flow-600">
            <ShieldOff className="h-3.5 w-3.5" /> Unblock
          </button>
        ) : (
          <button onClick={handleBlock} disabled={pending} className="flex items-center gap-1 font-medium text-ink-400 hover:text-red-500">
            <Ban className="h-3.5 w-3.5" /> Block
          </button>
        )}

        {!reportDone ? (
          <button onClick={() => setReportOpen((v) => !v)} disabled={pending} className="flex items-center gap-1 font-medium text-ink-400 hover:text-red-500">
            <Flag className="h-3.5 w-3.5" /> Report
          </button>
        ) : (
          <span className="flex items-center gap-1 font-medium text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Reported
          </span>
        )}
      </div>

      {reportOpen && !reportDone && (
        <form onSubmit={handleReport} className="space-y-2 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Textarea label="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Anything that'll help us review this" />
          <Button type="submit" size="sm" disabled={pending} fullWidth>
            {pending ? "Submitting…" : "Submit report"}
          </Button>
        </form>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
