"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  if (!credential_type) return { error: "Choose what kind of credential this is." };
  if (!title) return { error: "Give this claim a title." };
  if (source === "external_link" && !evidence_url) return { error: "Add a link to your evidence for an external claim." };

  const { error } = await supabase.from("verifications").insert({
    profile_id: user.id,
    credential_type,
    title,
    source,
    evidence_url: evidence_url || null,
    evidence_note: evidence_note || null,
    reference_id: skill_id || null,
    reference_table: skill_id ? "profile_skill" : null,
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
