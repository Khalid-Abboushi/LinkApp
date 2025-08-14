// components/profile/FriendsList.tsx
import React from "react";
import { View, Text, Image, ActivityIndicator, Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-medium", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",        default: "system-ui" });

type PColors = { surface: string; surfaceAlt?: string; text: string; textMuted: string; border: string; primary: string };
type ProfileMini = { id: string; display_name: string | null; avatar_url: string | null };

export default function FriendsList({ P }: { P: PColors }) {
  const [loading, setLoading] = React.useState(true);
  const [friends, setFriends] = React.useState<ProfileMini[]>([]);
  const cacheRef = React.useRef<Map<string, ProfileMini>>(new Map());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      const uid = me.user?.id;
      if (!uid) { setFriends([]); return; }

      // Get accepted friendships involving me
      const { data, error } = await supabase
        .from("friendships")
        .select("id, user_id, friend_id, status, updated_at")
        .eq("status", "accepted")
        .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const otherIds = Array.from(
        new Set(
          (data ?? []).map((r: any) => (r.user_id === uid ? r.friend_id : r.user_id))
        )
      );

      if (otherIds.length === 0) { setFriends([]); return; }

      // Fetch profiles for those users (use cache to minimize queries)
      const idsToFetch = otherIds.filter((id) => !cacheRef.current.has(id));
      if (idsToFetch.length) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", idsToFetch);
        if (pErr) throw pErr;
        for (const p of profs ?? []) cacheRef.current.set(p.id, p as ProfileMini);
      }

      const list: ProfileMini[] = otherIds
        .map((id) => cacheRef.current.get(id))
        .filter(Boolean) as ProfileMini[];

      setFriends(list);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      await load();
      if (cancel) return;

      const { data: me } = await supabase.auth.getUser();
      const uid = me.user?.id;
      if (!uid) return;

      // Subscribe to friendship changes involving me -> update list live
      const ch = supabase
        .channel(`friends:list:${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "friendships", filter: `user_id=eq.${uid}` },
          () => load()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "friendships", filter: `friend_id=eq.${uid}` },
          () => load()
        )
        .subscribe();

      return () => supabase.removeChannel(ch);
    })();
    return () => { cancel = true; };
  }, [load]);

  return (
    <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 16, alignSelf: "stretch" }}>
      <Text style={{ color: P.text, fontFamily: fontHeavy, marginBottom: 8 }}>Friends</Text>

      {loading ? (
        <View style={{ paddingVertical: 12, alignItems: "center" }}>
          <ActivityIndicator />
        </View>
      ) : friends.length === 0 ? (
        <Text style={{ color: P.textMuted, fontFamily: fontSans }}>You don’t have any friends yet.</Text>
      ) : (
        friends.map((f) => (
          <View key={f.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 8, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.03)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Image source={{ uri: f.avatar_url || "https://placehold.co/64x64/png" }} style={{ width: 32, height: 32, borderRadius: 999, borderWidth: 1, borderColor: P.border }} />
              <Text style={{ color: P.text, fontFamily: fontHeavy }}>{f.display_name || "User"}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
