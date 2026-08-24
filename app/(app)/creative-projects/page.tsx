import { redirect } from "next/navigation";
import { Palette } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getMyPendingCreativeProjectInvitations, getMyOwnedCreativeProjects, getMyActiveCreativeProjectMemberships, getActiveMemberCounts } from "@/lib/data/creative-projects";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateProjectDialog } from "@/components/creative-projects/CreateProjectDialog";
import { PendingInvitationCard } from "@/components/creative-projects/PendingInvitationCard";
import { ProjectCard } from "@/components/creative-projects/ProjectCard";

export default async function CreativeProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [pendingInvitations, ownedProjects, activeMemberships] = await Promise.all([
    getMyPendingCreativeProjectInvitations(user.id),
    getMyOwnedCreativeProjects(user.id),
    getMyActiveCreativeProjectMemberships(user.id),
  ]);

  const memberCounts = await getActiveMemberCounts(ownedProjects.map((p) => p.id));

  const hasNothing = pendingInvitations.length === 0 && ownedProjects.length === 0 && activeMemberships.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-white">Creative Projects</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">A shared space for a song, a film, or any creative work — invite collaborators, and connect their contributions to Passport verification.</p>
        </div>
        <CreateProjectDialog />
      </div>

      {hasNothing ? (
        <EmptyState
          icon={<Palette className="h-6 w-6" />}
          title="No creative projects yet"
          body="Create one to invite collaborators, or wait for an invitation to show up here."
          action={<CreateProjectDialog />}
        />
      ) : (
        <>
          {pendingInvitations.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-bold text-ink-900 dark:text-white">Pending Invitations</h2>
              <div className="space-y-2.5">
                {pendingInvitations.map((invite) => (
                  <PendingInvitationCard key={invite.project_id} invitation={invite} />
                ))}
              </div>
            </section>
          )}

          {ownedProjects.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-bold text-ink-900 dark:text-white">Owned Projects</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {ownedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    title={project.title}
                    description={project.description}
                    href={`/creative-projects/${project.id}`}
                    roleLabel="Owner"
                    roleTone="gold"
                    memberCount={memberCounts.get(project.id) ?? 1}
                  />
                ))}
              </div>
            </section>
          )}

          {activeMemberships.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-bold text-ink-900 dark:text-white">Active Memberships</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeMemberships.map((membership) => (
                  <ProjectCard key={membership.project_id} title={membership.title} description={membership.description} href={`/creative-projects/${membership.project_id}`} roleLabel="Member" roleTone="flow" />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
