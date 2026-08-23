import { createClient } from "@/lib/supabase/server";

/** A pending ('invited') creative_project_members row for the current
 * caller, joined to just the project title — the minimum a "you have a
 * pending invitation" list needs. RLS (creative_project_members_self_read)
 * already scopes this to the caller's own rows regardless of the .eq
 * filters below; they're here for query precision, not as the security
 * boundary. */
export interface PendingCreativeProjectInvitation {
  project_id: string;
  project_title: string;
  invited_at: string;
}

export async function getMyPendingCreativeProjectInvitations(profileId: string): Promise<PendingCreativeProjectInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creative_project_members")
    .select("project_id, invited_at, project:creative_projects(title)")
    .eq("profile_id", profileId)
    .eq("status", "invited")
    .order("invited_at", { ascending: false });

  if (error) {
    console.error("[getMyPendingCreativeProjectInvitations] query failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    project_id: row.project_id,
    project_title: (row.project as unknown as { title: string } | null)?.title ?? "Untitled project",
    invited_at: row.invited_at,
  }));
}
