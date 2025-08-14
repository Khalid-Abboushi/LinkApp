// app/(tabs)/profile/index.tsx

import React from "react";
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  SafeAreaView,
  Platform,
  Pressable,
  Animated,
  Easing,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
} from "@/lib/friends";
import PartyInvitesPanel from "@/components/profile/PartyInvitesPanel";
import { uploadImageToPartyPics } from "@/data/uploadImage";

/* ======= Theme palettes (same as Parties) ======= */
type AppPalette = {
  name: string;
  appBg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
};
const PALETTES: AppPalette[] = [
  { name: "Luxe Neon", appBg: "#0E131B", surface: "#121826", surfaceAlt: "#192133", text: "#E8EEF8", textMuted: "#9FB1C7", border: "#273247", primary: "#3B82F6" },
  { name: "Electric Sunset", appBg: "#0F1016", surface: "#151826", surfaceAlt: "#1B2033", text: "#ECEAF6", textMuted: "#B7B5CC", border: "#282E45", primary: "#7C3AED" },
  { name: "Cyber Lime", appBg: "#0C1413", surface: "#111A19", surfaceAlt: "#162220", text: "#E6F5F2", textMuted: "#A6C9C1", border: "#22312E", primary: "#10B981" },
];

const MAX_W = 920;
const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-medium", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",        default: "system-ui" });

function usePress(scale = 0.98) {
  const v = React.useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.timing(v, { toValue: scale, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  const onPressOut = () => Animated.timing(v, { toValue: 1, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  return { style: { transform: [{ scale: v }] }, onPressIn, onPressOut };
}

/* ===== Storage (reuse your party-pics bucket for avatars) ===== */
const AVATAR_BUCKET = "party-pics";
const AVATAR_PREFIX = "avatars";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  notifications_enabled?: boolean | null;
  location_enabled?: boolean | null;
  eta_enabled?: boolean | null;
};

type PendingIncoming = {
  id: string;          // friendship row id
  from_id: string;     // requester id
  from_name?: string | null;
  from_avatar?: string | null;
};

type FriendTile = {
  row_id: string;              // friendship row id
  other_id: string;            // the other user's id
  other_name?: string | null;
  other_avatar?: string | null;
};

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [palIdx, setPalIdx] = React.useState(0);
  const P = PALETTES[palIdx % PALETTES.length];
  const containerW = Math.min(Dimensions.get("window").width, MAX_W);

  const [profile, setProfile] = React.useState<ProfileRow | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [avatarBust, setAvatarBust] = React.useState<number>(0);
  const [imgReady, setImgReady] = React.useState(false);

  // friends & requests
  const [friends, setFriends] = React.useState<FriendTile[]>([]);
  const [pendingIn, setPendingIn] = React.useState<PendingIncoming[]>([]);
  const [pendingOut, setPendingOut] = React.useState<Set<string>>(new Set()); // target user ids I sent requests to

  // tiny in-page toasts
  const [toasts, setToasts] = React.useState<{ id: string; title: string }[]>([]);

  const name =
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.username ||
    user?.email ||
    "User";

  /* ========= load profile ========= */
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, notifications_enabled, location_enabled, eta_enabled")
        .eq("id", user.id)
        .single();

      if (!cancelled) {
        if (error) {
          setProfile({ id: user.id, display_name: name, avatar_url: null } as ProfileRow);
        } else {
          setProfile(data as ProfileRow);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  /* ========= load friends snapshot ========= */
  const loadFriendsSnapshot = React.useCallback(async () => {
    if (!user?.id) return;

    // accepted friendships containing me
    const { data: fr, error: errF } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, requested_by, status")
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq("status", "accepted");

    if (!errF) {
      const otherIds = (fr ?? []).map(r => (r.user_id === user.id ? r.friend_id : r.user_id));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);

      const profMap = new Map((profs ?? []).map(p => [p.id, p]));
      setFriends(
        (fr ?? []).map(r => {
          const other = r.user_id === user.id ? r.friend_id : r.user_id;
          const prof = profMap.get(other);
          return {
            row_id: r.id,
            other_id: other,
            other_name: prof?.display_name ?? null,
            other_avatar: prof?.avatar_url ?? null,
          } as FriendTile;
        })
      );
    }

    // pending incoming (to me)
    const { data: pin } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, requested_by, status")
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq("status", "pending")
      .neq("requested_by", user.id);

    const requesterIds = (pin ?? []).map(r => r.requested_by);
    const { data: reqProfs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", requesterIds.length ? requesterIds : ["00000000-0000-0000-0000-000000000000"]);
    const reqMap = new Map((reqProfs ?? []).map(p => [p.id, p]));
    setPendingIn(
      (pin ?? []).map(r => ({
        id: r.id,
        from_id: r.requested_by,
        from_name: reqMap.get(r.requested_by)?.display_name ?? null,
        from_avatar: reqMap.get(r.requested_by)?.avatar_url ?? null,
      }))
    );

    // pending outgoing (I sent)
    const { data: pout } = await supabase
      .from("friendships")
      .select("user_id, friend_id, requested_by, status")
      .eq("requested_by", user.id)
      .eq("status", "pending");
    setPendingOut(new Set((pout ?? []).map(r => (r.user_id === user.id ? r.friend_id : r.user_id))));
  }, [user?.id]);

  React.useEffect(() => {
    loadFriendsSnapshot();
  }, [loadFriendsSnapshot]);

  /* ========= realtime: friendships table (both sides) ========= */
  React.useEffect(() => {
    if (!user?.id) return;

    const ch = supabase
      .channel(`friends:live:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (row?.status === "accepted") {
            setToasts((prev) => [{ id: `t:${Date.now()}`, title: "New friend 🎉" }, ...prev].slice(0, 3));
          }
          loadFriendsSnapshot();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `friend_id=eq.${user.id}` },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (row?.status === "accepted") {
            setToasts((prev) => [{ id: `t:${Date.now()}`, title: "New friend 🎉" }, ...prev].slice(0, 3));
          }
          loadFriendsSnapshot();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id, loadFriendsSnapshot]);

  /* ========= settings helpers ========= */
  const updateField = async (patch: Partial<ProfileRow>) => {
    if (!profile) return;
    setProfile({ ...profile, ...patch });
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
      if (error) Alert.alert("Update error", error.message);
    } finally {
      setSaving(false);
    }
  };

  /* ========= avatar upload ========= */
  const changeAvatar = async () => {
    if (!user?.id) return;
    
    // Ask for photos permission
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    
    // Let user pick & crop to square
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;
  
    setSaving(true);
    try {
      const a = res.assets[0];
    
      // ✅ Mobile-safe upload (re-encodes to real JPEG and uploads as ArrayBuffer)
      const url = await uploadImageToPartyPics({
        uri: a.uri,
        name: (a as any).name ?? (a as any).fileName ?? null,
        fileName: (a as any).fileName ?? null,
        type: (a as any).type ?? null,
        mimeType: (a as any).mimeType ?? null,
      });
    
      // Save on profile and refresh the <Image>
      await updateField({ avatar_url: url });
      setAvatarBust(Date.now()); // cache-bust
      setImgReady(false);
    } catch (e: any) {
      console.log("avatar upload error:", e?.message || e);
      Alert.alert("Upload error", e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  /* ========= simple subcomponents ========= */

  const ToastRow = ({ text }: { text: string }) => (
    <View style={{ alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.03)", borderColor: P.border, borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}>
      <Text style={{ color: P.text, fontFamily: fontHeavy }}>{text}</Text>
    </View>
  );

  const RequestRow = ({ r }: { r: PendingIncoming }) => (
    <View style={{ alignSelf: "stretch", borderWidth: 1, borderColor: P.border, borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.03)", flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Image source={{ uri: r.from_avatar || "https://placehold.co/80x80/png" }} style={{ width: 36, height: 36, borderRadius: 999, borderWidth: 1, borderColor: P.border }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: P.text, fontFamily: fontHeavy }}>{r.from_name || "User"}</Text>
      </View>
      <Pressable
        onPress={async () => {
          await acceptFriendRequest(r.id);
          setPendingIn(prev => prev.filter(x => x.id !== r.id));
        }}
        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: P.primary, marginRight: 6 }}
      >
        <Text style={{ color: P.text, fontFamily: fontHeavy }}>Accept</Text>
      </Pressable>
      <Pressable
        onPress={async () => {
          await declineFriendRequest(r.id);
          setPendingIn(prev => prev.filter(x => x.id !== r.id));
        }}
        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: P.border }}
      >
        <Text style={{ color: P.text, fontFamily: fontHeavy }}>Decline</Text>
      </Pressable>
    </View>
  );

  const FriendRow = ({ f }: { f: FriendTile }) => (
    <View style={{ alignSelf: "stretch", borderWidth: 1, borderColor: P.border, borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.03)", flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Image source={{ uri: f.other_avatar || "https://placehold.co/80x80/png" }} style={{ width: 36, height: 36, borderRadius: 999, borderWidth: 1, borderColor: P.border }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: P.text, fontFamily: fontHeavy }}>{f.other_name || "Friend"}</Text>
      </View>
    </View>
  );

  const FriendFinder = () => {
    const [q, setQ] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [rows, setRows] = React.useState<Array<{ id: string; display_name: string | null; avatar_url: string | null }>>([]);

    const friendsSet = React.useMemo(() => new Set(friends.map(f => f.other_id)), [friends]);

    const search = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const qb = supabase.from("profiles").select("id, display_name, avatar_url").limit(12);
        if (q.trim()) qb.ilike("display_name", `%${q.trim()}%`);
        const { data, error } = await qb;
        if (error) throw error;
        setRows((data || []).filter(p => p.id !== user.id));
      } catch (e:any) {
        Alert.alert("Search error", e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };

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
          <Pressable onPress={search} style={{ paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: P.primary, justifyContent: "center" }}>
            <Text style={{ color: P.text, fontFamily: fontHeavy }}>Search</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator />
        ) : (
          rows.map((u) => {
            const alreadyFriend = friendsSet.has(u.id);
            const alreadySent = pendingOut.has(u.id);
            return (
              <View key={u.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 8, marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Image source={{ uri: u.avatar_url || "https://placehold.co/80x80/png" }} style={{ width: 32, height: 32, borderRadius: 999 }} />
                  <Text style={{ color: P.text, fontFamily: fontHeavy }}>{u.display_name || "User"}</Text>
                </View>
                {alreadyFriend ? (
                  <Text style={{ color: P.textMuted, fontFamily: fontHeavy }}>Friend</Text>
                ) : alreadySent ? (
                  <Text style={{ color: P.textMuted, fontFamily: fontHeavy }}>Already sent</Text>
                ) : (
                  <Pressable
                    onPress={async () => {
                      // optimistic mark as sent
                      setPendingOut(prev => new Set(prev).add(u.id));
                      try {
                        await sendFriendRequest(u.id);
                      } catch (e:any) {
                        // rollback on error
                        const copy = new Set(pendingOut);
                        copy.delete(u.id);
                        setPendingOut(copy);
                        Alert.alert("Request error", e?.message || String(e));
                      }
                    }}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: P.primary }}
                  >
                    <Text style={{ color: P.text, fontFamily: fontHeavy }}>Add</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>
    );
  };

  /* ========= render ========= */

  const avatarSrc = profile?.avatar_url ? `${profile.avatar_url}${avatarBust ? `?v=${avatarBust}` : ""}` : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: P.appBg }}>
      {/* Header */}
      <View style={{ alignItems: "center" }}>
        <View style={{ width: containerW, paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 6 : 10, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: P.text, fontSize: 22, fontWeight: "800", flex: 1 }}>Profile</Text>
          <Pressable
            onPress={() => setPalIdx((i) => (i + 1) % PALETTES.length)}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: P.border, backgroundColor: P.surfaceAlt }}
          >
            <Text style={{ color: P.text, fontSize: 12 }}>{PALETTES[(palIdx + 1) % PALETTES.length].name}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 120, paddingTop: 28 }}>
        <View style={{ width: containerW, paddingHorizontal: 16 }}>
          {/* Profile card */}
          <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 16, alignSelf: "stretch", marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <View style={{ width: 84, height: 84, borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: P.border, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" }}>
                {!imgReady && <Ionicons name="person" size={36} color={P.textMuted} />}
                {avatarSrc ? (
                  <Image
                    source={{ uri: avatarSrc }}
                    style={{ width: 84, height: 84, position: "absolute", left: 0, top: 0, opacity: imgReady ? 1 : 0 }}
                    onLoad={() => setImgReady(true)}
                    onError={() => setImgReady(true)}
                  />
                ) : null}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ color: P.text, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
                    {profile?.display_name || name}
                  </Text>
                  <Pressable onPress={changeAvatar} style={{ paddingVertical: 4 }}>
                    <Text style={{ color: P.primary, fontFamily: fontHeavy, fontSize: 12, textDecorationLine: "underline" }}>
                      Upload avatar
                    </Text>
                  </Pressable>
                </View>

                <Text style={{ color: P.textMuted }} numberOfLines={1}>{user?.email}</Text>

                <View style={{ marginTop: 10 }}>
                  <Pressable
                    onPress={async () => { await signOut(); router.replace("/"); }}
                    style={{ height: 32, paddingHorizontal: 14, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#B91C1C", borderWidth: 1, borderColor: "#DC2626", alignSelf: "flex-start" }}
                  >
                    <Text style={{ color: "#fff", fontFamily: fontHeavy, fontSize: 12 }}>Sign out</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {/* Toasts (short) */}
          {toasts.length > 0 && (
            <View style={{ marginTop: 18 }}>
              {toasts.map(t => <ToastRow key={t.id} text={t.title} />)}
            </View>
          )}

          {/* Friend requests */}
          <View style={{ height: 18 }} />
          <Text style={{ color: P.text, fontWeight: "800", marginBottom: 8 }}>Friend requests</Text>
          <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 16, alignSelf: "stretch" }}>
            {pendingIn.length === 0 ? (
              <Text style={{ color: P.textMuted }}>No requests right now.</Text>
            ) : (
              pendingIn.map(r => <RequestRow key={r.id} r={r} />)
            )}
          </View>

          {/* Friends */}
          <View style={{ height: 18 }} />
          <Text style={{ color: P.text, fontWeight: "800", marginBottom: 8 }}>Friends</Text>
          <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 16, alignSelf: "stretch" }}>
            {friends.length === 0 ? (
              <Text style={{ color: P.textMuted }}>You have no friends yet.</Text>
            ) : (
              friends.map(f => <FriendRow key={f.row_id} f={f} />)
            )}
          </View>

          {/* Add friends (search + request) */}
          <View style={{ height: 18 }} />
          <FriendFinder />

          {/* Party invites */}
          <View style={{ height: 18 }} />
          <Text style={{ color: P.text, fontWeight: "800", marginBottom: 8 }}>Party invites</Text>
          <PartyInvitesPanel
            P={{
              surface: P.surface,
              text: P.text,
              textMuted: P.textMuted,
              border: P.border,
              primary: P.primary,
            }}
          />

          {/* Settings */}
          <View style={{ height: 18 }} />
          <Text style={{ color: P.text, fontWeight: "800", marginBottom: 8 }}>Settings</Text>
          <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 16, alignSelf: "stretch" }}>
            <Toggle
              P={P}
              label="Notifications"
              value={!!profile?.notifications_enabled}
              onChange={(v) => updateField({ notifications_enabled: v })}
            />
            <View style={{ height: 4 }} />
            <Toggle
              P={P}
              label="Location"
              desc="Only your friends will be able to see your location."
              value={!!profile?.location_enabled}
              onChange={(v) => updateField({ location_enabled: v })}
            />
            <View style={{ height: 4 }} />
            <Toggle
              P={P}
              label="ETA tracker"
              desc="Only your friends will see your ETA during events (estimated time of arrival)."
              value={!!profile?.eta_enabled}
              onChange={(v) => updateField({ eta_enabled: v })}
            />
          </View>

          {saving ? <Text style={{ color: P.textMuted, marginTop: 8 }}>Saving…</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===== toggle component ===== */
function Toggle({
  value, onChange, label, desc, P,
}: {
  value: boolean; onChange: (v:boolean)=>void; label: string; desc?: string; P: AppPalette;
}) {
  const press = usePress(0.96);
  return (
    <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingVertical:10 }}>
      <View style={{ flex:1, paddingRight:12 }}>
        <Text style={{ color: P.text, fontFamily: fontHeavy }}>{label}</Text>
        {desc ? <Text style={{ color: P.textMuted, fontSize: 12, marginTop: 2 }}>{desc}</Text> : null}
      </View>
      <Animated.View style={[press.style]}>
        <Pressable
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={() => onChange(!value)}
          style={{
            width: 48, height: 28, borderRadius: 999, borderWidth: 1,
            borderColor: P.border, backgroundColor: value ? P.primary : "transparent",
            alignItems: value ? "flex-end" : "flex-start", justifyContent: "center", paddingHorizontal: 4,
          }}
        >
          <View style={{ width: 20, height: 20, borderRadius: 999, backgroundColor: value ? "#ffffff" : P.textMuted }} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
