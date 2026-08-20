import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { CopyButton } from "@/components/admin/CopyButton";
import { COMMANDS, type FlowCommand } from "@/components/admin/FlowCommandHelpers";
import { cn } from "@/lib/utils";

/**
 * Picks a small, honest subset of the existing copy-ready command templates
 * most relevant to the current state — never a new fabricated command, just
 * a curated view into COMMANDS from FlowCommandHelpers.
 */
function pickRelevantCommands({
  founderApprovalRequired,
  qaStatus,
  hasRisks,
  allCheckpointsDone,
}: {
  founderApprovalRequired: boolean;
  qaStatus: string;
  hasRisks: boolean;
  allCheckpointsDone: boolean;
}): FlowCommand[] {
  const byLabel = (label: string) => COMMANDS.find((c) => c.label === label)!;
  const picked: FlowCommand[] = [];

  if (founderApprovalRequired) picked.push(byLabel("Approve checkpoint"));
  if (qaStatus.toUpperCase() !== "PASS") picked.push(byLabel("QA"));
  if (hasRisks) picked.push(byLabel("Risks"));
  picked.push(byLabel("What changed"));
  picked.push(byLabel("Safe point"));
  if (allCheckpointsDone) picked.push(byLabel("Release check"));

  // De-dupe while preserving order, cap at 5 so this stays a quick scan.
  const seen = new Set<string>();
  return picked.filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true))).slice(0, 5);
}

export function FlowCommandYourMove({
  founderApprovalRequired,
  qaStatus,
  hasRisks,
  allCheckpointsDone,
}: {
  founderApprovalRequired: boolean;
  qaStatus: string;
  hasRisks: boolean;
  allCheckpointsDone: boolean;
}) {
  const relevant = pickRelevantCommands({ founderApprovalRequired, qaStatus, hasRisks, allCheckpointsDone });

  return (
    <Card
      className={cn(
        "border-2",
        founderApprovalRequired
          ? "border-gold-500/50 bg-gold-500/5"
          : "border-verified-500/30 bg-verified-500/[0.03]",
      )}
    >
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2.5">
          {founderApprovalRequired ? (
            <AlertTriangle className="h-6 w-6 shrink-0 text-gold-600 dark:text-gold-400" />
          ) : (
            <CheckCircle2 className="h-6 w-6 shrink-0 text-verified-600 dark:text-verified-400" />
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Your move</p>
            <p
              className={cn(
                "text-lg font-extrabold sm:text-xl",
                founderApprovalRequired ? "text-gold-600 dark:text-gold-400" : "text-verified-600 dark:text-verified-400",
              )}
            >
              {founderApprovalRequired ? "FOUNDER APPROVAL REQUIRED" : "NO ACTION NEEDED"}
            </p>
          </div>
        </div>

        <p className="text-sm text-ink-500 dark:text-ink-400">
          Copy-ready commands to paste into your Claude Code session. Copying here does not do anything by itself — nothing on this page controls a live
          agent.
        </p>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {relevant.map((cmd) => (
            <li
              key={cmd.text}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-3.5 py-2.5 dark:border-ink-800 dark:bg-ink-900"
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
