import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  flow: "bg-flow-100 text-flow-700 dark:bg-flow-950 dark:text-flow-300",
  verified: "bg-verified-500/10 text-verified-600 dark:text-verified-400",
  gold: "bg-gold-500/10 text-gold-600 dark:text-gold-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  urgent: "bg-red-500 text-white",
} as const;

export function Badge({ tone = "neutral", className, children, icon }: { tone?: keyof typeof tones; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
