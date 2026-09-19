import type { ConnectionStatus } from "@flow/passport-contracts";
import { effectiveClaimStatus } from "./claim-lifecycle";
import type { ClaimStatus } from "@flow/passport-contracts";

/**
 * "Why can't I rely on this claim right now?" has several DIFFERENT answers
 * that must never be collapsed into one generic "invalid":
 *
 *   valid               a verifier decided yes and nothing has since closed it
 *   unverified          asserted, no verifier has decided
 *   invalid             a verifier/source said no (rejected) or withdrew it (revoked)
 *   expired             it was valid; its validity window has closed
 *   source_unavailable  we can't currently reach the source that would confirm it
 *                       (connection disconnected/errored) — the claim is STALE, not false
 *   superseded          replaced by a newer claim
 */
export type ClaimAssessment =
  | { kind: "valid" }
  | { kind: "unverified" }
  | { kind: "invalid"; because: "rejected" | "revoked" }
  | { kind: "expired" }
  | { kind: "source_unavailable"; connection: ConnectionStatus | "unknown" }
  | { kind: "superseded" };

const UNAVAILABLE_CONNECTIONS: ReadonlyArray<ConnectionStatus> = ["disconnected", "auth_required", "error", "degraded", "stale"];

export function assessClaim(
  claim: { status: ClaimStatus; expires_at: string | null },
  /** Effective connection status of the source system, when the claim has one. */
  connection: ConnectionStatus | null,
  now: Date,
): ClaimAssessment {
  const status = effectiveClaimStatus(claim, now);
  switch (status) {
    case "superseded":
      return { kind: "superseded" };
    case "rejected":
      return { kind: "invalid", because: "rejected" };
    case "revoked":
      return { kind: "invalid", because: "revoked" };
    case "expired":
      return { kind: "expired" };
    case "draft":
    case "submitted":
    case "under_review":
      return { kind: "unverified" };
    case "stale":
    case "disconnected":
      return { kind: "source_unavailable", connection: connection ?? "unknown" };
    case "verified":
      // A verified claim stays valid unless its source has since gone quiet.
      if (connection && UNAVAILABLE_CONNECTIONS.includes(connection)) return { kind: "source_unavailable", connection };
      return { kind: "valid" };
  }
}

/** Only a `valid` assessment may be presented to a consumer as a current fact. */
export function isRelyable(assessment: ClaimAssessment): boolean {
  return assessment.kind === "valid";
}
