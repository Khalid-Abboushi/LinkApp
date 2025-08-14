// components/party/PartyDetails.tsx
import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  Dimensions,
  ActivityIndicator,
  Platform,
  FlatList,
  ScrollView,
  Animated,
  Easing,
  Pressable,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { sendPartyInvite } from "@/lib/partyInvites";

/* ======================================================================
   Palette
   ====================================================================== */

export type AppPalette = {
  name: string;
  appBg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
};

type LocalPalette = {
  name: string;
  bg: string; bg2: string; text: string; textMuted: string;
  glass: string; glassBorder: string; p1: string; warn: string;
  chip: string; chipBorder: string;
};

const fromApp = (A?: AppPalette): LocalPalette => {
  if (!A) {
    return {
      name: "Details",
      bg: "#0C111B",
      bg2: "#121826",
      text: "#E8EEFA",
      textMuted: "#A7B1C4",
      glass: "rgba(255,255,255,0.03)",
      glassBorder: "rgba(255,255,255,0.08)",
      p1: "#3B82F6",
      warn: "#F5A524",
      chip: "rgba(255,255,255,0.04)",
      chipBorder: "rgba(255,255,255,0.10)",
    };
  }
  return {
    name: A.name,
    bg: A.surface,
    bg2: A.surfaceAlt,
    text: A.text,
    textMuted: A.textMuted,
    glass: "rgba(255,255,255,0.03)",
    glassBorder: A.border,
    p1: A.primary,
    warn: "#F5A524",
    chip: "rgba(255,255,255,0.04)",
    chipBorder: "rgba(255,255,255,0.10)",
  };
};

const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-medium", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",        default: "system-ui" });

/* ============ Tiny helpers ============ */
function usePressScale(scaleTo = 0.99) {
  const anim = React.useRef(new Animated.Value(1)).current;
  const onPressIn = React.useCallback(() => {
    Animated.timing(anim, { toValue: scaleTo, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [anim, scaleTo]);
  const onPressOut = React.useCallback(() => {
    Animated.timing(anim, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [anim]);
  return { style: { transform: [{ scale: anim }] }, onPressIn, onPressOut };
}
const Hairline = ({ color }: { color: string }) => <View style={{ height: 1, backgroundColor: color }} />;

/* ================= Types ================= */
type Role = "owner" | "admin" | "member";
type Profile = { id: string; display_name: string | null; avatar_url: string | null; };
type PartyMember = { user_id: string; role: Role; profile: Profile };

/* ===== UI bits ===== */

const SectionTitle = ({ P, title }: { P: LocalPalette; title: string }) => (
  <View style={{ marginTop: 10 }}>
    <View style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: P.bg2 }}>
      <Text style={{ color: P.textMuted, fontFamily: fontSans, fontSize: 12, letterSpacing: 0.3 }}>{title}</Text>
    </View>
    <Hairline color={P.glassBorder} />
  </View>
);

const ThinButton = ({
  P,
  label,
  onPress,
  tone = "neutral",
  disabled = false,
}: {
  P: LocalPalette;
  label: string;
  onPress?: () => void;
  tone?: "neutral" | "primary" | "warn";
  disabled?: boolean;
}) => {
  const colors: Record<string, { border: string; bg: string; text: string; opacity?: number }> = {
    neutral: { border: P.glassBorder, bg: "transparent", text: P.text, opacity: 0.9 },
    primary: { border: `${P.p1}66`, bg: "transparent", text: P.text, opacity: 1 },
    warn:    { border: `${P.warn}80`, bg: "transparent", text: P.text, opacity: 1 },
  };
  const c = colors[tone];
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={{
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : c.opacity ?? 1,
      }}
    >
      <Text style={{ color: c.text, fontFamily: fontHeavy, fontSize: 12, letterSpacing: 0.2 }}>{label}</Text>
    </TouchableOpacity>
  );
};

const MemberRow = ({
  P,
  meIsOwner,
  item,
  onPromote,
  onDemote,
}: {
  P: LocalPalette;
  meIsOwner: boolean;
  item: PartyMember;
  onPromote: (id: string) => Promise<void>;
  onDemote: (id: string) => Promise<void>;
}) => {
  const roleColor =
    item.role === "owner" ? P.warn :
    item.role === "admin" ? P.p1 : P.textMuted;

  const pressAnim = usePressScale(0.997);

  return (
    <Animated.View
      style={[
        {
          marginHorizontal: 12,
          marginVertical: 6,
          borderWidth: 1,
          borderColor: P.glassBorder,
          backgroundColor: P.glass,
          borderRadius: 10,
          paddingVertical: 8,
          paddingHorizontal: 10,
        },
        pressAnim.style,
      ]}
    >
      <Pressable onPressIn={pressAnim.onPressIn} onPressOut={pressAnim.onPressOut} style={{ flexDirection: "row", alignItems: "center" }}>
        <Image
          source={{ uri: item.profile?.avatar_url || "https://placehold.co/80x80/png" }}
          style={{ width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: P.glassBorder, backgroundColor: "#e5e7eb" }}
        />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
          <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 14 }} numberOfLines={1}>
            {item.profile?.display_name || "User"}
          </Text>
          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 5,
              marginTop: 4,
              backgroundColor: P.chip,
              borderWidth: 1,
              borderColor: P.chipBorder,
            }}
          >
            <Text style={{ color: roleColor, fontSize: 10, letterSpacing: 0.2 }}>{item.role.toUpperCase()}</Text>
          </View>
        </View>

        {meIsOwner && item.role !== "owner" ? (
          item.role === "member" ? (
            <ThinButton P={P} label="Promote" onPress={() => onPromote(item.user_id)} tone="primary" />
          ) : (
            <ThinButton P={P} label="Demote" onPress={() => onDemote(item.user_id)} tone="primary" />
          )
        ) : null}
      </Pressable>
    </Animated.View>
  );
};

/** Rectangular segmented control */
function SegmentedBar({
  P,
  value,
  onChange,
}: {
  P: LocalPalette;
  value: "all" | "owners" | "admins" | "members";
  onChange: (v: "all" | "owners" | "admins" | "members") => void;
}) {
  const Tab = (id: "all" | "owners" | "admins" | "members", label: string, showDivider?: boolean) => {
    const active = value === id;
    const press = usePressScale(0.98);

    return (
      <View style={{ flex: 1, flexDirection: "row", alignItems: "stretch" }}>
        <Animated.View style={[{ flex: 1 }, press.style]}>
          <Pressable
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            onPress={() => onChange(id)}
            style={{
              flex: 1,
              height: 34,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? "rgba(255,255,255,0.03)" : "transparent",
            }}
          >
            <Text
              style={{
                color: active ? P.text : P.textMuted,
                fontFamily: active ? fontHeavy : fontSans,
                fontSize: 12,
                letterSpacing: 0.2,
              }}
            >
              {label}
            </Text>
            <View style={{ height: 1, width: "52%", marginTop: 7, backgroundColor: active ? P.p1 : "transparent" }} />
          </Pressable>
        </Animated.View>
        {showDivider ? <View style={{ width: 1, backgroundColor: P.glassBorder }} /> : null}
      </View>
    );
  };

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
      <View
        style={{
          flexDirection: "row",
          borderRadius: 10,
          borderWidth: 1,
          borderColor: P.glassBorder,
          backgroundColor: P.glass,
          overflow: "hidden",
        }}
      >
        {Tab("all", "All", true)}
        {Tab("owners", "Owner", true)}
        {Tab("admins", "Admins", true)}
        {Tab("members", "Members", false)}
      </View>
    </View>
  );
}

/* =============== Search modal (uses FlatList) =============== */
function SearchUsersModal({
  P,
  visible,
  onClose,
  title,
  placeholder,
  onInvite,
  excludeIds = [],
  asRole = "member",
  invitedSet,
}: {
  P: LocalPalette;
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  onInvite: (user: Profile) => Promise<void>;
  excludeIds?: string[];
  asRole?: Role;
  invitedSet?: Set<string>;
}) {
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Profile[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  const search = async () => {
    setLoading(true);
    setErr(null);
    try {
      const qb = supabase.from("profiles").select("id, display_name, avatar_url");
      if (q.trim()) qb.ilike("display_name", `%${q.trim()}%`);
      const { data, error } = await qb;
      if (error) throw error;
      setItems((data || []).filter((p) => !excludeIds.includes(p.id)));
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (visible) { setQ(""); setItems([]); setErr(null); }
  }, [visible]);

  const EmptyState = () => (
    <View style={{ alignItems: "center", paddingVertical: 12 }}>
      <Text style={{ color: P.textMuted, fontFamily: fontSans, fontSize: 12 }}>No results yet. Try searching.</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ position: "absolute", inset: 0, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View
          style={{
            width: Math.min(Dimensions.get("window").width - 16, 720),
            maxHeight: Dimensions.get("window").height * 0.78,
            borderRadius: 14,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: P.glassBorder,
            backgroundColor: P.bg2,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderColor: P.glassBorder,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 13 }}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ color: P.textMuted, fontFamily: fontHeavy }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: P.glassBorder,
                  backgroundColor: P.glass,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                }}
              >
                <Text style={{ color: P.textMuted, fontSize: 12 }}>🔎</Text>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder={placeholder}
                  placeholderTextColor={P.textMuted}
                  style={{ flex: 1, color: P.text, paddingVertical: 6, fontFamily: fontSans, marginLeft: 6, fontSize: 13 }}
                />
              </View>
              <ThinButton P={P} label="Search" onPress={search} tone="primary" />
            </View>
            {err ? <Text style={{ color: "#ef4444", marginTop: 8 }}>{err}</Text> : null}
          </View>

          {loading ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(x) => x.id}
              ListEmptyComponent={<EmptyState />}
              renderItem={({ item }) => {
                const alreadyInvited = invitedSet?.has(item.id) ?? false;
                return (
                  <View
                    style={{
                      height: 54,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: P.glassBorder,
                      backgroundColor: P.glass,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 10,
                      marginHorizontal: 12,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Image
                        source={{ uri: item.avatar_url || "https://placehold.co/80x80/png" }}
                        style={{ width: 32, height: 32, borderRadius: 999, borderWidth: 1, borderColor: P.glassBorder }}
                      />
                      <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 13 }}>{item.display_name || "User"}</Text>
                    </View>
                    <ThinButton
                      P={P}
                      label={alreadyInvited ? "Invited" : asRole === "admin" ? "Invite admin" : "Invite"}
                      onPress={alreadyInvited ? undefined : () => onInvite(item)}
                      tone="primary"
                      disabled={alreadyInvited}
                    />
                  </View>
                );
              }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 12 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ====================== Main ====================== */
export default function PartyDetails({
  partyId,
  appPalette,
}: {
  partyId: string;
  appPalette?: AppPalette;
}) {
  const P: LocalPalette = React.useMemo(() => fromApp(appPalette), [appPalette]);

  const [myRole, setMyRole] = React.useState<Role>("member");
  const [members, setMembers] = React.useState<PartyMember[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [addAdminOpen, setAddAdminOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"all" | "owners" | "admins" | "members">("all");

  const uidRef = React.useRef<string | null>(null);
  const firstLoadDone = React.useRef(false);

  // Track pending invites for this party -> show "Invited" in the picker
  const [pendingInvitees, setPendingInvitees] = React.useState<Set<string>>(new Set());

  // cache to hydrate profiles for realtime INSERTs
  const profileCacheRef = React.useRef<Map<string, Profile | "loading">>(new Map());
  const ensureProfile = React.useCallback(async (userId: string): Promise<Profile | null> => {
    const cache = profileCacheRef.current;
    const cached = cache.get(userId);
    if (cached && cached !== "loading") return cached;
    if (cached === "loading") return null;

    cache.set(userId, "loading");
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", userId)
      .single();

    if (error || !data) {
      cache.delete(userId);
      return null;
    }
    const prof: Profile = {
      id: data.id,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
    };
    cache.set(userId, prof);
    return prof;
  }, []);

  /** One-time load */
  const loadInitial = React.useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;
      uidRef.current = uid;

      // Party members
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

      // Pending invites for this party (any inviter) → mark invited IDs
      const { data: inv } = await supabase
        .from("party_invites")
        .select("invitee_id")
        .eq("party_id", partyId)
        .eq("status", "pending");
      setPendingInvitees(new Set((inv ?? []).map(i => i.invitee_id)));
    } finally {
      setLoading(false);
      firstLoadDone.current = true;
    }
  }, [partyId]);

  React.useEffect(() => {
    loadInitial();

    // Realtime: members list (acceptance will insert rows here)
    const channelMembers = supabase
      .channel(`pmembers:${partyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "party_members", filter: `party_id=eq.${partyId}` },
        async (payload: any) => {
          if (!firstLoadDone.current) return;

          if (payload.eventType === "INSERT") {
            const row = payload.new;
            // insert (hydrate profile async)
            setMembers(prev => {
              if (prev.find(m => m.user_id === row.user_id)) return prev;
              return [
                ...prev,
                { user_id: row.user_id, role: row.role as Role, profile: { id: row.user_id, display_name: null, avatar_url: null } },
              ];
            });
            const prof = await ensureProfile(row.user_id);
            if (prof) setMembers(prev => prev.map(m => (m.user_id === row.user_id ? { ...m, profile: prof } : m)));
            // once accepted, this invite should be gone; a separate realtime below removes it
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new;
            setMembers(prev => prev.map(m => (m.user_id === row.user_id ? { ...m, role: row.role as Role } : m)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old;
            setMembers(prev => prev.filter(m => m.user_id !== row.user_id));
          }

          // stable sort
          setMembers(prev => {
            const next = [...prev];
            const roleRank: Record<Role, number> = { owner: 0, admin: 1, member: 2 };
            next.sort((a, b) => {
              const r = roleRank[a.role] - roleRank[b.role];
              if (r !== 0) return r;
              const an = (a.profile?.display_name || "").toLowerCase();
              const bn = (b.profile?.display_name || "").toLowerCase();
              return an.localeCompare(bn);
            });
            if (uidRef.current) {
              const mine = next.find(m => m.user_id === uidRef.current);
              if (mine) setMyRole(mine.role);
            }
            return next;
          });
        }
      )
      .subscribe();

    // Realtime: invites for this party (to keep "Invited" badges live)
    const channelInvites = supabase
      .channel(`pinvites:${partyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "party_invites", filter: `party_id=eq.${partyId}` },
        (payload: any) => {
          const inv = payload.new;
          if (inv?.status === "pending") {
            setPendingInvitees(prev => new Set(prev).add(inv.invitee_id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "party_invites", filter: `party_id=eq.${partyId}` },
        (payload: any) => {
          const inv = payload.old;
          if (inv?.invitee_id) {
            setPendingInvitees(prev => {
              const n = new Set(prev);
              n.delete(inv.invitee_id);
              return n;
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "party_invites", filter: `party_id=eq.${partyId}` },
        (payload: any) => {
          const inv = payload.new;
          // if status changed out of pending, remove from local set
          if (inv?.status !== "pending") {
            setPendingInvitees(prev => {
              const n = new Set(prev);
              n.delete(inv.invitee_id);
              return n;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelMembers);
      supabase.removeChannel(channelInvites);
    };
  }, [partyId, loadInitial, ensureProfile]);

  const owners   = members.filter((m) => m.role === "owner");
  const admins   = members.filter((m) => m.role === "admin");
  const regulars = members.filter((m) => m.role === "member");

  const meIsOwner = myRole === "owner";
  const canInvite = myRole === "owner" || myRole === "admin";

  /* ---- Invite actions (now create party_invites instead of mutating party_members) ---- */
  const inviteMember = async (user: Profile) => {
    try {
      await sendPartyInvite(partyId, user.id, "member");
      setPendingInvitees(prev => new Set(prev).add(user.id)); // optimistic
      setInviteOpen(false);
    } catch (e: any) {
      // keep modal open so user can retry
      console.log("invite member error:", e?.message || String(e));
    }
  };

  const inviteAdmin = async (user: Profile) => {
    try {
      await sendPartyInvite(partyId, user.id, "admin");
      setPendingInvitees(prev => new Set(prev).add(user.id)); // optimistic
      setAddAdminOpen(false);
    } catch (e: any) {
      console.log("invite admin error:", e?.message || String(e));
    }
  };

  /* ---- Existing member role changes remain direct ---- */
  const promoteExisting = async (userId: string) => {
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: "admin" } : m)));
    await supabase.from("party_members").update({ role: "admin" }).eq("party_id", partyId).eq("user_id", userId);
  };

  const demoteAdmin = async (userId: string) => {
    setMembers((prev) => prev.map((m) => (m.user_id === userId && m.role === "admin" ? { ...m, role: "member" } : m)));
    await supabase.from("party_members").update({ role: "member" }).eq("party_id", partyId).eq("user_id", userId);
  };

  /* ---- Render lists ---- */
  const renderGroup = (list: PartyMember[]) =>
    list.length === 0 ? (
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text style={{ color: P.textMuted, fontFamily: fontSans, fontSize: 12 }}>Nothing here yet.</Text>
      </View>
    ) : (
      list.map((pm) => (
        <MemberRow
          key={pm.user_id}
          P={P}
          item={pm}
          meIsOwner={meIsOwner}
          onPromote={promoteExisting}
          onDemote={demoteAdmin}
        />
      ))
    );

  if (loading) {
    return (
      <View style={{ padding: 14 }}>
        <ActivityIndicator />
        <Text style={{ color: P.textMuted, marginTop: 8, fontFamily: fontSans, fontSize: 12 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: P.bg }}>
      {/* Segmented filter */}
      <SegmentedBar P={P} value={tab} onChange={setTab} />

      {/* Thin action buttons */}
      <View style={{ paddingHorizontal: 12, paddingBottom: 6, flexDirection: "row", gap: 8 }}>
        {meIsOwner ? (
          <View style={{ flex: 1 }}>
            <ThinButton P={P} label="Invite admin" onPress={() => setAddAdminOpen(true)} tone="primary" />
          </View>
        ) : null}
        {canInvite ? (
          <View style={{ flex: 1 }}>
            <ThinButton P={P} label="Invite member" onPress={() => setInviteOpen(true)} tone="primary" />
          </View>
        ) : null}
      </View>

      <Hairline color={P.glassBorder} />

      {/* Content */}
      <ScrollView contentContainerStyle={{ paddingBottom: 16, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        {tab === "owners" && (
          <>
            <SectionTitle P={P} title="Owner" />
            {renderGroup(owners)}
          </>
        )}
        {tab === "admins" && (
          <>
            <SectionTitle P={P} title="Admins" />
            {renderGroup(admins)}
          </>
        )}
        {tab === "members" && (
          <>
            <SectionTitle P={P} title="Members" />
            {renderGroup(regulars)}
          </>
        )}
        {tab === "all" && (
          <>
            <SectionTitle P={P} title="Owner" />
            {renderGroup(owners)}
            <SectionTitle P={P} title="Admins" />
            {renderGroup(admins)}
            <SectionTitle P={P} title="Members" />
            {renderGroup(regulars)}
          </>
        )}
      </ScrollView>

      {/* Modals */}
      <SearchUsersModal
        P={P}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite member"
        placeholder="Search by name…"
        onInvite={inviteMember}
        excludeIds={members.map((m) => m.user_id)}
        asRole="member"
        invitedSet={pendingInvitees}
      />
      <SearchUsersModal
        P={P}
        visible={addAdminOpen}
        onClose={() => setAddAdminOpen(false)}
        title="Invite admin"
        placeholder="Search by name…"
        onInvite={inviteAdmin}
        excludeIds={members.map((m) => m.user_id)}
        asRole="admin"
        invitedSet={pendingInvitees}
      />
    </View>
  );
}
