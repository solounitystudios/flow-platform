import Link from "next/link";
import { Users, ListTodo, ShieldCheck, Send, ArrowRight } from "lucide-react";
import { getAdminMetrics } from "@/lib/data/admin";
import { PIPELINE_STAGES } from "@/lib/admin/constants";

export default async function AdminHomePage() {
  const metrics = await getAdminMetrics();

  const cards = [
    { label: "Total prospects", value: metrics.totalLeads, icon: Users, href: "/admin/leads" },
    { label: "Open tasks", value: metrics.openTasks, sub: metrics.overdueTasks ? `${metrics.overdueTasks} overdue` : undefined, icon: ListTodo, href: "/admin/tasks" },
    { label: "Pending verification", value: metrics.pendingVerification, icon: ShieldCheck, href: "/admin/verification" },
    { label: "Active invitations", value: metrics.activeInvitations, icon: Send, href: "/admin/leads" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Command center</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Employer outreach pipeline at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon, href }) => (
          <Link key={label} href={href} className="rounded-xl border border-ink-200 bg-white p-4 transition hover:border-flow-300 dark:border-ink-800 dark:bg-ink-900">
            <Icon className="mb-2 h-5 w-5 text-flow-600" />
            <p className="text-2xl font-semibold text-ink-900 dark:text-white">{value}</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">{label}</p>
            {sub && <p className="mt-0.5 text-xs font-medium text-amber-600">{sub}</p>}
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Pipeline</h2>
        <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {PIPELINE_STAGES.map((stage) => {
                const count = metrics.stageCounts[stage.value] ?? 0;
                return (
                  <tr key={stage.value} className="border-b border-ink-100 last:border-0 dark:border-ink-800">
                    <td className="px-4 py-2 text-ink-600 dark:text-ink-300">{stage.label}</td>
                    <td className="w-full px-4 py-2">
                      <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                        <div
                          className="h-2 rounded-full bg-flow-500"
                          style={{ width: metrics.totalLeads ? `${Math.max((count / metrics.totalLeads) * 100, count ? 4 : 0)}%` : "0%" }}
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
      </div>

      <Link href="/admin/leads/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-flow-600 hover:underline">
        Add a business prospect <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
