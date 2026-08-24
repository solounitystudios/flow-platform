// Pure presentation logic — no Next.js/Supabase imports, so this is safe to
// import from a client component without pulling lib/data/creative-projects.ts's
// server-only createClient() (next/headers) into the browser bundle. Same
// convention as lib/authz.ts, lib/map-selectors.ts, lib/redirect-safety.ts.

/** What a pending-invitation card shows. Separated from the data-fetching
 * shape in lib/data/creative-projects.ts because the project's own title
 * isn't always readable yet — creative_projects_member_read requires active
 * membership (is_creative_project_member(), status='active'), which a
 * merely-invited profile doesn't have until they accept. See
 * supabase/migrations/20260823041155_creative_projects_foundation.sql. */
export interface PendingInvitationDisplay {
  title: string;
  subtitle: string | null;
}

export function describePendingInvitation(invite: {
  project_title: string | null;
  inviter: { full_name: string | null; username: string | null } | null;
}): PendingInvitationDisplay {
  const inviterName = invite.inviter?.full_name ?? (invite.inviter?.username ? `@${invite.inviter.username}` : null);

  if (invite.project_title) {
    return { title: invite.project_title, subtitle: inviterName ? `Invited by ${inviterName}` : null };
  }

  return {
    title: inviterName ? `A creative project from ${inviterName}` : "A creative project",
    subtitle: "Accept to see the full project details.",
  };
}
