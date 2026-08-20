import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { MockPerson } from "@/lib/types";

export function PersonCard({
  person,
  className,
  action,
}: {
  person: Pick<MockPerson, "id" | "username" | "full_name" | "avatar_url" | "city" | "state" | "bio" | "reliability_score" | "available_now">;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-ink-100 bg-white p-3.5 transition hover:border-flow-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900", className)}>
      <div className="flex items-center gap-3">
        <Link href={`/p/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar src={person.avatar_url} name={person.full_name} size="lg" />
            {person.available_now && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-ink-900" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900 dark:text-white">{person.full_name}</p>
            <p className="truncate text-xs text-ink-400">
              @{person.username} · {person.city}, {person.state}
            </p>
            {person.bio && <p className="mt-1 line-clamp-1 text-xs text-ink-500 dark:text-ink-400">{person.bio}</p>}
          </div>
        </Link>
        <Badge tone="verified" icon={<ShieldCheck className="h-3 w-3" />} className="shrink-0">
          {person.reliability_score}%
        </Badge>
      </div>
      {action && <div className="mt-3 flex justify-end border-t border-ink-100 pt-3 dark:border-ink-800">{action}</div>}
    </div>
  );
}
