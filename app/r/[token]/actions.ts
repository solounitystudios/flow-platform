"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export interface ReferralAcceptResult {
  ok: boolean;
  error?: string;
  foundingClassGranted?: boolean;
}

const ACCEPT_ERROR_TEXT: Record<string, string> = {
  not_authenticated: "Log in to accept this referral.",
  invalid_or_expired: "This referral link is invalid or has expired.",
  self_referral: "You can't accept your own referral.",
  email_mismatch: "This referral was sent to a different email address.",
  already_claimed: "This referral has already been accepted by another account.",
};

/** Hashes the token the same way generateReferralAction did — the
 * plaintext never reaches the database at all, coming or going. */
export async function acceptReferralAction(token: string): Promise<ReferralAcceptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ACCEPT_ERROR_TEXT.not_authenticated };

  const token_hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase.rpc("accept_referral", { p_token_hash: token_hash });

  if (error) {
    console.error("[referral:accept]", error.message);
    return { ok: false, error: "Something went wrong. Try again." };
  }

  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) return { ok: false, error: ACCEPT_ERROR_TEXT[result?.reason ?? ""] ?? "Something went wrong. Try again." };

  const { data: grant } = await supabase.from("founding_class_grants").select("profile_id").eq("profile_id", user.id).maybeSingle();

  return { ok: true, foundingClassGranted: Boolean(grant) };
}
