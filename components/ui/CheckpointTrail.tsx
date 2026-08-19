import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckpointStatus = "done" | "in_progress" | "pending";

export type Checkpoint = {
  name: string;
  status: CheckpointStatus;
  note?: string;
};

const DOT_STYLES: Record<CheckpointStatus, string> = {
  done: "border-verified-500 bg-verified-500 text-white",
  in_progress: "border-flow-500 bg-flow-50 text-flow-600 dark:bg-flow-950 dark:text-flow-300",
  pending: "border-ink-200 bg-white text-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-600",
};

const LABEL_STYLES: Record<CheckpointStatus, string> = {
  done: "text-ink-700 dark:text-ink-200",
  in_progress: "text-flow-600 dark:text-flow-300",
  pending: "text-ink-400 dark:text-ink-500",
};

const CONNECTOR_STYLES: Record<CheckpointStatus, string> = {
  done: "bg-verified-500",
  in_progress: "bg-flow-300 dark:bg-flow-800",
  pending: "bg-ink-200 dark:bg-ink-700",
};

function CheckpointDot({ status }: { status: CheckpointStatus }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        DOT_STYLES[status],
        status === "in_progress" && "animate-pulse-slow",
      )}
      aria-hidden="true"
    >
      {status === "done" && <Check className="h-4 w-4" strokeWidth={3} />}
      {status === "in_progress" && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={3} />}
      {status === "pending" && <Circle className="h-2 w-2 fill-current" strokeWidth={0} />}
    </span>
  );
}

/**
 * Horizontal (or wrapping) step trail showing real checkpoint completion —
 * never a fabricated percentage. Each checkpoint is binary/tri-state
 * (done / in_progress / pending). Presentational only; safe as a Server
 * Component.
 */
export function CheckpointTrail({
  checkpoints,
  className,
  showSummary = false,
}: {
  checkpoints: Checkpoint[];
  className?: string;
  /** Also render a compact "N of M checkpoints complete" line above the trail. */
  showSummary?: boolean;
}) {
  const total = checkpoints.length;
  const doneCount = checkpoints.filter((c) => c.status === "done").length;

  if (total === 0) {
    return (
      <div className={cn("text-sm text-ink-400 dark:text-ink-500", className)}>No checkpoints defined.</div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {showSummary && (
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
          {doneCount} of {total} checkpoints complete
        </p>
      )}

      <ol className="flex w-full items-start overflow-x-auto pb-1" role="list">
        {checkpoints.map((checkpoint, i) => {
          const isLast = i === checkpoints.length - 1;
          return (
            <li
              key={`${checkpoint.name}-${i}`}
              className={cn("flex shrink-0 items-start", !isLast && "flex-1 min-w-[92px]")}
              title={checkpoint.note}
            >
              <div className="flex flex-col items-center">
                <CheckpointDot status={checkpoint.status} />
                <span
                  className={cn(
                    "mt-1.5 max-w-[92px] text-center text-[11px] font-medium leading-tight sm:max-w-[112px] sm:text-xs",
                    LABEL_STYLES[checkpoint.status],
                  )}
                >
                  {checkpoint.name}
                </span>
              </div>

              {!isLast && (
                <span
                  className={cn("mt-3.5 h-0.5 min-w-[24px] flex-1 rounded-full sm:mt-[15px]", CONNECTOR_STYLES[checkpoint.status])}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
