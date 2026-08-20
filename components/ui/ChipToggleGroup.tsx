"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Generic toggle-chip row, in two modes:
 *
 * - `multiple` (default true): independent on/off pills, any number active
 *   at once, with a visible "N of M active" summary. The original use case
 *   this was built for.
 * - `multiple={false}`: exactly one pill active at a time (radio-button
 *   semantics) — clicking a pill replaces the whole selection with just
 *   that one id (`value` is still `string[]`, always length 1, so the
 *   external API doesn't change shape between modes). Used for FLOW's
 *   canonical Map V2 layer control (All / Work Now / Gigs / Jobs /
 *   Volunteer / Events / Businesses — see lib/map-selectors.ts's
 *   `MapLayer`), where exactly one category is ever selected.
 *
 * Kept generic (no map-specific naming/props) since the pattern is broadly
 * useful beyond the map. Scrolls horizontally on narrow viewports (matches
 * the `no-scrollbar` horizontal filter rows already used elsewhere) and
 * wraps in place from `sm` up. Each pill has a ~44px minimum touch target
 * regardless of label length.
 *
 * Usage (multi-select, default):
 *   const [activeLayers, setActiveLayers] = useState(["jobs", "events"]);
 *   <ChipToggleGroup
 *     aria-label="Filters"
 *     options={[{ id: "jobs", label: "Jobs" }, { id: "events", label: "Events" }]}
 *     value={activeLayers}
 *     onChange={setActiveLayers}
 *   />
 *
 * Usage (single-select):
 *   const [layer, setLayer] = useState<MapLayer>("all");
 *   <ChipToggleGroup
 *     aria-label="Map layer"
 *     multiple={false}
 *     showSummary={false}
 *     options={MAP_LAYERS.map((l) => ({ id: l, label: MAP_LAYER_LABEL[l] }))}
 *     value={[layer]}
 *     onChange={([next]) => next && setLayer(next as MapLayer)}
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
  /** Ids of the currently-active/on options. In single-select mode
   * (`multiple={false}`) this is always a 0-or-1-length array. */
  value: string[];
  onChange: (next: string[]) => void;
  /** true (default): independent on/off pills, any number active. false:
   * exactly one pill active at a time, clicking replaces the selection —
   * the already-active pill is a no-op (can't deselect down to none). */
  multiple?: boolean;
  /** Render the "N of M active" summary line above the chips. Defaults to true; ignored/meaningless in single-select mode unless explicitly set. */
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
  multiple = true,
  showSummary = true,
  summaryLabel = defaultSummaryLabel,
  className,
}: ChipToggleGroupProps) {
  function toggle(id: string) {
    if (!multiple) {
      if (!value.includes(id)) onChange([id]);
      return;
    }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showSummary && (
        <p className="text-xs font-medium text-ink-400 dark:text-ink-500">{summaryLabel(value.length, options.length)}</p>
      )}
      <div
        role={multiple ? "group" : "radiogroup"}
        aria-label={ariaLabel}
        className="flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
      >
        {options.map((option) => {
          const active = value.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={multiple ? undefined : "radio"}
              aria-pressed={multiple ? active : undefined}
              aria-checked={multiple ? undefined : active}
              disabled={option.disabled}
              onClick={() => toggle(option.id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
