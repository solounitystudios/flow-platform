import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FlowRiskFlag } from "@/lib/admin/flow-command";
import { riskTone } from "@/lib/admin/flow-command-ui";

export function FlowCommandRiskView({ flags }: { flags: FlowRiskFlag[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Risk &amp; rogue-agent watch</h2>
      </CardHeader>
      <CardBody>
        {flags.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No risk flags right now" body="Nothing in the current mission state needs a second look." />
        ) : (
          <ul className="space-y-3">
            {flags.map((flag, i) => (
              <li key={i} className="rounded-xl border border-ink-100 p-3.5 dark:border-ink-800">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={riskTone(flag.severity)} icon={<ShieldAlert className="h-3 w-3" />}>
                    {flag.severity}
                  </Badge>
                  {flag.agent && <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">{flag.agent}</span>}
                </div>
                <p className="mt-1.5 text-sm text-ink-700 dark:text-ink-200">{flag.what}</p>
                {flag.filesAffected.length > 0 && (
                  <p className="mt-1 truncate font-mono text-xs text-ink-400">{flag.filesAffected.join(", ")}</p>
                )}
                <p className="mt-2 text-xs font-medium text-ink-500 dark:text-ink-400">Recommended: {flag.recommendedAction}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
