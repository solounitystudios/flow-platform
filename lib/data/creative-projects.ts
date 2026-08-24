import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

// `creative_project_members.role`/`.status` are plain `text` at the SQL
// level (constrained by a `check`, not a Postgres enum), so the generated
// `Tables<"creative_project_members">` types them as `string` — these two
// literal unions narrow them for app code, same convention as
// `OrganizationMemberRole`/`OrganizationMemberStatus` in lib/data/organization.ts.
export type CreativeProjectMemberRole = "owner" | "member";
export type CreativeProjectMemberStatus = "invited" | "active" | "suspended" | "removed";

export type CreativeProjectMember = Omit<Tables<"creative_project_members">, "role" | "status"> & {
  role: CreativeProjectMemberRole;
  status: CreativeProjectMemberStatus;
};

export type CreativeProjectMemberWithProfile = CreativeProjectMember & {
  profile: Pick<Tables<"profiles">, "id" | "full_name" | "username" | "avatar_url"> | null;
};

/** A pending ('invited') creative_project_members row for the current
 * caller. `project_title` is null when the project's title itself isn't
 * readable yet — creative_projects_member_read requires active membership
 * (is_creative_project_member(), status='active'), which a merely-invited
 * profile doesn't have until they accept. See
 * lib/creative-project-display.ts's describePendingInvitation() for the
 * honest fallback this produces (kept in a dependency-free module so a
 * client component can use it without pulling this server-only file's
 * next/headers import into the browser bundle), and
 * supabase/migrations/20260823041155_creative_projects_foundation.sql for
 * the RLS this reflects. `inviter` is always readable regardless (profiles
 * has a public read policy), so it's included as the fallback identifying
 * context. RLS (creative_project_members_self_read) already scopes the
 * base row to the caller's own regardless of the .eq filters below. */
export interface PendingCreativeProjectInvitation {
  project_id: string;
  project_title: string | null;
  invited_at: string;
  inviter: { full_name: string | null; username: string | null } | null;
}

export async function getMyPendingCreativeProjectInvitations(profileId: string): Promise<PendingCreativeProjectInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creative_project_members")
    .select("project_id, invited_at, project:creative_projects(title), inviter:profiles!creative_project_members_invited_by_fkey(full_name, username)")
    .eq("profile_id", profileId)
    .eq("status", "invited")
    .order("invited_at", { ascending: false });

  if (error) {
    console.error("[getMyPendingCreativeProjectInvitations] query failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    project_id: row.project_id,
    project_title: (row.project as unknown as { title: string } | null)?.title ?? null,
    invited_at: row.invited_at,
    inviter: (row.inviter as unknown as { full_name: string | null; username: string | null } | null) ?? null,
  }));
}

/** Projects the caller owns. RLS (creative_projects_owner_manage) already
 * scopes this to the caller's own regardless of the .eq filter below. */
export async function getMyOwnedCreativeProjects(profileId: string): Promise<Tables<"creative_projects">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("creative_projects").select("*").eq("owner_id", profileId).order("created_at", { ascending: false });

  if (error) {
    console.error("[getMyOwnedCreativeProjects] query failed:", error.message);
    return [];
  }
  return data ?? [];
}

/** Active, non-owner memberships — the "projects I've joined" list. Distinct
 * from getMyActiveCreativeProjects (lib/data/verifications.ts), which is a
 * narrower {id,title}-only lookup built for the evidence-submission form's
 * project picker; this one carries the description too, for a proper list
 * card. Both read the same table, scoped by RLS to the caller's own rows. */
export interface MyActiveCreativeProjectMembership {
  project_id: string;
  title: string;
  description: string | null;
}

export async function getMyActiveCreativeProjectMemberships(profileId: string): Promise<MyActiveCreativeProjectMembership[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creative_project_members")
    .select("project_id, project:creative_projects(title, description)")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .eq("role", "member")
    .order("joined_at", { ascending: false });

  if (error) {
    console.error("[getMyActiveCreativeProjectMemberships] query failed:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const project = row.project as unknown as { title: string; description: string | null } | null;
      if (!project) return null;
      return { project_id: row.project_id, title: project.title, description: project.description };
    })
    .filter((row): row is MyActiveCreativeProjectMembership => row !== null);
}

/** One cheap extra query for "how many active members" on owned-project
 * cards — not embedded per-row (PostgREST can't filter an embedded
 * aggregate by a sibling column), just a single flat count query batched
 * across every owned project id. */
export async function getActiveMemberCounts(projectIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (projectIds.length === 0) return counts;

  const supabase = await createClient();
  const { data, error } = await supabase.from("creative_project_members").select("project_id").eq("status", "active").in("project_id", projectIds);

  if (error) {
    console.error("[getActiveMemberCounts] query failed:", error.message);
    return counts;
  }

  for (const row of data ?? []) {
    counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  }
  return counts;
}

/** The project row itself, plus the caller's own membership row for it.
 * `project` is null whenever RLS hasn't granted read access — which, per
 * creative_projects_member_read, means the caller is not an active member
 * or the owner (covers a pending invitee, a suspended/removed member, and
 * a total stranger alike). `myMembership` still resolves independently via
 * creative_project_members_self_read (no status filter), so the detail
 * page can tell "you have a real but non-active relationship to this
 * project" apart from "you have no relationship to this project at all"
 * without ever needing to read the project row to do it. */
export interface CreativeProjectDetail {
  project: Tables<"creative_projects"> | null;
  myMembership: CreativeProjectMember | null;
}

export async function getCreativeProjectDetail(projectId: string, profileId: string): Promise<CreativeProjectDetail> {
  const supabase = await createClient();
  const [{ data: project, error: projectError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("creative_projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("creative_project_members").select("*").eq("project_id", projectId).eq("profile_id", profileId).maybeSingle(),
  ]);

  if (projectError) console.error("[getCreativeProjectDetail] project query failed:", projectError.message);
  if (membershipError) console.error("[getCreativeProjectDetail] membership query failed:", membershipError.message);

  return {
    project: project ?? null,
    myMembership: (membership as CreativeProjectMember | null) ?? null,
  };
}

/** Full member roster for a project, joined to the profile columns the
 * detail page needs. Only call this once getCreativeProjectDetail has
 * confirmed `project` is non-null — that's the RLS-confirmed signal the
 * caller is the owner or an active member, which is exactly what
 * creative_project_members_active_roster_read requires to return every row
 * (any status/role) rather than just the caller's own. */
export async function getCreativeProjectMembers(projectId: string): Promise<CreativeProjectMemberWithProfile[]> {
  const supabase = await createClient();
  // creative_project_members has two FKs into profiles (profile_id and
  // invited_by), so the embed must name which one to follow — otherwise
  // PostgREST rejects the query as ambiguous. Same pattern as
  // getOrganizationMembers in lib/data/organization.ts.
  const { data, error } = await supabase
    .from("creative_project_members")
    .select("*, profile:profiles!creative_project_members_profile_id_fkey(id, full_name, username, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getCreativeProjectMembers] query failed:", error.message);
    return [];
  }
  return (data ?? []) as CreativeProjectMemberWithProfile[];
}
