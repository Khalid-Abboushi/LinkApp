import { supabase } from "@/lib/supabase";

/* ===== Types (align with your DB) ===== */
export type PartyRow = {
  id: string;
  name: string;
  picture_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type ChatRow = {
  id: string;
  party_id: string;
  created_at: string;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  author_id: string;
  text: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

/* ===== Data helpers ===== */

export async function getParty(partyId: string): Promise<PartyRow | null> {
  const { data, error } = await supabase
    .from("parties")
    .select("*")
    .eq("id", partyId)
    .maybeSingle();
  if (error) throw error;
  return (data as PartyRow) ?? null;
}

/** Ensure a chat row exists for the given party and return its id */
export async function ensurePartyChat(partyId: string): Promise<string> {
  const { data: found, error: e1 } = await supabase
    .from("chats")
    .select("id")
    .eq("party_id", partyId)
    .maybeSingle();
  if (e1) throw e1;
  if (found?.id) return found.id;

  const { data: created, error: e2 } = await supabase
    .from("chats")
    .insert({ party_id: partyId })
    .select("id")
    .single();
  if (e2) throw e2;
  return created.id as string;
}

export async function fetchAllMessages(chatId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export async function sendMessage(chatId: string, text: string): Promise<MessageRow> {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const author_id = auth.user?.id;
  if (!author_id) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("messages")
    .insert({ chat_id: chatId, author_id, text })
    .select("*")
    .single();
  if (error) throw error;
  return data as MessageRow;
}

export type PartyMemberRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
  profiles: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

export async function getPartyMembers(partyId: string) {
  const { data, error } = await supabase
    .from("party_members")
    .select(
      `
      user_id,
      role,
      profiles (
        id,
        display_name,
        username,
        avatar_url
      )
    `
    )
    .eq("party_id", partyId)
    .order("role", { ascending: true });

  if (error) throw error;

  // Explicitly cast after confirming structure
  return (data ?? []) as unknown as PartyMemberRow[];
}
