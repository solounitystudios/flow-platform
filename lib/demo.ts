/**
 * Explicit demo-mode gate for the seed/mock fixtures in lib/mock/*.
 *
 * Defaults to OFF. Must be turned on deliberately (NEXT_PUBLIC_FLOW_DEMO_MODE=true
 * in .env.local) to see mock fallbacks in the UI — it is never implied by
 * NODE_ENV, so a `next build && next start` smoke test or a misconfigured
 * deploy can't accidentally ship demo fixtures as if they were real data.
 */
export function isDemoModeEnabled() {
  return process.env.NEXT_PUBLIC_FLOW_DEMO_MODE === "true";
}
