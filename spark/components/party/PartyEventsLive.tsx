// components/party/PartyEventsLive.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ActivityIndicator, RefreshControl, Dimensions, ScrollView } from "react-native";
import { supabase } from "@/lib/supabase";
import EventCardPrism from "@/components/ui/EventCardPrism";

/* ========= Palette compat ========= */
type DiscoverPalette = {
  name?: string;
  bg?: string; bg2?: string;
  text?: string; textMuted?: string;
  glass?: string; glassBorder?: string;
  p1?: string; p2?: string; p3?: string; p4?: string;
};
type AppPalette = {
  name?: string;
  surface?: string; border?: string;
  text?: string; textMuted?: string;
  glass?: string; glassBorder?: string;
  p1?: string; p2?: string; p3?: string; p4?: string;
  bg?: string; bg2?: string;
};
type Palette = Required<DiscoverPalette>;

function normalizePalette(P: AppPalette | DiscoverPalette): Palette {
  const bg = (P as any).bg ?? (P as any).surface ?? "#0B0814";
  const bg2 = (P as any).bg2 ?? (P as any).surface ?? "#140F2B";
  return {
    name: P.name ?? "App",
    bg,
    bg2,
    text: P.text ?? "#ECF1FF",
    textMuted: P.textMuted ?? "#B7C3DA",
    glass: P.glass ?? "rgba(255,255,255,0.06)",
    glassBorder: P.glassBorder ?? "rgba(255,255,255,0.10)",
    p1: P.p1 ?? "#22D3EE",
    p2: P.p2 ?? "#A78BFA",
    p3: P.p3 ?? "#FB7185",
    p4: P.p4 ?? "#34D399",
  };
}

/* ========= Types ========= */
type Role = "owner" | "admin" | "member";
type EventRow = {
  id: string;
  party_id: string;
  name: string;
  description?: string | null;
  location_name?: string | null;
  hero_url?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  created_at: string;
};
type EventWithVotes = EventRow & {
  likes: number;
  dislikes: number;
  net: number;
  myVote: -1 | 0 | 1;
};

/* ========= Realtime auth bridge ========= */
function useRealtimeAuthBridge() {
  useEffect(() => {
    let sub: any;
    supabase.auth.getSession().then(({ data }) => {
      supabase.realtime.setAuth(data.session?.access_token ?? "");
    });
    const o = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? "");
    });
    sub = o.data?.subscription;
    return () => sub?.unsubscribe?.();
  }, []);
}

/* ========= Data helpers ========= */
async function fetchPartyEvents(partyId: string): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id,party_id,name,description,location_name,hero_url,start_at,end_at,created_at")
    .eq("party_id", partyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchAggregates(ids: string[]) {
  const counts = new Map<string, { likes: number; dislikes: number }>();
  const mine = new Map<string, -1 | 0 | 1>();
  if (!ids.length) return { counts, mine };

  // Pull all votes and filter locally (works with RLS + realtime)
  const { data: votes } = await supabase.from("event_votes").select("event_id,vote");
  votes?.forEach((v) => {
    if (!ids.includes(v.event_id)) return;
    const cur = counts.get(v.event_id) ?? { likes: 0, dislikes: 0 };
    if (v.vote === 1) cur.likes += 1;
    else if (v.vote === -1) cur.dislikes += 1;
    counts.set(v.event_id, cur);
  });

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (uid) {
    const { data: mineRows } = await supabase
      .from("event_votes")
      .select("event_id,vote")
      .eq("profile_id", uid);
    (mineRows || []).forEach((r) => {
      if (!ids.includes(r.event_id)) return;
      mine.set(r.event_id, (r.vote ?? 0) as -1 | 0 | 1);
    });
  }

  return { counts, mine };
}

async function fetchMyRole(partyId: string): Promise<Role | "none"> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return "none";
  const { data, error } = await supabase
    .from("party_members")
    .select("role")
    .eq("party_id", partyId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) return "none";
  return (data?.role as Role) ?? "none";
}

/* ========= Component ========= */
export default function PartyEventsLive({
  partyId,
  P: PIn,
}: {
  partyId: string;
  P: AppPalette | DiscoverPalette;
}) {
  useRealtimeAuthBridge();
  const P = useMemo(() => normalizePalette(PIn), [PIn]);
  const containerW = Math.min(Dimensions.get("window").width, 860);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<EventWithVotes[]>([]);
  const [role, setRole] = useState<Role | "none">("none");
  const canEditTime = role === "owner" || role === "admin";
  const idSetRef = useRef<Set<string>>(new Set());

  const sortRows = (arr: EventWithVotes[]) =>
    arr.sort((a, b) => b.net - a.net || a.created_at.localeCompare(b.created_at));

  const loadAll = async () => {
    setLoading(true);
    try {
      const [events, myRole] = await Promise.all([fetchPartyEvents(partyId), fetchMyRole(partyId)]);
      setRole(myRole);
      idSetRef.current = new Set(events.map((e) => e.id));
      const ids = Array.from(idSetRef.current);
      const { counts, mine } = await fetchAggregates(ids);
      const merged: EventWithVotes[] = events.map((e) => {
        const c = counts.get(e.id) ?? { likes: 0, dislikes: 0 };
        const my = mine.get(e.id) ?? 0;
        return { ...e, likes: c.likes, dislikes: c.dislikes, net: c.likes - c.dislikes, myVote: my };
      });
      setRows(sortRows(merged));
    } finally {
      setLoading(false);
    }
  };

  const refreshVotes = async () => {
    const ids = Array.from(idSetRef.current);
    const { counts, mine } = await fetchAggregates(ids);
    setRows((prev) =>
      sortRows(
        prev.map((e) => {
          const c = counts.get(e.id) ?? { likes: 0, dislikes: 0 };
          const my = mine.get(e.id) ?? e.myVote;
          return { ...e, likes: c.likes, dislikes: c.dislikes, net: c.likes - c.dislikes, myVote: my };
        })
      )
    );
  };

  useEffect(() => {
    loadAll();
  }, [partyId]);

  // Realtime: events in this party → reload
  useEffect(() => {
    const channel = supabase
      .channel(`party-events-${partyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `party_id=eq.${partyId}` },
        () => loadAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  // Realtime: any vote change → if it's one of ours, refresh counts (debounced)
  useEffect(() => {
    const channel = supabase
      .channel(`party-votes-${partyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_votes" },
        (payload) => {
          const evId = (payload.new as any)?.event_id ?? (payload.old as any)?.event_id;
          if (!evId) return;
          if (idSetRef.current.has(evId)) {
            clearTimeout((refreshVotes as any)._t);
            (refreshVotes as any)._t = setTimeout(refreshVotes, 60);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  // optimistic vote
  async function handleVote(eventId: string, vote: -1 | 0 | 1) {
    setRows((prev) =>
      sortRows(
        prev.map((ev) => {
          if (ev.id !== eventId) return ev;
          let { likes, dislikes } = ev;
          if (ev.myVote === 1) likes -= 1;
          else if (ev.myVote === -1) dislikes -= 1;
          if (vote === 1) likes += 1;
          else if (vote === -1) dislikes += 1;
          return { ...ev, likes, dislikes, net: likes - dislikes, myVote: vote };
        })
      )
    );
    try {
      const { data: auth } = await supabase.auth.getUser();
      const profile_id = auth.user?.id;
      if (!profile_id) throw new Error("Not signed in");
      const { error } = await supabase
        .from("event_votes")
        .upsert({ event_id: eventId, profile_id, vote }, { onConflict: "event_id,profile_id" });
      if (error) throw error;
      // realtime will refresh for everyone
    } catch (e) {
      await refreshVotes();
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={{ padding: 18 }}>
        <ActivityIndicator />
        <Text style={{ color: P.textMuted, marginTop: 8 }}>Loading events…</Text>
      </View>
    );
  }

  if (!rows.length) {
    return (
      <View style={{ padding: 18, borderRadius: 12, borderWidth: 1, borderColor: P.glassBorder, backgroundColor: P.glass }}>
        <Text style={{ color: P.textMuted }}>
          No events yet. Add ideas from Discover and they’ll show up here for voting.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.text} />}
      contentContainerStyle={{ alignItems: "center", paddingBottom: 60 }}
    >
      <View style={{ width: containerW - 20, paddingHorizontal: 10, paddingTop: 10 }}>
        {rows.map((ev) => (
          <EventCardPrism key={ev.id} P={P} event={ev} onVote={handleVote} canEditTime={canEditTime} />
        ))}
      </View>
    </ScrollView>
  );
}
