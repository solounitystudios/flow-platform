"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateLeadStageAction } from "@/lib/admin/actions";
import { PIPELINE_STAGES } from "@/lib/admin/constants";
import { relativeTime } from "@/lib/utils";
import type { PipelineCard } from "@/lib/data/admin";

/**
 * No drag-and-drop here on purpose: native HTML5 DnD doesn't work well
 * with touch on iPad Safari, and the task explicitly calls for a
 * mobile/iPad-friendly board. Each card gets a "Move to" select instead —
 * every transition still goes through updateLeadStageAction, which calls
 * the server-authorized change_lead_stage() RPC (re-checks admin/AAL2,
 * validates the stage against the DB check constraint, and records
 * lead_stage_history), so this is exactly as validated as drag-and-drop
 * would have been.
 */
export function PipelineBoard({ board }: { board: Record<string, PipelineCard[]> }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => {
        const cards = board[stage.value] ?? [];
        return (
          <div key={stage.value} className="w-72 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-ink-200">{stage.label}</h3>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-300">{cards.length}</span>
            </div>
            <div className="space-y-2">
              {cards.map((card) => (
                <PipelineCardItem key={card.id} card={card} currentStage={stage.value} />
              ))}
              {cards.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 p-3 text-center text-xs text-ink-300 dark:border-ink-800">Empty</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineCardItem({ card, currentStage }: { card: PipelineCard; currentStage: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3 text-sm dark:border-ink-800 dark:bg-ink-900">
      <Link href={`/admin/leads/${card.id}`} className="font-medium text-ink-900 hover:text-flow-600 dark:text-white">
        {card.business_name}
      </Link>
      <p className="text-xs text-ink-400">
        {card.category} · {card.interest_level} interest
      </p>
      <p className="text-xs text-ink-300">Updated {relativeTime(card.updated_at)}</p>
      <select
        defaultValue=""
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) return;
          setError(null);
          startTransition(async () => {
            const result = await updateLeadStageAction(card.id, next);
            if (result.error) setError(result.error);
            e.target.value = "";
          });
        }}
        className="mt-2 w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
      >
        <option value="">Move to…</option>
        {PIPELINE_STAGES.filter((s) => s.value !== currentStage).map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
