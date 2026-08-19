"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FlowAgentStatus } from "@/lib/admin/flow-command";
import { agentStatusTone, riskTone } from "@/lib/admin/flow-command-ui";

export function FlowCommandAgentCard({ agent }: { agent: FlowAgentStatus }) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <Card>
      <CardHeader className="items-start pb-2">
        <div className="space-y-1">
          <p className="font-semibold text-ink-900 dark:text-white">{agent.name}</p>
          {agent.role && <p className="text-xs text-ink-500 dark:text-ink-400">{agent.role}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge tone={agentStatusTone(agent.status)}>{agent.status}</Badge>
          <Badge tone={riskTone(agent.risk)}>{agent.risk} risk</Badge>
        </div>
      </CardHeader>

      <CardBody className="space-y-2.5 pt-3">
        {agent.current_task && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Currently</p>
            <p className="text-sm text-ink-800 dark:text-ink-100">{agent.current_task}</p>
          </div>
        )}
        {agent.last_action && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Last action</p>
            <p className="text-sm text-ink-700 dark:text-ink-200">{agent.last_action}</p>
          </div>
        )}
        {agent.next_action && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Next up</p>
            <p className="text-sm text-ink-700 dark:text-ink-200">{agent.next_action}</p>
          </div>
        )}
        {agent.waiting_on && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Waiting on</p>
            <p className="text-sm text-ink-700 dark:text-ink-200">{agent.waiting_on}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          className="flex min-h-[36px] w-full items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-xs font-medium text-ink-500 hover:bg-ink-50 dark:border-ink-800 dark:text-ink-400 dark:hover:bg-ink-800"
        >
          Show technical details
          {showTechnical ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showTechnical && (
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
        )}
      </CardBody>
    </Card>
  );
}
