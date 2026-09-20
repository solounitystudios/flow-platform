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

// ── consent + disclosure ────────────────────────────────────────────────

export const requestConsent = (
  supabase: Client,
  input: { grantorId: string; granteeType: string; granteeId: string; purpose: string; categories: string[]; contextType?: string; contextId?: string },
) =>
  supabase
    .rpc("passport_request_consent", {
      p_grantor: input.grantorId,
      p_grantee_type: input.granteeType,
      p_grantee_id: input.granteeId,
      p_purpose: input.purpose,
      p_categories: input.categories,
      p_context_type: input.contextType,
      p_context_id: input.contextId,
    })
    .then((response) => normalizeRpc<{ id: string }>("passport_request_consent", response));

export const respondConsent = (supabase: Client, input: { id: string; approve: boolean; approvedCategories?: string[]; expiresAt?: string }) =>
  supabase
    .rpc("passport_respond_consent", {
      p_id: input.id,
      p_approve: input.approve,
      p_approved_categories: input.approvedCategories,
      p_expires_at: input.expiresAt,
    })
    .then((response) => normalizeRpc<{ status: string; expires_at?: string }>("passport_respond_consent", response));

export const withdrawConsentRequest = (supabase: Client, id: string) =>
  supabase.rpc("passport_withdraw_consent_request", { p_id: id }).then((response) => normalizeRpc("passport_withdraw_consent_request", response));

export const revokeConsent = (supabase: Client, id: string, reason?: string) =>
  supabase.rpc("passport_revoke_consent", { p_id: id, p_reason: reason }).then((response) => normalizeRpc("passport_revoke_consent", response));

export const expireDueConsents = async (supabase: Client): Promise<number> => {
  const { data, error } = await supabase.rpc("passport_expire_due_consents");
  if (error) {
    console.error("[passport:passport_expire_due_consents]", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
};

/** Selective disclosure: the grantee asks a narrow question and gets an answer, never data. */
export const disclose = (supabase: Client, input: { grantId: string; question: "claim_valid" | "credential_held"; claimType?: string; credentialType?: string }) =>
  supabase
    .rpc("passport_disclose", {
      p_grant_id: input.grantId,
      p_question: input.question,
      p_claim_type: input.claimType,
      p_credential_type: input.credentialType,
    })
    .then((response) => normalizeRpc<{ question: string; grant_id: string; answer: boolean; expires_at: string | null; evaluated_at: string }>("passport_disclose", response));

// ── relationships ───────────────────────────────────────────────────────

export const proposeRelationship = (
  supabase: Client,
  input: { fromType: string; fromId: string; relation: string; toType: string; toId: string; metadata?: { [key: string]: Json | undefined } },
) =>
  supabase
    .rpc("passport_propose_relationship", {
      p_from_type: input.fromType,
      p_from_id: input.fromId,
      p_relation: input.relation,
      p_to_type: input.toType,
      p_to_id: input.toId,
      p_metadata: input.metadata ?? {},
    })
    .then((response) => normalizeRpc<{ id: string; status: string }>("passport_propose_relationship", response));

export const respondRelationship = (supabase: Client, id: string, accept: boolean) =>
  supabase.rpc("passport_respond_relationship", { p_id: id, p_accept: accept }).then((response) => normalizeRpc<{ status: string }>("passport_respond_relationship", response));

export const endRelationship = (supabase: Client, id: string, reason?: string) =>
  supabase.rpc("passport_end_relationship", { p_id: id, p_reason: reason }).then((response) => normalizeRpc("passport_end_relationship", response));

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
  invalid_purpose: "That purpose isn't valid.",
  no_categories: "Choose what information you're asking for.",
  duplicate_category: "Each kind of information can only be listed once.",
  invalid_category: "That kind of information isn't recognised.",
  category_not_allowed_for_purpose: "That information isn't needed for this purpose, so it can't be requested.",
  invalid_context: "That context isn't valid.",
  self_request: "You can't ask yourself.",
  rate_limited: "Too many requests today. Try again tomorrow.",
  already_open: "There's already an open request for this.",
  request_expired: "That request has expired.",
  nothing_approved: "Approve at least one kind of information.",
  approved_exceeds_request: "You can only approve what was asked for.",
  expiry_too_far: "Access can last at most a year.",
  expired: "That access has expired.",
  category_not_approved: "That information wasn't shared with you.",
  unsupported_claim_type: "That can't be checked through sharing.",
  unsupported_question: "That question isn't supported.",
  unknown_relation: "That relationship type isn't recognised.",
  relation_managed_elsewhere: "That relationship is managed elsewhere in FLOW.",
  relation_not_available: "That kind of relationship isn't available yet.",
  invalid_relation_endpoints: "That relationship doesn't fit those two parties.",
  invalid_metadata: "The relationship details aren't valid.",
  self_relationship: "You can't relate something to itself.",
  already_exists: "That relationship already exists.",
  not_endable: "That relationship has already ended.",
  rpc_error: "Something went wrong. Try again.",
};

export function passportReasonMessage(reason: string): string {
  return REASON_MESSAGES[reason] ?? "Unable to complete that.";
}
