"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { inviteOrganizationMemberAction, type TeamActionState } from "@/app/(app)/business/team/actions";

const initialState: TeamActionState = {};

/**
 * Owner-only invite form. Role options never include "owner" — that role
 * is reserved for the row synced from `organizations.owner_id` and can't
 * be granted through this flow (also enforced server-side and by RLS).
 *
 * There's no email/notification delivery behind this yet, so the copy
 * below is deliberately honest about what actually happens: a row is
 * created with status "invited", nothing is sent anywhere.
 */
export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const [state, formAction] = useActionState(inviteOrganizationMemberAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="organization_id" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input label="FLOW username" name="username" placeholder="username" hint="They must already have a FLOW account." required />
        <Select label="Role" name="role" defaultValue="admin">
          <option value="admin">Admin</option>
          <option value="recruiter">Recruiter</option>
          <option value="manager">Manager</option>
        </Select>
      </div>

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

      <SubmitButton pendingLabel="Adding…">Add to team</SubmitButton>
      <p className="text-xs text-ink-400">
        This doesn&apos;t send an email or notification — they&apos;ll see the invite the next time they open their FLOW
        business dashboard, but it&apos;s worth telling them directly too.
      </p>
    </form>
  );
}
