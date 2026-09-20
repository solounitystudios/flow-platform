import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * The ONE place a service-role Supabase client is created. It is used only by
 * the Passport Integration Gateway, and only to call the service_role-only
 * `passport_gateway_*` RPCs — those functions (not this client) enforce every
 * rule. The key comes from deployment configuration and is never
 * NEXT_PUBLIC_*, never committed, never sent to a browser.
 */
export function createGatewayServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
