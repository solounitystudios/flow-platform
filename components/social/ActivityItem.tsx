import { Briefcase, CalendarCheck, ShieldCheck, MessageSquareQuote, Coins, UserPlus, Hammer } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { relativeTime } from "@/lib/utils";
import type { MockActivityItem } from "@/lib/types";

const ICONS: Record<MockActivityItem["type"], typeof Briefcase> = {
  gig_completed: Briefcase,
  event_attended: CalendarCheck,
  skill_verified: ShieldCheck,
  recommendation: MessageSquareQuote,
  points_earned: Coins,
  connection: UserPlus,
  project: Hammer,
};

export function ActivityItem({ item }: { item: MockActivityItem }) {
  const Icon = ICONS[item.type];

  return (
    <div className="flex gap-3 py-3">
      <Avatar src={item.actor.avatar_url} name={item.actor.full_name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-700 dark:text-ink-200">
          <span className="font-semibold text-ink-900 dark:text-white">{item.actor.full_name}</span> {item.summary}
        </p>
        {item.detail && <p className="mt-0.5 text-sm italic text-ink-400">{item.detail}</p>}
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
          <Icon className="h-3 w-3" />
          {relativeTime(item.created_at)}
          {item.points && <span className="font-semibold text-flow-600">+{item.points} pts</span>}
        </div>
      </div>
    </div>
  );
}
