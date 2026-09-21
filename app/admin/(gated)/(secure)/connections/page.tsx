import { requireSecureAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { gatewayServiceCredentialsPresent } from "@/lib/passport/gateway/service-client";
import { summarizeGatewayConfig } from "@/lib/passport/gateway/config-summary";
import { readIntegrationConnections } from "@/lib/passport/data";
import { buildConnectionsCenter } from "@/lib/passport/domain";
import { ConnectionsCenterView } from "@/components/passport/connections/ConnectionsCenterView";

export const metadata = { title: "Passport connections" };

/**
 * Operational truth about the systems connected to Passport. Platform-level
 * connections are readable only by an AAL2 platform admin (that is what the
 * database's row-level security allows), so this lives in the secure admin
 * area rather than in a member surface that would always be empty.
 */
export default async function AdminConnectionsPage() {
  // The (secure) layout also gates this; every page re-checks directly.
  await requireSecureAdmin();

  const supabase = await createClient();
  const records = await readIntegrationConnections(supabase);
  const center = buildConnectionsCenter({
    now: new Date(),
    records,
    gateway: { credentialsPresent: gatewayServiceCredentialsPresent(), config: summarizeGatewayConfig(process.env.PASSPORT_GATEWAY_CLIENTS) },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Passport connections</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500 dark:text-ink-400">
          External systems that contribute to Passport. They can produce evidence; Passport alone owns claims, verification, consent and authority.
        </p>
      </div>
      <ConnectionsCenterView center={center} />
    </div>
  );
}
