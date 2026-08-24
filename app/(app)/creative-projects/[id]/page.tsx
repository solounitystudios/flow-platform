import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getCreativeProjectDetail, getCreativeProjectMembers } from "@/lib/data/creative-projects";
import { canSubmitCreativeProjectEvidence } from "@/lib/authz";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MemberRoster } from "@/components/creative-projects/MemberRoster";
import { InviteMemberForm } from "@/components/creative-projects/InviteMemberForm";
import { LeaveProjectButton } from "@/components/creative-projects/LeaveProjectButton";

const RELATIONSHIP_LABEL: Record<string, string> = {
  invited: "Pending invitation",
  suspended: "Suspended",
  removed: "No longer a member",
};

export default async function CreativeProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { project, myMembership } = await getCreativeProjectDetail(id, user.id);

  // Total stranger — no relationship to this project at all. Render a
  // true not-found, not a leaked "you don't have access" message, so
  // strangers can't distinguish a real project id from a nonexistent one.
  if (!project && !myMembership) notFound();

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/creative-projects" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to Creative Projects
      </Link>

      {project ? (
        <FullProjectView projectId={project.id} title={project.title} description={project.description} currentUserId={user.id} membership={myMembership} isOwner={project.owner_id === user.id} />
      ) : (
        <ReducedRelationshipView status={myMembership!.status} />
      )}
    </div>
  );
}

// Rendered whenever the caller has a real creative_project_members row but
// isn't (yet, or no longer) active or the owner — creative_projects_member_read
// requires active membership, so the project row itself (title/description)
// isn't readable here. See lib/data/creative-projects.ts's
// getCreativeProjectDetail doc comment for the exact RLS reasoning. This is
// not a 404: the person genuinely has a relationship to this project, just
// not one that grants read access to its details.
function ReducedRelationshipView({ status }: { status: string }) {
  const label = RELATIONSHIP_LABEL[status] ?? status;

  return (
    <Card>
      <CardBody className="space-y-3">
        <Badge tone={status === "invited" ? "gold" : status === "suspended" ? "danger" : "neutral"}>{label}</Badge>
        {status === "invited" && <p className="text-sm text-ink-600 dark:text-ink-300">You have a pending invitation to this project. Accept or decline it from your Creative Projects list — its full details become visible once you accept.</p>}
        {status === "suspended" && <p className="text-sm text-ink-600 dark:text-ink-300">You&apos;re currently suspended from this project, so its details aren&apos;t shown here.</p>}
        {status === "removed" && <p className="text-sm text-ink-600 dark:text-ink-300">You&apos;re no longer an active member of this project, so its details aren&apos;t shown here.</p>}
        <Button href="/creative-projects" variant="outline" size="sm">
          Back to Creative Projects
        </Button>
      </CardBody>
    </Card>
  );
}

async function FullProjectView({
  projectId,
  title,
  description,
  currentUserId,
  membership,
  isOwner,
}: {
  projectId: string;
  title: string;
  description: string | null;
  currentUserId: string;
  membership: { status: string; role: string } | null;
  isOwner: boolean;
}) {
  const members = await getCreativeProjectMembers(projectId);
  const owner = members.find((m) => m.role === "owner");
  const canSubmitEvidence = membership ? canSubmitCreativeProjectEvidence(membership.status) : false;

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-xl font-bold text-ink-900 dark:text-white">{title}</h1>
            <Badge tone={isOwner ? "gold" : "verified"}>{isOwner ? "Owner" : "Active Member"}</Badge>
          </div>
          {description && <p className="text-sm text-ink-600 dark:text-ink-300">{description}</p>}
          {owner?.profile && <p className="text-xs text-ink-400">Owned by {owner.profile.full_name ?? (owner.profile.username ? `@${owner.profile.username}` : "a FLOW member")}</p>}
        </CardBody>
      </Card>

      {canSubmitEvidence && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-900 dark:text-white">Submit contribution evidence</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Tag a Passport evidence claim to this project — reviewed the same way as any other evidence, never automatic.</p>
            </div>
            <Button href="/settings" variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4" /> Go to Evidence
            </Button>
          </CardBody>
        </Card>
      )}

      {isOwner && (
        <Card>
          <CardHeader>
            <h2 className="font-bold text-ink-900 dark:text-white">Invite a member</h2>
          </CardHeader>
          <CardBody>
            <InviteMemberForm projectId={projectId} />
          </CardBody>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Project Members ({members.length})</h2>
        <MemberRoster projectId={projectId} members={members} currentUserId={currentUserId} isOwner={isOwner} />
      </section>

      {!isOwner && membership?.status === "active" && (
        <div>
          <LeaveProjectButton projectId={projectId} projectTitle={title} />
        </div>
      )}
    </div>
  );
}
