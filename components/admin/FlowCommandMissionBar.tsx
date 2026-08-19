import { GitBranch, GitCommitHorizontal } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CheckpointTrail } from "@/components/ui/CheckpointTrail";
import type { FlowCommandState, LiveRepoStatus } from "@/lib/admin/flow-command";
import { qaLabel, qaTone, usageModeTone } from "@/lib/admin/flow-command-ui";

export function FlowCommandMissionBar({ state, liveRepo }: { state: FlowCommandState; liveRepo: LiveRepoStatus }) {
  const branch = liveRepo.available ? liveRepo.branch : state.repo_status?.branch ?? null;
  const branchIsLive = liveRepo.available && !!liveRepo.branch;

  const productionBanner =
    state.production_touched === false
      ? { text: "PRODUCTION UNTOUCHED", tone: "verified" as const }
      : state.production_touched === true
        ? { text: "PRODUCTION MODIFIED", tone: "urgent" as const }
        : { text: "PRODUCTION STATE UNKNOWN", tone: "gold" as const };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Current mission</p>
            <h1 className="text-xl font-bold text-ink-900 dark:text-white">{state.mission}</h1>
            <p className="text-sm text-ink-500 dark:text-ink-400">Phase: {state.phase}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={usageModeTone(state.usage_mode)}>Usage: {state.usage_mode}</Badge>
            <Badge tone={qaTone(state.qa_status)}>{qaLabel(state.qa_status)}</Badge>
          </div>
        </div>

        <CheckpointTrail checkpoints={state.checkpoints} showSummary />

        <div
          className={
            productionBanner.tone === "verified"
              ? "rounded-xl border border-verified-500/30 bg-verified-500/10 px-4 py-2.5 text-sm font-semibold text-verified-700 dark:text-verified-400"
              : productionBanner.tone === "urgent"
                ? "rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-700 dark:text-red-400"
                : "rounded-xl border border-gold-500/30 bg-gold-500/10 px-4 py-2.5 text-sm font-semibold text-gold-700 dark:text-gold-400"
          }
        >
          {productionBanner.text}
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

        <p className="text-xs text-ink-400">
          {state.usage_mode_note ?? "Usage mode is manually reported — not live-detected."}
          {" "}
          Active agents: {state.active_agent_count ?? "unknown"}
          {state.parallelism_limited ? " · parallelism currently limited" : ""}
        </p>
      </CardBody>
    </Card>
  );
}
