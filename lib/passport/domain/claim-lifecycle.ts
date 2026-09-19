import type { ClaimStatus } from "@flow/passport-contracts";

/**
 * Claim lifecycle — the only legal status moves. The database enforces the
 * same table (`passport_claim_transition_allowed`, kept in lockstep by
 * tests/unit/passport-sql-parity.test.ts), so this map is for UI/pre-checks
 * and documentation, never a substitute for the DB gate.
 *
 * Design notes:
 *  - `verified` is reachable only through a recorded verification decision
 *    (the RPC requires one); `submitted` alone is "asserted, not verified".
 *  - `stale` / `disconnected` are SOURCE-FRESHNESS states set when an
 *    integration goes quiet or drops. They are not verdicts on the claim.
 *  - `rejected`, `expired`, `revoked` can only be followed by `superseded`
 *    (a corrected/renewed claim replaces them); history is never rewritten.
 */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "verified", "rejected", "revoked", "superseded"],
  under_review: ["verified", "rejected", "revoked", "superseded"],
  verified: ["expired", "revoked", "superseded", "stale", "disconnected"],
  stale: ["verified", "expired", "revoked", "superseded", "disconnected"],
  disconnected: ["verified", "stale", "expired", "revoked", "superseded"],
  rejected: ["superseded"],
  expired: ["superseded"],
  revoked: ["superseded"],
  superseded: [],
};

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from].includes(to);
}

/** No further status change is possible except supersession — history stays intact. */
export function isTerminalClaimStatus(status: ClaimStatus): boolean {
  return status === "superseded";
}

/**
 * The status a reader should act on right now. A claim whose window has
 * closed reads as `expired` even if no sweep has materialised that yet —
 * expiry is a fact about time, not about whether a job ran.
 */
export function effectiveClaimStatus(claim: { status: ClaimStatus; expires_at: string | null }, now: Date): ClaimStatus {
  const liveStates: ClaimStatus[] = ["verified", "stale", "disconnected"];
  if (liveStates.includes(claim.status) && claim.expires_at && new Date(claim.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }
  return claim.status;
}
