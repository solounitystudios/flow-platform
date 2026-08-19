"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AcceptResult {
  ok: boolean;
  error?: string;
  businessName?: string;
}

const ACCEPT_ERROR_TEXT: Record<string, string> = {
  not_authenticated: "Log in to accept this invitation.",
  invalid_or_expired: "This invitation link is invalid or has expired.",
  email_mismatch: "This invitation was sent to a different email address.",
  already_claimed: "This invitation has already been accepted by another account.",
};

/**
 * Hashes the token client never sees the server compare — the RPC only
 * ever receives and stores the SHA-256 hash, matching how
 * employer_invitations.token_hash was generated when the admin created it.
 */
export async function acceptInvitationAction(token: string): Promise<AcceptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ACCEPT_ERROR_TEXT.not_authenticated };

  const token_hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase.rpc("accept_employer_invitation", { p_token_hash: token_hash });

  if (error) {
    console.error("[employer:acceptInvitation]", error.message);
    return { ok: false, error: "Something went wrong. Try again." };
  }

  const result = data as unknown as { ok: boolean; reason?: string; business_name?: string };
  if (!result.ok) return { ok: false, error: ACCEPT_ERROR_TEXT[result.reason ?? ""] ?? "Something went wrong. Try again." };

  return { ok: true, businessName: result.business_name };
}

export interface OnboardingState {
  error?: string;
}

export async function createEmployerOrganizationAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const city = String(formData.get("city") ?? "Buffalo");
  const state = String(formData.get("state") ?? "NY");
  if (!name) return { error: "Give your business a name." };

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ owner_id: user.id, name, description, city, state })
    .select("id")
    .single();

  if (orgError) {
    console.error("[employer:createOrganization]", orgError.message);
    return { error: "Something went wrong creating your organization. Try again." };
  }

  const { error: linkError } = await supabase.rpc("complete_invited_employer_onboarding", { p_organization_id: org.id });
  if (linkError) {
    // The organization exists either way — this only fails to link it back
    // to the lead/verification case, which isn't something the employer
    // can fix themselves, so don't block them here.
    console.error("[employer:completeOnboarding]", linkError.message);
  }

  redirect("/business");
}
