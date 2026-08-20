import { GitBranch, GitCommitHorizontal, Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CheckpointTrail } from "@/components/ui/CheckpointTrail";
import type { FlowCommandState, LiveRepoStatus } from "@/lib/admin/flow-command";
import { qaLabel, qaTone, usageModeTone, founderApprovalTone, founderApprovalLabel, detectPossibleStale } from "@/lib/admin/flow-command-ui";
import { cn, formatDateTime } from "@/lib/utils";

export function FlowCommandMissionBar({ state, liveRepo }: { state: FlowCommandState; liveRepo: LiveRepoStatus }) {
  const branch = liveRepo.available ? liveRepo.branch : state.repo_status?.branch ?? null;
  const branchIsLive = liveRepo.available && !!liveRepo.branch;

  const productionBanner =
    state.production_touched === false
      ? { text: "PRODUCTION UNTOUCHED", tone: "verified" as const }
      : state.production_touched === true
        ? { text: "PRODUCTION MODIFIED", tone: "urgent" as const }
        : { text: "PRODUCTION STATE UNKNOWN", tone: "gold" as const };

  const currentPhaseIndex = state.phases.indexOf(state.phase);
  const possiblyStale = detectPossibleStale(state, liveRepo);

  return (
    <Card className="border-flow-200/70 dark:border-flow-900/60">
      <CardBody className="space-y-5">
        {/* Mission identity — the strongest element on the page */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-flow-600 dark:text-flow-400">Current mission</p>
          <h1 className="text-2xl font-extrabold leading-tight text-ink-900 dark:text-white sm:text-3xl">{state.mission}</h1>
        </div>

        {/* Phase — the dominant "you are here" signal */}
        {state.phases.length > 0 && (
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Phase</p>
              <p className="text-xl font-bold text-flow-700 dark:text-flow-300 sm:text-2xl">{state.phase}</p>
            </div>
            <ol className="mt-2.5 flex w-full items-center gap-1 overflow-x-auto pb-1" role="list">
              {state.phases.map((p, i) => {
                const isCurrent = i === currentPhaseIndex;
                const isPast = currentPhaseIndex >= 0 && i < currentPhaseIndex;
                return (
                  <li key={p} className="flex min-w-0 flex-1 items-center gap-1">
                    <span
                      className={cn(
                        "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                        isPast && "bg-verified-500 text-white",
                        isCurrent && "bg-flow-600 text-white ring-4 ring-flow-500/20",
                        !isPast && !isCurrent && "bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500",
                      )}
                      title={p}
                    >
                      {isPast ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "truncate text-[11px] font-medium sm:text-xs",
                        isCurrent && "font-bold text-flow-700 dark:text-flow-300",
                        isPast && "text-ink-500 dark:text-ink-400",
                        !isPast && !isCurrent && "text-ink-300 dark:text-ink-600",
                      )}
                    >
                      {p}
                    </span>
                    {i < state.phases.length - 1 && (
                      <span className={cn("h-0.5 flex-1 rounded-full", isPast ? "bg-verified-500" : "bg-ink-100 dark:bg-ink-800")} aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <CheckpointTrail checkpoints={state.checkpoints} showSummary />

        {/* Status row: QA, production, founder approval — scannable in one glance */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div
            className={cn(
              "flex items-center justify-center rounded-xl border px-4 py-2.5 text-center text-sm font-semibold",
              productionBanner.tone === "verified" && "border-verified-500/30 bg-verified-500/10 text-verified-600 dark:text-verified-400",
              productionBanner.tone === "urgent" && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
              productionBanner.tone === "gold" && "border-gold-500/30 bg-gold-500/10 text-gold-600 dark:text-gold-400",
            )}
          >
            {productionBanner.text}
          </div>
          <div className="flex items-center justify-center rounded-xl border border-ink-100 bg-ink-50 px-4 py-2.5 dark:border-ink-800 dark:bg-ink-950">
            <Badge tone={qaTone(state.qa_status)}>{qaLabel(state.qa_status)}</Badge>
          </div>
          <div className="flex items-center justify-center rounded-xl border border-ink-100 bg-ink-50 px-4 py-2.5 dark:border-ink-800 dark:bg-ink-950">
            <Badge tone={founderApprovalTone(state.founder_approval_required)}>{founderApprovalLabel(state.founder_approval_required)}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-950">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
              <GitBranch className="h-3.5 w-3.5" /> Branch
            </p>
            <p className="mt-1 truncate font-mono text-sm text-ink-800 dark:text-ink-100">{branch ?? "unknown"}</p>
            {!branchIsLive && <p className="mt-0.5 text-[11px] text-ink-400">from last recorded status, not live</p>}
          </div>

          <div className="rounded-xl border border-ink-100 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-950">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Working tree</p>
            {liveRepo.available ? (
              <p className="mt-1 text-sm text-ink-800 dark:text-ink-100">
                {liveRepo.workingTreeClean ? "Clean" : `Dirty — ${liveRepo.changedFileCount} file${liveRepo.changedFileCount === 1 ? "" : "s"} changed`}
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-400">Not available in this environment</p>
            )}
          </div>

          <div className="rounded-xl border border-ink-100 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-950">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
              <GitCommitHorizontal className="h-3.5 w-3.5" /> Last safe checkpoint
            </p>
            <p className="mt-1 truncate font-mono text-sm text-ink-800 dark:text-ink-100">
              {liveRepo.available ? liveRepo.lastCommit ?? "unknown" : state.repo_status?.last_commit ?? "unknown"}
            </p>
          </div>
        </div>

        {/* Checkpoint-based, not live-polling — always shown, never framed as a live indicator */}
        <div className="space-y-1 border-t border-ink-100 pt-3 dark:border-ink-800">
          <p className="text-xs text-ink-400">
            Status last updated {state.updated_at ? formatDateTime(state.updated_at) : "unknown"} — this is a checkpoint snapshot flow-lead writes at
            meaningful milestones, not a live feed.
          </p>
          {possiblyStale && (
            <p className="text-xs font-medium text-gold-600 dark:text-gold-400">
              This snapshot may be behind live reality (an agent is shown active while the working tree or checkpoints suggest otherwise) — treat it as
              informational, not current-second truth.
            </p>
          )}
          <p className="text-xs text-ink-400">
            {state.usage_mode_note ?? "Usage mode is manually reported — not live-detected."} <Badge tone={usageModeTone(state.usage_mode)}>Usage: {state.usage_mode}</Badge>{" "}
            Active agents: {state.active_agent_count ?? "unknown"}
            {state.parallelism_limited ? " · parallelism currently limited" : ""}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
