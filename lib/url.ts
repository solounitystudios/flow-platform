import { headers } from "next/headers";

// isSafeInternalPath moved to lib/redirect-safety.ts (pure, dependency-free
// — see tests/security/redirect-safety.test.ts) — re-exported here so
// existing call sites don't need to change their import path.
export { isSafeInternalPath } from "@/lib/redirect-safety";

const CODESPACE_NAME_PATTERN = /^[a-z0-9-]+$/i;

/**
 * The origin the current request should redirect back to — used for
 * Supabase Auth email links (emailRedirectTo) and this app's own auth
 * callback route.
 *
 * In a GitHub Codespaces dev environment, this is derived from the
 * platform's own injected environment variables (CODESPACE_NAME,
 * GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) rather than request headers.
 * Those are set by the Codespaces runtime itself, not supplied by whoever
 * is making the HTTP request, so they can't be spoofed the way a header
 * can. It also means nothing is hard-coded or goes stale: the value is
 * read fresh from the environment on every call, correct for whatever
 * codespace instance happens to be running.
 *
 * Outside a detected Codespaces environment (local dev without a proxy,
 * and production), this falls back to standard forwarded-header handling
 * (x-forwarded-host/-proto, then Host) — unchanged from before this
 * Codespaces-specific path was added, so production behavior is preserved.
 * Forwarded headers are only ever *trusted as the primary signal* inside
 * the environment we can positively identify as Codespaces; everywhere
 * else this is the same fallback the app already had.
 */
export async function getRequestOrigin(): Promise<string> {
  const codespaceName = process.env.CODESPACE_NAME;
  const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

  if (process.env.CODESPACES === "true" && codespaceName && forwardingDomain && CODESPACE_NAME_PATTERN.test(codespaceName)) {
    const port = process.env.PORT ?? "3000";
    return `https://${codespaceName}-${port}.${forwardingDomain}`;
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
