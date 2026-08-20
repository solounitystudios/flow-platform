"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertCircle, Check, Copy, Plus, Trash2, Archive, RotateCcw, RefreshCw } from "lucide-react";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormSection } from "@/components/ui/FormSection";
import {
  createContactAction,
  createInvitationAction,
  replaceInvitationAction,
  createTaskAction,
  logActivityAction,
  revokeInvitationAction,
  updateLeadAction,
  updateLeadStageAction,
  archiveLeadAction,
  restoreLeadAction,
  type AdminActionState,
  type InvitationActionState,
} from "@/lib/admin/actions";
import { CONTACT_METHODS, ACTIVITY_METHODS, PIPELINE_STAGES, TASK_TYPES, INTEREST_LEVELS } from "@/lib/admin/constants";
import { relativeTime, formatDateTime } from "@/lib/utils";
import type { ContactRow, InvitationRow, LeadDetail } from "@/lib/data/admin";

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

function invitationStatus(inv: InvitationRow): "accepted" | "revoked" | "expired" | "active" {
  if (inv.accepted_at) return "accepted";
  if (inv.revoked_at) return "revoked";
  if (new Date(inv.expires_at) < new Date()) return "expired";
  return "active";
}

/** copiedUrl (never the raw token — the RPC/action only ever returns the
 * plaintext link exactly once) is shown once for copy-to-clipboard, then
 * the panel falls back to status-only history. Nothing here ever
 * re-displays a previously generated token. */
export function InvitationPanel({ leadId, invitations }: { leadId: string; invitations: InvitationRow[] }) {
  const [state, formAction] = useActionState(createInvitationAction.bind(null, leadId), initialInvite);
  const [copied, setCopied] = useState(false);
  const [revoking, startRevoke] = useTransition();
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const active = invitations.filter((i) => invitationStatus(i) === "active");
  const history = invitations.filter((i) => invitationStatus(i) !== "active");

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Employer invitations</p>

      {active.length > 0 && (
        <ul className="space-y-2">
          {active.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800">
              <span className="text-ink-500 dark:text-ink-400">
                {inv.intended_email ?? "Any email"} · created {formatDateTime(inv.created_at)} · expires {relativeTime(inv.expires_at)}
              </span>
              <button
                type="button"
                disabled={revoking}
                onClick={() => setRevokeTarget(inv.id)}
                className="flex items-center gap-1 text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <ul className="space-y-1.5 border-t border-ink-100 pt-3 dark:border-ink-800">
          {history.map((inv) => {
            const status = invitationStatus(inv);
            return (
              <li key={inv.id} className="flex items-center justify-between text-xs text-ink-400">
                <span>
                  {inv.intended_email ?? "Any email"} · {status} · created {formatDateTime(inv.created_at)}
                  {inv.accepted_at && ` · accepted ${formatDateTime(inv.accepted_at)}`}
                  {inv.revoked_at && ` · revoked ${formatDateTime(inv.revoked_at)}`}
                </span>
                {status === "expired" && replacingId !== inv.id && (
                  <button type="button" onClick={() => setReplacingId(inv.id)} className="flex items-center gap-1 text-flow-600 hover:underline">
                    <RefreshCw className="h-3 w-3" /> Replace
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {replacingId && (
        <ReplaceInvitationForm leadId={leadId} invitationId={replacingId} onDone={() => setReplacingId(null)} />
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

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke this invitation?"
        description="The link stops working immediately and can never be used again — even by the person it was meant for. You can generate a new invitation afterward."
        confirmLabel="Revoke invitation"
        onConfirm={() => {
          const id = revokeTarget;
          if (!id) return;
          startRevoke(async () => {
            await revokeInvitationAction(id, leadId);
          });
          setRevokeTarget(null);
        }}
      />
    </div>
  );
}

function ReplaceInvitationForm({ leadId, invitationId, onDone }: { leadId: string; invitationId: string; onDone: () => void }) {
  const [state, formAction] = useActionState(replaceInvitationAction.bind(null, invitationId, leadId), initialInvite);
  const [copied, setCopied] = useState(false);

  if (state.inviteUrl) {
    return (
      <div className="space-y-2 rounded-lg bg-ink-50 p-3 dark:bg-ink-800">
        <p className="text-xs text-ink-500 dark:text-ink-400">New link — copy it now, shown once.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={state.inviteUrl} className="w-full truncate rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs dark:border-ink-700 dark:bg-ink-900" />
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
        <button type="button" onClick={onDone} className="text-xs text-ink-400 hover:text-ink-600">
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg bg-ink-50 p-3 dark:bg-ink-800">
      <Input label="Intended email (optional)" name="intended_email" type="email" />
      <Input label="Expires in (days)" name="expires_days" type="number" defaultValue={14} min={1} max={90} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="Replacing…">
          Replace invitation
        </SubmitButton>
        <button type="button" onClick={onDone} className="text-xs text-ink-400 hover:text-ink-600">
          Cancel
        </button>
      </div>
    </form>
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

export function EditLeadForm({ lead, admins }: { lead: LeadDetail; admins: { profile_id: string; full_name: string | null; username: string | null }[] }) {
  const action = updateLeadAction.bind(null, lead.id);
  const [state, formAction] = useActionState(action, initialAction);

  return (
    <form action={formAction} className="space-y-6 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Edit business profile</p>

      <FormSection title="Basics">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Business name" name="business_name" defaultValue={lead.business_name} required />
          <Input label="Category" name="category" defaultValue={lead.category} required />
        </div>
      </FormSection>

      <FormSection title="Location">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Address" name="address" defaultValue={lead.address ?? ""} />
          <Input label="Neighborhood" name="neighborhood" defaultValue={lead.neighborhood ?? ""} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="City" name="city" defaultValue={lead.city} />
          <Input label="State" name="region" defaultValue={lead.region} />
          <Input label="Postal code" name="postal_code" defaultValue={lead.postal_code ?? ""} />
        </div>
      </FormSection>

      <FormSection title="Online presence & contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Website" name="website_url" type="url" defaultValue={lead.website_url ?? ""} />
          <Input label="Social URL" name="social_url" type="url" defaultValue={lead.social_url ?? ""} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="General email" name="general_email" type="email" defaultValue={lead.general_email ?? ""} />
          <Input label="General phone" name="general_phone" type="tel" defaultValue={lead.general_phone ?? ""} />
        </div>
      </FormSection>

      <FormSection title="Hiring details" description="What we know about how and when this business hires.">
        <Textarea label="Staffing problems observed" name="staffing_problems" defaultValue={lead.staffing_problems ?? ""} />
        <Input label="Typical roles" name="typical_roles" defaultValue={lead.typical_roles.join(", ")} hint="Comma-separated" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Hiring frequency" name="hiring_frequency" defaultValue={lead.hiring_frequency ?? ""} />
          <Select label="Best contact method" name="best_contact_method" defaultValue={lead.best_contact_method ?? ""}>
            <option value="">Unknown</option>
            {CONTACT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
      </FormSection>

      <FormSection title="Outreach tracking" description="Only your team sees this — it's never shown to the business.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Interest level" name="interest_level" defaultValue={lead.interest_level}>
            {INTEREST_LEVELS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
          <Select label="Assigned owner" name="assigned_to" defaultValue={lead.assigned_to ?? ""}>
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.profile_id} value={a.profile_id}>
                {a.full_name ?? a.username ?? a.profile_id.slice(0, 8)}
              </option>
            ))}
          </Select>
        </div>
        <Input label="Source" name="source" defaultValue={lead.source ?? ""} hint="How this prospect first came onto your radar." />
        <Textarea label="Consent notes" name="consent_notes" defaultValue={lead.consent_notes ?? ""} hint="How/when contact info was gathered and any consent given." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Next action" name="next_action" defaultValue={lead.next_action ?? ""} />
          <Input label="Next action at" name="next_action_at" type="datetime-local" defaultValue={lead.next_action_at?.slice(0, 16) ?? ""} />
        </div>
        <Textarea label="Internal notes" name="notes" defaultValue={lead.notes ?? ""} />
      </FormSection>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}

export function ArchiveControls({ lead }: { lead: Pick<LeadDetail, "id" | "archived" | "archived_reason" | "archived_at"> }) {
  const [state, formAction] = useActionState(archiveLeadAction.bind(null, lead.id), initialAction);
  const [restoring, startRestore] = useTransition();
  const [showForm, setShowForm] = useState(false);

  if (lead.archived) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm dark:border-ink-800 dark:bg-ink-800">
        <div>
          <p className="font-medium text-ink-700 dark:text-ink-200">Archived {lead.archived_at ? formatDateTime(lead.archived_at) : ""}</p>
          {lead.archived_reason && <p className="text-xs text-ink-400">{lead.archived_reason}</p>}
        </div>
        <button
          type="button"
          disabled={restoring}
          onClick={() =>
            startRestore(async () => {
              await restoreLeadAction(lead.id);
            })
          }
          className="flex items-center gap-1.5 rounded-lg bg-flow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-flow-700 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restore
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
      >
        <Archive className="h-4 w-4" /> Archive prospect
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
      <Textarea label="Reason for archiving" name="archived_reason" required hint="Kept for the record — nothing is deleted." />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="danger" pendingLabel="Archiving…">
          Confirm archive
        </SubmitButton>
        <button type="button" onClick={() => setShowForm(false)} className="text-xs text-ink-400 hover:text-ink-600">
          Cancel
        </button>
      </div>
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
