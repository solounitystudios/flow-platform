import { notFound } from "next/navigation";
import { Mail, Phone, Globe, MapPin, ListTodo } from "lucide-react";
import { getLeadWithRelations } from "@/lib/data/admin";
import { PIPELINE_STAGES, ACTIVITY_METHODS, CONTACT_METHODS } from "@/lib/admin/constants";
import { relativeTime, formatDateTime } from "@/lib/utils";
import { StageSelect, AddContactForm, LogActivityForm, CreateInvitationForm, QuickAddTaskForm } from "@/components/admin/LeadWorkspace";

function labelFor(list: readonly { value: string; label: string }[], value: string | null) {
  if (!value) return "—";
  return list.find((i) => i.value === value)?.label ?? value;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getLeadWithRelations(id);
  if (!data) notFound();

  const { lead, contacts, activities, tasks, invitations } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">{lead.business_name}</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {lead.category} {lead.neighborhood ? `· ${lead.neighborhood}` : ""}
          </p>
        </div>
        <StageSelect leadId={lead.id} currentStage={lead.pipeline_stage} />
      </div>

      <div className="grid gap-3 rounded-xl border border-ink-200 bg-white p-4 text-sm dark:border-ink-800 dark:bg-ink-900 sm:grid-cols-2">
        {lead.address && (
          <p className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
            <MapPin className="h-4 w-4 shrink-0 text-ink-400" /> {lead.address}, {lead.city}, {lead.region}
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
        {lead.staffing_problems && <p className="sm:col-span-2 text-ink-600 dark:text-ink-300">Staffing problems: {lead.staffing_problems}</p>}
        {lead.typical_roles.length > 0 && <p className="sm:col-span-2 text-ink-600 dark:text-ink-300">Typical roles: {lead.typical_roles.join(", ")}</p>}
        {lead.notes && <p className="sm:col-span-2 whitespace-pre-wrap text-ink-600 dark:text-ink-300">{lead.notes}</p>}
      </div>

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
            </li>
          ))}
          {activities.length === 0 && <p className="text-sm text-ink-400">No outreach logged yet.</p>}
        </ul>
        <LogActivityForm leadId={lead.id} contacts={contacts} />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">
          <ListTodo className="h-4 w-4" /> Tasks ({tasks.length})
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
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Employer invitation</h2>
        <CreateInvitationForm leadId={lead.id} invitations={invitations} />
      </section>

      <p className="text-xs text-ink-400">
        Pipeline stage reference: {PIPELINE_STAGES.find((s) => s.value === lead.pipeline_stage)?.label}
      </p>
    </div>
  );
}
