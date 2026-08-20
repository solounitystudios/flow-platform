"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationByOwner, type OrganizationMemberRole, type OrganizationMemberStatus } from "@/lib/data/organization";
import { canManageOrganizationMember, INVITABLE_ORGANIZATION_ROLES } from "@/lib/authz";

export interface TeamActionState {
  error?: string;
  success?: string;
}

const INVITABLE_ROLES: OrganizationMemberRole[] = [...INVITABLE_ORGANIZATION_ROLES];

/**
 * Owner-only. Looks up a FLOW member by username and creates an `invited`
 * organization_members row for them. This does NOT send an email or any
 * other notification — there's no delivery infrastructure for this flow
 * yet, so the row is created data-only and the UI must say so honestly.
 * The RLS policy this relies on (`organization_members_owner_invite`)
 * independently enforces the same "caller is the org owner, target isn't
 * themselves, role isn't owner" rules — this check is defense-in-depth,
 * not a substitute for it, per this repo's convention.
 */
export async function inviteOrganizationMemberAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const organizationId = String(formData.get("organization_id") ?? "");
  const username = String(formData.get("username") ?? "").trim().replace(/^@/, "");
  const role = String(formData.get("role") ?? "") as OrganizationMemberRole;

  if (!organizationId || !username) return { error: "Enter a FLOW username to invite." };
  if (!INVITABLE_ROLES.includes(role)) return { error: "Choose a valid role." };

  const org = await getOrganizationByOwner(user.id);
  if (!org || org.id !== organizationId) return { error: "Only the business owner can invite team members." };

  const { data: targetProfile } = await supabase.from("profiles").select("id, full_name, username").eq("username", username).maybeSingle();
  if (!targetProfile) return { error: `No FLOW member found with the username "${username}".` };
  if (targetProfile.id === user.id) return { error: "You're already the owner of this business." };

  const { error } = await supabase.from("organization_members").insert({
    organization_id: organizationId,
    profile_id: targetProfile.id,
    role,
    status: "invited",
    invited_by: user.id,
  });

  if (error) {
    if (error.code === "23505") return { error: `${targetProfile.full_name ?? username} is already on this team.` };
    console.error("[team:invite] insert failed:", error.message);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/business/team");
  revalidatePath("/business");
  return { success: `Added ${targetProfile.full_name ?? `@${username}`} as invited — they'll see it the next time they open their FLOW business dashboard. No email is sent, so it's worth letting them know directly too.` };
}

/**
 * Owner-only. Soft state change (never a DELETE) — sets a non-owner
 * member's status to `suspended` or `removed`. Blocked from ever targeting
 * the caller's own row or a `role = 'owner'` row, both here and in the
 * RLS policy (`organization_members_owner_manage`) that backs this write.
 */
export async function setOrganizationMemberStatusAction(
  organizationId: string,
  memberId: string,
  status: Extract<OrganizationMemberStatus, "suspended" | "removed" | "active">,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };

  const org = await getOrganizationByOwner(user.id);
  if (!org || org.id !== organizationId) return { error: "Only the business owner can manage the team." };

  const { data: target } = await supabase.from("organization_members").select("id, profile_id, role").eq("id", memberId).eq("organization_id", organizationId).maybeSingle();

  if (!target) return { error: "That team member no longer exists." };
  if (!canManageOrganizationMember(target, user.id)) {
    return { error: target.role === "owner" ? "The business owner's access can't be changed here." : "You can't change your own membership." };
  }

  const removedAt = status === "removed" ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("organization_members")
    .update({ status, removed_at: removedAt })
    .eq("id", memberId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[team:setStatus] update failed:", error.message);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/business/team");
  return {};
}
