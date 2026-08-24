"use client";

import { useState } from "react";
import { PersonRow } from "@/components/ui/PersonRow";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { canSuspendCreativeProjectMember } from "@/lib/authz";
import { suspendCreativeProjectMemberAction } from "@/lib/creative-project-actions";
import type { CreativeProjectMemberWithProfile } from "@/lib/data/creative-projects";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", member: "Member" };
const ROLE_TONE: Record<string, "gold" | "flow"> = { owner: "gold", member: "flow" };
const STATUS_LABEL: Record<string, string> = { invited: "Invited", active: "Active", suspended: "Suspended", removed: "Removed" };
const STATUS_TONE: Record<string, "verified" | "gold" | "danger" | "neutral"> = { active: "verified", invited: "gold", suspended: "danger", removed: "neutral" };

/**
 * Full roster — visible here only because RLS (creative_project_members_active_roster_read)
 * already granted the caller (owner or active member) every row for this
 * project. Suspend is the ONLY owner action rendered — no Activate, no
 * Remove, no Promote — because the backend has no path for any of those
 * (see suspendCreativeProjectMemberAction's own doc comment). Membership
 * status here is never a stand-in for verified contribution; that
 * distinction is enforced by keeping this roster free of any "Verified"
 * language.
 */
export function MemberRoster({ projectId, members, currentUserId, isOwner }: { projectId: string; members: CreativeProjectMemberWithProfile[]; currentUserId: string; isOwner: boolean }) {
  return (
    <div className="space-y-2.5">
      {members.map((member) => (
        <MemberRosterRow key={member.id} projectId={projectId} member={member} currentUserId={currentUserId} isOwner={isOwner} />
      ))}
    </div>
  );
}

function MemberRosterRow({
  projectId,
  member,
  currentUserId,
  isOwner,
}: {
  projectId: string;
  member: CreativeProjectMemberWithProfile;
  currentUserId: string;
  isOwner: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const name = member.profile?.full_name ?? (member.profile?.username ? `@${member.profile.username}` : "FLOW member");
  const canSuspend = isOwner && member.status !== "suspended" && canSuspendCreativeProjectMember(member, currentUserId);

  return (
    <>
      <PersonRow
        name={name}
        imageUrl={member.profile?.avatar_url}
        meta={member.profile?.username ? `@${member.profile.username}` : undefined}
        role={
          <div className="flex items-center gap-1.5">
            <Badge tone={ROLE_TONE[member.role] ?? "flow"}>{ROLE_LABEL[member.role] ?? member.role}</Badge>
            <Badge tone={STATUS_TONE[member.status] ?? "neutral"}>{STATUS_LABEL[member.status] ?? member.status}</Badge>
          </div>
        }
        actions={
          canSuspend ? (
            <button type="button" onClick={() => setConfirming(true)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-ink-50 dark:border-ink-700 dark:text-white dark:hover:bg-ink-800">
              Suspend
            </button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Suspend ${name}?`}
        description={`${name} will lose active-member access to this project, including the project-linked evidence flow, until reinstated. This doesn't remove their membership history.`}
        confirmLabel="Suspend"
        onConfirm={() => suspendCreativeProjectMemberAction(projectId, member.id, member.role, member.profile_id)}
      />
    </>
  );
}
