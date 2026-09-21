import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function serviceEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Whether the gateway's service credentials are present. Reads the same
 * environment as createGatewayServiceClient() but builds NO client and returns
 * NO value, so an operations page can report "misconfigured" without ever
 * holding a service-role client.
 */
export function gatewayServiceCredentialsPresent(): boolean {
  return serviceEnv() !== null;
}

/**
 * The ONE place a service-role Supabase client is created. It is used only by
 * the Passport Integration Gateway, and only to call the service_role-only
 * `passport_gateway_*` RPCs — those functions (not this client) enforce every
 * rule. The key comes from deployment configuration and is never
 * NEXT_PUBLIC_*, never committed, never sent to a browser.
 */
export function createGatewayServiceClient() {
  const env = serviceEnv();
  if (!env) return null;
  return createClient<Database>(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
