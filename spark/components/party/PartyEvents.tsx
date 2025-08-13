// components/party/PartyEvents.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, RefreshControl, Dimensions, Animated, Platform, ScrollView } from "react-native";
import EventCard from "@/components/ui/EventCardPrism";
import { fetchPartyEventsWithVotes, upsertEventVote, EventWithVotes } from "@/data/eventVotes";

type Palette = {
  name: string; bg: string; bg2: string; text: string; textMuted: string; glass: string; glassBorder: string;
  p1: string; p2: string; p3: string; p4: string;
};

export default function PartyEvents({
  partyId,
  P,
}:{
  partyId: string;
  P: Palette;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<EventWithVotes[]>([]);
  const containerW = Math.min(Dimensions.get("window").width, 860);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchPartyEventsWithVotes(partyId);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [partyId]);

  async function handleVote(eventId: string, vote: -1 | 0 | 1) {
    // optimistic update
    setRows(prev => prev.map(ev => {
      if (ev.id !== eventId) return ev;
      let likes = ev.likes;
      let dislikes = ev.dislikes;

      // remove previous myVote
      if (ev.myVote === 1) likes -= 1;
      else if (ev.myVote === -1) dislikes -= 1;

      // apply new vote
      if (vote === 1) likes += 1;
      else if (vote === -1) dislikes += 1;

      const net = likes - dislikes;
      return { ...ev, likes, dislikes, net, myVote: vote };
    }).sort((a, b) => b.net - a.net || a.created_at.localeCompare(b.created_at)));

    try {
      await upsertEventVote(eventId, vote);
    } catch (e) {
      console.warn("vote failed", e);
      // revert if failed
      await load();
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
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
        <Text style={{ color: P.textMuted }}>No events yet. Add ideas from Discover and they’ll show up here for voting.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.text} />}
      contentContainerStyle={{ alignItems: "center", paddingBottom: 60 }}
    >
      <View style={{ width: containerW - 20, paddingHorizontal: 10, paddingTop: 10 }}>
        {rows.map(ev => (
          <EventCard key={ev.id} P={P} event={ev} onVote={handleVote} />
        ))}
      </View>
    </ScrollView>
  );
}
