import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Radio } from "lucide-react";
import type { FlowFeedEntry } from "@/lib/admin/flow-command";
import { classifyFeedEntry, feedEmphasisClass } from "@/lib/admin/flow-command-ui";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Renders flow-lead's already-founder-friendly feed copy verbatim, newest
 * first — no reprocessing or paraphrasing of the messages themselves.
 * Visual emphasis on meaningful moments is a pure styling hook keyed off the
 * real message text (delegation/checkpoint/QA/blocker/approval/complete
 * keywords) — it never adds a claim beyond what the text already says. */
export function FlowCommandFeed({ feed }: { feed: FlowFeedEntry[] }) {
  const ordered = [...feed].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">Mission timeline</h2>
      </CardHeader>
      <CardBody>
        {ordered.length === 0 ? (
          <EmptyState icon={<Radio className="h-8 w-8" />} title="No feed entries yet" body="flow-lead posts here at each meaningful milestone." />
        ) : (
          <ol className="space-y-0">
            {ordered.map((entry, i) => {
              const emphasis = classifyFeedEntry(entry.message);
              const isLast = i === ordered.length - 1;
              return (
                <li key={`${entry.time}-${i}`} className="flex gap-3 sm:gap-4">
                  <div className="flex w-16 shrink-0 flex-col items-end pt-0.5 text-right sm:w-24">
                    {isValidDate(entry.time) ? (
                      <>
                        <span className="text-[11px] font-semibold text-ink-600 dark:text-ink-300 sm:text-xs">
                          {formatDateTime(entry.time).split(",").slice(-1)[0].trim()}
                        </span>
                        <span className="text-[10px] text-ink-400">{formatDateTime(entry.time).split(",").slice(0, -1).join(",")}</span>
                      </>
                    ) : (
                      <span className="text-[11px] font-medium text-ink-400 sm:text-xs">{entry.time}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white dark:border-ink-900", emphasis === "none" ? "bg-ink-300 dark:bg-ink-600" : "bg-flow-500")} aria-hidden="true" />
                    {!isLast && <span className="my-0.5 w-px flex-1 bg-ink-100 dark:bg-ink-800" aria-hidden="true" />}
                  </div>
                  <div className={cn("min-w-0 flex-1 rounded-lg border-l-2 px-3 pb-4", feedEmphasisClass(emphasis))}>
                    <p className="text-sm text-ink-800 dark:text-ink-100">
                      <span className="font-semibold">{entry.actor}</span> — {entry.message}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function isValidDate(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}
