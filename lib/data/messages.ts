import { createClient } from "@/lib/supabase/server";
import { dicebearAvatar } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

export interface ConversationSummary {
  id: string;
  type: "direct" | "event" | "opportunity";
  title: string;
  subtitle: string;
  avatarUrl: string;
  href: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
}

const PERSON_COLUMNS = "id, username, full_name, avatar_url";

/** Conversations the profile is a member of, newest activity first, each with
 * an unread count derived from the member's own last_read_at. */
export async function getMyConversations(profileId: string): Promise<ConversationSummary[]> {
  const supabase = await createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at")
    .eq("profile_id", profileId);

  if (membershipsError) {
    console.error("[getMyConversations] memberships query failed:", membershipsError.message);
    throw new Error("Unable to load your conversations.");
  }

  const conversationIds = (memberships ?? []).map((m) => m.conversation_id);
  if (conversationIds.length === 0) return [];

  const readAtByConversation = new Map((memberships ?? []).map((m) => [m.conversation_id, m.last_read_at]));

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select(`*, event:events(id, title, image_url), opportunity:opportunities(id, title)`)
    .in("id", conversationIds)
    .order("last_message_at", { ascending: false });

  if (conversationsError) {
    console.error("[getMyConversations] conversations query failed:", conversationsError.message);
    throw new Error("Unable to load your conversations.");
  }

  type Row = Tables<"conversations"> & {
    event: Pick<Tables<"events">, "id" | "title" | "image_url"> | null;
    opportunity: Pick<Tables<"opportunities">, "id" | "title"> | null;
  };
  const rows = (conversations ?? []) as Row[];

  const directIds = rows.filter((r) => r.type === "direct").map((r) => r.id);
  const otherByConversation = new Map<string, Tables<"profiles">>();
  if (directIds.length > 0) {
    const { data: allMembers } = await supabase
      .from("conversation_members")
      .select(`conversation_id, profile:profiles(${PERSON_COLUMNS})`)
      .in("conversation_id", directIds);
    type MemberRow = { conversation_id: string; profile: Tables<"profiles"> | null };
    for (const m of (allMembers ?? []) as MemberRow[]) {
      if (m.profile && m.profile.id !== profileId) otherByConversation.set(m.conversation_id, m.profile);
    }
  }

  const { data: lastMessages } = await supabase
    .from("messages")
    .select("conversation_id, body, created_at, deleted_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });
  const previewByConversation = new Map<string, { body: string; created_at: string; deleted_at: string | null }>();
  for (const m of lastMessages ?? []) {
    if (!previewByConversation.has(m.conversation_id)) previewByConversation.set(m.conversation_id, m);
  }

  const { data: unreadRows } = await supabase
    .from("messages")
    .select("conversation_id, created_at, sender_id")
    .in("conversation_id", conversationIds)
    .neq("sender_id", profileId)
    .is("deleted_at", null);
  const unreadByConversation = new Map<string, number>();
  for (const m of unreadRows ?? []) {
    const readAt = readAtByConversation.get(m.conversation_id);
    if (!readAt || new Date(m.created_at) > new Date(readAt)) {
      unreadByConversation.set(m.conversation_id, (unreadByConversation.get(m.conversation_id) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const preview = previewByConversation.get(row.id);
    const previewText = preview ? (preview.deleted_at ? "Message deleted" : preview.body) : null;

    if (row.type === "event" && row.event) {
      return {
        id: row.id,
        type: "event" as const,
        title: row.event.title,
        subtitle: "Event group chat",
        avatarUrl: row.event.image_url ?? dicebearAvatar(row.event.title),
        href: `/messages/${row.id}`,
        lastMessageAt: row.last_message_at,
        lastMessagePreview: previewText,
        unreadCount: unreadByConversation.get(row.id) ?? 0,
      };
    }
    if (row.type === "opportunity" && row.opportunity) {
      return {
        id: row.id,
        type: "opportunity" as const,
        title: row.opportunity.title,
        subtitle: "Opportunity chat",
        avatarUrl: dicebearAvatar(row.opportunity.title),
        href: `/messages/${row.id}`,
        lastMessageAt: row.last_message_at,
        lastMessagePreview: previewText,
        unreadCount: unreadByConversation.get(row.id) ?? 0,
      };
    }

    const other = otherByConversation.get(row.id);
    return {
      id: row.id,
      type: "direct" as const,
      title: other?.full_name ?? "FLOW Member",
      subtitle: other?.username ? `@${other.username}` : "",
      avatarUrl: other?.avatar_url ?? dicebearAvatar(other?.id ?? row.id),
      href: `/messages/${row.id}`,
      lastMessageAt: row.last_message_at,
      lastMessagePreview: previewText,
      unreadCount: unreadByConversation.get(row.id) ?? 0,
    };
  });
}

export async function getUnreadConversationCount(profileId: string): Promise<number> {
  const conversations = await getMyConversations(profileId);
  return conversations.filter((c) => c.unreadCount > 0).length;
}

export interface ConversationMeta {
  id: string;
  type: "direct" | "event" | "opportunity";
  title: string;
  subtitle: string;
  avatarUrl: string;
  otherMemberId: string | null;
}

export async function getConversationMeta(conversationId: string, viewerId: string): Promise<ConversationMeta | null> {
  const supabase = await createClient();
  const { data: isMember, error: membershipError } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", viewerId)
    .maybeSingle();

  // A genuine "you're not a member" (no row, no error) is correctly treated
  // as not-found — that's real access control. A failed query is a
  // different thing and must not be silently read the same way: it isn't
  // evidence the user lacks access, so it must not produce a 404.
  if (membershipError) {
    console.error("[getConversationMeta] membership check failed:", membershipError.message);
    throw new Error("Unable to load this conversation.");
  }
  if (!isMember) return null;

  const { data: conv, error: conversationError } = await supabase
    .from("conversations")
    .select(`*, event:events(id, title, image_url), opportunity:opportunities(id, title)`)
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    console.error("[getConversationMeta] conversation query failed:", conversationError.message);
    throw new Error("Unable to load this conversation.");
  }
  if (!conv) return null;

  if (conv.type === "event" && conv.event) {
    return { id: conv.id, type: "event", title: conv.event.title, subtitle: "Event group chat", avatarUrl: conv.event.image_url ?? dicebearAvatar(conv.event.title), otherMemberId: null };
  }
  if (conv.type === "opportunity" && conv.opportunity) {
    return { id: conv.id, type: "opportunity", title: conv.opportunity.title, subtitle: "Opportunity chat", avatarUrl: dicebearAvatar(conv.opportunity.title), otherMemberId: null };
  }

  const { data: members } = await supabase
    .from("conversation_members")
    .select(`profile:profiles(${PERSON_COLUMNS})`)
    .eq("conversation_id", conversationId);
  type MemberRow = { profile: Tables<"profiles"> | null };
  const other = ((members ?? []) as MemberRow[]).map((m) => m.profile).find((p) => p && p.id !== viewerId);

  return {
    id: conv.id,
    type: "direct",
    title: other?.full_name ?? "FLOW Member",
    subtitle: other?.username ? `@${other.username}` : "",
    avatarUrl: other?.avatar_url ?? dicebearAvatar(other?.id ?? conv.id),
    otherMemberId: other?.id ?? null,
  };
}

export type MessageRow = Tables<"messages"> & { sender: Pick<Tables<"profiles">, "id" | "full_name" | "avatar_url"> | null };

const PAGE_SIZE = 30;

/** Most recent page (or the page before `before`) of a conversation's
 * messages, returned in chronological (oldest-first) order for rendering. */
export async function getConversationMessages(conversationId: string, before?: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("messages")
    .select(`*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)`)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) {
    console.error("[getConversationMessages] query failed:", error.message);
    throw new Error("Unable to load messages.");
  }
  return ((data ?? []) as MessageRow[]).reverse();
}
