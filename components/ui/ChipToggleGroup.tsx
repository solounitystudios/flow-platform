"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Generic multi-select toggle-chip row — independent on/off pills with a
 * visible "N of M active" summary. Built for things like map layer toggles
 * (Jobs / Work Now / Events / Businesses / Community) but kept generic
 * (no map-specific naming/props) since the pattern is broadly useful for
 * any "several independent filters, all can be on at once" UI.
 *
 * Scrolls horizontally on narrow viewports (matches the `no-scrollbar`
 * horizontal filter rows already used in `OpportunityBrowser`/`LiveBrowser`)
 * and wraps in place from `sm` up.
 *
 * Usage:
 *   const [activeLayers, setActiveLayers] = useState(["jobs", "events"]);
 *   <ChipToggleGroup
 *     aria-label="Map layers"
 *     options={[
 *       { id: "jobs", label: "Jobs", icon: <Briefcase className="h-3.5 w-3.5" /> },
 *       { id: "work-now", label: "Work Now", tone: "gold" },
 *       { id: "events", label: "Events" },
 *       { id: "businesses", label: "Businesses" },
 *       { id: "community", label: "Community" },
 *     ]}
 *     value={activeLayers}
 *     onChange={setActiveLayers}
 *   />
 */

export interface ChipOption {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Visual tone applied while active. Defaults to "flow". */
  tone?: "flow" | "gold" | "verified" | "danger" | "neutral";
  disabled?: boolean;
}

export interface ChipToggleGroupProps {
  /** Accessible name for the group (not rendered visually — pair with your own visible heading if one is needed). */
  "aria-label": string;
  options: ChipOption[];
  /** Ids of the currently-active/on options. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Render the "N of M active" summary line above the chips. Defaults to true. */
  showSummary?: boolean;
  summaryLabel?: (activeCount: number, total: number) => string;
  className?: string;
}

const TONE_ACTIVE_CLASSES: Record<NonNullable<ChipOption["tone"]>, string> = {
  flow: "border-flow-600 bg-flow-600 text-white",
  gold: "border-gold-500 bg-gold-500 text-white",
  verified: "border-verified-500 bg-verified-500 text-white",
  danger: "border-red-600 bg-red-600 text-white",
  neutral: "border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-950",
};

const INACTIVE_CLASSES =
  "border-ink-200 text-ink-500 hover:border-flow-300 dark:border-ink-700 dark:text-ink-400";

function defaultSummaryLabel(activeCount: number, total: number) {
  return `${activeCount} of ${total} active`;
}

export function ChipToggleGroup({
  "aria-label": ariaLabel,
  options,
  value,
  onChange,
  showSummary = true,
  summaryLabel = defaultSummaryLabel,
  className,
}: ChipToggleGroupProps) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showSummary && (
        <p className="text-xs font-medium text-ink-400 dark:text-ink-500">{summaryLabel(value.length, options.length)}</p>
      )}
      <div role="group" aria-label={ariaLabel} className="flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {options.map((option) => {
          const active = value.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={option.disabled}
              onClick={() => toggle(option.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active ? TONE_ACTIVE_CLASSES[option.tone ?? "flow"] : INACTIVE_CLASSES,
              )}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
