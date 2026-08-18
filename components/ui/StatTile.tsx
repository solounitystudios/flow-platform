import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon,
  className,
  accent = "default",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
  accent?: "default" | "flow" | "gold" | "verified";
}) {
  const accents = {
    default: "text-ink-900 dark:text-white",
    flow: "text-flow-600 dark:text-flow-400",
    gold: "text-gold-600 dark:text-gold-400",
    verified: "text-verified-600 dark:text-verified-400",
  };

  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900", className)}>
      <div className="flex items-center gap-1.5 text-ink-400">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className={cn("text-2xl font-bold leading-tight", accents[accent])}>{value}</span>
    </div>
  );
}
