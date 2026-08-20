import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/lib/database.types";

export async function getOrganizationByOwner(ownerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("*").eq("owner_id", ownerId).maybeSingle();
  return data;
}

// ─────────────────────────────────────────────────────────────────────────
// organization_members — TEMPORARY CAST NOTICE
//
// `organization_members` and its helper RPCs
// (`is_organization_member`/`has_organization_role`) are defined in
// supabase/migrations/20260820091500_organization_members_foundation.sql
// and 20260820091530_organization_members_read_access.sql, which have been
// drafted by supabase-backend but are NOT YET APPLIED to production —
// they're waiting on separate founder authorization. Because of that,
// `lib/database.types.ts` (regenerated only from a live schema) has no
// knowledge of this table yet, so `supabase.from("organization_members")`
// fails to typecheck against the real `Database` type.
//
// `pendingOrgMembersTable()` below is the escape hatch: it re-casts the
// already-authenticated, cookie-scoped `supabase` client (created via the
// normal `createClient()` everywhere else in this file) to the untyped
// `SupabaseClient` shape just for this one table, so the query is correct
// against the schema the migration defines today. Every value read back
// through it is then narrowed with an explicit `as unknown as <Type>` cast
// at the call site, matching the `(data ?? []) as unknown as X[]` pattern
// already used throughout lib/data/admin.ts — this file introduces no new
// convention, just applies the existing one to a table instead of a
// not-yet-typed RPC (see `PendingAdminRpc` in lib/admin/actions.ts for the
// RPC-shaped sibling of this same situation).
//
// Once the migration is applied and `lib/database.types.ts` is
// regenerated: delete `pendingOrgMembersTable()`, delete the manual
// `OrganizationMember*` types below (replace with `Tables<"organization_members">`),
// and call `supabase.from("organization_members")` directly everywhere
// this helper is used, in this file and in
// app/(app)/business/team/actions.ts.
export function pendingOrgMembersTable(supabase: Awaited<ReturnType<typeof createClient>>) {
  const untyped = supabase as unknown as SupabaseClient;
  return untyped.from("organization_members");
}

export type OrganizationMemberRole = "owner" | "admin" | "recruiter" | "manager";
export type OrganizationMemberStatus = "invited" | "active" | "suspended" | "removed";

export interface OrganizationMember {
  id: string;
  organization_id: string;
  profile_id: string;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  invited_by: string | null;
  invited_at: string;
  joined_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

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

  const membersTable = pendingOrgMembersTable(supabase);
  const { data: membership } = await membersTable
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const membershipRow = membership as unknown as { organization_id: string } | null;
  if (!membershipRow) return null;

  const { data: memberOrg } = await supabase.from("organizations").select("*").eq("id", membershipRow.organization_id).maybeSingle();
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
  const membersTable = pendingOrgMembersTable(supabase);
  const { data, error } = await membersTable
    .select("*, profile:profiles(id, full_name, username, avatar_url)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getOrganizationMembers] query failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as OrganizationMemberWithProfile[];
}

/** A single member row for one profile in one org (used to render "your own membership" for non-owners). */
export async function getOrganizationMembership(organizationId: string, profileId: string): Promise<OrganizationMember | null> {
  const supabase = await createClient();
  const membersTable = pendingOrgMembersTable(supabase);
  const { data } = await membersTable.select("*").eq("organization_id", organizationId).eq("profile_id", profileId).maybeSingle();
  return (data ?? null) as unknown as OrganizationMember | null;
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
  const membersTable = pendingOrgMembersTable(supabase);
  const { data, error } = await membersTable
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
