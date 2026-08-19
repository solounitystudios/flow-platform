import { getVerificationQueue } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/utils";
import { VerificationCaseForm } from "@/components/admin/VerificationCaseForm";

export default async function AdminVerificationPage() {
  const cases = await getVerificationQueue();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Verification queue</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{cases.length} case{cases.length === 1 ? "" : "s"}</p>
      </div>

      <div className="space-y-3">
        {cases.map((c) => (
          <div key={c.id} className="grid gap-4 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium text-ink-900 dark:text-white">{c.organization?.name ?? c.lead?.business_name ?? "Unknown"}</p>
              <p className="text-xs text-ink-400">Opened {formatDateTime(c.created_at)}</p>
              <p className="text-xs text-ink-400">Status: {c.status}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(c.requirements as Record<string, boolean>).map(([k, done]) => (
                  <span
                    key={k}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                      done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-ink-100 text-ink-500 dark:bg-ink-800"
                    }`}
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
            <VerificationCaseForm caseId={c.id} status={c.status} decisionReason={c.decision_reason} />
          </div>
        ))}
        {cases.length === 0 && <p className="py-8 text-center text-sm text-ink-400">No verification cases yet.</p>}
      </div>
    </div>
  );
}
