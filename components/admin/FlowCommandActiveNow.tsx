import { Activity, Users2, Hourglass } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FlowAgentStatus } from "@/lib/admin/flow-command";
import { agentStatusVisual, agentStatusTone, riskTone } from "@/lib/admin/flow-command-ui";
import { cn } from "@/lib/utils";

function ActiveAgentCard({ agent }: { agent: FlowAgentStatus }) {
  const visual = agentStatusVisual(agent.status);
  const isBlocked = agent.status.toUpperCase() === "BLOCKED";

  return (
    <Card className={cn("border-2", visual.cardClass)}>
      <CardBody className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("relative flex h-3.5 w-3.5 shrink-0 rounded-full", visual.dotClass, visual.animationClass)} aria-hidden="true" />
            <div>
              <p className="text-xl font-extrabold text-ink-900 dark:text-white sm:text-2xl">{agent.name}</p>
              {agent.role && <p className="text-sm text-ink-500 dark:text-ink-400">{agent.role}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={agentStatusTone(agent.status)}>{visual.label}</Badge>
            <Badge tone={riskTone(agent.risk)}>{agent.risk} risk</Badge>
          </div>
        </div>

        {isBlocked && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">Blocked — needs the founder</p>
            <p className="mt-1 text-sm font-medium text-red-800 dark:text-red-300">{agent.waiting_on ?? agent.current_task ?? "Reason not recorded."}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {agent.current_task && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">What it&apos;s doing</p>
              <p className="text-base font-medium text-ink-800 dark:text-ink-100">{agent.current_task}</p>
            </div>
          )}
          {agent.last_action && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Last move</p>
              <p className="text-sm text-ink-700 dark:text-ink-200">{agent.last_action}</p>
            </div>
          )}
          {agent.next_action && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Next move</p>
              <p className="text-sm text-ink-700 dark:text-ink-200">{agent.next_action}</p>
            </div>
          )}
          {!isBlocked && agent.waiting_on && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Waiting on</p>
              <p className="text-sm text-ink-700 dark:text-ink-200">{agent.waiting_on}</p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * The single largest visual element outside the mission hero. Shows every
 * agent whose status is WORKING/REVIEWING/BLOCKED (real state, no invented
 * order). When nothing is active, shows an honest standby message instead
 * of implying activity that isn't happening.
 */
export function FlowCommandActiveNow({ activeAgents, founderApprovalRequired }: { activeAgents: FlowAgentStatus[]; founderApprovalRequired: boolean }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-flow-600 dark:text-flow-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">Active now</h2>
      </div>

      {activeAgents.length === 0 ? (
        <Card className="border-dashed border-ink-200 dark:border-ink-800">
          <CardBody className="flex flex-col items-center gap-2 py-8 text-center">
            {founderApprovalRequired ? (
              <>
                <Hourglass className="h-7 w-7 text-gold-500" />
                <p className="text-lg font-bold text-ink-800 dark:text-ink-100">WAITING FOR FOUNDER</p>
                <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">No agent is currently active — this batch is paused for your review below.</p>
              </>
            ) : (
              <>
                <Users2 className="h-7 w-7 text-ink-300 dark:text-ink-600" />
                <p className="text-lg font-bold text-ink-800 dark:text-ink-100">TEAM STANDING BY</p>
                <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">No mission work is currently in flight.</p>
              </>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeAgents.map((agent) => (
            <ActiveAgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
