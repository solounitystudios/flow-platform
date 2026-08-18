import Link from "next/link";
import { Bell, Briefcase, CalendarDays, CreditCard, Sparkles, Users } from "lucide-react";
import { mockNotifications } from "@/lib/mock/data";
import { EmptyState } from "@/components/ui/EmptyState";
import { relativeTime, cn } from "@/lib/utils";

const ICONS = {
  opportunity: Briefcase,
  event: CalendarDays,
  social: Users,
  system: Sparkles,
  payment: CreditCard,
} as const;

export default function NotificationsPage() {
  if (mockNotifications.length === 0) {
    return <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" />;
  }

  return (
    <div className="space-y-2">
      {mockNotifications.map((n) => {
        const Icon = ICONS[n.type];
        const content = (
          <div className={cn("flex gap-3 rounded-2xl border p-3.5 transition", n.read ? "border-ink-100 dark:border-ink-800" : "border-flow-200 bg-flow-50/60 dark:border-flow-900 dark:bg-flow-950/30")}>
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", n.read ? "bg-ink-100 text-ink-400 dark:bg-ink-800" : "bg-flow-600 text-white")}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900 dark:text-white">{n.title}</p>
              <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{n.body}</p>
              <p className="mt-1 text-xs text-ink-400">{relativeTime(n.created_at)}</p>
            </div>
            {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-flow-600" />}
          </div>
        );

        return n.href ? (
          <Link key={n.id} href={n.href}>
            {content}
          </Link>
        ) : (
          <div key={n.id}>{content}</div>
        );
      })}
    </div>
  );
}
