import type { AuthorityType, VerificationMethod } from "@flow/passport-contracts";

/**
 * What each verification method demands of the party that decides. This is
 * descriptive metadata about DIFFERENT kinds of assurance — deliberately not
 * a ranking and never reduced to a score.
 *
 * The database is the enforcement point (`passport_record_verification`);
 * the table is mirrored there (`passport_method_required_authority`) and
 * kept in lockstep by tests/unit/passport-sql-parity.test.ts.
 */
export interface VerificationMethodPolicy {
  /** Can a decision under this method move a claim to `verified`? */
  canYieldVerified: boolean;
  /** Must the verifier be someone other than the claim's subject? */
  independentVerifier: boolean;
  /** Authority the deciding principal must hold on the verifying entity. */
  requiredAuthority: AuthorityType | null;
  /** Requires a FLOW admin at AAL2 rather than an entity authority. */
  platformAdmin: boolean;
  /** False = no honest implementation exists yet; the RPC rejects it. */
  available: boolean;
  unavailableReason?: string;
}

export const VERIFICATION_METHOD_POLICY: Record<VerificationMethod, VerificationMethodPolicy> = {
  // A person vouching for their own claim is an assertion, not verification.
  self_attested: { canYieldVerified: false, independentVerifier: false, requiredAuthority: null, platformAdmin: false, available: true },
  // A named person other than the subject confirms (same shape as the legacy collaborator tier).
  peer_attested: { canYieldVerified: true, independentVerifier: true, requiredAuthority: null, platformAdmin: false, available: true },
  employer_verified: { canYieldVerified: true, independentVerifier: true, requiredAuthority: "evidence_reviewer", platformAdmin: false, available: true },
  organization_verified: { canYieldVerified: true, independentVerifier: true, requiredAuthority: "evidence_reviewer", platformAdmin: false, available: true },
  licensed_provider: { canYieldVerified: true, independentVerifier: true, requiredAuthority: "credential_issuer", platformAdmin: false, available: true },
  education_provider: { canYieldVerified: true, independentVerifier: true, requiredAuthority: "credential_issuer", platformAdmin: false, available: true },
  platform_verified: { canYieldVerified: true, independentVerifier: true, requiredAuthority: null, platformAdmin: true, available: true },
  // No authoritative source integrations exist yet. An organization asserting
  // it is "the government" would be exactly the pretence Passport must avoid.
  government_issued: {
    canYieldVerified: true,
    independentVerifier: true,
    requiredAuthority: "credential_issuer",
    platformAdmin: false,
    available: false,
    unavailableReason: "No government source integration exists; this method requires an authoritative connector.",
  },
  external_source_verified: {
    canYieldVerified: true,
    independentVerifier: true,
    requiredAuthority: "credential_issuer",
    platformAdmin: false,
    available: false,
    unavailableReason: "No external source connector exists yet.",
  },
};

export function availableVerificationMethods(): VerificationMethod[] {
  return (Object.keys(VERIFICATION_METHOD_POLICY) as VerificationMethod[]).filter((method) => VERIFICATION_METHOD_POLICY[method].available);
}
