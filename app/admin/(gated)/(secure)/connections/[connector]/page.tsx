import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSecureAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { gatewayServiceCredentialsPresent } from "@/lib/passport/gateway/service-client";
import { summarizeGatewayConfig } from "@/lib/passport/gateway/config-summary";
import { readIntegrationConnections, readIntegrationEvents } from "@/lib/passport/data";
import { allConnectors, buildConnectionsCenter, presentIntegrationEvents } from "@/lib/passport/domain";
import { ConnectorDetail, type HistoryState } from "@/components/passport/connections/ConnectorDetail";

export const metadata = { title: "Passport connection" };

export default async function AdminConnectorPage({ params }: { params: Promise<{ connector: string }> }) {
  await requireSecureAdmin();

  const { connector } = await params;
  // Connector keys are constrained by the database; anything else is not a connector.
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(connector)) notFound();

  const supabase = await createClient();
  const now = new Date();
  const records = await readIntegrationConnections(supabase);
  const center = buildConnectionsCenter({
    now,
    records,
    gateway: { credentialsPresent: gatewayServiceCredentialsPresent(), config: summarizeGatewayConfig(process.env.PASSPORT_GATEWAY_CLIENTS) },
  });

  // Prefer the platform-level record; a connector with neither a contract nor a record is not a page.
  const matches = allConnectors(center).filter((v) => v.key === connector);
  const view = matches.find((v) => v.connection.kind === "recorded" && v.connection.level === "platform") ?? matches[0];
  if (!view) notFound();

  const eventsRead = await readIntegrationEvents(supabase, connector);
  const history: HistoryState = eventsRead.ok ? { state: "ok", events: presentIntegrationEvents(eventsRead.rows, now) } : { state: "unavailable" };

  return (
    <div className="space-y-5">
      <Link href="/admin/connections" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> All connections
      </Link>
      <ConnectorDetail view={view} history={history} />
    </div>
  );
}
