import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

/** Presentational only — no data fetching, no knowledge of owned vs. active
 * membership. The consuming section decides the role badge and whether a
 * member count is meaningful. Mirrors PersonRow's "purely presentational,
 * caller maps its own data in" convention. */
export function ProjectCard({
  title,
  description,
  href,
  roleLabel,
  roleTone,
  memberCount,
}: {
  title: string;
  description: string | null;
  href: string;
  roleLabel: string;
  roleTone: "gold" | "flow";
  memberCount?: number;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition hover:border-flow-300 hover:shadow-glow dark:border-ink-800 dark:bg-ink-900 dark:hover:border-flow-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900 dark:text-white">{title}</p>
          {description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-500 dark:text-ink-400">{description}</p>}
        </div>
        <Badge tone={roleTone}>{roleLabel}</Badge>
      </div>
      {typeof memberCount === "number" && (
        <p className="mt-3 flex items-center gap-1 text-xs text-ink-400">
          <Users className="h-3.5 w-3.5" />
          {memberCount} {memberCount === 1 ? "active member" : "active members"}
        </p>
      )}
    </Link>
  );
}
