import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Globe, MapPin, ListTodo, ShieldCheck, Building2 } from "lucide-react";
import { getLeadWithRelations, getAssignableAdmins } from "@/lib/data/admin";
import { PIPELINE_STAGES, ACTIVITY_METHODS, CONTACT_METHODS, VERIFICATION_STATUSES } from "@/lib/admin/constants";
import { relativeTime, formatDateTime } from "@/lib/utils";
import {
  StageSelect,
  AddContactForm,
  LogActivityForm,
  InvitationPanel,
  QuickAddTaskForm,
  EditLeadForm,
  ArchiveControls,
} from "@/components/admin/LeadWorkspace";

function labelFor(list: readonly { value: string; label: string }[], value: string | null) {
  if (!value) return "—";
  return list.find((i) => i.value === value)?.label ?? value;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, admins] = await Promise.all([getLeadWithRelations(id), getAssignableAdmins()]);
  if (!data) notFound();

  const { lead, contacts, activities, tasks, invitations, stageHistory, organization, verificationCase } = data;
  const openTasks = tasks.filter((t) => t.status === "open");
  const completedTasks = tasks.filter((t) => t.status !== "open");
  const decisionMaker = contacts.find((c) => c.is_decision_maker);
  const assignedAdmin = admins.find((a) => a.profile_id === lead.assigned_to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            {lead.business_name} {lead.archived && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500 dark:bg-ink-800">Archived</span>}
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {lead.category} {lead.neighborhood ? `· ${lead.neighborhood}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StageSelect leadId={lead.id} currentStage={lead.pipeline_stage} />
          <ArchiveControls lead={lead} />
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-ink-200 bg-white p-4 text-sm dark:border-ink-800 dark:bg-ink-900 sm:grid-cols-2">
        {lead.address && (
          <p className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
            <MapPin className="h-4 w-4 shrink-0 text-ink-400" /> {lead.address}, {lead.city}, {lead.region} {lead.postal_code}
          </p>
        )}
        {lead.general_email && (
          <p className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
            <Mail className="h-4 w-4 shrink-0 text-ink-400" /> {lead.general_email}
          </p>
        )}
        {lead.general_phone && (
          <p className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
            <Phone className="h-4 w-4 shrink-0 text-ink-400" /> {lead.general_phone}
          </p>
        )}
        {lead.website_url && (
          <p className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
            <Globe className="h-4 w-4 shrink-0 text-ink-400" /> {lead.website_url}
          </p>
        )}
        <p className="text-ink-500 dark:text-ink-400">Interest: {lead.interest_level}</p>
        <p className="text-ink-500 dark:text-ink-400">Best contact: {labelFor(CONTACT_METHODS, lead.best_contact_method)}</p>
        <p className="text-ink-500 dark:text-ink-400">Owner: {assignedAdmin ? (assignedAdmin.full_name ?? assignedAdmin.username) : "Unassigned"}</p>
        <p className="text-ink-500 dark:text-ink-400">Source: {lead.source ?? "—"}</p>
        {lead.next_action && (
          <p className="sm:col-span-2 text-ink-600 dark:text-ink-300">
            Next action: {lead.next_action} {lead.next_action_at && `· ${formatDateTime(lead.next_action_at)}`}
          </p>
        )}
        {lead.staffing_problems && <p className="sm:col-span-2 text-ink-600 dark:text-ink-300">Staffing problems: {lead.staffing_problems}</p>}
        {lead.typical_roles.length > 0 && <p className="sm:col-span-2 text-ink-600 dark:text-ink-300">Typical roles: {lead.typical_roles.join(", ")}</p>}
        {lead.consent_notes && <p className="sm:col-span-2 text-ink-600 dark:text-ink-300">Consent: {lead.consent_notes}</p>}
        {lead.notes && <p className="sm:col-span-2 whitespace-pre-wrap text-ink-600 dark:text-ink-300">{lead.notes}</p>}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <Building2 className="h-4 w-4" /> Linked organization
          </h2>
          {organization ? (
            <p className="text-sm text-ink-600 dark:text-ink-300">
              {organization.name} — {organization.verified ? "Verified in marketplace" : "Not yet marketplace-verified"}
            </p>
          ) : (
            <p className="text-sm text-ink-400">No organization created yet.</p>
          )}
        </div>
        <div className="space-y-2 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <ShieldCheck className="h-4 w-4" /> Verification status
          </h2>
          {verificationCase ? (
            <p className="text-sm text-ink-600 dark:text-ink-300">
              {labelFor(VERIFICATION_STATUSES, verificationCase.status)}
              {verificationCase.decided_at && ` · decided ${formatDateTime(verificationCase.decided_at)}`}
            </p>
          ) : (
            <p className="text-sm text-ink-400">No verification case yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Contacts ({contacts.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
              <p className="font-medium text-ink-900 dark:text-white">
                {c.full_name} {c.is_decision_maker && <span className="ml-1 rounded-full bg-flow-100 px-2 py-0.5 text-[10px] font-semibold text-flow-700 dark:bg-flow-900 dark:text-flow-300">Decision-maker</span>}
              </p>
              {c.title && <p className="text-ink-500 dark:text-ink-400">{c.title}</p>}
              {c.email && <p className="text-ink-500 dark:text-ink-400">{c.email}</p>}
              {c.phone && <p className="text-ink-500 dark:text-ink-400">{c.phone}</p>}
            </div>
          ))}
          {contacts.length === 0 && <p className="text-sm text-ink-400 sm:col-span-2">No contacts yet.{decisionMaker ? "" : ""}</p>}
        </div>
        <AddContactForm leadId={lead.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Outreach history ({activities.length})</h2>
        <ul className="space-y-2">
          {activities.map((a) => (
            <li key={a.id} className="rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
              <p className="font-medium text-ink-900 dark:text-white">
                {labelFor(ACTIVITY_METHODS, a.method)} — {a.outcome}
              </p>
              <p className="text-xs text-ink-400">
                {formatDateTime(a.occurred_at)} {a.contact ? `· ${a.contact.full_name}` : ""}
              </p>
              {a.notes && <p className="mt-1 text-ink-600 dark:text-ink-300">{a.notes}</p>}
              {a.objections && <p className="mt-1 text-amber-600">Objections: {a.objections}</p>}
              {a.documents_sent.length > 0 && <p className="mt-1 text-ink-500 dark:text-ink-400">Documents sent: {a.documents_sent.join(", ")}</p>}
            </li>
          ))}
          {activities.length === 0 && <p className="text-sm text-ink-400">No outreach logged yet.</p>}
        </ul>
        <LogActivityForm leadId={lead.id} contacts={contacts} />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">
          <ListTodo className="h-4 w-4" /> Tasks ({openTasks.length} open, {completedTasks.length} completed)
        </h2>
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
              <div>
                <p className="font-medium text-ink-900 dark:text-white">{t.title}</p>
                <p className="text-xs text-ink-400">
                  Due {relativeTime(t.due_at)} · {t.status}
                </p>
              </div>
            </li>
          ))}
          {tasks.length === 0 && <p className="text-sm text-ink-400">No tasks yet.</p>}
        </ul>
        <QuickAddTaskForm leadId={lead.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Stage history</h2>
        <ul className="space-y-1.5">
          {stageHistory.map((h) => (
            <li key={h.id} className="text-xs text-ink-500 dark:text-ink-400">
              {formatDateTime(h.changed_at)} — {h.changed_by_profile?.full_name ?? h.changed_by_profile?.username ?? "Unknown"}: {labelFor(PIPELINE_STAGES, h.from_stage)} → {labelFor(PIPELINE_STAGES, h.to_stage)}
              {h.note && ` (${h.note})`}
            </li>
          ))}
          {stageHistory.length === 0 && <p className="text-sm text-ink-400">No stage changes recorded yet.</p>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Employer invitation</h2>
        <InvitationPanel leadId={lead.id} invitations={invitations} />
      </section>

      <section>
        <EditLeadForm lead={lead} admins={admins} />
      </section>

      <p className="text-xs text-ink-400">
        Pipeline stage reference: {PIPELINE_STAGES.find((s) => s.value === lead.pipeline_stage)?.label}
      </p>
      <Link href="/admin/leads" className="text-xs text-flow-600 hover:underline">
        Back to leads
      </Link>
    </div>
  );
}
