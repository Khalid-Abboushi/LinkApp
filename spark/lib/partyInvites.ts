// /lib/partyInvites.ts
import { supabase } from "@/lib/supabase";

export type PartyInviteRow = {
  id: string;
  party_id: string;
  inviter_id: string;
  invitee_id: string;
  target_role: "member" | "admin";
  status: "pending" | "accepted" | "declined" | "canceled";
  created_at: string;
  parties?: { name: string } | null;
};

export async function sendPartyInvite(
  partyId: string,
  inviteeId: string,
  targetRole: "member" | "admin"
) {
  const { data: me } = await supabase.auth.getUser();
  const inviterId = me.user?.id;
  if (!inviterId) throw new Error("Not signed in");

  const { error } = await supabase.from("party_invites").insert({
    party_id: partyId,
    inviter_id: inviterId,
    invitee_id: inviteeId,
    target_role: targetRole,
    status: "pending",
  });
  if (error) throw error;
}

export async function listIncomingPartyInvites(): Promise<PartyInviteRow[]> {
  const { data: me } = await supabase.auth.getUser();
  const uid = me.user?.id!;
  const { data, error } = await supabase
    .from("party_invites")
    .select(
      "id, party_id, inviter_id, invitee_id, target_role, status, created_at, parties:party_id(name)"
    )
    .eq("invitee_id", uid)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function acceptPartyInvite(inviteId: string) {
  // IMPORTANT: Only call the RPC; do not write to party_members from the client.
  const { error } = await supabase.rpc("accept_party_invite_v2", {
    p_invite_id: inviteId,
  });
  if (error) throw error;
}

export async function declinePartyInvite(inviteId: string) {
  const { error } = await supabase.rpc("decline_party_invite_v2", {
    p_invite_id: inviteId,
  });
  if (error) throw error;
}
