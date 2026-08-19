import { Check, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { OpportunityGap } from "@/lib/data/gap";

/** Explains exactly which required skills are satisfied vs. missing —
 * never a promise of an outcome, just the real gap. */
export function OpportunityGapCard({ gap }: { gap: OpportunityGap }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-bold text-ink-900 dark:text-white">Requirement match</h2>
      </CardHeader>
      <CardBody className="space-y-2">
        {gap.matched.map((s) => (
          <p key={s.id} className="flex items-center gap-2 text-sm text-emerald-600">
            <Check className="h-4 w-4 shrink-0" /> {s.name} — on your Passport
          </p>
        ))}
        {gap.missing.map((s) => (
          <p key={s.id} className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
            <X className="h-4 w-4 shrink-0 text-red-400" /> {s.name} — not yet on your Passport
          </p>
        ))}
        {gap.missing.length > 0 && (
          <p className="pt-1 text-xs text-ink-400">
            Add missing skills (and evidence, if you have it) in <a href="/settings" className="text-flow-600 hover:underline">Settings</a>.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
