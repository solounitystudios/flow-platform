import { ShieldCheck } from "lucide-react";
import type { ClaimExplanation } from "@flow/passport-contracts";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { explainClaim } from "@/lib/passport/domain";
import { formatDateTime } from "@/lib/utils";

const TONE = { verified: "verified", warning: "gold", neutral: "neutral", danger: "danger" } as const;

const VIEWER_NOTE: Record<ClaimExplanation["viewer"], string> = {
  owner: "You're seeing the full chain because this is your claim.",
  admin: "Shown to a Flow admin (step-up verified).",
  reviewer: "Shown because you were asked to review this.",
  public: "This is what anyone can see about a public, verified claim. Evidence and reviewer details stay private.",
};

/**
 * "Why does Passport show this?" for ONE claim. It renders only what the
 * viewer-scoped response contains (see passport_claim_explanation), so a
 * public viewer's card is structurally unable to show private evidence or
 * verifier detail — there is nothing here to hide.
 */
export function ClaimExplanationCard({ explanation, title }: { explanation: ClaimExplanation; title: string }) {
  const view = explainClaim(explanation);
  return (
    <Card>
      <CardHeader>
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink-900 dark:text-white">
          <ShieldCheck className="h-5 w-5 text-verified-600" /> Why does Passport show this?
        </h1>
        <Badge tone={TONE[view.status.tone]}>{view.status.label}</Badge>
      </CardHeader>
      <CardBody className="space-y-5">
        <div>
          <p className="font-semibold text-ink-900 dark:text-white">{title}</p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{view.headline}</p>
        </div>

        <dl className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm dark:divide-ink-800 dark:border-ink-800">
          {view.steps.map((step) => (
            <div key={step.label} className="flex items-start justify-between gap-4 px-3 py-2">
              <dt className="text-ink-400">{step.label}</dt>
              <dd className="text-right font-medium text-ink-900 dark:text-white">{step.detail}</dd>
            </div>
          ))}
        </dl>

        {view.evidenceLines.length > 0 && (
          <section className="space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Evidence on file</h2>
            <ul className="space-y-1 text-sm text-ink-700 dark:text-ink-200">
              {view.evidenceLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="text-xs text-ink-400">Only the kind and date are shown — never the documents themselves.</p>
          </section>
        )}

        {view.timeline.length > 0 && (
          <section className="space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">What happened</h2>
            <ol className="space-y-1 text-sm text-ink-700 dark:text-ink-200">
              {view.timeline.map((entry, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="capitalize">{entry.what}</span>
                  <span className="text-ink-400">{formatDateTime(entry.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="text-xs text-ink-400">{VIEWER_NOTE[explanation.viewer]}</p>
      </CardBody>
    </Card>
  );
}
