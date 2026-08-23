"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findProfileByUsername } from "@/lib/data/verifications";
import type { CollaboratorConfirmationResult, OrganizationVerificationResult } from "@/lib/database.types";

export interface EvidenceActionState {
  error?: string;
}

/** A member submits a claim about themselves — always starts 'pending'
 * (enforced by the verifications_self_insert RLS policy's WITH CHECK, not
 * just this action). No status this action sends is ever trusted as
 * final; only decide_evidence_verification() (admin, AAL2) can move it. */
export async function submitEvidenceAction(_prev: EvidenceActionState, formData: FormData): Promise<EvidenceActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to submit evidence." };

  const credential_type = String(formData.get("credential_type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const source = String(formData.get("source") ?? "self_reported");
  const evidence_url = String(formData.get("evidence_url") ?? "").trim();
  const evidence_note = String(formData.get("evidence_note") ?? "").trim();
  const skill_id = String(formData.get("skill_id") ?? "");
  const creative_project_id = String(formData.get("creative_project_id") ?? "").trim();
  const witness_username = String(formData.get("witness_username") ?? "").trim();

  if (!credential_type) return { error: "Choose what kind of credential this is." };
  if (!title) return { error: "Give this claim a title." };
  if (source === "external_link" && !evidence_url) return { error: "Add a link to your evidence for an external claim." };

  // Naming a collaborator is optional and purely claimant-supplied at
  // submission — it grants that profile no access by itself, it only
  // identifies who could later confirm this specific claim via
  // confirm_verification_as_collaborator(). The DB also enforces "not
  // yourself" (verifications_witness_not_self_check); checked here too for
  // a clean error message instead of a raw constraint violation.
  let witness_profile_id: string | null = null;
  if (witness_username) {
    const witness = await findProfileByUsername(witness_username);
    if (!witness) return { error: "That username could not be found." };
    if (witness.id === user.id) return { error: "You can't name yourself as your own collaborator." };
    witness_profile_id = witness.id;
  }

  // A claim references at most one of skill_id / creative_project_id in this
  // batch. creative_project_id wins if both are somehow submitted — it comes
  // from a dedicated, narrower project picker rather than the general skill
  // picker, so it's the more specific signal when both are present.
  const reference_table = creative_project_id ? "creative_project" : skill_id ? "profile_skill" : null;
  const reference_id = creative_project_id || skill_id || null;

  const { error } = await supabase.from("verifications").insert({
    profile_id: user.id,
    credential_type,
    title,
    source,
    evidence_url: evidence_url || null,
    evidence_note: evidence_note || null,
    reference_id,
    reference_table,
    witness_profile_id,
    status: "pending",
  });

  if (error) {
    console.error("[submitEvidence]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  await supabase.rpc("evaluate_achievements", { p_profile_id: user.id });
  revalidatePath("/settings");
  revalidatePath("/passport");
  return {};
}

// ── Recommendations ──────────────────────────────────────────────────────

export async function dismissRecommendationAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in first." };

  const { error } = await supabase.from("match_recommendations").update({ dismissed_at: new Date().toISOString() }).eq("id", id).eq("profile_id", user.id);
  if (error) return { error: "Something went wrong. Try again." };

  revalidatePath("/recommendations");
  return {};
}

export async function markRecommendationActedAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in first." };

  const { error } = await supabase.from("match_recommendations").update({ acted_at: new Date().toISOString() }).eq("id", id).eq("profile_id", user.id);
  if (error) return { error: "Something went wrong. Try again." };

  revalidatePath("/recommendations");
  return {};
}

export async function refreshRecommendationsAction(): Promise<{ error?: string; generated?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in first." };

  const { data, error } = await supabase.rpc("generate_match_recommendations", { p_profile_id: user.id });
  if (error) {
    console.error("[refreshRecommendations]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  const result = data as { ok: boolean; generated?: number } | null;
  revalidatePath("/recommendations");
  return { generated: result?.generated ?? 0 };
}

// ── Verification tiering — non-admin resolution paths ────────────────────
// Both RPCs are SECURITY DEFINER and do their own row-scoped authorization
// (confirm_verification_as_collaborator: caller must be exactly the named
// witness_profile_id on that pending claim; resolve_verification_as_organization:
// caller must be an owner/admin member of the specific verified organization
// named on that pending claim). This action layer never decides who's
// allowed — it just calls the RPC and translates its {ok, reason} result
// into a message, same contract as decideEvidenceAction in
// lib/admin/actions.ts.

const COLLABORATOR_CONFIRM_MESSAGES: Record<NonNullable<CollaboratorConfirmationResult["reason"]>, string> = {
  not_authenticated: "Log in to confirm this claim.",
  not_found: "That claim could not be found.",
  not_authorized: "You're not the named collaborator on this claim.",
  not_a_project_member: "You're no longer an active member of the project this claim references.",
  not_pending: "This claim has already been resolved.",
};

/** Called by the profile named as witness_profile_id on a pending claim —
 * see app/(app)/passport/confirm/[id]/page.tsx for the UI entry point. */
export async function confirmVerificationAsCollaborator(verificationId: string, notes?: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to confirm this claim." };

  const { data, error } = await supabase.rpc("confirm_verification_as_collaborator", {
    p_verification_id: verificationId,
    p_notes: notes || undefined,
  });

  if (error) {
    console.error("[confirmVerificationAsCollaborator]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  const result = data as CollaboratorConfirmationResult | null;
  if (!result?.ok) {
    return { error: (result?.reason && COLLABORATOR_CONFIRM_MESSAGES[result.reason]) || "Unable to confirm this claim." };
  }

  revalidatePath("/passport");
  revalidatePath("/settings");
  revalidatePath(`/passport/confirm/${verificationId}`);
  return { ok: true };
}

const ORGANIZATION_RESOLVE_MESSAGES: Record<NonNullable<OrganizationVerificationResult["reason"]>, string> = {
  not_authenticated: "Log in to resolve this claim.",
  not_found: "That claim could not be found.",
  no_organization_named: "This claim doesn't name an organization.",
  not_pending: "This claim has already been resolved.",
  organization_not_verified: "That organization isn't verified yet.",
  not_authorized: "You're not an owner or admin of that organization.",
};

/** Called by an owner/admin member of the specific verified organization
 * named on a pending claim. No dedicated UI ships in this batch (out of
 * scope — see task); the action exists so the RPC has a real application
 * caller, and so a future org-facing surface can wire straight to it. */
export async function resolveVerificationAsOrganization(verificationId: string, notes?: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to resolve this claim." };

  const { data, error } = await supabase.rpc("resolve_verification_as_organization", {
    p_verification_id: verificationId,
    p_notes: notes || undefined,
  });

  if (error) {
    console.error("[resolveVerificationAsOrganization]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  const result = data as OrganizationVerificationResult | null;
  if (!result?.ok) {
    return { error: (result?.reason && ORGANIZATION_RESOLVE_MESSAGES[result.reason]) || "Unable to resolve this claim." };
  }

  revalidatePath("/passport");
  revalidatePath("/settings");
  return { ok: true };
}
