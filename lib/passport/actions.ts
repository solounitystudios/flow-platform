"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { claimFromActivity, passportReasonMessage, setClaimVisibility } from "@/lib/passport/data";

export interface PassportActionResult {
  error?: string;
}

/**
 * A participant whose host has marked them completed puts that outcome on
 * their Passport. The client supplies ONLY the activity id — evidence, claim
 * and the verification decision are derived server-side from the host's own
 * record (see passport_claim_from_activity), and the RPC refuses anyone else.
 */
export async function claimActivityToPassportAction(activityId: string): Promise<PassportActionResult & { claimId?: string; alreadyExists?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to add this to your Passport." };

  const result = await claimFromActivity(supabase, activityId);
  if (!result.ok) return { error: passportReasonMessage(result.reason) };

  revalidatePath("/passport");
  revalidatePath(`/activities/${activityId}`);
  return { claimId: result.id, alreadyExists: result.already_exists };
}

/** Owner-controlled disclosure. New claims are private until the owner says otherwise. */
export async function setClaimVisibilityAction(claimId: string, visibility: "private" | "public"): Promise<PassportActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in first." };

  const result = await setClaimVisibility(supabase, claimId, visibility);
  if (!result.ok) return { error: passportReasonMessage(result.reason) };

  revalidatePath("/passport");
  revalidatePath(`/passport/claims/${claimId}`);
  return {};
}
