// /lib/friends.ts
import { supabase } from "@/lib/supabase";

export type FriendStatus = "pending" | "accepted" | "declined";
export type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  requested_by: string;
  status: FriendStatus;
  created_at: string;
  updated_at: string;
};

export type ProfileBrief = { id: string; display_name: string | null; avatar_url: string | null };

export type PendingIncoming = { id: string; requester: ProfileBrief };
export type FriendsState = {
  friends: ProfileBrief[];
  pendingOut: Set<string>;        // userIds I've sent to (pending)
  pendingIn: PendingIncoming[];   // requests to me (with requester profile)
};

/** Send a friend request (idempotent via unique pair index in your schema). */
export async function sendFriendRequest(targetUserId: string) {
  const { data: me } = await supabase.auth.getUser();
  const uid = me.user?.id;
  if (!uid) throw new Error("Not signed in");
  if (uid === targetUserId) throw new Error("You can’t add yourself");

  const { error } = await supabase.from("friendships").insert({
    user_id: uid,
    friend_id: targetUserId,
    requested_by: uid,
    status: "pending",
  });
  if (error) throw error;
}

/** Accept / decline / cancel helpers wired to RPCs you created. */
export async function acceptFriendRequest(id: string) {
  const { error } = await supabase.rpc("accept_friend_request_v2", { p_request_id: id });
  if (error) throw error;
}
export async function declineFriendRequest(id: string) {
  const { error } = await supabase.rpc("decline_friend_request_v2", { p_request_id: id });
  if (error) throw error;
}
export async function cancelFriendRequest(id: string) {
  const { error } = await supabase.rpc("cancel_friend_request_v2", { p_request_id: id });
  if (error) throw error;
}

/** Fetch friends + pending state for current user, including requester profiles for incoming. */
export async function loadFriendsState(): Promise<FriendsState> {
  const { data: me } = await supabase.auth.getUser();
  const uid = me.user?.id!;
  if (!uid) return { friends: [], pendingOut: new Set(), pendingIn: [] };

  // Accepted friendships (I’m either side)
  const { data: accRows, error: accErr } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`user_id.eq.${uid},friend_id.eq.${uid}`);
  if (accErr) throw accErr;

  const friendIds = (accRows ?? []).map((r) => (r.user_id === uid ? r.friend_id : r.user_id));

  // Pending OUT (I requested)
  const { data: outRows, error: outErr } = await supabase
    .from("friendships")
    .select("id,user_id,friend_id,requested_by,status")
    .eq("status", "pending")
    .eq("requested_by", uid)
    .or(`user_id.eq.${uid},friend_id.eq.${uid}`);
  if (outErr) throw outErr;
  const pendingOut = new Set<string>(
    (outRows ?? []).map((r) => (r.user_id === uid ? r.friend_id : r.user_id))
  );

  // Pending IN (to me, not requested_by me)
  const { data: inRows, error: inErr } = await supabase
    .from("friendships")
    .select("id,user_id,friend_id,requested_by,status")
    .eq("status", "pending")
    .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
    .neq("requested_by", uid);
  if (inErr) throw inErr;

  const requesterIds = Array.from(new Set((inRows ?? []).map((r) => r.requested_by)));
  let requesterMap = new Map<string, ProfileBrief>();
  if (requesterIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", requesterIds);
    if (pErr) throw pErr;
    requesterMap = new Map(profs!.map((p) => [p.id, p as ProfileBrief]));
  }
  const pendingIn: PendingIncoming[] = (inRows ?? []).map((r) => ({
    id: r.id,
    requester: requesterMap.get(r.requested_by) || {
      id: r.requested_by,
      display_name: "User",
      avatar_url: null,
    },
  }));

  // Fetch friend profiles
  let friends: ProfileBrief[] = [];
  if (friendIds.length) {
    const { data: profs, error: p2 } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", friendIds);
    if (p2) throw p2;
    friends = (profs ?? []) as ProfileBrief[];
  }

  return { friends, pendingOut, pendingIn };
}

/**
 * Subscribe to realtime friendship changes for current user.
 * Calls `onRefresh()` on any insert/update/delete that involves them.
 * Calls `onAccepted(otherUser)` when any row becomes 'accepted'.
 * Returns an unsubscribe function.
 */
export function subscribeFriendsRealtime(
  onRefresh: () => void,
  onAccepted?: (other: ProfileBrief) => void
): () => void {
  const ch = supabase.channel(`friends:live`);

  ch.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "friendships" },
    async (payload) => {
      // This runs for every change; check if it involves me first.
      const { data: me } = await supabase.auth.getUser();
      const uid = me.user?.id;
      if (!uid) return;

      const row = (payload.new ?? payload.old) as Partial<FriendshipRow> | null;
      if (!row) return;
      if (row.user_id !== uid && row.friend_id !== uid) return;

      // If newly accepted, emit a friendly toast hook with the other user's profile
      if (payload.eventType === "UPDATE" && row.status === "accepted" && onAccepted) {
        const otherId = row.user_id === uid ? row.friend_id! : row.user_id!;
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .eq("id", otherId)
          .single();
        if (prof) onAccepted(prof as ProfileBrief);
      }
      onRefresh();
    }
  ).subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}
