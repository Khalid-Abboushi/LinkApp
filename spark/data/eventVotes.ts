// data/eventVotes.ts
import { supabase } from "@/lib/supabase";

export type EventRow = {
  id: string;
  party_id: string;
  name: string;
  description?: string | null;
  location_name?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  hero_url?: string | null; // optional column (see SQL)
  created_at: string;
  updated_at: string;
};

export type EventWithVotes = EventRow & {
  likes: number;
  dislikes: number;
  net: number;              // likes - dislikes
  myVote: -1 | 0 | 1;       // caller’s vote
};

/** Fetch events for a party + aggregate votes + current user's vote */
export async function fetchPartyEventsWithVotes(partyId: string): Promise<EventWithVotes[]> {
  // 1) events
  const { data: events, error: e1 } = await supabase
    .from("events")
    .select("*")
    .eq("party_id", partyId)
    .order("created_at", { ascending: false });

  if (e1) throw e1;

  if (!events?.length) return [];

  const eventIds = events.map(e => e.id);

  // 2) aggregate votes for those events
  const { data: agg, error: e2 } = await supabase
    .from("event_votes")
    .select("event_id, vote")
    .in("event_id", eventIds);

  if (e2) throw e2;

  const byId = new Map<string, { likes: number; dislikes: number }>();
  agg?.forEach(row => {
    const cur = byId.get(row.event_id) ?? { likes: 0, dislikes: 0 };
    if (row.vote === 1) cur.likes += 1;
    else if (row.vote === -1) cur.dislikes += 1;
    byId.set(row.event_id, cur);
  });

  // 3) current user’s vote
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  let my: { event_id: string; vote: number }[] = [];
  if (uid) {
    const { data: mine } = await supabase
      .from("event_votes")
      .select("event_id,vote")
      .in("event_id", eventIds)
      .eq("profile_id", uid);
    my = mine || [];
  }

  const mineMap = new Map(my.map(r => [r.event_id, (r.vote ?? 0) as -1|0|1]));

  return (events as EventRow[]).map(ev => {
    const a = byId.get(ev.id) ?? { likes: 0, dislikes: 0 };
    const me = mineMap.get(ev.id) ?? 0;
    return {
      ...ev,
      likes: a.likes,
      dislikes: a.dislikes,
      net: a.likes - a.dislikes,
      myVote: me,
    };
  }).sort((a, b) => b.net - a.net || a.created_at.localeCompare(b.created_at));
}

/** Idempotent: one row per (event_id, profile_id). Passing the same vote again keeps it; sending the opposite flips it. */
export async function upsertEventVote(eventId: string, vote: -1 | 0 | 1): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const profile_id = auth.user?.id;
  if (!profile_id) throw new Error("Not signed in");

  const { error } = await supabase
    .from("event_votes")
    .upsert({ event_id: eventId, profile_id, vote }, { onConflict: "event_id,profile_id" });

  if (error) throw error;
}
