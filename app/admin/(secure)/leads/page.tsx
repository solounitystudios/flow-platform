import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getLeads } from "@/lib/data/admin";
import { PIPELINE_STAGES } from "@/lib/admin/constants";
import { Button } from "@/components/ui/Button";
import { relativeTime } from "@/lib/utils";

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const { q, stage } = await searchParams;
  const leads = await getLeads({ search: q, stage });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Leads</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{leads.length} prospect{leads.length === 1 ? "" : "s"}</p>
        </div>
        <Button href="/admin/leads/new" size="sm">
          <Plus className="h-4 w-4" /> Add prospect
        </Button>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by business name…"
            className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
          />
        </div>
        <select
          name="stage"
          defaultValue={stage ?? ""}
          className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
        >
          <option value="">All stages</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
        <table className="w-full min-w-[720px] text-sm">
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
