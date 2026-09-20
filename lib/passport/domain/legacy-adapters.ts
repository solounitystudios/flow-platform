import type { Claim, ClaimStatus, VerificationMethod } from "@flow/passport-contracts";

/**
 * Read-side adapters from Flow's LEGACY Passport tables to the canonical
 * contracts. Nothing here writes: the legacy tables stay the source of truth
 * for their own data and the legacy RPC pipeline stays the write path. These
 * adapters exist so canonical consumers (claim explanation, projections,
 * the Capture bridge) can treat legacy evidence uniformly without a
 * destructive migration or a dual write.
 *
 * Inputs are structural (not the generated DB types) so this module stays
 * framework-free.
 */

export interface LegacyVerificationInput {
  id: string;
  profile_id: string;
  credential_type: string | null;
  title: string | null;
  source: string;
  status: string;
  evidence_url: string | null;
  evidence_note: string | null;
  reference_table: string | null;
  reference_id: string | null;
  witness_profile_id: string | null;
  organization_id: string | null;
  resolved_tier: string | null;
  verified_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Legacy `pending` means "asserted, not yet decided" — canonically `submitted`. */
const LEGACY_STATUS: Record<string, ClaimStatus> = {
  pending: "submitted",
  verified: "verified",
  rejected: "rejected",
  expired: "expired",
  revoked: "revoked",
};

/**
 * The legacy tier that resolved a claim, expressed as a canonical method.
 * `auto_verified` is reserved and has no rows; if one ever appears it is a
 * deterministic platform check, so it maps to platform_verified.
 */
const LEGACY_TIER_METHOD: Record<string, VerificationMethod> = {
  admin_verified: "platform_verified",
  collaborator_verified: "peer_attested",
  organization_verified: "organization_verified",
  auto_verified: "platform_verified",
};

export interface AdaptedLegacyVerification {
  claim: Claim;
  /** How the legacy row was resolved, when it has been. */
  verification: { method: VerificationMethod; decided_at: string | null } | null;
  /** A summary of the evidence the legacy row carries inline. Never the note text. */
  evidence: { type: "link" | "note" | "document"; has_link: boolean } | null;
}

export function adaptLegacyVerification(row: LegacyVerificationInput): AdaptedLegacyVerification {
  const status = LEGACY_STATUS[row.status] ?? "submitted";
  const method = row.resolved_tier ? (LEGACY_TIER_METHOD[row.resolved_tier] ?? null) : null;

  const claim: Claim = {
    id: row.id,
    subject: { type: "person", id: row.profile_id },
    claim_type: `credential.${row.credential_type ?? "skill"}`,
    // Only structural, non-sensitive facts. The free-text evidence note is
    // private to the member and deliberately never copied into a claim.
    value: {
      ...(row.title ? { title: row.title } : {}),
      ...(row.reference_table ? { reference_table: row.reference_table } : {}),
    },
    // Legacy claims are self-assertions that a tier later confirmed; only an
    // organization-resolved claim names a distinct issuer.
    issuer:
      row.resolved_tier === "organization_verified" && row.organization_id
        ? { kind: "entity", ref: { type: "organization", id: row.organization_id } }
        : { kind: "subject" },
    source: { system: "flow_platform", ref: row.id },
    evidence_ids: [],
    effective_at: row.verified_at,
    expires_at: row.expires_at,
    status,
    status_reason_code: null,
    // Legacy verification rows were always owner/admin-only; the public face
    // of a verified claim is the credential badge, not this record.
    visibility: "private",
    sensitivity: "standard",
    superseded_by: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  return {
    claim,
    verification: method && status !== "submitted" ? { method, decided_at: row.verified_at ?? row.revoked_at } : null,
    evidence: row.evidence_url
      ? { type: "link", has_link: true }
      : row.evidence_note
        ? { type: "note", has_link: false }
        : null,
  };
}
