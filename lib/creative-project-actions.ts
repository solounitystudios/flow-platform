"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findProfileByUsername } from "@/lib/data/verifications";
import { canSuspendCreativeProjectMember } from "@/lib/authz";
import type { CreativeProjectInviteResult, LeaveCreativeProjectResult } from "@/lib/database.types";

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

// ── Creative Project UI V1 (Batch 17b) ─────────────────────────────────────

export interface CreativeProjectActionState {
  error?: string;
  success?: string;
}

/** Any authenticated FLOW member can create a project — normal user-scoped
 * client, relying entirely on creative_projects_owner_manage's RLS
 * with-check (auth.uid() = owner_id) rather than any service-role bypass.
 * The AFTER INSERT sync trigger (sync_creative_project_owner_membership)
 * creates the caller's own active, role='owner' creative_project_members
 * row automatically — nothing here writes to that table directly. */
export async function createCreativeProjectAction(_prev: CreativeProjectActionState, formData: FormData): Promise<CreativeProjectActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to create a project." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) return { error: "Give your project a title." };

  const { data, error } = await supabase
    .from("creative_projects")
    .insert({ owner_id: user.id, title, description: description || null })
    .select("id")
    .single();

  if (error) {
    console.error("[createCreativeProject]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/creative-projects");
  redirect(`/creative-projects/${data.id}`);
}

/** Owner-only. Resolves a FLOW username to a profile id (reusing the same
 * lookup the evidence-witness flow already uses — lib/data/verifications.ts)
 * and creates an 'invited' creative_project_members row. This is a request
 * for consent, not membership itself — the invitee must separately call
 * acceptCreativeProjectInviteAction before they're an active member of
 * anything. No email/notification delivery exists yet, same honest
 * limitation as inviteOrganizationMemberAction
 * (app/(app)/business/team/actions.ts). RLS
 * (creative_project_members_owner_invite) independently enforces the same
 * "caller is the project owner, target isn't themselves, role isn't owner,
 * status is invited" rules — this check is defense-in-depth, not a
 * substitute for it. */
export async function inviteCreativeProjectMemberAction(_prev: CreativeProjectActionState, formData: FormData): Promise<CreativeProjectActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to invite a member." };

  const projectId = String(formData.get("project_id") ?? "");
  const username = String(formData.get("username") ?? "")
    .trim()
    .replace(/^@/, "");
  if (!projectId || !username) return { error: "Enter a FLOW username to invite." };

  const target = await findProfileByUsername(username);
  if (!target) return { error: `No FLOW member found with the username "${username}".` };
  if (target.id === user.id) return { error: "You can't invite yourself." };

  const { error } = await supabase.from("creative_project_members").insert({
    project_id: projectId,
    profile_id: target.id,
    role: "member",
    status: "invited",
  });

  if (error) {
    if (error.code === "23505") return { error: `${target.full_name ?? `@${username}`} is already on this project.` };
    console.error("[inviteCreativeProjectMember]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath(`/creative-projects/${projectId}`);
  return { success: `Invited ${target.full_name ?? `@${username}`} — they'll see it next time they open Creative Projects.` };
}

/** Owner-only. Soft state change — sets a non-owner member's status to
 * 'suspended'. This is the ONLY status this action can ever write: unlike
 * organizations' setOrganizationMemberStatusAction, there is no
 * activate/remove branch here, because creative_project_members_owner_manage's
 * with-check no longer permits the owner to set status='active' at all
 * after 20260823232600_creative_project_invite_consent.sql (only
 * accept_creative_project_invite() can, self-service only), and never
 * permitted 'removed' even before that. canSuspendCreativeProjectMember
 * (lib/authz.ts) mirrors that same policy's target-eligibility rule. */
export async function suspendCreativeProjectMemberAction(projectId: string, memberId: string, targetRole: string, targetProfileId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to manage this project." };

  if (!canSuspendCreativeProjectMember({ role: targetRole, profile_id: targetProfileId }, user.id)) {
    return { error: targetRole === "owner" ? "The project owner's access can't be changed here." : "You can't change your own membership." };
  }

  const { error } = await supabase.from("creative_project_members").update({ status: "suspended" }).eq("id", memberId).eq("project_id", projectId);

  if (error) {
    console.error("[suspendCreativeProjectMember]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath(`/creative-projects/${projectId}`);
  return {};
}

const LEAVE_RESULT_MESSAGES: Record<NonNullable<LeaveCreativeProjectResult["reason"]>, string> = {
  not_authenticated: "Log in to leave this project.",
  not_a_member: "You're not a member of this project.",
  owner_cannot_leave: "The project owner can't leave their own project.",
  not_active: "You're not an active member of this project.",
};

/** Thin wrapper around the existing leave_creative_project(p_project_id)
 * RPC (20260823041155_creative_projects_foundation.sql) — self-targeted
 * only (auth.uid()), no parameter accepts an arbitrary profile. History-
 * preserving: sets status='removed', removed_at=now(), never a hard
 * delete. */
export async function leaveCreativeProjectAction(projectId: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to leave this project." };

  const { data, error } = await supabase.rpc("leave_creative_project", { p_project_id: projectId });

  if (error) {
    console.error("[leaveCreativeProject]", error.message);
    return { error: "Something went wrong. Try again." };
  }

  const result = data as LeaveCreativeProjectResult | null;
  if (!result?.ok) {
    return { error: (result?.reason && LEAVE_RESULT_MESSAGES[result.reason]) || "Unable to leave this project." };
  }

  revalidatePath("/creative-projects");
  revalidatePath(`/creative-projects/${projectId}`);
  return { ok: true };
}
