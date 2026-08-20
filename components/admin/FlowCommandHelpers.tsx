import { Terminal } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CopyButton } from "@/components/admin/CopyButton";

export interface FlowCommand {
  label: string;
  text: string;
}

export const COMMANDS: FlowCommand[] = [
  { label: "Approve checkpoint", text: "FLOW APPROVE CHECKPOINT" },
  { label: "Simple status", text: "FLOW SIMPLE STATUS" },
  { label: "Risks", text: "FLOW RISKS" },
  { label: "Safe point", text: "FLOW SAFE POINT" },
  { label: "QA", text: "FLOW QA" },
  { label: "Release check", text: "FLOW RELEASE CHECK" },
  { label: "Stop an agent", text: "FLOW STOP <agent>" },
  { label: "Redirect an agent", text: "FLOW REDIRECT <agent>: <instruction>" },
  { label: "What changed", text: "FLOW WHAT CHANGED" },
  { label: "File ownership", text: "FLOW FILE OWNERSHIP" },
];

/**
 * Copy-ready command templates only — pasted into a Claude Code session by
 * the founder. Nothing here calls, controls, or redirects a live agent from
 * this app; there is no runtime path from this page to an active session.
 */
export function FlowCommandHelpers() {
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900 dark:text-white">
          <Terminal className="h-5 w-5" /> All commands
        </h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Suggested command — paste into your Claude Code session. Copying here does not do anything by itself.
        </p>
        <ul className="space-y-2">
          {COMMANDS.map((cmd) => (
            <li
              key={cmd.text}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-2.5 dark:border-ink-800 dark:bg-ink-950"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{cmd.label}</p>
                <p className="truncate font-mono text-sm text-ink-800 dark:text-ink-100">{cmd.text}</p>
              </div>
              <CopyButton text={cmd.text} />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
