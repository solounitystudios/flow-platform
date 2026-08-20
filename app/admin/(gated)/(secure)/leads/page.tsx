import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getLeads, getDistinctCategories, getDistinctNeighborhoods, getAssignableAdmins, type LeadFilters } from "@/lib/data/admin";
import { PIPELINE_STAGES, INTEREST_LEVELS, CONTACT_METHODS, FOLLOW_UP_STATUS_FILTERS, INVITATION_STATUS_FILTERS, VERIFICATION_STATUSES } from "@/lib/admin/constants";
import { Button } from "@/components/ui/Button";
import { relativeTime } from "@/lib/utils";

type SearchParams = {
  q?: string;
  stage?: string;
  category?: string;
  neighborhood?: string;
  interest?: string;
  method?: string;
  followUp?: string;
  assigned?: string;
  invitation?: string;
  verification?: string;
  archived?: string;
};

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  const filters: LeadFilters = {
    search: sp.q,
    stage: sp.stage,
    category: sp.category,
    neighborhood: sp.neighborhood,
    interestLevel: sp.interest,
    contactMethod: sp.method,
    followUp: sp.followUp as LeadFilters["followUp"],
    assignedTo: sp.assigned,
    invitationStatus: sp.invitation as LeadFilters["invitationStatus"],
    verificationStatus: sp.verification,
    archived: (sp.archived as LeadFilters["archived"]) ?? "active",
  };

  const [leads, categories, neighborhoods, admins] = await Promise.all([getLeads(filters), getDistinctCategories(), getDistinctNeighborhoods(), getAssignableAdmins()]);

  const selectClass = "rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Business prospects</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{leads.length} prospect{leads.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2">
          <Button href="/admin/import" size="sm" variant="outline">
            Import CSV
          </Button>
          <Button href="/admin/leads/new" size="sm">
            <Plus className="h-4 w-4" /> Add prospect
          </Button>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            name="q"
            defaultValue={sp.q}
            placeholder="Search by business name…"
            className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
          />
        </div>
        <select name="stage" defaultValue={sp.stage ?? ""} className={selectClass}>
          <option value="">All stages</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className={selectClass}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="neighborhood" defaultValue={sp.neighborhood ?? ""} className={selectClass}>
          <option value="">All neighborhoods</option>
          {neighborhoods.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select name="interest" defaultValue={sp.interest ?? ""} className={selectClass}>
          <option value="">Any interest</option>
          {INTEREST_LEVELS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
        <select name="method" defaultValue={sp.method ?? ""} className={selectClass}>
          <option value="">Any contact method</option>
          {CONTACT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select name="followUp" defaultValue={sp.followUp ?? ""} className={selectClass}>
          <option value="">Any follow-up status</option>
          {FOLLOW_UP_STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select name="assigned" defaultValue={sp.assigned ?? ""} className={selectClass}>
          <option value="">Any owner</option>
          {admins.map((a) => (
            <option key={a.profile_id} value={a.profile_id}>
              {a.full_name ?? a.username ?? a.profile_id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select name="invitation" defaultValue={sp.invitation ?? ""} className={selectClass}>
          <option value="">Any invitation status</option>
          {INVITATION_STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select name="verification" defaultValue={sp.verification ?? ""} className={selectClass}>
          <option value="">Any verification status</option>
          {VERIFICATION_STATUSES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
        <select name="archived" defaultValue={sp.archived ?? "active"} className={selectClass}>
          <option value="active">Active only</option>
          <option value="archived">Archived only</option>
          <option value="all">Active + archived</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
              <th className="px-4 py-2.5 font-medium">Business</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium">Interest</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-900">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/leads/${lead.id}`} className="font-medium text-ink-900 hover:text-flow-600 dark:text-white">
                    {lead.business_name}
                  </Link>
                  {lead.archived && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500 dark:bg-ink-800">Archived</span>}
                  {lead.neighborhood && <p className="text-xs text-ink-400">{lead.neighborhood}</p>}
                </td>
                <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{lead.category}</td>
                <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{PIPELINE_STAGES.find((s) => s.value === lead.pipeline_stage)?.label ?? lead.pipeline_stage}</td>
                <td className="px-4 py-2.5 capitalize text-ink-600 dark:text-ink-300">{lead.interest_level}</td>
                <td className="px-4 py-2.5 text-ink-400">{relativeTime(lead.updated_at)}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-400">
                  No prospects match yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
