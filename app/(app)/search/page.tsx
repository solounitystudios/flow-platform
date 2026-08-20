import Link from "next/link";
import { redirect } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { searchMembers, searchOpportunities, searchSkills } from "@/lib/data/search";
import { INTENT_TYPES } from "@/lib/data/intents";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; intent?: string; category?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { q, intent, category } = await searchParams;
  const filters = { q, intentType: intent, category };

  const hasQuery = Boolean(q || intent || category);
  const [members, opportunities, skills] = hasQuery
    ? await Promise.all([searchMembers(filters), searchOpportunities(filters), searchSkills(filters)])
    : [[], [], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Search</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Search members by goal, open opportunities, and skills — all structured filters, no black box.</p>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by name or title…"
            className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
          />
        </div>
        <select name="intent" defaultValue={intent ?? ""} className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white">
          <option value="">Any goal</option>
          {INTENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="category"
          defaultValue={category}
          placeholder="Category"
          className="w-32 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
        />
        <button type="submit" className="rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800">
          Search
        </button>
      </form>

      {!hasQuery ? (
        <EmptyState icon={<SearchIcon className="h-8 w-8" />} title="Search FLOW" body="Filter by name, goal, or category to find members, opportunities, and skills." />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Members ({members.length})</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((m) => (
                <Link key={m.id} href={`/p/${m.username ?? m.id}`} className="flex items-center gap-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
                  <Avatar src={m.avatar_url} name={m.full_name ?? "Member"} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-ink-900 dark:text-white">{m.full_name ?? "FLOW Member"}</p>
                    <p className="text-xs text-ink-400">
                      {m.city}, {m.state} · {m.intent_types.map((t) => INTENT_TYPES.find((i) => i.value === t)?.label ?? t).join(", ")}
                    </p>
                  </div>
                </Link>
              ))}
              {members.length === 0 && <p className="text-sm text-ink-400">No members match.</p>}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Opportunities ({opportunities.length})</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {opportunities.map((o) => (
                <Link key={o.id} href={`/gigs/${o.id}`} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
                  <p className="text-sm font-medium text-ink-900 dark:text-white">{o.title}</p>
                  <p className="text-xs text-ink-400">
                    {o.opportunity_type} · {o.is_remote ? "Remote" : `${o.city}, ${o.state}`}
                  </p>
                </Link>
              ))}
              {opportunities.length === 0 && <p className="text-sm text-ink-400">No open opportunities match.</p>}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Skills ({skills.length})</h2>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s.id} className="rounded-full border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300">
                  {s.name}
                </span>
              ))}
              {skills.length === 0 && <p className="text-sm text-ink-400">No skills match.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
