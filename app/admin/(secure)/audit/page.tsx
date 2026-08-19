import { getAuditLog } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/utils";

export default async function AdminAuditPage() {
  const entries = await getAuditLog();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Audit log</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Every insert, update, and delete on outreach/admin tables — written automatically by the database, not the app.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Table</th>
              <th className="px-4 py-2.5 font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-ink-100 last:border-0 dark:border-ink-800">
                <td className="px-4 py-2.5 text-ink-400">{formatDateTime(e.created_at)}</td>
                <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{e.actor?.full_name ?? e.actor?.username ?? "System"}</td>
                <td className="px-4 py-2.5 uppercase text-ink-600 dark:text-ink-300">{e.action}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-500">{e.table_name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-400">{e.record_id?.slice(0, 8)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-400">
                  No changes recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
