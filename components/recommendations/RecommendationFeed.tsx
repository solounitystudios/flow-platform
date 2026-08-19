"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Check, RefreshCw, Briefcase, Compass, Users, RotateCcw, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { dismissRecommendationAction, markRecommendationActedAction, refreshRecommendationsAction } from "@/lib/verification-actions";
import type { MatchRecommendation } from "@/lib/data/recommendations";

const SECTIONS: { type: string; label: string; icon: typeof Briefcase; href: (r: MatchRecommendation) => string }[] = [
  { type: "opportunity", label: "Best next opportunities", icon: Briefcase, href: (r) => `/gigs/${r.target_opportunity_id}` },
  { type: "mentor", label: "Mentors", icon: Compass, href: (r) => `/p/${r.target_profile?.username ?? r.target_profile_id}` },
  { type: "community", label: "People to meet", icon: Users, href: (r) => `/p/${r.target_profile?.username ?? r.target_profile_id}` },
  { type: "reconnection", label: "Reconnect", icon: RotateCcw, href: (r) => `/p/${r.target_profile?.username ?? r.target_profile_id}` },
  { type: "skill_training", label: "Build these skills", icon: GraduationCap, href: () => "/settings" },
];

export function RecommendationFeed({ grouped }: { grouped: Record<string, MatchRecommendation[]> }) {
  const [state, setState] = useState(grouped);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function removeCard(id: string) {
    setState((prev) => {
      const next: Record<string, MatchRecommendation[]> = {};
      for (const [k, v] of Object.entries(prev)) next[k] = v.filter((r) => r.id !== id);
      return next;
    });
  }

  const total = Object.values(state).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500 dark:text-ink-400">{total} active recommendation{total === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          {message && <span className="text-xs text-ink-400">{message}</span>}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await refreshRecommendationsAction();
                setMessage(result.error ?? `Refreshed — ${result.generated ?? 0} match${result.generated === 1 ? "" : "es"} updated.`);
                if (!result.error) window.location.reload();
              })
            }
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {SECTIONS.map((section) => {
        const items = state[section.type] ?? [];
        if (items.length === 0) return null;
        const Icon = section.icon;
        return (
          <section key={section.type} className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">
              <Icon className="h-4 w-4" /> {section.label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((r) => (
                <RecommendationCard key={r.id} rec={r} href={section.href(r)} onDismissed={() => removeCard(r.id)} />
              ))}
            </div>
          </section>
        );
      })}

      {total === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center dark:border-ink-800">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            No recommendations yet. Set a goal in Settings and hit Refresh — recommendations only ever come from real signals on your Passport.
          </p>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ rec, href, onDismissed }: { rec: MatchRecommendation; href: string; onDismissed: () => void }) {
  const [pending, startTransition] = useTransition();
  const title = rec.target_opportunity?.title ?? rec.target_profile?.full_name ?? rec.target_skill?.name ?? "Recommendation";

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start justify-between gap-2">
        <Link href={href} className="font-medium text-ink-900 hover:text-flow-600 dark:text-white">
          {title}
        </Link>
        <span className="shrink-0 rounded-full bg-flow-100 px-2 py-0.5 text-[10px] font-semibold text-flow-700 dark:bg-flow-950 dark:text-flow-300">{Math.round(rec.score)}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {rec.reasons.map((reason, i) => (
          <li key={i} className="text-xs text-ink-500 dark:text-ink-400">
            Why this match: {reason}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markRecommendationActedAction(rec.id);
            })
          }
        >
          <Check className="h-3.5 w-3.5" /> Act on this
        </Button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await dismissRecommendationAction(rec.id);
              onDismissed();
            })
          }
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
        >
          <X className="h-3.5 w-3.5" /> Dismiss
        </button>
      </div>
    </div>
  );
}
