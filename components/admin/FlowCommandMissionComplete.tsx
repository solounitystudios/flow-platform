"use client";

import { useEffect } from "react";
import { CheckCircle2, History, ShieldAlert } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FlowCommandState, FlowLastCompletedMission, LiveRepoStatus } from "@/lib/admin/flow-command";
import { qaTone } from "@/lib/admin/flow-command-ui";
import { cn } from "@/lib/utils";

function BoolPill({ label, value }: { label: string; value: boolean | null | undefined }) {
  const text = value === true ? "YES" : value === false ? "NO" : "unknown";
  const tone = value === true ? "verified" : value === false ? "neutral" : "gold";
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-950">
      <span className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</span>
      <Badge tone={tone}>{text}</Badge>
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-950">
      <span className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</span>
      <Badge tone={qaTone(value)}>{value}</Badge>
    </div>
  );
}

/** Renders the "FLOW MISSION COMPLETE" banner when every checkpoint in the
 * current mission is done, and sets the document title as a tab-visible
 * completion indicator while this page is open — restored on unmount. This
 * is the entirety of the "notification": no email/SMS/push/webhook call. */
export function FlowCommandCurrentMissionComplete({ state, liveRepo }: { state: FlowCommandState; liveRepo: LiveRepoStatus }) {
  const allDone = state.checkpoints.length > 0 && state.checkpoints.every((c) => c.status === "done");
  // Every checkpoint being done is a genuine milestone, but it isn't a
  // celebration if QA failed or the founder still hasn't signed off — those
  // states stay calm and serious rather than festive, per the honest-status
  // rule this whole page follows.
  const qaFailed = state.qa_status.toUpperCase() === "FAIL";
  const needsFounder = state.founder_approval_required;
  const isCalm = qaFailed || needsFounder;

  useEffect(() => {
    if (!allDone) return;
    const original = document.title;
    document.title = isCalm ? "FLOW — Checkpoints done, action needed" : "✅ FLOW Mission Complete";
    return () => {
      document.title = original;
    };
  }, [allDone, isCalm]);

  if (!allDone) return null;

  const agentNames = state.agents.map((a) => a.name);

  return (
    <Card
      className={cn(
        "motion-safe:animate-slide-up",
        isCalm ? "border-gold-500/40 bg-gold-500/5" : "border-verified-500/40 bg-verified-500/5",
      )}
    >
      <CardHeader>
        <h2 className={cn("flex items-center gap-2 text-lg font-bold", isCalm ? "text-gold-600 dark:text-gold-400" : "text-verified-600 dark:text-verified-400")}>
          {isCalm ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          {isCalm ? "ALL CHECKPOINTS DONE — REVIEW NEEDED" : "FLOW MISSION COMPLETE"}
        </h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-ink-700 dark:text-ink-200">{state.mission}</p>
        {isCalm && (
          <p className="text-xs font-medium text-gold-600 dark:text-gold-400">
            {qaFailed ? "QA reported FAIL on this batch — do not treat this as shippable." : "Waiting on founder approval before this counts as fully done."}
          </p>
        )}
        {agentNames.length > 0 && <p className="text-xs text-ink-500 dark:text-ink-400">Specialists used: {agentNames.join(", ")}</p>}
        {state.files_touched.length > 0 && (
          <p className="text-xs text-ink-500 dark:text-ink-400">Files changed: {state.files_touched.length}</p>
        )}
        {state.schema_impact?.changed && (
          <p className="text-xs text-ink-500 dark:text-ink-400">Migration: {state.schema_impact.notes ?? "schema changed this batch"}</p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StatusPill label="QA" value={state.qa_status} />
          <BoolPill label="Production touched" value={state.production_touched} />
          <BoolPill label="Founder approval required" value={state.founder_approval_required} />
          {liveRepo.available && (
            <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-950">
              <span className="text-xs font-medium text-ink-500 dark:text-ink-400">Pushed to origin</span>
              <Badge tone={liveRepo.aheadOfOrigin === 0 ? "verified" : "gold"}>
                {liveRepo.hasUpstream
                  ? liveRepo.aheadOfOrigin === 0
                    ? "YES"
                    : `NO — ${liveRepo.aheadOfOrigin ?? "?"} commit${liveRepo.aheadOfOrigin === 1 ? "" : "s"} ahead`
                  : "no upstream tracked"}
              </Badge>
            </div>
          )}
        </div>
        {liveRepo.available && liveRepo.lastCommit && (
          <p className="truncate font-mono text-xs text-ink-400">Last commit: {liveRepo.lastCommit}</p>
        )}
      </CardBody>
    </Card>
  );
}

export function FlowCommandLastMissionRecap({ mission }: { mission: FlowLastCompletedMission }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900 dark:text-white">
          <History className="h-5 w-5" /> Last completed mission
        </h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="font-semibold text-ink-800 dark:text-ink-100">{mission.name}</p>
        {mission.summary && <p className="text-sm text-ink-600 dark:text-ink-300">{mission.summary}</p>}
        {mission.commit && <p className="font-mono text-xs text-ink-400">{mission.commit}</p>}
        {mission.agents_used && mission.agents_used.length > 0 && (
          <p className="text-xs text-ink-500 dark:text-ink-400">Agents used: {mission.agents_used.join(", ")}</p>
        )}
        {mission.migration && <p className="text-xs text-ink-500 dark:text-ink-400">Migration: {mission.migration}</p>}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StatusPill label="QA" value={mission.qa_status} />
          <StatusPill label="Build" value={mission.build_status} />
          <StatusPill label="Typecheck" value={mission.typecheck_status} />
          <StatusPill label="Lint" value={mission.lint_status} />
          <BoolPill label="Production touched" value={mission.production_touched} />
          <BoolPill label="Pushed" value={mission.pushed} />
        </div>
      </CardBody>
    </Card>
  );
}
