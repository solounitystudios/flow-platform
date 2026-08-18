import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getFullProfile } from "@/lib/data/profile";
import { getConversationMeta, getConversationMessages } from "@/lib/data/messages";
import { ChatScreen } from "@/components/messages/ChatScreen";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [meta, full] = await Promise.all([getConversationMeta(id, user.id), getFullProfile(user.id)]);
  if (!meta || !full) notFound();

  const messages = await getConversationMessages(id);

  return (
    <ChatScreen
      conversationId={id}
      viewer={{ id: user.id, full_name: full.profile.full_name ?? "You", avatar_url: full.profile.avatar_url }}
      meta={meta}
      initialMessages={messages}
    />
  );
}
