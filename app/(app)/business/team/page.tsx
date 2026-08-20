import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getOrganizationForMember, getOrganizationMembers, getOrganizationMembership } from "@/lib/data/organization";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PersonRow } from "@/components/ui/PersonRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { InviteMemberForm } from "@/components/business/InviteMemberForm";
import { TeamMembersList } from "@/components/business/TeamMembersList";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", recruiter: "Recruiter", manager: "Manager" };
const STATUS_LABEL: Record<string, string> = { invited: "Invited", active: "Active", suspended: "Suspended", removed: "Removed" };

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await getOrganizationForMember(user.id);
  if (!org) redirect("/business");

  const isOwner = org.owner_id === user.id;

  return (
    <div className="space-y-5">
      <Link href="/business" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to business dashboard
      </Link>
      <div>
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Team</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{org.name}</p>
      </div>

      {isOwner ? <OwnerTeamView organizationId={org.id} currentUserId={user.id} /> : <MemberTeamView organizationId={org.id} profileId={user.id} orgName={org.name} />}
    </div>
  );
}

async function OwnerTeamView({ organizationId, currentUserId }: { organizationId: string; currentUserId: string }) {
  const members = await getOrganizationMembers(organizationId);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Add a team member</h2>
        </CardHeader>
        <CardBody>
          <InviteMemberForm organizationId={organizationId} />
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Current team ({members.length})</h2>
        {members.length > 0 ? (
          <TeamMembersList organizationId={organizationId} members={members} currentUserId={currentUserId} />
        ) : (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No team members yet" body="Add someone above to give them access to this business." />
        )}
      </section>
    </div>
  );
}

// Non-owner members can't see the full roster (RLS only lets the owner or a
// FLOW admin read every row — see organization_members_owner_read in the
// foundation migration), so this shows only what they themselves can see:
// their own membership row. Read-only — member write access (managing
// teammates, posting, etc.) is explicitly future scope.
async function MemberTeamView({ organizationId, profileId, orgName }: { organizationId: string; profileId: string; orgName: string }) {
  const membership = await getOrganizationMembership(organizationId, profileId);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-bold text-ink-900 dark:text-white">Your access</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        {membership ? (
          <PersonRow
            name={orgName}
            role={
              <div className="flex items-center gap-1.5">
                <Badge tone="flow">{ROLE_LABEL[membership.role] ?? membership.role}</Badge>
                <Badge tone={membership.status === "active" ? "verified" : "neutral"}>{STATUS_LABEL[membership.status] ?? membership.status}</Badge>
              </div>
            }
          />
        ) : (
          <p className="text-sm text-ink-500 dark:text-ink-400">You don&apos;t have a membership record for this business.</p>
        )}
        <p className="text-xs text-ink-400">
          Only the business owner can see and manage the full team. Ask them if you need your role or access changed.
        </p>
      </CardBody>
    </Card>
  );
}
