import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getMyConversations } from "@/lib/data/messages";
import { ConversationListItem } from "@/components/messages/ConversationListItem";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const conversations = await getMyConversations(user.id);

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircle className="h-6 w-6" />}
        title="No conversations yet"
        body="Message a connection from their Passport, or message attendees/employers from an event or opportunity."
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-2">
      {conversations.map((c) => (
        <ConversationListItem key={c.id} conversation={c} />
      ))}
    </div>
  );
}
