import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

/**
 * Typed access to the Passport V2 RPCs. The database is the authority for
 * every rule (see the passport_* migrations); this layer only calls the RPC
 * and turns its `{ ok, reason }` result into something a caller can branch on
 * — same contract as the existing decideEvidenceAction /
 * confirmVerificationAsCollaborator wrappers. It never decides who is allowed.
 */
export type PassportRpcResult<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string };

type Client = SupabaseClient<Database>;

/** Normalises a PostgREST RPC response into a PassportRpcResult. */
export function normalizeRpc<T extends object = object>(fn: string, response: { data: unknown; error: { message: string } | null }): PassportRpcResult<T> {
  if (response.error) {
    console.error(`[passport:${fn}]`, response.error.message);
    return { ok: false, reason: "rpc_error" };
  }
  const data = response.data;
  if (!data || typeof data !== "object" || typeof (data as { ok?: unknown }).ok !== "boolean") {
    console.error(`[passport:${fn}] unexpected response shape`);
    return { ok: false, reason: "rpc_error" };
  }
  const result = data as { ok: boolean; reason?: string } & Record<string, unknown>;
  return result.ok ? (result as unknown as PassportRpcResult<T>) : { ok: false, reason: result.reason ?? "unknown" };
}

// ── claims / evidence ───────────────────────────────────────────────────

export interface CreateClaimInput {
  subjectType: string;
  subjectId: string;
  claimType: string;
  value?: { [key: string]: Json | undefined };
  visibility?: "private" | "public";
  sensitivity?: "standard" | "sensitive" | "restricted";
  effectiveAt?: string;
  expiresAt?: string;
  submit?: boolean;
}

export const createClaim = (supabase: Client, input: CreateClaimInput) =>
  supabase.rpc("passport_create_claim", {
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_claim_type: input.claimType,
    p_value: input.value ?? {},
    p_visibility: input.visibility ?? "private",
    p_sensitivity: input.sensitivity ?? "standard",
    p_effective_at: input.effectiveAt,
    p_expires_at: input.expiresAt,
    p_submit: input.submit ?? false,
  }).then((response) => normalizeRpc<{ id: string; status: string }>("passport_create_claim", response));

export const submitClaim = (supabase: Client, claimId: string) => supabase.rpc("passport_submit_claim", { p_claim_id: claimId }).then((response) => normalizeRpc("passport_submit_claim", response));

export const addEvidence = (
  supabase: Client,
  input: { subjectType: string; subjectId: string; evidenceType: string; artifacts: Json[]; provenance?: { [key: string]: Json | undefined }; sensitivity?: string },
) =>
  supabase.rpc("passport_add_evidence", {
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_evidence_type: input.evidenceType,
    p_artifacts: input.artifacts,
    p_provenance: input.provenance ?? {},
    p_sensitivity: input.sensitivity ?? "standard",
  }).then((response) => normalizeRpc<{ id: string }>("passport_add_evidence", response));

export const attachEvidence = (supabase: Client, claimId: string, evidenceId: string, role: "supports" | "context" | "contradicts" = "supports") =>
  supabase.rpc("passport_attach_evidence", { p_claim_id: claimId, p_evidence_id: evidenceId, p_role: role }).then((response) => normalizeRpc("passport_attach_evidence", response));

export const detachEvidence = (supabase: Client, claimId: string, evidenceId: string) =>
  supabase.rpc("passport_detach_evidence", { p_claim_id: claimId, p_evidence_id: evidenceId }).then((response) => normalizeRpc("passport_detach_evidence", response));

export const setClaimVisibility = (supabase: Client, claimId: string, visibility: "private" | "public") =>
  supabase.rpc("passport_set_claim_visibility", { p_claim_id: claimId, p_visibility: visibility }).then((response) => normalizeRpc("passport_set_claim_visibility", response));

export const claimFromActivity = (supabase: Client, activityId: string) =>
  supabase.rpc("passport_claim_from_activity", { p_activity_id: activityId }).then((response) => normalizeRpc<{ id: string; already_exists: boolean }>("passport_claim_from_activity", response));

// ── verification ────────────────────────────────────────────────────────

export const requestVerification = (supabase: Client, input: { claimId: string; method: string; verifierType: string; verifierId?: string }) =>
  supabase.rpc("passport_request_verification", {
    p_claim_id: input.claimId,
    p_method: input.method,
    p_verifier_type: input.verifierType,
    p_verifier_id: input.verifierId,
  }).then((response) => normalizeRpc<{ id: string }>("passport_request_verification", response));

export const cancelVerificationRequest = (supabase: Client, verificationId: string) =>
  supabase.rpc("passport_cancel_verification_request", { p_verification_id: verificationId }).then((response) => normalizeRpc("passport_cancel_verification_request", response));

export const recordVerification = (supabase: Client, input: { verificationId: string; decision: "verified" | "rejected"; reasonCode?: string; expiresAt?: string }) =>
  supabase.rpc("passport_record_verification", {
    p_verification_id: input.verificationId,
    p_decision: input.decision,
    p_reason_code: input.reasonCode,
    p_expires_at: input.expiresAt,
  }).then((response) => normalizeRpc<{ status: string }>("passport_record_verification", response));

export const revokeClaim = (supabase: Client, claimId: string, reasonCode: string) =>
  supabase.rpc("passport_revoke_claim", { p_claim_id: claimId, p_reason_code: reasonCode }).then((response) => normalizeRpc("passport_revoke_claim", response));

export const expireDueClaims = async (supabase: Client): Promise<number> => {
  const { data, error } = await supabase.rpc("passport_expire_due_claims");
  if (error) {
    console.error("[passport:passport_expire_due_claims]", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
};

// ── authority ───────────────────────────────────────────────────────────

export const assignAuthority = (
  supabase: Client,
  input: { principalId: string; entityType: string; entityId: string; authority: string; purposes?: string[]; claimTypePrefixes?: string[]; expiresAt: string },
) =>
  supabase.rpc("passport_assign_authority", {
    p_principal: input.principalId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_authority: input.authority,
    p_purposes: input.purposes ?? [],
    p_claim_type_prefixes: input.claimTypePrefixes ?? [],
    p_expires_at: input.expiresAt,
  }).then((response) => normalizeRpc<{ id: string }>("passport_assign_authority", response));

export const revokeAuthority = (supabase: Client, id: string, reason?: string) => supabase.rpc("passport_revoke_authority", { p_id: id, p_reason: reason }).then((response) => normalizeRpc("passport_revoke_authority", response));

// ── messages ────────────────────────────────────────────────────────────

/** Member-facing text for a reason code. Unknown codes fall back to a safe generic. */
const REASON_MESSAGES: Record<string, string> = {
  not_authenticated: "Log in to continue.",
  not_authorized: "You can't do that.",
  not_found: "That couldn't be found.",
  not_eligible: "This isn't eligible yet — the host has to mark it completed first.",
  not_a_draft: "That has already been submitted.",
  claim_not_reviewable: "This claim can't be reviewed right now.",
  claim_not_open: "Evidence can't be added to this claim any more.",
  claim_not_editable: "This claim is already with a reviewer, so evidence can't be removed.",
  method_cannot_verify: "Your own word can't verify a claim — ask someone else to confirm it.",
  method_not_available: "That kind of verification isn't available yet.",
  verifier_is_subject: "You can't verify your own claim.",
  self_verification_not_allowed: "You can't decide on your own claim.",
  verifier_not_independent: "That party is connected to the person this concerns, so it can't verify it. Ask someone independent.",
  verifier_not_verified: "That organization hasn't been verified by FLOW yet, so it can't verify claims.",
  verifier_not_found: "That reviewer couldn't be found.",
  already_requested: "You've already asked them to verify this.",
  already_attached: "That evidence is already attached.",
  already_active: "That authority is already active.",
  subject_mismatch: "That evidence belongs to someone else.",
  invalid_artifacts: "That file reference isn't valid.",
  sensitive_cannot_be_public: "Sensitive claims can't be made public.",
  reason_code_required: "A reason is required.",
  not_pending: "That has already been decided.",
  not_entity_owner: "Only the organization's owner can do that.",
  expiry_required: "An expiry date is required.",
  expiry_invalid: "That expiry date isn't allowed.",
  invalid_scope: "Choose at least one valid scope.",
  authority_entity_mismatch: "That authority can't be assigned for this kind of entity.",
  authority_not_assignable: "That authority can't be assigned yet.",
  evidence_unusable: "That evidence can't be used.",
  expiry_not_in_future: "The expiry must be in the future.",
  invalid_claim_type: "That claim type isn't valid.",
  invalid_decision: "That decision isn't valid.",
  invalid_disclosure: "That visibility setting isn't valid.",
  invalid_evidence_type: "That kind of evidence can't be added here.",
  invalid_provenance: "That source detail is too large or invalid.",
  invalid_reason_code: "That reason isn't valid.",
  invalid_role: "That evidence role isn't valid.",
  invalid_subject_type: "That kind of Passport isn't supported.",
  invalid_value: "The claim details aren't valid.",
  invalid_verifier: "That isn't a valid reviewer for this kind of verification.",
  invalid_window: "The end date must be after the start date.",
  not_active: "That has already ended.",
  not_attached: "That evidence isn't attached to this claim.",
  not_revocable: "That claim can't be revoked in its current state.",
  principal_not_found: "That person couldn't be found.",
  reason_too_long: "That reason is too long.",
  unknown_method: "That verification method isn't recognised.",
  rpc_error: "Something went wrong. Try again.",
};

export function passportReasonMessage(reason: string): string {
  return REASON_MESSAGES[reason] ?? "Unable to complete that.";
}
