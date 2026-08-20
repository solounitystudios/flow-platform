"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FlowAgentStatus } from "@/lib/admin/flow-command";
import { agentStatusTone, riskTone, normalizeAgentStatus, agentStatusVisual } from "@/lib/admin/flow-command-ui";
import { cn } from "@/lib/utils";

function TechnicalDetails({ agent }: { agent: FlowAgentStatus }) {
  return (
    <div className="space-y-2 rounded-lg bg-ink-50 p-3 text-xs dark:bg-ink-950">
      <div>
        <p className="font-medium uppercase tracking-wide text-ink-400">Raw status</p>
        <p className="font-mono text-ink-700 dark:text-ink-200">{agent.status}</p>
      </div>
      <div>
        <p className="font-medium uppercase tracking-wide text-ink-400">Schema impact</p>
        <p className="text-ink-700 dark:text-ink-200">{agent.schema_impact ? "Yes" : "No"}</p>
      </div>
      {agent.files_owned.length > 0 && (
        <div>
          <p className="font-medium uppercase tracking-wide text-ink-400">Files owned</p>
          <ul className="mt-0.5 space-y-0.5 font-mono text-ink-600 dark:text-ink-300">
            {agent.files_owned.map((f) => (
              <li key={f} className="truncate">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {agent.files_touched.length > 0 && (
        <div>
          <p className="font-medium uppercase tracking-wide text-ink-400">Files touched this batch</p>
          <ul className="mt-0.5 space-y-0.5 font-mono text-ink-600 dark:text-ink-300">
            {agent.files_touched.map((f) => (
              <li key={f} className="truncate">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TechnicalToggle({ showTechnical, onToggle }: { showTechnical: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-[36px] w-full items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-xs font-medium text-ink-500 hover:bg-ink-50 dark:border-ink-800 dark:text-ink-400 dark:hover:bg-ink-800"
    >
      Show technical details
      {showTechnical ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Compact card for a DONE agent — name, checkmark, one-line accomplishment,
 * with full technical details still available behind the expand toggle. */
function CompactDoneCard({ agent }: { agent: FlowAgentStatus }) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <Card className="border-verified-500/25 bg-verified-500/[0.03]">
      <CardBody className="space-y-2 p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-verified-500 text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900 dark:text-white">{agent.name}</p>
            {agent.last_action && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{agent.last_action}</p>}
          </div>
        </div>

        <TechnicalToggle showTechnical={showTechnical} onToggle={() => setShowTechnical((v) => !v)} />
        {showTechnical && <TechnicalDetails agent={agent} />}
      </CardBody>
    </Card>
  );
}

/** Default (non-active, non-done) card — genuinely light: name, status,
 * one-line role/task/last/next, risk badge, and a files-touched count only
 * (no paths) unless expanded. */
function DefaultAgentCard({ agent }: { agent: FlowAgentStatus }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const visual = agentStatusVisual(agent.status);
  const kind = normalizeAgentStatus(agent.status);

  return (
    <Card className={cn("border", visual.cardClass)}>
      <CardHeader className="items-start pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", visual.dotClass)} aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            <p className="truncate font-semibold text-ink-900 dark:text-white">{agent.name}</p>
            {agent.role && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{agent.role}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge tone={agentStatusTone(agent.status)}>{visual.label}</Badge>
          <Badge tone={riskTone(agent.risk)}>{agent.risk} risk</Badge>
        </div>
      </CardHeader>

      <CardBody className="space-y-2 pt-3">
        {agent.current_task && (
          <p className="line-clamp-1 text-sm text-ink-800 dark:text-ink-100" title={agent.current_task}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Currently </span>
            {agent.current_task}
          </p>
        )}
        {agent.last_action && (
          <p className="line-clamp-1 text-sm text-ink-700 dark:text-ink-200" title={agent.last_action}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Last </span>
            {agent.last_action}
          </p>
        )}
        {agent.next_action && (
          <p className="line-clamp-1 text-sm text-ink-700 dark:text-ink-200" title={agent.next_action}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Next </span>
            {agent.next_action}
          </p>
        )}
        {kind === "WAITING" && agent.waiting_on && (
          <p className="line-clamp-1 text-sm font-medium text-gold-600 dark:text-gold-400" title={agent.waiting_on}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-gold-500">Waiting on </span>
            {agent.waiting_on}
          </p>
        )}

        <p className="text-xs text-ink-400">
          {agent.files_touched.length} file{agent.files_touched.length === 1 ? "" : "s"} touched this batch
        </p>

        <TechnicalToggle showTechnical={showTechnical} onToggle={() => setShowTechnical((v) => !v)} />
        {showTechnical && <TechnicalDetails agent={agent} />}
      </CardBody>
    </Card>
  );
}

export function FlowCommandAgentCard({ agent }: { agent: FlowAgentStatus }) {
  const kind = normalizeAgentStatus(agent.status);
  if (kind === "DONE") return <CompactDoneCard agent={agent} />;
  return <DefaultAgentCard agent={agent} />;
}
