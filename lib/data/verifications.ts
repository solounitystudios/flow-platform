import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type CredentialType = Tables<"credential_types">;
export type Verification = Tables<"verifications">;
export type ProfileCredential = Tables<"profile_credentials">;

export async function getCredentialTypes(): Promise<CredentialType[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("credential_types").select("*").order("sort_order");
  return data ?? [];
}

/** The member's own evidence claims — every column here is already
 * member-appropriate (no verifier identity, method, or reasoning; that
 * lives in verification_reviews, which only admins can read). */
export async function getMyVerifications(profileId: string): Promise<Verification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMyVerifications] query failed:", error.message);
    throw new Error("Unable to load your evidence.");
  }
  return data ?? [];
}

/** The colored credential badges a profile has earned — public, same
 * visibility precedent as profile_skills/achievements in this codebase. */
export async function getProfileCredentials(profileId: string): Promise<ProfileCredential[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_credentials")
    .select("*")
    .eq("profile_id", profileId)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false });
  return data ?? [];
}

// ── Admin: evidence review queue ─────────────────────────────────────────

export interface EvidenceQueueRow extends Verification {
  profile: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null;
}

export async function getEvidenceQueue(status?: string): Promise<EvidenceQueueRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("verifications")
    .select("*, profile:profiles(id, full_name, username)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  else query = query.eq("status", "pending");

  const { data, error } = await query;
  if (error) {
    console.error("[getEvidenceQueue] query failed:", error.message);
    throw new Error("Unable to load the evidence queue.");
  }
  return (data ?? []) as unknown as EvidenceQueueRow[];
}

export type VerificationReviewRow = Tables<"verification_reviews"> & { actor: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null };

export async function getVerificationReviews(verificationId: string): Promise<VerificationReviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_reviews")
    .select("*, actor:profiles(id, full_name, username)")
    .eq("verification_id", verificationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getVerificationReviews] query failed:", error.message);
    throw new Error("Unable to load the review history.");
  }
  return (data ?? []) as unknown as VerificationReviewRow[];
}
