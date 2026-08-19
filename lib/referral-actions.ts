"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/url";

export interface ReferralActionState {
  error?: string;
  inviteUrl?: string;
}

/** Any authenticated member can refer a friend — this is not an admin
 * action. Same one-way-hash design as employer invitations: the plaintext
 * token is generated here, only its SHA-256 hash is stored, and the
 * plaintext is returned exactly once for the member to copy. */
export async function generateReferralAction(_prev: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to refer a friend." };

  const intendedEmail = String(formData.get("intended_email") ?? "").trim();
  const days = Number(formData.get("expires_days") ?? 30) || 30;

  const token = randomBytes(32).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const expires_at = new Date(Date.now() + days * 86_400_000).toISOString();

  const { error } = await supabase.from("referrals").insert({
    referrer_id: user.id,
    token_hash,
    intended_email: intendedEmail || null,
    expires_at,
  });

  if (error) {
    console.error("[generateReferral]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  const origin = await getRequestOrigin();
  revalidatePath("/settings");
  return { inviteUrl: `${origin}/r/${token}` };
}

export async function revokeReferralAction(referralId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in first." };

  const { error } = await supabase.from("referrals").update({ revoked_at: new Date().toISOString() }).eq("id", referralId).eq("referrer_id", user.id);
  if (error) return { error: "Something went wrong. Try again." };

  revalidatePath("/settings");
  return {};
}
