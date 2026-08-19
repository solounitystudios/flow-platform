import { getEvidenceQueue, getVerificationReviews, getCredentialTypes } from "@/lib/data/verifications";
import { formatDateTime } from "@/lib/utils";
import { EvidenceDecisionForm } from "@/components/admin/EvidenceDecisionForm";
import { EVIDENCE_STATUSES } from "@/lib/admin/constants";

export default async function AdminEvidencePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const [claims, credentialTypes] = await Promise.all([getEvidenceQueue(status), getCredentialTypes()]);
  const typeLabel = new Map(credentialTypes.map((c) => [c.key, c.label]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Passport evidence review</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {claims.length} claim{claims.length === 1 ? "" : "s"}. Internal notes are never shown to the member.
        </p>
      </div>

      <form className="flex items-center gap-2" method="get">
        <select
          name="status"
          defaultValue={status ?? "pending"}
          className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
        >
          {EVIDENCE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800">
          Filter
        </button>
      </form>

      <div className="space-y-3">
        {await Promise.all(
          claims.map(async (c) => {
            const reviews = await getVerificationReviews(c.id);
            return (
              <div key={c.id} className="grid gap-4 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-medium text-ink-900 dark:text-white">{c.title}</p>
                  <p className="text-xs text-ink-400">
                    {c.profile?.full_name ?? c.profile?.username ?? "Unknown member"} · {typeLabel.get(c.credential_type ?? "") ?? c.credential_type ?? "Uncategorized"}
                  </p>
                  <p className="text-xs text-ink-400">Submitted {formatDateTime(c.created_at)} · {c.source === "external_link" ? "External link" : "Self-reported"}</p>
                  {c.evidence_url && (
                    <p className="text-xs text-flow-600 break-all">
                      <a href={c.evidence_url} target="_blank" rel="noopener noreferrer nofollow">
                        {c.evidence_url}
                      </a>
                    </p>
                  )}
                  {c.evidence_note && <p className="text-xs text-ink-600 dark:text-ink-300">{c.evidence_note}</p>}
                  <p className="text-xs text-ink-400">Status: {c.status}</p>
                </div>
                <EvidenceDecisionForm verificationId={c.id} status={c.status} reviews={reviews} />
              </div>
            );
          }),
        )}
        {claims.length === 0 && <p className="py-8 text-center text-sm text-ink-400">No claims match this filter.</p>}
      </div>
    </div>
  );
}
