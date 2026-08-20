import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export async function getOrganizationByOwner(ownerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("*").eq("owner_id", ownerId).maybeSingle();
  return data;
}

// `organization_members.role`/`.status` are plain `text` at the SQL level
// (constrained by a `check`, not a Postgres enum), so the generated
// `Tables<"organization_members">` types them as `string` — these two
// literal unions narrow them for app code, same convention as
// `ApplicationStatus`/`AttendanceStatus` at the tail of database.types.ts.
export type OrganizationMemberRole = "owner" | "admin" | "recruiter" | "manager";
export type OrganizationMemberStatus = "invited" | "active" | "suspended" | "removed";

export type OrganizationMember = Omit<Tables<"organization_members">, "role" | "status"> & {
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
};

export type OrganizationMemberWithProfile = OrganizationMember & {
  profile: Pick<Tables<"profiles">, "id" | "full_name" | "username" | "avatar_url"> | null;
};

/**
 * Member-aware organization lookup — a strict superset of
 * `getOrganizationByOwner`. Finds the organization a profile can access
 * either because it owns it (`organizations.owner_id`, identical to the
 * existing behavior) or because it holds an active
 * `organization_members` row for it. Owner check always runs first and
 * short-circuits, so a lone owner's result and code path are unchanged.
 */
export async function getOrganizationForMember(profileId: string) {
  const supabase = await createClient();

  const { data: ownedOrg } = await supabase.from("organizations").select("*").eq("owner_id", profileId).maybeSingle();
  if (ownedOrg) return ownedOrg;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data: memberOrg } = await supabase.from("organizations").select("*").eq("id", membership.organization_id).maybeSingle();
  return memberOrg ?? null;
}

/**
 * Full member roster for an organization, joined to the profile columns
 * the team UI needs. RLS shape (see the foundation migration) means this
 * only returns every row when the caller is the org owner or a FLOW admin —
 * a non-owner member calling this will only see their own row come back,
 * by design (there is deliberately no "member reads all teammates" policy
 * yet).
 */
export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMemberWithProfile[]> {
  const supabase = await createClient();
  // `organization_members` has two FKs into `profiles` (`profile_id` and
  // `invited_by`), so the embed must name which one to follow — otherwise
  // PostgREST rejects the query as ambiguous.
  const { data, error } = await supabase
    .from("organization_members")
    .select("*, profile:profiles!organization_members_profile_id_fkey(id, full_name, username, avatar_url)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getOrganizationMembers] query failed:", error.message);
    return [];
  }
  return (data ?? []) as OrganizationMemberWithProfile[];
}

/** A single member row for one profile in one org (used to render "your own membership" for non-owners). */
export async function getOrganizationMembership(organizationId: string, profileId: string): Promise<OrganizationMember | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("organization_members").select("*").eq("organization_id", organizationId).eq("profile_id", profileId).maybeSingle();
  return (data ?? null) as OrganizationMember | null;
}

export interface PendingOrganizationInvite {
  id: string;
  role: OrganizationMemberRole;
  organization: Pick<Tables<"organizations">, "id" | "name" | "city" | "state"> | null;
}

/**
 * There's no email/push delivery behind the invite flow yet (see
 * app/(app)/business/team/actions.ts), so this is how an invited profile
 * actually finds out: the `organization_members_self_read` RLS policy
 * already lets a profile read their own row regardless of status, so a
 * pending "invited" row is visible here the moment the owner creates it —
 * `app/(app)/business/page.tsx` surfaces it as a read-only notice. There is
 * deliberately no self-accept action yet (out of scope per the foundation
 * migration's own header — accepting needs a narrow RPC of its own).
 */
export async function getPendingInvitationsForProfile(profileId: string): Promise<PendingOrganizationInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, role, organization:organizations(id, name, city, state)")
    .eq("profile_id", profileId)
    .eq("status", "invited")
    .order("invited_at", { ascending: false });

  if (error) {
    console.error("[getPendingInvitationsForProfile] query failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as PendingOrganizationInvite[];
}
