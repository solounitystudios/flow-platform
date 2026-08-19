import Link from "next/link";
import { getOpenTasks } from "@/lib/data/admin";
import { TASK_TYPES } from "@/lib/admin/constants";
import { relativeTime } from "@/lib/utils";
import { TaskActions } from "@/components/admin/TaskActions";

export default async function AdminTasksPage() {
  const tasks = await getOpenTasks();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Tasks</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{tasks.length} open</p>
      </div>

      <ul className="space-y-2">
        {tasks.map((t) => {
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <div>
                <p className="font-medium text-ink-900 dark:text-white">{t.title}</p>
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
              <TaskActions taskId={t.id} />
            </li>
          );
        })}
        {tasks.length === 0 && <p className="py-8 text-center text-sm text-ink-400">No open tasks. You&apos;re caught up.</p>}
      </ul>
    </div>
  );
}
