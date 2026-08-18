"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send, Trash2, WifiOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { sendMessageAction, markConversationReadAction, deleteMessageAction } from "@/lib/actions";
import { useMessagesRealtime } from "@/components/messages/useMessagesRealtime";
import { relativeTime, cn } from "@/lib/utils";
import type { MessageRow, ConversationMeta } from "@/lib/data/messages";
import type { Tables } from "@/lib/database.types";

const PAGE_SIZE = 30;

export function ChatScreen({ conversationId, viewer, meta, initialMessages }: { conversationId: string; viewer: { id: string; full_name: string; avatar_url: string | null }; meta: ConversationMeta; initialMessages: MessageRow[] }) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [hasMoreOlder, setHasMoreOlder] = useState(initialMessages.length === PAGE_SIZE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledInitially = useRef(false);

  const status = useMessagesRealtime(conversationId, (incoming) => {
    setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, { ...incoming, sender: null }]));
    if (incoming.sender_id !== viewer.id) markConversationReadAction(conversationId);
  });

  useEffect(() => {
    markConversationReadAction(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!hasScrolledInitially.current || messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: hasScrolledInitially.current ? "smooth" : "auto" });
      hasScrolledInitially.current = true;
    }
  }, [messages.length]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const older = ((data ?? []) as unknown as MessageRow[]).reverse();
    setHasMoreOlder(older.length === PAGE_SIZE);
    setMessages((prev) => [...older, ...prev]);
    setLoadingOlder(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setSendError(null);
    const result = await sendMessageAction(conversationId, trimmed);
    setSending(false);

    if (result.error) {
      setSendError(result.error);
      return;
    }
    setBody("");
    if (result.messageId) {
      const optimistic: MessageRow = {
        id: result.messageId,
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: trimmed,
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
        sender: { id: viewer.id, full_name: viewer.full_name, avatar_url: viewer.avatar_url },
      };
      setMessages((prev) => (prev.some((m) => m.id === optimistic.id) ? prev : [...prev, optimistic]));
    }
  }

  async function handleDelete(messageId: string) {
    if (!confirm("Delete this message? This can't be undone.")) return;
    const result = await deleteMessageAction(messageId);
    if (result.error) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, body: "", deleted_at: new Date().toISOString() } : m)));
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col sm:h-[calc(100dvh-6rem)]">
      <div className="flex items-center gap-3 border-b border-ink-100 pb-3 dark:border-ink-800">
        <Link href="/messages" className="text-ink-400 hover:text-ink-600" aria-label="Back to messages">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar src={meta.avatarUrl} name={meta.title} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900 dark:text-white">{meta.title}</p>
          {meta.subtitle && <p className="truncate text-xs text-ink-400">{meta.subtitle}</p>}
        </div>
        {status !== "connected" && (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600">
            <WifiOff className="h-3.5 w-3.5" /> {status === "offline" ? "Offline" : "Reconnecting…"}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {hasMoreOlder && (
          <div className="flex justify-center">
            <button onClick={loadOlder} disabled={loadingOlder} className="text-xs font-medium text-flow-600 hover:underline">
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-400">No messages yet. Say hello!</p>
        )}

        {messages.map((m) => {
          const isMine = m.sender_id === viewer.id;
          const isDeleted = !!m.deleted_at;
          return (
            <div key={m.id} className={cn("group flex items-end gap-2", isMine ? "flex-row-reverse" : "flex-row")}>
              {!isMine && <Avatar src={m.sender?.avatar_url ?? null} name={m.sender?.full_name ?? "FLOW Member"} size="xs" />}
              <div className={cn("flex max-w-[75%] flex-col gap-0.5", isMine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm",
                    isDeleted
                      ? "italic text-ink-400 border border-dashed border-ink-200 dark:border-ink-700"
                      : isMine
                        ? "bg-flow-600 text-white"
                        : "bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-white",
                  )}
                >
                  {isDeleted ? "Message deleted" : m.body}
                </div>
                <div className="flex items-center gap-1.5 px-1 text-[10px] text-ink-400">
                  <span>{relativeTime(m.created_at)}</span>
                  {isMine && !isDeleted && (
                    <button onClick={() => handleDelete(m.id)} className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100" aria-label="Delete message">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Write a message…"
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-500/20 dark:border-ink-700 dark:bg-ink-900"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-flow-600 text-white transition-colors hover:bg-flow-700 disabled:opacity-50"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
      {sendError && <p className="mt-1.5 text-xs text-red-600">{sendError}</p>}
    </div>
  );
}
