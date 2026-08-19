import Link from "next/link";
import { Users, ListTodo, ShieldCheck, Send, ArrowRight, Archive } from "lucide-react";
import { getAdminMetrics } from "@/lib/data/admin";
import { PIPELINE_STAGES } from "@/lib/admin/constants";

export default async function AdminHomePage() {
  const m = await getAdminMetrics();

  const topCards = [
    { label: "Active prospects", value: m.totalLeads, sub: `${m.newThisWeek} new this week`, icon: Users, href: "/admin/leads" },
    { label: "Open tasks", value: m.openTasks, sub: m.overdueTasks ? `${m.overdueTasks} overdue` : `${m.dueToday} due today`, icon: ListTodo, href: "/admin/tasks" },
    { label: "Pending verification", value: m.pendingVerification, icon: ShieldCheck, href: "/admin/verification" },
    { label: "Active invitations", value: m.activeInvitations, icon: Send, href: "/admin/leads" },
  ];

  const funnelCards = [
    { label: "Contacted", value: m.contacted },
    { label: "Decision-makers reached", value: m.decisionMakersReached },
    { label: "Demos scheduled", value: m.demosScheduled },
    { label: "Demos completed", value: m.demosCompleted },
    { label: "Pilots offered", value: m.pilotsOffered },
    { label: "Pilots accepted", value: m.pilotsAccepted },
    { label: "Onboarding started", value: m.onboardingStarted },
    { label: "Organizations verified", value: m.organizationsVerified },
    { label: "First opportunities posted", value: m.firstOpportunitiesPosted },
    { label: "Repeat employers", value: m.repeatEmployers },
  ];

  const opsCards = [
    { label: "Follow-ups due today", value: m.dueToday },
    { label: "Overdue follow-ups", value: m.overdueTasks },
    { label: "No-response prospects", value: m.noResponseProspects },
    { label: "Onboarding stalled", value: m.stalledOnboarding },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Command center</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Employer outreach pipeline at a glance. Archived and not-interested prospects are excluded below.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {topCards.map(({ label, value, sub, icon: Icon, href }) => (
          <Link key={label} href={href} className="rounded-xl border border-ink-200 bg-white p-4 transition hover:border-flow-300 dark:border-ink-800 dark:bg-ink-900">
            <Icon className="mb-2 h-5 w-5 text-flow-600" />
            <p className="text-2xl font-semibold text-ink-900 dark:text-white">{value}</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">{label}</p>
            {sub && <p className="mt-0.5 text-xs font-medium text-amber-600">{sub}</p>}
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Funnel</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {funnelCards.map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
              <p className="text-xl font-semibold text-ink-900 dark:text-white">{value}</p>
              <p className="text-xs text-ink-500 dark:text-ink-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Stage-to-stage conversion</h2>
        <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {m.conversions.map((c) => (
                <tr key={c.toStage} className="border-b border-ink-100 last:border-0 dark:border-ink-800">
                  <td className="px-4 py-2 text-ink-500 dark:text-ink-400">
                    {PIPELINE_STAGES.find((s) => s.value === c.fromStage)?.label} → {PIPELINE_STAGES.find((s) => s.value === c.toStage)?.label}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-ink-900 dark:text-white">{c.rate === null ? "—" : `${Math.round(c.rate * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {opsCards.map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
            <p className="text-xl font-semibold text-ink-900 dark:text-white">{value}</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Pipeline</h2>
        <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {PIPELINE_STAGES.map((stage) => {
                const count = m.stageCounts[stage.value] ?? 0;
                return (
                  <tr key={stage.value} className="border-b border-ink-100 last:border-0 dark:border-ink-800">
                    <td className="px-4 py-2 text-ink-600 dark:text-ink-300">{stage.label}</td>
                    <td className="w-full px-4 py-2">
                      <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                        <div
                          className="h-2 rounded-full bg-flow-500"
                          style={{ width: m.totalLeads ? `${Math.max((count / m.totalLeads) * 100, count ? 4 : 0)}%` : "0%" }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-ink-900 dark:text-white">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
          <Archive className="h-3.5 w-3.5" /> {m.archivedCount} archived · {m.notInterestedCount} not interested (excluded above)
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Category performance</h2>
          <div className="space-y-1.5">
            {m.categoryPerformance.map((c) => (
              <div key={c.category} className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800">
                <span className="text-ink-700 dark:text-ink-200">{c.category}</span>
                <span className="text-ink-400">
                  {c.total} prospect{c.total === 1 ? "" : "s"} · {c.advanced} at pilot+
                </span>
              </div>
            ))}
            {m.categoryPerformance.length === 0 && <p className="text-sm text-ink-400">No prospects yet.</p>}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Neighborhood distribution</h2>
          <div className="space-y-1.5">
            {m.neighborhoodDistribution.map((n) => (
              <div key={n.neighborhood} className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800">
                <span className="text-ink-700 dark:text-ink-200">{n.neighborhood}</span>
                <span className="text-ink-400">{n.count}</span>
              </div>
            ))}
            {m.neighborhoodDistribution.length === 0 && <p className="text-sm text-ink-400">No prospects yet.</p>}
          </div>
        </div>
      </div>

      <Link href="/admin/leads/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-flow-600 hover:underline">
        Add a business prospect <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
