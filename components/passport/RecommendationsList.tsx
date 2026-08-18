import { Quote } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { relativeTime } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

export function RecommendationsList({ recommendations }: { recommendations: (Tables<"recommendations"> & { author: Tables<"profiles"> })[] }) {
  if (recommendations.length === 0) {
    return <EmptyState icon={<Quote className="h-6 w-6" />} title="No recommendations yet" body="Complete gigs and events to start earning them." />;
  }

  return (
    <div className="space-y-3">
      {recommendations.map((r) => (
        <div key={r.id} className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center gap-2.5">
            <Avatar src={r.author.avatar_url} name={r.author.full_name ?? "FLOW Member"} size="sm" />
            <div>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">{r.author.full_name}</p>
              <p className="text-xs text-ink-400">{relativeTime(r.created_at)}</p>
            </div>
          </div>
          <p className="mt-2.5 text-sm text-ink-600 dark:text-ink-300">&ldquo;{r.body}&rdquo;</p>
        </div>
      ))}
    </div>
  );
}
