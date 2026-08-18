import type { ReactNode } from "react";

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink-200 px-6 py-12 text-center dark:border-ink-800">
      {icon && <div className="text-ink-300 dark:text-ink-600">{icon}</div>}
      <div className="space-y-1">
        <p className="font-semibold text-ink-800 dark:text-ink-100">{title}</p>
        {body && <p className="text-sm text-ink-400">{body}</p>}
      </div>
      {action}
    </div>
  );
}
