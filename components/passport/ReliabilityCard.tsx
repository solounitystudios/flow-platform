import { ShieldCheck } from "lucide-react";
import type { ReliabilityBreakdown } from "@/lib/database.types";

export function ReliabilityCard({ breakdown }: { breakdown: ReliabilityBreakdown | null }) {
  const completed = breakdown?.gigs_completed ?? 0;
  const noShows = breakdown?.no_shows ?? 0;
  const cancellations = breakdown?.worker_cancellations ?? 0;
  const score = breakdown?.reliability_score ?? 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-verified-500" />
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Built from real completions — not a hidden algorithm. Every factor below feeds the score.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Factor value={completed} label="Completed" tone="verified" />
        <Factor value={noShows} label="No-shows" tone="danger" />
        <Factor value={cancellations} label="Cancellations" tone="danger" />
      </div>
      <p className="text-xs text-ink-400">
        Score = 100 × (completed + 3) / (completed + no-shows + cancellations + 3). The +3 is a grace buffer so one
        early miss doesn&apos;t define your score — it fades as you complete more gigs. Current score: <strong className="text-ink-700 dark:text-ink-200">{score}%</strong>.
      </p>
    </div>
  );
}

function Factor({ value, label, tone }: { value: number; label: string; tone: "verified" | "danger" }) {
  return (
    <div className="rounded-xl bg-ink-50 py-2.5 dark:bg-ink-800">
      <p className={`text-lg font-bold ${tone === "verified" ? "text-verified-600 dark:text-verified-400" : "text-red-500"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  );
}
