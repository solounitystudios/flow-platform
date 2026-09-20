import { AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectorSummaryCard } from "@/components/passport/connections/ConnectorSummaryCard";
import type { ConnectionsCenterView as Center, ConnectorView } from "@/lib/passport/domain";

/** The Connections Center: connected, needs attention, and what is supported but not connected. */
export function ConnectionsCenterView({ center }: { center: Center }) {
  return (
    <div className="space-y-8">
      {center.read === "unavailable" && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-gold-500/40 bg-gold-500/10 p-4 text-sm text-gold-600 dark:text-gold-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Connection health is unavailable.</span> The connection records could not be read just now. Nothing below should be read as healthy or unhealthy — try again shortly.
          </p>
        </div>
      )}
      {center.unreadableRecords > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-gold-500/40 bg-gold-500/10 p-4 text-sm text-gold-600 dark:text-gold-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {center.unreadableRecords} connection record{center.unreadableRecords === 1 ? "" : "s"} could not be read and {center.unreadableRecords === 1 ? "is" : "are"} not shown. That is not the same as healthy.
          </p>
        </div>
      )}

      {center.healthUnavailable.length > 0 && (
        <Section title="Supported connectors — health unavailable" views={center.healthUnavailable} />
      )}

      {center.read === "ok" && (
        <>
          <Section
            title="Needs attention"
            views={center.needsAttention}
            empty={<EmptyState title="Nothing needs attention" body="No recorded connection is stale, degraded, disconnected or misconfigured." />}
            hideWhenEmpty={center.connected.length === 0 && center.needsAttention.length === 0}
          />
          <Section
            title="Connected systems"
            views={center.connected}
            empty={<EmptyState title="No connected systems" body="No external system has made an authenticated, healthy contact with Passport yet." />}
          />
          <Section
            title="Available, not connected"
            views={center.notConnected}
            empty={<EmptyState title="Every supported connector has a record" body="Each connector Passport has a contract for appears above." />}
          />
        </>
      )}
    </div>
  );
}

function Section({ title, views, empty, hideWhenEmpty }: { title: string; views: ConnectorView[]; empty?: React.ReactNode; hideWhenEmpty?: boolean }) {
  if (views.length === 0 && (hideWhenEmpty || !empty)) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</h2>
      {views.length === 0 ? empty : views.map((view) => <ConnectorSummaryCard key={`${view.key}:${view.connection.kind === "recorded" ? view.connection.level : "none"}`} view={view} />)}
    </section>
  );
}
