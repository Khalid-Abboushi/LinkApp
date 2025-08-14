// components/profile/FriendFinder.tsx
import React from "react";
import { View, Text, TextInput, Pressable, Image, ActivityIndicator, Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { sendFriendRequest } from "@/lib/friends";
import type { ProfileBrief } from "@/lib/friends";

const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-medium", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",        default: "system-ui" });

export default function FriendFinder({
  P,
  friendsSet,
  pendingOut,
  onSent, // optimistic: (userId) => void
}: {
  P: { surface: string; text: string; textMuted: string; border: string; primary: string };
  friendsSet: Set<string>;
  pendingOut: Set<string>;
  onSent: (userId: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<ProfileBrief[]>([]);
  const [me, setMe] = React.useState<string | null>(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  async function search() {
    setLoading(true);
    try {
      const qb = supabase.from("profiles").select("id, display_name, avatar_url").limit(12);
      if (q.trim()) qb.ilike("display_name", `%${q.trim()}%`);
      const { data, error } = await qb;
      if (error) throw error;
      setRows((data || []).filter((p) => p.id !== me) as ProfileBrief[]);
    } finally {
      setLoading(false);
    }
  }

  async function request(uid: string) {
    await sendFriendRequest(uid);
    onSent(uid); // optimistic: mark as sent immediately
  }

  return (
    <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 14 }}>
      <Text style={{ color: P.text, fontFamily: fontHeavy, marginBottom: 8 }}>Add friends</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1, borderWidth: 1, borderColor: P.border, borderRadius: 8, paddingHorizontal: 10 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by name…"
            placeholderTextColor={P.textMuted}
            style={{ color: P.text, paddingVertical: 8, fontFamily: fontSans }}
          />
        </View>
        <Pressable onPress={search} style={{ paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: P.primary }}>
          <Text style={{ color: P.text, fontFamily: fontHeavy, paddingVertical: 8 }}>Search</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator />
      ) : (
        rows.map((u) => {
          const isFriend = friendsSet.has(u.id);
          const isSent = pendingOut.has(u.id);
          return (
            <View
              key={u.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: P.border,
                borderRadius: 10,
                padding: 8,
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Image source={{ uri: u.avatar_url || "https://placehold.co/80x80/png" }} style={{ width: 32, height: 32, borderRadius: 999 }} />
                <Text style={{ color: P.text, fontFamily: fontHeavy }}>{u.display_name || "User"}</Text>
              </View>

              {isFriend ? (
                <Text style={{ color: P.textMuted, fontFamily: fontHeavy }}>Friends ✓</Text>
              ) : isSent ? (
                <Text style={{ color: P.textMuted, fontFamily: fontHeavy }}>Sent</Text>
              ) : (
                <Pressable onPress={() => request(u.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: P.primary }}>
                  <Text style={{ color: P.text, fontFamily: fontHeavy }}>Add</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}
