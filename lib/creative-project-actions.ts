"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CreativeProjectInviteResult } from "@/lib/database.types";

// Both RPCs are SECURITY DEFINER and self-scoped (auth.uid() only, no
// parameter accepts an arbitrary profile) — this action layer never decides
// who's allowed, it just calls the RPC and translates its {ok, reason}
// result into a message. Same contract as confirmVerificationAsCollaborator
// in lib/verification-actions.ts.

const INVITE_RESPONSE_MESSAGES: Record<NonNullable<CreativeProjectInviteResult["reason"]>, string> = {
  not_authenticated: "Log in to respond to this invitation.",
  not_found: "That invitation could not be found.",
  not_pending: "This invitation has already been responded to.",
};

/** Called by the profile named on a pending ('invited') creative_project_members
 * row — see accept_creative_project_invite() for the authorization/precondition
 * logic this wraps. Accepting means only "I consent to being listed as a
 * member of this project" — it does not confirm a contribution, approve
 * evidence, or grant any ownership/royalty/publishing/contractual right. */
export async function acceptCreativeProjectInviteAction(projectId: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to respond to this invitation." };

  const { data, error } = await supabase.rpc("accept_creative_project_invite", { p_project_id: projectId });

  if (error) {
    console.error("[acceptCreativeProjectInvite]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  const result = data as CreativeProjectInviteResult | null;
  if (!result?.ok) {
    return { error: (result?.reason && INVITE_RESPONSE_MESSAGES[result.reason]) || "Unable to accept this invitation." };
  }

  revalidatePath("/creative-projects");
  return { ok: true };
}

/** Called by the profile named on a pending ('invited') creative_project_members
 * row — see decline_creative_project_invite() for the authorization/precondition
 * logic this wraps. */
export async function declineCreativeProjectInviteAction(projectId: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to respond to this invitation." };

  const { data, error } = await supabase.rpc("decline_creative_project_invite", { p_project_id: projectId });

  if (error) {
    console.error("[declineCreativeProjectInvite]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  const result = data as CreativeProjectInviteResult | null;
  if (!result?.ok) {
    return { error: (result?.reason && INVITE_RESPONSE_MESSAGES[result.reason]) || "Unable to decline this invitation." };
  }

  revalidatePath("/creative-projects");
  return { ok: true };
}
