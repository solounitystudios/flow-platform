import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Referral = Tables<"referrals">;

export function referralStatus(r: Referral): "accepted" | "revoked" | "expired" | "active" {
  if (r.accepted_at) return "accepted";
  if (r.revoked_at) return "revoked";
  if (new Date(r.expires_at) < new Date()) return "expired";
  return "active";
}

export async function getMyReferrals(profileId: string): Promise<Referral[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMyReferrals] query failed:", error.message);
    throw new Error("Unable to load your referrals.");
  }
  return data ?? [];
}

export async function getFoundingClassStatus(profileId: string): Promise<Tables<"founding_class_grants"> | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("founding_class_grants").select("*").eq("profile_id", profileId).maybeSingle();
  return data ?? null;
}
