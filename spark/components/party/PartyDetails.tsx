// components/party/PartyDetails.tsx
import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  FlatList,
  Platform,
  Dimensions,
  ActivityIndicator,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

/* ========= Local palette type + defaults ========= */
type LocalPalette = {
  name: string;
  bg: string;
  bg2: string;
  text: string;
  textMuted: string;
  glass: string;
  glassBorder: string;
  p1: string;
  p2: string;
};

export const DEFAULT_PALETTE: LocalPalette = {
  name: "Details",
  bg: "#0B0814",
  bg2: "#131827",
  text: "#ECF1FF",
  textMuted: "#B7C3DA",
  glass: "rgba(255,255,255,0.06)",
  glassBorder: "rgba(255,255,255,0.10)",
  p1: "#22D3EE",
  p2: "#A78BFA",
};

const fontHeavy = Platform.select({
  ios: "Avenir-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});
const fontSans = Platform.select({
  ios: "Avenir-Book",
  android: "sans-serif",
  default: "system-ui",
});

/* ========= Types for party members ========= */
type Role = "owner" | "admin" | "member";
type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};
type PartyMember = { user_id: string; role: Role; profile: Profile };

/* ========= Small helpers ========= */
const SectionTitle = ({
  P,
  icon,
  children,
}: {
  P: LocalPalette;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
    <Ionicons name={icon} size={16} color={P.textMuted} />
    <Text style={{ color: P.textMuted, fontFamily: fontSans, letterSpacing: 0.3 }}>{children}</Text>
  </View>
);

const PersonRow = ({
  P,
  pm,
  right,
}: {
  P: LocalPalette;
  pm: PartyMember;
  right?: React.ReactNode;
}) => {
  return (
    <View
      style={{
        height: 56,
        borderRadius: 14,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: P.glassBorder,
        backgroundColor: P.glass,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Image
          source={{ uri: pm.profile?.avatar_url || "https://placehold.co/80x80/png" }}
          style={{ width: 36, height: 36, borderRadius: 999, borderWidth: 1, borderColor: P.glassBorder }}
        />
        <View>
          <Text style={{ color: P.text, fontFamily: fontHeavy }} numberOfLines={1}>
            {pm.profile?.display_name || "User"}
          </Text>
          <Text style={{ color: P.textMuted, fontSize: 12 }}>{pm.role.toUpperCase()}</Text>
        </View>
      </View>
      {right}
    </View>
  );
};

/* ========= Search modal (invite / add admin) ========= */
function SearchUsersModal({
  P,
  visible,
  onClose,
  title,
  placeholder,
  onPick,
  excludeIds = [],
  asRole = "member",
}: {
  P: LocalPalette;
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  onPick: (user: Profile) => Promise<void>;
  excludeIds?: string[];
  asRole?: Role;
}) {
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Profile[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  const search = async () => {
    setLoading(true);
    setErr(null);
    try {
      // 🔧 FIX: no 'email' column in profiles -> select id, display_name, avatar_url only
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${q}%`);
      if (error) throw error;
      const filtered = (data || []).filter((p) => !excludeIds.includes(p.id));
      setItems(filtered);
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (visible) {
      setQ("");
      setItems([]);
      setErr(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ position: "absolute", inset: 0, justifyContent: "center", alignItems: "center", padding: 16 }}>
        <View
          style={{
            width: Math.min(Dimensions.get("window").width - 16, 700),
            maxHeight: Dimensions.get("window").height * 0.76,
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: P.glassBorder,
            backgroundColor: P.bg2,
          }}
        >
          {/* header */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: P.glassBorder,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: P.text, fontFamily: fontHeavy }}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={P.textMuted} />
            </TouchableOpacity>
          </View>

          {/* body */}
          <View style={{ padding: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: P.glassBorder,
                  backgroundColor: P.glass,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                }}
              >
                <Ionicons name="search" size={16} color={P.textMuted} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder={placeholder}
                  placeholderTextColor={P.textMuted}
                  style={{ flex: 1, color: P.text, paddingVertical: 8, fontFamily: fontSans, marginLeft: 6 }}
                />
              </View>
              <TouchableOpacity
                onPress={search}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: `${P.p1}AA`,
                  backgroundColor: `${P.p1}26`,
                }}
              >
                <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>Search</Text>
              </TouchableOpacity>
            </View>

            {err ? <Text style={{ color: "#ef4444", marginTop: 8 }}>{err}</Text> : null}
          </View>

          <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            {loading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(x) => x.id}
                renderItem={({ item }) => (
                  <View
                    style={{
                      height: 58,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: P.glassBorder,
                      backgroundColor: P.glass,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Image
                        source={{ uri: item.avatar_url || "https://placehold.co/80x80/png" }}
                        style={{ width: 36, height: 36, borderRadius: 999, borderWidth: 1, borderColor: P.glassBorder }}
                      />
                      <View>
                        <Text style={{ color: P.text, fontFamily: fontHeavy }}>
                          {item.display_name || "User"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => onPick(item)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: `${P.p2}AA`,
                        backgroundColor: `${P.p2}26`,
                      }}
                    >
                      <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>
                        {asRole === "admin" ? "Add as admin" : "Invite"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={{ paddingVertical: 18 }}>
                    <Text style={{ color: P.textMuted, textAlign: "center" }}>No results</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ========= Main ========= */
export default function PartyDetails({
  partyId,
  P: incomingTheme,
}: {
  partyId: string;
  P?: Partial<LocalPalette>;
}) {
  const P: LocalPalette = React.useMemo(
    () => ({ ...DEFAULT_PALETTE, ...(incomingTheme || {}) }),
    [incomingTheme]
  );

  const [myRole, setMyRole] = React.useState<Role>("member");
  const [members, setMembers] = React.useState<PartyMember[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [addAdminOpen, setAddAdminOpen] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;

      const { data, error } = await supabase
        .from("party_members")
        .select("user_id, role, profiles:user_id(id, display_name, avatar_url)")
        .eq("party_id", partyId)
        .order("role", { ascending: true });
      if (error) throw error;

      const mapped: PartyMember[] = (data || []).map((row: any) => ({
        user_id: row.user_id,
        role: row.role as Role,
        profile: {
          id: row.profiles?.id,
          display_name: row.profiles?.display_name,
          avatar_url: row.profiles?.avatar_url,
        },
      }));

      setMembers(mapped);
      if (uid) {
        const mine = mapped.find((m) => m.user_id === uid);
        if (mine) setMyRole(mine.role);
      }
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    const channel = supabase
      .channel(`pmembers:${partyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "party_members", filter: `party_id=eq.${partyId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  const owners = members.filter((m) => m.role === "owner");
  const admins = members.filter((m) => m.role === "admin");
  const regulars = members.filter((m) => m.role === "member");

  const canInvite = myRole === "owner" || myRole === "admin";
  const canAddAdmin = myRole === "owner";

  const inviteUser = async (user: Profile) => {
    await supabase.from("party_members").insert({
      party_id: partyId,
      user_id: user.id,
      role: "member",
    });
    setInviteOpen(false);
  };

  const addUserAsAdmin = async (user: Profile) => {
    const existing = members.find((m) => m.user_id === user.id);
    if (existing) {
      await supabase
        .from("party_members")
        .update({ role: "admin" })
        .eq("party_id", partyId)
        .eq("user_id", user.id);
    } else {
      await supabase
        .from("party_members")
        .insert({ party_id: partyId, user_id: user.id, role: "admin" });
    }
    setAddAdminOpen(false);
  };

  const promoteExisting = async (userId: string) => {
    await supabase
      .from("party_members")
      .update({ role: "admin" })
      .eq("party_id", partyId)
      .eq("user_id", userId);
  };

  const nonAdminMembers = members.filter((m) => m.role === "member");

  if (loading) {
    return (
      <View style={{ padding: 14 }}>
        <ActivityIndicator />
        <Text style={{ color: P.textMuted, marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 14 }}>
      {/* Owner */}
      <SectionTitle P={P} icon="person-circle">
        Owner
      </SectionTitle>
      {owners.length ? (
        owners.map((pm) => (
          <PersonRow
            key={pm.user_id}
            P={P}
            pm={pm}
            right={
              canAddAdmin ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setAddAdminOpen(true)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: `${P.p2}AA`,
                      backgroundColor: `${P.p2}26`,
                    }}
                  >
                    <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>Add admin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setInviteOpen(true)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: `${P.p1}AA`,
                      backgroundColor: `${P.p1}26`,
                    }}
                  >
                    <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>Invite member</Text>
                  </TouchableOpacity>
                </View>
              ) : undefined
            }
          />
        ))
      ) : (
        <Text style={{ color: P.textMuted }}>No owner listed.</Text>
      )}

      {/* Admins */}
      <View style={{ height: 10 }} />
      <SectionTitle P={P} icon="shield-checkmark">
        Admins
      </SectionTitle>
      {admins.length ? (
        admins.map((pm) => <PersonRow key={pm.user_id} P={P} pm={pm} />)
      ) : (
        <Text style={{ color: P.textMuted }}>No admins yet.</Text>
      )}

      {/* Members */}
      <View style={{ height: 10 }} />
      <SectionTitle P={P} icon="people">
        Members
      </SectionTitle>
      {regulars.length ? (
        regulars.map((pm) => <PersonRow key={pm.user_id} P={P} pm={pm} />)
      ) : (
        <Text style={{ color: P.textMuted }}>No members yet.</Text>
      )}

      {/* Admin-only Invite shortcut when not owner */}
      {canInvite && !canAddAdmin ? (
        <TouchableOpacity
          onPress={() => setInviteOpen(true)}
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${P.p1}AA`,
            backgroundColor: `${P.p1}26`,
          }}
        >
          <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>Invite member</Text>
        </TouchableOpacity>
      ) : null}

      {/* Owner convenience: promote existing members */}
      {canAddAdmin && nonAdminMembers.length ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: P.textMuted, marginBottom: 8 }}>Promote existing member</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={nonAdminMembers}
            keyExtractor={(x) => x.user_id}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => promoteExisting(item.user_id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: P.glassBorder,
                  backgroundColor: P.glass,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Image
                  source={{ uri: item.profile?.avatar_url || "https://placehold.co/80/png" }}
                  style={{ width: 22, height: 22, borderRadius: 999 }}
                />
                <Text style={{ color: P.text, fontFamily: fontSans }} numberOfLines={1}>
                  {item.profile?.display_name || "User"}
                </Text>
                <LinearGradient
                  colors={[`${P.p2}66`, `${P.p1}44`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ marginLeft: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}
                >
                  <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy, fontSize: 11 }}>
                    Promote
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {/* Modals */}
      <SearchUsersModal
        P={P}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite member"
        placeholder="Search by name…"
        onPick={inviteUser}
        excludeIds={members.map((m) => m.user_id)}
        asRole="member"
      />
      <SearchUsersModal
        P={P}
        visible={addAdminOpen}
        onClose={() => setAddAdminOpen(false)}
        title="Add admin"
        placeholder="Search by name…"
        onPick={addUserAsAdmin}
        excludeIds={[]}
        asRole="admin"
      />
    </View>
  );
}
