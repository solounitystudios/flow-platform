// Pure, dependency-free — see lib/authz.ts for why this repo separates
// decision logic like this from the Next.js/Supabase code that calls it.

/**
 * Guards every redirect that echoes a `next` query param (login, signup,
 * the auth callback, the employer invitation path). Must be a same-origin,
 * absolute path — `//evil.com` is scheme-relative and browsers treat it as
 * an external URL, so it's rejected alongside any fully-qualified one.
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}
