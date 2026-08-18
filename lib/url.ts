import { headers } from "next/headers";

/**
 * The origin the current request actually arrived on, derived from
 * `x-forwarded-*` (set by any reverse proxy in front of the app — Codespaces'
 * port forwarder, a production load balancer/CDN) and falling back to `Host`.
 * Used for auth email redirect links so they land back on whatever host the
 * user is actually browsing from, instead of a value baked in at build time.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
