import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Radio } from "lucide-react";
import type { FlowFeedEntry } from "@/lib/admin/flow-command";
import { formatDateTime } from "@/lib/utils";

/** Renders flow-lead's already-founder-friendly feed copy verbatim, newest
 * first — no reprocessing or paraphrasing of the messages themselves. */
export function FlowCommandFeed({ feed }: { feed: FlowFeedEntry[] }) {
  const ordered = [...feed].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Live mission feed</h2>
      </CardHeader>
      <CardBody>
        {ordered.length === 0 ? (
          <EmptyState icon={<Radio className="h-8 w-8" />} title="No feed entries yet" body="flow-lead posts here at each meaningful milestone." />
        ) : (
          <ol className="space-y-3">
            {ordered.map((entry, i) => (
              <li key={`${entry.time}-${i}`} className="flex gap-3 border-l-2 border-flow-200 pl-3 dark:border-flow-800">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-800 dark:text-ink-100">
                    <span className="font-semibold">{entry.actor}</span> — {entry.message}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">{isValidDate(entry.time) ? formatDateTime(entry.time) : entry.time}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function isValidDate(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}
