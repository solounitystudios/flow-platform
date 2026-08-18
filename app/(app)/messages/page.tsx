import { MessageCircle } from "lucide-react";
import { mockConnections } from "@/lib/mock/data";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

export default function MessagesPage() {
  const threads = mockConnections.filter((c) => c.status === "connected");

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-1.5">
        {threads.map((c) => (
          <button
            key={c.person.id}
            className="flex w-full items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 text-left transition hover:border-flow-300 dark:border-ink-800 dark:bg-ink-900"
          >
            <Avatar src={c.person.avatar_url} name={c.person.full_name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">{c.person.full_name}</p>
              <p className="truncate text-xs text-ink-400">Start a conversation</p>
            </div>
          </button>
        ))}
      </div>

      <div className="hidden lg:block">
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title="Direct messaging is coming soon"
          body="This is the messaging architecture for FLOW — pick a conversation to preview the layout. Sending is not wired up yet."
          action={<Badge tone="flow">In development</Badge>}
        />
      </div>

      <div className="lg:hidden">
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title="Direct messaging is coming soon"
          body="Select a connection above to preview the conversation layout."
        />
      </div>
    </div>
  );
}
