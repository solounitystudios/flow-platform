"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { inviteCreativeProjectMemberAction, type CreativeProjectActionState } from "@/lib/creative-project-actions";

const initialState: CreativeProjectActionState = {};

/**
 * Owner-only invite form. Mirrors components/business/InviteMemberForm.tsx's
 * structure and honesty about no email/notification delivery — but
 * deliberately does NOT mirror its owner-direct-activation semantics.
 * There is no role picker here (creative_project_members has only
 * 'owner'/'member', and 'owner' is reserved for the ownership-sync
 * trigger's row) and, more importantly, inviting never makes anyone an
 * active member — only accept_creative_project_invite() can, and only the
 * invitee themselves can call it.
 */
export function InviteMemberForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState(inviteCreativeProjectMemberAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <Input label="FLOW username" name="username" placeholder="username" hint="They must already have a FLOW account. They'll need to accept before they're an active member." required />

      {state.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </p>
      )}
      {state.success && (
        <p className="flex items-center gap-1.5 rounded-lg bg-verified-500/10 px-3 py-2 text-sm text-verified-600 dark:text-verified-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {state.success}
        </p>
      )}

      <SubmitButton size="sm" pendingLabel="Inviting…">
        Invite
      </SubmitButton>
    </form>
  );
}
