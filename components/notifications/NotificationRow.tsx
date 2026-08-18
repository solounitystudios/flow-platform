"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, Briefcase, Calendar, CheckCircle2, MessageSquareQuote, ThumbsDown, ThumbsUp, UserCheck, UserPlus, XCircle } from "lucide-react";
import { markNotificationReadAction } from "@/lib/actions";
import { relativeTime, cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

const ICONS: Record<string, typeof Bell> = {
  application_submitted: Briefcase,
  application_accepted: ThumbsUp,
  application_rejected: ThumbsDown,
  opportunity_changed: Calendar,
  opportunity_cancelled: XCircle,
  gig_reminder: Calendar,
  completion_confirmed: CheckCircle2,
  recommendation_received: MessageSquareQuote,
  connection_request: UserPlus,
  connection_accepted: UserCheck,
};

export function NotificationRow({ notification }: { notification: Tables<"notifications"> }) {
  const [pending, startTransition] = useTransition();
  const Icon = ICONS[notification.type] ?? Bell;

  function handleClick() {
    if (!notification.read) startTransition(() => markNotificationReadAction(notification.id));
  }

  const content = (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border p-3.5 transition",
        notification.read ? "border-ink-100 dark:border-ink-800" : "border-flow-200 bg-flow-50/60 dark:border-flow-900 dark:bg-flow-950/30",
        pending && "opacity-60",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", notification.read ? "bg-ink-100 text-ink-400 dark:bg-ink-800" : "bg-flow-600 text-white")}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900 dark:text-white">{notification.title}</p>
        {notification.body && <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{notification.body}</p>}
        <p className="mt-1 text-xs text-ink-400">{relativeTime(notification.created_at)}</p>
      </div>
      {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-flow-600" />}
    </div>
  );

  return notification.href ? (
    <Link href={notification.href} onClick={handleClick}>
      {content}
    </Link>
  ) : (
    <button onClick={handleClick} className="w-full text-left">
      {content}
    </button>
  );
}
