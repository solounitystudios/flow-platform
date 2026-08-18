import { Award, Briefcase, CalendarDays, Flame, Gift, Medal, MessageSquareQuote, ShieldCheck, Star, Trophy, Users2, Zap, type LucideIcon } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import type { AchievementDef, EarnedAchievement } from "@/lib/data/achievements";

const ICONS: Record<string, LucideIcon> = {
  award: Award,
  trophy: Trophy,
  star: Star,
  medal: Medal,
  shield: ShieldCheck,
  zap: Zap,
  flame: Flame,
  briefcase: Briefcase,
  users: Users2,
  calendar: CalendarDays,
  gift: Gift,
  quote: MessageSquareQuote,
};

function resolveIcon(icon: string): LucideIcon {
  return ICONS[icon.toLowerCase()] ?? Award;
}

export function Achievements({ all, earned }: { all: AchievementDef[]; earned: EarnedAchievement[] }) {
  const earnedByKey = new Map(earned.map((e) => [e.achievement_key, e]));

  if (all.length === 0) {
    return <p className="text-sm text-ink-400">No achievements are available yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {all.map((a) => {
        const earnedRow = earnedByKey.get(a.key);
        const isEarned = !!earnedRow;
        const Icon = resolveIcon(a.icon);
        return (
          <div
            key={a.key}
            title={isEarned ? `${a.description} · earned ${relativeTime(earnedRow.earned_at)}` : a.description}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center",
              isEarned ? "border-gold-500/30 bg-gold-500/5" : "border-ink-100 opacity-40 dark:border-ink-800",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full",
                isEarned ? "bg-gold-500/15 text-gold-600 dark:text-gold-400" : "bg-ink-100 text-ink-400 dark:bg-ink-800",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-[11px] font-medium leading-tight text-ink-700 dark:text-ink-200">{a.title}</p>
            {a.points_bonus > 0 && <p className="text-[10px] text-ink-400">+{a.points_bonus} pts</p>}
          </div>
        );
      })}
    </div>
  );
}
