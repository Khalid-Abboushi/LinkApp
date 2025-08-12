// /hooks/useChatRealtime.ts
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import type { MessageRow } from "@/data/partyRoom";

type Handlers = {
  onInsert?: (row: MessageRow) => void;
  onUpdate?: (row: MessageRow) => void;
  onDelete?: (row: MessageRow) => void;
};

/** Robust chat subscription with reconnection + backoff. */
export function useChatRealtime(chatId: string | null, handlers: Handlers) {
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const backoffRef = useRef(500); // ms, grows to 8000

  useEffect(() => {
    if (!chatId) return;

    let unmounted = false;

    const makeChannel = () => {
      if (unmounted) return;

      // clean previous
      chanRef.current?.unsubscribe();
      const ch = supabase.channel(`chat:${chatId}`);
      chanRef.current = ch;

      const onIns = (p: any) => handlers.onInsert?.(p.new as MessageRow);
      const onUpd = (p: any) => handlers.onUpdate?.(p.new as MessageRow);
      const onDel = (p: any) => handlers.onDelete?.(p.old as MessageRow);

      ch.on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, onIns);
      ch.on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, onUpd);
      ch.on("postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, onDel);

      ch.subscribe((status) => {
        console.log("🔌 messages channel:", status);
        if (status === "SUBSCRIBED") backoffRef.current = 500;

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          const delay = Math.min(backoffRef.current, 8000);
          backoffRef.current = Math.min(backoffRef.current * 2, 8000);
          setTimeout(async () => {
            if (unmounted) return;
            const { data } = await supabase.auth.getSession(); // refresh token
            supabase.realtime.setAuth(data.session?.access_token ?? "");
            makeChannel(); // rebuild channel
          }, delay);
        }
      });
    };

    // ensure JWT then create first channel
    supabase.auth.getSession().then(({ data }) => {
      supabase.realtime.setAuth(data.session?.access_token ?? "");
      makeChannel();
    });

    // reconnect on app foreground / tab visible (web)
    const appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") makeChannel();
    });
    const onVis = () => { if (!document.hidden) makeChannel(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);

    return () => {
      unmounted = true;
      appStateSub.remove();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      chanRef.current?.unsubscribe();
      chanRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);
}
