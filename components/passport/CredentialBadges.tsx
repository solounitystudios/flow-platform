import { BadgeCheck, Sparkles, Briefcase, GraduationCap, Users, ShieldCheck, Star, Compass, Building, type LucideIcon } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { relativeTime } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "badge-check": BadgeCheck,
  sparkles: Sparkles,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  users: Users,
  "shield-check": ShieldCheck,
  star: Star,
  compass: Compass,
  building: Building,
};

const COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  flow: "bg-flow-100 text-flow-700 dark:bg-flow-950 dark:text-flow-300",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

/** Color is never the only indicator — every badge also carries its label
 * text and an icon, so this reads fine without color perception too. */
export function CredentialBadges({
  credentials,
  credentialTypes,
}: {
  credentials: Tables<"profile_credentials">[];
  credentialTypes: Tables<"credential_types">[];
}) {
  if (credentials.length === 0) {
    return <p className="text-sm text-ink-400">No verified credentials yet.</p>;
  }

  const typeByKey = new Map(credentialTypes.map((t) => [t.key, t]));

  return (
    <div className="flex flex-wrap gap-2">
      {credentials.map((c) => {
        const type = typeByKey.get(c.credential_type);
        const Icon = ICONS[type?.icon_name ?? ""] ?? BadgeCheck;
        const colorClass = COLOR_CLASSES[type?.color_token ?? ""] ?? COLOR_CLASSES.slate;
        return (
          <span
            key={c.id}
            title={`${c.title} · granted ${relativeTime(c.granted_at)}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${colorClass}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {c.title}
          </span>
        );
      })}
    </div>
  );
}
