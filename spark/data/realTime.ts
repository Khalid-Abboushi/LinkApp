// data/realtime.ts
import { supabase } from "@/lib/supabase";
import type { MessageRow } from "./partyRoom";

export function subscribeToChatRealtime(
  chatId: string,
  handlers: {
    onInsert?: (row: MessageRow) => void;
    onUpdate?: (row: MessageRow) => void;
    onDelete?: (row: MessageRow) => void;
  } = {}
) {
  const ch = supabase.channel(`chat:${chatId}`);

  ch.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
    (payload) => handlers.onInsert?.(payload.new as MessageRow)
  );
  ch.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
    (payload) => handlers.onUpdate?.(payload.new as MessageRow)
  );
  ch.on(
    "postgres_changes",
    { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
    (payload) => handlers.onDelete?.(payload.old as MessageRow)
  );

  ch.subscribe(); // token is attached automatically for postgres_changes

  return () => ch.unsubscribe();
}
