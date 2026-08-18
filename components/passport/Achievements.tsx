import { Award, ShieldCheck, MessageSquareQuote, Briefcase, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AchievementDef {
  key: string;
  label: string;
  icon: LucideIcon;
  earned: boolean;
}

export function Achievements({
  gigsCompleted,
  skillsVerified,
  recommendationsCount,
  reliabilityScore,
}: {
  gigsCompleted: number;
  skillsVerified: number;
  recommendationsCount: number;
  reliabilityScore: number;
}) {
  const achievements: AchievementDef[] = [
    { key: "first-gig", label: "First Gig Completed", icon: Briefcase, earned: gigsCompleted >= 1 },
    { key: "reliable", label: "Highly Reliable", icon: ShieldCheck, earned: reliabilityScore >= 95 && gigsCompleted >= 3 },
    { key: "verified-pro", label: "Verified Pro", icon: Award, earned: skillsVerified >= 3 },
    { key: "well-recommended", label: "Well Recommended", icon: MessageSquareQuote, earned: recommendationsCount >= 3 },
  ];

  const earnedCount = achievements.filter((a) => a.earned).length;
  if (earnedCount === 0) {
    return <p className="text-sm text-ink-400">Complete gigs, get skills verified, and earn recommendations to unlock achievements.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {achievements.map((a) => {
        const Icon = a.icon;
        return (
          <div
            key={a.key}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center",
              a.earned ? "border-gold-500/30 bg-gold-500/5" : "border-ink-100 opacity-40 dark:border-ink-800",
            )}
          >
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", a.earned ? "bg-gold-500/15 text-gold-600 dark:text-gold-400" : "bg-ink-100 text-ink-400 dark:bg-ink-800")}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-[11px] font-medium leading-tight text-ink-700 dark:text-ink-200">{a.label}</p>
          </div>
        );
      })}
    </div>
  );
}
