import { getVerificationQueue, getVerificationDecisions, getAssignableAdmins } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/utils";
import { VerificationCaseForm } from "@/components/admin/VerificationCaseForm";

export default async function AdminVerificationPage() {
  const [cases, admins] = await Promise.all([getVerificationQueue(), getAssignableAdmins()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Verification requests</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{cases.length} case{cases.length === 1 ? "" : "s"}. Internal notes are never shown publicly.</p>
      </div>

      <div className="space-y-3">
        {await Promise.all(
          cases.map(async (c) => {
            const decisions = await getVerificationDecisions(c.id);
            return (
              <div key={c.id} className="grid gap-4 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-medium text-ink-900 dark:text-white">{c.organization?.name ?? c.lead?.business_name ?? "Unknown"}</p>
                  <p className="text-xs text-ink-400">Opened {formatDateTime(c.created_at)}</p>
                  <p className="text-xs text-ink-400">Status: {c.status}</p>
                  {c.assigned_reviewer && <p className="text-xs text-ink-400">Assigned: {c.assigned_reviewer.full_name ?? c.assigned_reviewer.username}</p>}
                  {c.decided_at && <p className="text-xs text-ink-400">Decided {formatDateTime(c.decided_at)}</p>}
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
                  {c.findings && Object.keys(c.findings as Record<string, unknown>).length > 0 && (
                    <div className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                      <p className="font-medium">Submitted evidence summary:</p>
                      <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-ink-50 p-2 dark:bg-ink-800">{JSON.stringify(c.findings, null, 2)}</pre>
                    </div>
                  )}
                </div>
                <VerificationCaseForm
                  caseId={c.id}
                  status={c.status}
                  decisionReason={c.decision_reason}
                  decisionReasonCode={c.decision_reason_code}
                  assignedTo={c.assigned_to}
                  admins={admins}
                  decisions={decisions}
                />
              </div>
            );
          }),
        )}
        {cases.length === 0 && <p className="py-8 text-center text-sm text-ink-400">No verification cases yet.</p>}
      </div>
    </div>
  );
}
