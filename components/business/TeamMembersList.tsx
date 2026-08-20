"use client";

import { useState } from "react";
import { PersonRow } from "@/components/ui/PersonRow";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { OrganizationMemberRole, OrganizationMemberStatus, OrganizationMemberWithProfile } from "@/lib/data/organization";
import { setOrganizationMemberStatusAction } from "@/app/(app)/business/team/actions";

const ROLE_LABEL: Record<OrganizationMemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
  manager: "Manager",
};

const ROLE_TONE: Record<OrganizationMemberRole, "flow" | "gold" | "neutral"> = {
  owner: "gold",
  admin: "flow",
  recruiter: "neutral",
  manager: "neutral",
};

const STATUS_LABEL: Record<OrganizationMemberStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

const STATUS_TONE: Record<OrganizationMemberStatus, "verified" | "gold" | "danger" | "neutral"> = {
  active: "verified",
  invited: "gold",
  suspended: "danger",
  removed: "neutral",
};

/**
 * Owner-only management list. `currentUserId` and the `role === "owner"`
 * check both gate rendering of the suspend/remove actions per-row — this
 * mirrors (not replaces) the same two checks enforced server-side in
 * `setOrganizationMemberStatusAction`.
 */
export function TeamMembersList({
  organizationId,
  members,
  currentUserId,
}: {
  organizationId: string;
  members: OrganizationMemberWithProfile[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-2.5">
      {members.map((member) => (
        <MemberRow key={member.id} organizationId={organizationId} member={member} isSelf={member.profile_id === currentUserId} />
      ))}
    </div>
  );
}

function MemberRow({
  organizationId,
  member,
  isSelf,
}: {
  organizationId: string;
  member: OrganizationMemberWithProfile;
  isSelf: boolean;
}) {
  const [confirming, setConfirming] = useState<"suspend" | "remove" | "reactivate" | null>(null);
  const name = member.profile?.full_name ?? member.profile?.username ?? "FLOW member";
  const canManage = member.role !== "owner" && !isSelf;

  return (
    <>
      <PersonRow
        name={name}
        imageUrl={member.profile?.avatar_url}
        meta={member.profile?.username ? `@${member.profile.username}` : undefined}
        role={
          <div className="flex items-center gap-1.5">
            <Badge tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role]}</Badge>
            <Badge tone={STATUS_TONE[member.status]}>{STATUS_LABEL[member.status]}</Badge>
          </div>
        }
        actions={
          canManage ? (
            <div className="flex items-center gap-1.5">
              {member.status !== "suspended" && member.status !== "removed" && (
                <Button variant="outline" size="sm" onClick={() => setConfirming("suspend")}>
                  Suspend
                </Button>
              )}
              {member.status === "suspended" && (
                <Button variant="outline" size="sm" onClick={() => setConfirming("reactivate")}>
                  Reactivate
                </Button>
              )}
              {member.status !== "removed" && (
                <Button variant="ghost" size="sm" onClick={() => setConfirming("remove")}>
                  Remove
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={confirming === "suspend"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Suspend ${name}?`}
        description={`${name} will lose access to this business's postings, applicants, and events until reactivated. This doesn't delete their account or membership.`}
        confirmLabel="Suspend"
        onConfirm={() => setOrganizationMemberStatusAction(organizationId, member.id, "suspended")}
      />
      <ConfirmDialog
        open={confirming === "reactivate"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Reactivate ${name}?`}
        description={`${name} will regain access to this business's postings, applicants, and events.`}
        confirmLabel="Reactivate"
        tone="default"
        onConfirm={() => setOrganizationMemberStatusAction(organizationId, member.id, "active")}
      />
      <ConfirmDialog
        open={confirming === "remove"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Remove ${name} from the team?`}
        description={`${name} will lose access to this business's postings, applicants, and events. You can invite them again later if needed.`}
        confirmLabel="Remove"
        onConfirm={() => setOrganizationMemberStatusAction(organizationId, member.id, "removed")}
      />
    </>
  );
}
