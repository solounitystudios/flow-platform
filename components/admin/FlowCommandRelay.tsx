import { Check, ArrowRight, User } from "lucide-react";
import type { FlowAgentStatus } from "@/lib/admin/flow-command";
import { normalizeAgentStatus, isAgentActiveNow, agentStatusVisual } from "@/lib/admin/flow-command-ui";
import { cn } from "@/lib/utils";

function RelayNode({ agent }: { agent: FlowAgentStatus }) {
  const kind = normalizeAgentStatus(agent.status);
  const isDone = kind === "DONE";
  const isActive = isAgentActiveNow(agent.status);
  const visual = agentStatusVisual(agent.status);

  if (isActive) {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border-2 px-4 py-3 text-center",
          visual.cardClass,
        )}
      >
        <span className={cn("h-2.5 w-2.5 rounded-full", visual.dotClass, visual.animationClass)} aria-hidden="true" />
        <p className="max-w-[110px] truncate text-sm font-bold text-ink-900 dark:text-white">{agent.name}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{visual.label}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
        isDone ? "border-verified-500/30 bg-verified-500/5" : "border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-950",
      )}
      title={`${agent.name} — ${visual.label}`}
    >
      {isDone ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-verified-600 dark:text-verified-400" strokeWidth={3} />
      ) : (
        <span className={cn("h-2 w-2 shrink-0 rounded-full", visual.dotClass)} aria-hidden="true" />
      )}
      <span className={cn("max-w-[90px] truncate text-xs font-medium", isDone ? "text-ink-600 dark:text-ink-300" : "text-ink-400 dark:text-ink-500")}>
        {agent.name}
      </span>
    </div>
  );
}

/**
 * Compact relay showing the real sequence of agents in this mission, in the
 * order they appear in state.agents — no invented order, no hardcoded team.
 * Completed agents compress to a checkmark chip, the active agent(s) expand,
 * everything else stays muted, ending in a founder marker.
 */
export function FlowCommandRelay({ agents, founderApprovalRequired }: { agents: FlowAgentStatus[]; founderApprovalRequired: boolean }) {
  if (agents.length === 0) return null;

  return (
    <div className="flex w-full items-center gap-2 overflow-x-auto pb-1" role="list" aria-label="Agent relay for the current mission">
      {agents.map((agent, i) => (
        <div key={agent.name} className="flex shrink-0 items-center gap-2">
          <RelayNode agent={agent} />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-200 dark:text-ink-700" aria-hidden="true" />
        </div>
      ))}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
          founderApprovalRequired
            ? "border-gold-500/50 bg-gold-500/10 text-gold-600 dark:text-gold-400"
            : "border-ink-100 bg-ink-50 text-ink-400 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-500",
        )}
      >
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-semibold">{founderApprovalRequired ? "FOUNDER ← YOU ARE HERE" : "FOUNDER"}</span>
      </div>
    </div>
  );
}
