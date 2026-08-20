import Link from "next/link";
import { getTasks, getTaskSignals, type OpenTask } from "@/lib/data/admin";
import { TASK_TYPES, PIPELINE_STAGES } from "@/lib/admin/constants";
import { relativeTime } from "@/lib/utils";
import { TaskActions, GenerateFollowupsButton } from "@/components/admin/TaskActions";

function TaskRow({ t }: { t: OpenTask }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
      <div>
        <p className="font-medium text-ink-900 dark:text-white">
          {t.title} {t.auto_generated && <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500 dark:bg-ink-800">Auto</span>}
        </p>
        <p className={`text-xs ${t.overdue ? "font-medium text-red-600" : "text-ink-400"}`}>
          {TASK_TYPES.find((x) => x.value === t.task_type)?.label ?? t.task_type} · Due {relativeTime(t.due_at)}
          {t.lead && (
            <>
              {" · "}
              <Link href={`/admin/leads/${t.lead.id}`} className="text-flow-600 hover:underline">
                {t.lead.business_name}
              </Link>
            </>
          )}
        </p>
        {t.details && <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{t.details}</p>}
      </div>
      <TaskActions taskId={t.id} status={t.status} />
    </li>
  );
}

function SignalList({ items }: { items: { id: string; business_name: string; detail: string }[] }) {
  if (items.length === 0) return <p className="py-4 text-center text-sm text-ink-400">Nothing here.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((s) => (
        <li key={s.id} className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800">
          <Link href={`/admin/leads/${s.id}`} className="font-medium text-ink-900 hover:text-flow-600 dark:text-white">
            {s.business_name}
          </Link>
          <span className="text-xs text-ink-400">{s.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminTasksPage({ searchParams }: { searchParams: Promise<{ type?: string; stage?: string; from?: string; to?: string }> }) {
  const { type, stage, from, to } = await searchParams;

  const [allTasks, signals] = await Promise.all([getTasks({ status: "all", taskType: type, stage, dueFrom: from, dueTo: to }), getTaskSignals()]);

  const open = allTasks.filter((t) => t.status === "open");
  const completed = allTasks.filter((t) => t.status === "completed");
  const now = new Date();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dueToday = open.filter((t) => new Date(t.due_at) >= todayStart && new Date(t.due_at) <= todayEnd);
  const overdue = open.filter((t) => new Date(t.due_at) < todayStart);
  const upcoming = open.filter((t) => new Date(t.due_at) > todayEnd);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{open.length} open</p>
        </div>
        <GenerateFollowupsButton />
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <select name="type" defaultValue={type ?? ""} className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white">
          <option value="">All methods</option>
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={stage ?? ""} className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white">
          <option value="">All stages</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={from ?? ""} className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
        <input type="date" name="to" defaultValue={to ?? ""} className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white" />
        <button type="submit" className="rounded-xl border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800">
          Filter
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-red-600">Overdue ({overdue.length})</h2>
        <ul className="space-y-2">{overdue.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
        {overdue.length === 0 && <p className="text-sm text-ink-400">Nothing overdue.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Due today ({dueToday.length})</h2>
        <ul className="space-y-2">{dueToday.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
        {dueToday.length === 0 && <p className="text-sm text-ink-400">Nothing due today.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Upcoming ({upcoming.length})</h2>
        <ul className="space-y-2">{upcoming.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
        {upcoming.length === 0 && <p className="text-sm text-ink-400">Nothing scheduled ahead.</p>}
      </section>

      <div className="grid gap-6 sm:grid-cols-3">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">No-response follow-ups</h2>
          <SignalList items={signals.noResponse} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Meetings this week</h2>
          <SignalList items={signals.demosThisWeek} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Onboarding stalled</h2>
          <SignalList items={signals.onboardingStalled} />
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Completed ({completed.length})</h2>
        <ul className="space-y-2">{completed.slice(0, 25).map((t) => <TaskRow key={t.id} t={t} />)}</ul>
        {completed.length === 0 && <p className="text-sm text-ink-400">Nothing completed yet.</p>}
      </section>

      <p className="text-xs text-ink-400">{now.toDateString()}</p>
    </div>
  );
}
