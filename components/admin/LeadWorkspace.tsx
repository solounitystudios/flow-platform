"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertCircle, Check, Copy, Plus, Trash2 } from "lucide-react";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import {
  createContactAction,
  createInvitationAction,
  createTaskAction,
  logActivityAction,
  revokeInvitationAction,
  updateLeadStageAction,
  type AdminActionState,
  type InvitationActionState,
} from "@/lib/admin/actions";
import { CONTACT_METHODS, ACTIVITY_METHODS, PIPELINE_STAGES, TASK_TYPES } from "@/lib/admin/constants";
import { relativeTime } from "@/lib/utils";
import type { ContactRow, InvitationRow } from "@/lib/data/admin";

const initialAction: AdminActionState = {};
const initialInvite: InvitationActionState = {};

export function StageSelect({ leadId, currentStage }: { leadId: string; currentStage: string }) {
  const [stage, setStage] = useState(currentStage);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <select
        value={stage}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setStage(next);
          setError(null);
          startTransition(async () => {
            const result = await updateLeadStageAction(leadId, next);
            if (result.error) {
              setError(result.error);
              setStage(currentStage);
            }
          });
        }}
        className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function AddContactForm({ leadId }: { leadId: string }) {
  const action = createContactAction.bind(null, leadId);
  const [state, formAction] = useActionState(action, initialAction);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Add a contact</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" name="full_name" required />
        <Input label="Title" name="title" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Email" name="email" type="email" />
        <Input label="Phone" name="phone" type="tel" />
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2">
        <Select label="Preferred method" name="preferred_method">
          <option value="">Unknown</option>
          {CONTACT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-ink-600 dark:text-ink-300">
          <input type="checkbox" name="is_decision_maker" className="h-4 w-4 rounded border-ink-300" /> Decision-maker
        </label>
      </div>
      <Textarea label="Notes" name="notes" />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton size="sm" pendingLabel="Saving…">
        <Plus className="h-4 w-4" /> Add contact
      </SubmitButton>
    </form>
  );
}

export function LogActivityForm({ leadId, contacts }: { leadId: string; contacts: ContactRow[] }) {
  const action = logActivityAction.bind(null, leadId);
  const [state, formAction] = useActionState(action, initialAction);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Log outreach</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Method" name="method" required>
          {ACTIVITY_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select label="Contact" name="contact_id">
          <option value="">General / no specific contact</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </Select>
      </div>
      <Input label="Outcome" name="outcome" placeholder="Left voicemail, spoke with manager…" required />
      <Textarea label="Notes" name="notes" />
      <Textarea label="Objections" name="objections" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Interest level" name="interest_level">
          <option value="">Unknown</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Input label="Follow up at" name="follow_up_at" type="datetime-local" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton size="sm" pendingLabel="Saving…">
        <Plus className="h-4 w-4" /> Log activity
      </SubmitButton>
    </form>
  );
}

export function CreateInvitationForm({ leadId, invitations }: { leadId: string; invitations: InvitationRow[] }) {
  const action = createInvitationAction.bind(null, leadId);
  const [state, formAction] = useActionState(action, initialInvite);
  const [copied, setCopied] = useState(false);
  const [revoking, startRevoke] = useTransition();

  const active = invitations.filter((i) => !i.revoked_at && !i.accepted_at && new Date(i.expires_at) > new Date());

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Employer invitation</p>

      {active.length > 0 && (
        <ul className="space-y-2">
          {active.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800">
              <span className="text-ink-500 dark:text-ink-400">
                {inv.intended_email ?? "Any email"} · expires {relativeTime(inv.expires_at)}
              </span>
              <button
                type="button"
                disabled={revoking}
                onClick={() =>
                  startRevoke(async () => {
                    await revokeInvitationAction(inv.id, leadId);
                  })
                }
                className="flex items-center gap-1 text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.inviteUrl ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-500 dark:text-ink-400">Copy this link — it&apos;s shown once and never stored in plain text.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={state.inviteUrl} className="w-full truncate rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs dark:border-ink-700 dark:bg-ink-800" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(state.inviteUrl!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <Input label="Intended email (optional)" name="intended_email" type="email" hint="Leave blank to allow any email to claim it." />
          <Input label="Expires in (days)" name="expires_days" type="number" defaultValue={14} min={1} max={90} />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <SubmitButton size="sm" pendingLabel="Generating…">
            Generate invitation link
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function QuickAddTaskForm({ leadId }: { leadId: string }) {
  const [state, formAction] = useActionState(createTaskAction, initialAction);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Add a follow-up task</p>
      <input type="hidden" name="lead_id" value={leadId} />
      <Input label="Title" name="title" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Type" name="task_type" defaultValue="follow_up">
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Input label="Due" name="due_at" type="datetime-local" required />
      </div>
      <Textarea label="Details" name="details" />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton size="sm" pendingLabel="Saving…">
        <Plus className="h-4 w-4" /> Add task
      </SubmitButton>
    </form>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
      <AlertCircle className="h-4 w-4 shrink-0" /> {children}
    </p>
  );
}
