import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { relativeTime, cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/data/messages";

export function ConversationListItem({ conversation }: { conversation: ConversationSummary }) {
  return (
    <Link
      href={conversation.href}
      className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 transition hover:border-flow-300 dark:border-ink-800 dark:bg-ink-900"
    >
      <Avatar src={conversation.avatarUrl} name={conversation.title} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate text-sm", conversation.unreadCount > 0 ? "font-bold text-ink-900 dark:text-white" : "font-semibold text-ink-800 dark:text-ink-100")}>
            {conversation.title}
          </p>
          <span className="shrink-0 text-[11px] text-ink-400">{relativeTime(conversation.lastMessageAt)}</span>
        </div>
        <p className={cn("truncate text-xs", conversation.unreadCount > 0 ? "font-medium text-ink-700 dark:text-ink-200" : "text-ink-400")}>
          {conversation.lastMessagePreview ?? "No messages yet"}
        </p>
      </div>
      {conversation.unreadCount > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-flow-600 px-1.5 text-[11px] font-bold text-white">
          {conversation.unreadCount}
        </span>
      )}
    </Link>
  );
}
