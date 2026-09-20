import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { connectorBadge, type ConnectorView, type Tone } from "@/lib/passport/domain";
import { formatDateTime } from "@/lib/utils";

export const BADGE_TONE = { verified: "verified", warning: "gold", neutral: "neutral", danger: "danger" } as const satisfies Record<Tone, string>;

const CONFIG_LABEL = { configured: "Configured", not_configured: "Not configured", misconfigured: "Misconfigured" } as const;

/**
 * One connector, summarised. The three facts a reader needs are shown
 * SEPARATELY and never merged: the contract (can Passport talk to it?), the
 * gateway configuration (will Passport accept it?) and the connection (has it
 * actually connected?). "Contract: Ready" is not "Connected".
 */
export function ConnectorSummaryCard({ view }: { view: ConnectorView }) {
  const badge = connectorBadge(view);
  const conn = view.connection;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink-900 dark:text-white">{view.name}</h3>
            {view.summary && <p className="text-sm text-ink-500 dark:text-ink-400">{view.summary}</p>}
          </div>
          <Badge tone={BADGE_TONE[badge.tone]}>{badge.label}</Badge>
        </div>

        <dl className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm dark:divide-ink-800 dark:border-ink-800">
          <Row label="Contract" value={view.contract.ready ? "Ready" : "None"} />
          <Row label="Gateway configuration" value={CONFIG_LABEL[view.configuration.state]} />
          <Row label="Connection" value={conn.kind === "recorded" ? conn.health.label : conn.kind === "none" ? "Not connected" : "Health unavailable"} />
          {conn.kind === "recorded" && (
            <Row label="Last successful contact" value={conn.health.lastSuccess ? `${conn.health.lastSuccess.ago} · ${formatDateTime(conn.health.lastSuccess.at)}` : "Never"} />
          )}
          {conn.kind === "recorded" && conn.health.lastError && <Row label="Last failure" value={conn.health.lastError.label} />}
        </dl>

        <p className="text-sm text-ink-600 dark:text-ink-300">{conn.kind === "recorded" ? conn.health.explanation : conn.text}</p>

        {view.attentionReasons.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-gold-500/10 p-3 text-sm text-gold-600 dark:text-gold-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Action needed</p>
              <ul className="list-inside list-disc">
                {view.attentionReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <Link href={`/admin/connections/${view.key}`} className="inline-block text-sm font-medium text-flow-600">
          Details, capabilities and history
        </Link>
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-right font-medium text-ink-900 dark:text-white">{value}</dd>
    </div>
  );
}
