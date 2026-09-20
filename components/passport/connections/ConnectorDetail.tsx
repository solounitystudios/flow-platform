import { Check, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BADGE_TONE } from "@/components/passport/connections/ConnectorSummaryCard";
import { connectorBadge, type ConnectorView, type IntegrationEventView } from "@/lib/passport/domain";
import { formatDateTime } from "@/lib/utils";

export type HistoryState = { state: "ok"; events: IntegrationEventView[] } | { state: "unavailable" };

const SOURCE_TEXT = {
  gateway_configuration: "What the gateway currently enforces for this connector.",
  none: "No scopes: nothing is registered for this connector.",
} as const;

/** Everything known about one connector, from canonical state only. */
export function ConnectorDetail({ view, history }: { view: ConnectorView; history: HistoryState }) {
  const badge = connectorBadge(view);
  const conn = view.connection;
  const { capabilities: cap } = view;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-bold text-ink-900 dark:text-white">{view.name}</h1>
          <Badge tone={BADGE_TONE[badge.tone]}>{badge.label}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          {view.role && <p className="text-sm text-ink-600 dark:text-ink-300">{view.role}</p>}
          <Facts
            rows={[
              ["Connector", view.key],
              ["Level", conn.kind === "recorded" ? (conn.level === "platform" ? "Platform-level" : "Owned by a Passport subject") : "—"],
              ["Registered", conn.kind === "recorded" ? `${conn.registeredAgo} · ${formatDateTime(conn.registeredAt)}` : "Not registered"],
              ["Connector schema version", conn.kind === "recorded" ? "Not recorded" : "—"],
              ["Provenance role", "Produces evidence; never a verifier"],
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Health</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-700 dark:text-ink-200">{conn.kind === "recorded" ? conn.health.explanation : conn.text}</p>
          {conn.kind === "recorded" && (
            <Facts
              rows={[
                ["Last successful contact", conn.health.lastSuccess ? `${conn.health.lastSuccess.ago} · ${formatDateTime(conn.health.lastSuccess.at)}` : "Never"],
                ["Last attempt", conn.health.lastAttempt ? `${conn.health.lastAttempt.ago} · ${formatDateTime(conn.health.lastAttempt.at)}` : "None recorded"],
                ["Last failure", conn.health.lastError ? conn.health.lastError.label : "None recorded"],
                ["Expected contact window", conn.health.staleWindow],
              ]}
            />
          )}
          {view.attentionReasons.length > 0 && (
            <ul className="list-inside list-disc text-sm font-medium text-gold-600 dark:text-gold-400">
              {view.attentionReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Contract and configuration</h2>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <p>
            <span className="font-semibold text-ink-900 dark:text-white">Contract: </span>
            {view.contract.text}
          </p>
          <p>
            <span className="font-semibold text-ink-900 dark:text-white">Gateway configuration: </span>
            {view.configuration.text}
          </p>
          {view.configuration.keys.length > 0 && (
            <ul className="space-y-1 text-ink-600 dark:text-ink-300">
              {view.configuration.keys.map((key) => (
                <li key={key.key_id}>
                  Key <code className="rounded bg-ink-100 px-1 dark:bg-ink-800">{key.key_id}</code> — {key.status}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-400">Key identifiers only. Secrets are never displayed anywhere.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">What this connector can and cannot do</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {(view.capabilityNote ?? SOURCE_TEXT[view.capabilitySource]) && <p className="text-xs text-ink-400">{view.capabilityNote ?? SOURCE_TEXT[view.capabilitySource]}</p>}
          <CapabilityList title="Can" icon={<Check className="h-4 w-4 text-verified-600" />} items={cap.can.map((c) => c.label)} none="Nothing is currently permitted." />
          <CapabilityList title="Does not have" icon={<Minus className="h-4 w-4 text-ink-400" />} items={cap.lacks.map((c) => c.label)} none="Holds every gateway scope." />
          <CapabilityList title="Cannot — no scope grants this" icon={<X className="h-4 w-4 text-red-600" />} items={[...cap.never]} />
          {cap.unrecognisedScopes > 0 && <p className="text-xs text-ink-400">{cap.unrecognisedScopes} unrecognised scope{cap.unrecognisedScopes === 1 ? "" : "s"} on the record; not interpreted.</p>}
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <Flag label="Can submit evidence" on={cap.flags.canSubmitEvidence} />
            <Flag label="Can request evidence" on={cap.flags.canRequestEvidence} />
            <Flag label="Can make verification decisions" on={cap.flags.canMakeVerificationDecisions} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Recent integration history</h2>
        </CardHeader>
        <CardBody>
          {history.state === "unavailable" ? (
            <p className="text-sm text-gold-600 dark:text-gold-400">History is unavailable: it could not be read just now.</p>
          ) : history.events.length === 0 ? (
            <p className="text-sm text-ink-400">No integration events recorded for this connector.</p>
          ) : (
            <ol className="space-y-2">
              {history.events.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-ink-900 dark:text-white">{event.label}</p>
                    {event.note && <p className="text-ink-500 dark:text-ink-400">{event.note}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">{event.ago} · {formatDateTime(event.at)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-ink-400">The most recent events only. Event payloads are never shown.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm dark:divide-ink-800 dark:border-ink-800">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 px-3 py-2">
          <dt className="text-ink-400">{label}</dt>
          <dd className="text-right font-medium text-ink-900 dark:text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CapabilityList({ title, icon, items, none }: { title: string; icon: React.ReactNode; items: string[]; none?: string }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</h3>
      {items.length === 0 ? (
        none && <p className="text-sm text-ink-400">{none}</p>
      ) : (
        <ul className="space-y-1 text-sm text-ink-700 dark:text-ink-200">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{icon}</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="rounded-xl border border-ink-100 p-2.5 dark:border-ink-800">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="font-semibold text-ink-900 dark:text-white">{on ? "Yes" : "No"}</dd>
    </div>
  );
}
