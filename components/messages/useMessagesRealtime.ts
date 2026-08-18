"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "offline";

export function useMessagesRealtime(conversationId: string, onInsert: (message: Tables<"messages">) => void) {
  const [status, setStatus] = useState<RealtimeStatus>(() => (typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "connecting"));
  const onInsertRef = useRef(onInsert);

  useEffect(() => {
    onInsertRef.current = onInsert;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    function handleBrowserOnline() {
      setStatus((s) => (s === "offline" ? "reconnecting" : s));
    }
    function handleBrowserOffline() {
      setStatus("offline");
    }
    window.addEventListener("online", handleBrowserOnline);
    window.addEventListener("offline", handleBrowserOffline);

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!cancelled) onInsertRef.current(payload.new as Tables<"messages">);
        },
      )
      .subscribe((subStatus) => {
        if (cancelled) return;
        if (subStatus === "SUBSCRIBED") setStatus("connected");
        else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") setStatus("reconnecting");
        else if (subStatus === "CLOSED") setStatus("offline");
      });

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleBrowserOnline);
      window.removeEventListener("offline", handleBrowserOffline);
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return status;
}
