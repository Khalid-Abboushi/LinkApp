// components/party/PartyBudget.tsx
import * as React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  useWindowDimensions,
  Pressable,
  StyleSheet,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";

/** Match app palette */
export type AppPalette = {
  appBg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  name: string;
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

/* ---------- Types ---------- */
type Member = {
  id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

type IOU = {
  id: string;
  party_id: string;
  event_id: string | null;
  creditor: string;
  debtor: string;
  amount: number;
  reason: string | null;
  status: "requested" | "paid_marked";
  created_at: string;
  updated_at: string;
};

const fmtMoney = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Number(n).toFixed(2)}`;

/** stable id for idempotent upsert */
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ---------- Small UI bits ---------- */
function Avatar({ url, name, size = 28 }: { url?: string | null; name: string; size?: number }) {
  const initial = (name?.[0] || "?").toUpperCase();
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(255,255,255,0.18)",
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.18)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontFamily: fontHeavy, fontSize: size * 0.45 }}>{initial}</Text>
    </View>
  );
}

function PillButton({
  label,
  onPress,
  active,
  P,
  disabled,
  icon,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
  P: AppPalette;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      style={[
        styles.pill,
        {
          backgroundColor: active ? `${P.primary}22` : "transparent",
          borderColor: active ? P.primary : P.border,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? P.primary : P.textMuted} /> : null}
      <Text style={{ color: active ? P.primary : P.textMuted, fontFamily: active ? fontHeavy : fontSans }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ---------- Shared shells ---------- */
const Field = React.memo(({ children, border }: { children: React.ReactNode; border: string }) => (
  <View
    style={[
      styles.inputShell,
      { borderColor: border, backgroundColor: "rgba(255,255,255,0.04)" },
    ]}
  >
    {children}
  </View>
));
Field.displayName = "Field";

const Card = React.memo(
  ({ children, P }: { children: React.ReactNode; P: AppPalette }) => (
    <LinearGradient
      colors={["rgba(255,255,255,0.04)", "rgba(255,255,255,0.01)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        {
          borderColor: P.border,
          backgroundColor: P.surfaceAlt,
        },
      ]}
    >
      {children}
    </LinearGradient>
  )
);
Card.displayName = "Card";

/* ---------- Member Picker (Modal) ---------- */
/** IMPORTANT: No KeyboardAvoidingView here (as requested). */
function MemberPicker({
  P,
  visible,
  onClose,
  members,
  excludeId,
  onPick,
}: {
  P: AppPalette;
  visible: boolean;
  onClose: () => void;
  members: Member[];
  excludeId?: string | null;
  onPick: (m: Member) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [q, setQ] = React.useState("");

  const cardMax = 680;
  const cardW = Math.min(width - 24, cardMax);
  const cardH = Math.min(520, height - 24 - 24);

  const list = React.useMemo(() => {
    const base = excludeId ? members.filter((m) => m.id !== excludeId) : members;
    const s = q.trim().toLowerCase();
    if (!s) return base;
    return base.filter(
      (m) =>
        m.name.toLowerCase().includes(s) ||
        (m.username ?? "").toLowerCase().includes(s)
    );
  }, [members, q, excludeId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop} />
      <View style={styles.modalCenter}>
        <View
          style={{
            width: cardW,
            maxWidth: cardMax,
            height: cardH,
            backgroundColor: P.surface,
            borderWidth: 1,
            borderColor: P.border,
            borderRadius: 16,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: P.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="people" size={16} color={P.textMuted} />
            <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 16, flex: 1 }}>Select a member</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={16} color={P.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={{ borderWidth: 1, borderColor: P.border, backgroundColor: "rgba(255,255,255,0.04)", margin: 12, borderRadius: 10, paddingHorizontal: 10, paddingVertical: Platform.OS === "ios" ? 10 : 8 }}>
            <TextInput
              placeholder="Search by name or @username"
              placeholderTextColor={P.textMuted}
              value={q}
              onChangeText={setQ}
              style={{ color: P.text, fontFamily: fontSans }}
              autoFocus
              blurOnSubmit={false}
            />
          </View>

          <FlatList
            data={list}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
                activeOpacity={0.9}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: P.border,
                  marginHorizontal: 6,
                  marginVertical: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: P.surfaceAlt,
                }}
              >
                <Avatar url={item.avatar_url} name={item.name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: P.text, fontFamily: fontHeavy }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {!!item.username && (
                      <Text style={{ color: P.textMuted, fontFamily: fontSans }} numberOfLines={1}>
                        @{item.username}
                      </Text>
                    )}
                    {!!item.role && (
                      <Text style={{ color: P.textMuted, fontFamily: fontSans, opacity: 0.9 }} numberOfLines={1}>
                        {item.role}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={{ color: P.textMuted, textAlign: "center", marginTop: 12 }}>No members.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Create IOU Form ---------- */
type CreateIOUFormProps = {
  P: AppPalette;
  myId: string | null;
  partyId: string;
  members: Record<string, Member>;
  kbOffset: number;
  scrollToY: (y: number) => void;          // NEW: parent-controlled scroll
};
const CreateIOUForm = React.memo(function CreateIOUForm({
  P,
  myId,
  partyId,
  members,
  kbOffset,
  scrollToY,
}: CreateIOUFormProps) {
  const { width } = useWindowDimensions();
  const isSmall = width < 480;

  const [debtorId, setDebtorId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const createIdRef = React.useRef<string | null>(null);

  // Track layout Y to scroll focused input into view
  const amountY = React.useRef(0);
  const reasonY = React.useRef(0);
  const onAmountLayout = (e: LayoutChangeEvent) => (amountY.current = e.nativeEvent.layout.y);
  const onReasonLayout = (e: LayoutChangeEvent) => (reasonY.current = e.nativeEvent.layout.y);

  const selected = debtorId ? members[debtorId] : undefined;

  const createIOU = React.useCallback(async () => {
    if (saving) return;
    if (!myId || !partyId || !debtorId || !amount.trim()) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    setSaving(true);
    if (!createIdRef.current) createIdRef.current = uuidv4();
    const newId = createIdRef.current;

    const { data: activeEv } = await supabase
      .from("events")
      .select("id")
      .eq("party_id", partyId)
      .eq("active", true)
      .maybeSingle();

    const now = new Date().toISOString();
    const optimistic: IOU = {
      id: newId!,
      party_id: partyId,
      event_id: activeEv?.id ?? null,
      creditor: myId,
      debtor: debtorId,
      amount: Number(parsed.toFixed(2)),
      reason: reason || null,
      status: "requested",
      created_at: now,
      updated_at: now,
    };

    await supabase.from("ious").upsert([optimistic], { onConflict: "id", ignoreDuplicates: false });

    createIdRef.current = null;
    setAmount("");
    setReason("");
    setDebtorId(null);
    setSaving(false);
  }, [saving, myId, partyId, debtorId, amount, reason]);

  const membersArr = React.useMemo(() => Object.values(members), [members]);

  // Helper to nudge content slightly above keyboard
  const bringIntoView = (y: number) => {
    // Pull it a bit above the keyboard / button row
    const pad = Platform.OS === "ios" ? 120 : 140;
    scrollToY(Math.max(0, y - pad));
  };

  return (
    <>
      {/* Row: select debtor (no KAV here) */}
      <TouchableOpacity
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.9}
        style={[styles.debtorSelect, { borderColor: P.border, backgroundColor: "rgba(255,255,255,0.04)" }]}
      >
        <Avatar url={selected?.avatar_url} name={selected?.name || "Select member"} size={24} />
        <Text
          style={{
            color: selected ? P.text : P.textMuted,
            fontFamily: selected ? fontHeavy : fontSans,
            flexShrink: 1,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {selected ? `${selected.name}${selected.username ? ` (@${selected.username})` : ""}` : "Select a member"}
        </Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-down" size={16} color={P.textMuted} />
      </TouchableOpacity>

      {/* ONLY these inputs are wrapped in KeyboardAvoidingView */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={kbOffset}
        style={{ width: "100%" }}
      >
        <View
          style={{
            flexDirection: isSmall ? "column" : "row",
            gap: 10,
            alignItems: isSmall ? "stretch" : "center",
          }}
        >
          {/* Amount */}
          <View style={{ flex: 1 }} onLayout={onAmountLayout}>
            <Field border={P.border}>
              <TextInput
                keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                placeholder="$ Amount"
                placeholderTextColor={P.textMuted}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
                style={{ color: P.text, fontFamily: fontSans }}
                returnKeyType="next"
                onFocus={() => bringIntoView(amountY.current)}
                blurOnSubmit={false}
              />
            </Field>
          </View>

          {/* Reason */}
          <View style={{ flex: 2 }} onLayout={onReasonLayout}>
            <Field border={P.border}>
              <TextInput
                placeholder="Reason (optional)"
                placeholderTextColor={P.textMuted}
                value={reason}
                onChangeText={setReason}
                style={{ color: P.text, fontFamily: fontSans }}
                returnKeyType="done"
                onFocus={() => bringIntoView(reasonY.current)}
                blurOnSubmit={false}
              />
            </Field>
          </View>

          {/* Save */}
          <View style={{ alignSelf: isSmall ? "flex-end" : "auto" }}>
            <TouchableOpacity
              onPress={createIOU}
              disabled={saving || !debtorId || !amount.trim()}
              activeOpacity={0.9}
              style={[
                styles.primaryBtn,
                {
                  borderColor: P.primary,
                  backgroundColor: `${P.primary}1A`,
                  opacity: saving || !debtorId || !amount.trim() ? 0.6 : 1,
                },
              ]}
            >
              <Ionicons name={saving ? "time" : "save"} size={14} color={P.primary} />
              <Text style={{ color: P.primary, fontFamily: fontHeavy }}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <MemberPicker
        P={P}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        members={membersArr}
        excludeId={myId}
        onPick={(m) => setDebtorId(m.id)}
      />
    </>
  );
});

/* ---------- Main ---------- */
export default function PartyBudget({
  partyId,
  myId,
  P,
}: {
  partyId: string;
  myId: string | null;
  P: AppPalette;
}) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = React.useState(true);
  const [members, setMembers] = React.useState<Record<string, Member>>({});
  const [ious, setIous] = React.useState<IOU[]>([]);

  // Active event data shown only when user RSVP is confirmed
  const [activeEventName, setActiveEventName] = React.useState<string | null>(null);
  const [perPerson, setPerPerson] = React.useState<number | null>(null);
  const [isConfirmedForActive, setIsConfirmedForActive] = React.useState<boolean>(false);

  // Scroll handling to keep inputs visible above keyboard
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollToY = (y: number) => scrollRef.current?.scrollTo({ y, animated: true });

  /* ----- data fetch ----- */
  const loadMembers = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("party_members")
      .select("role, user_id, profiles ( id, display_name, username, avatar_url )")
      .eq("party_id", partyId);

    if (error) {
      console.warn("party_members load error:", error);
      setMembers({});
      return;
    }

    const map: Record<string, Member> = {};
    for (const row of (data ?? []) as any[]) {
      const p = row.profiles;
      if (!p?.id) continue;
      map[p.id] = {
        id: p.id,
        name: (p.display_name || p.username || p.id.slice(0, 8)).trim(),
        username: p.username ?? null,
        avatar_url: p.avatar_url ?? null,
        role: row.role ?? null,
      };
    }
    setMembers(map);
  }, [partyId]);

  const loadIOUs = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("ious")
      .select("*")
      .eq("party_id", partyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("ious load error:", error);
      setIous([]);
      return;
    }
    setIous((data ?? []) as IOU[]);
  }, [partyId]);

  const loadActiveEvent = React.useCallback(async () => {
    const { data: ev, error } = await supabase
      .from("events")
      .select("id,name,cost_amount")
      .eq("party_id", partyId)
      .eq("active", true)
      .maybeSingle();

    if (error || !ev) {
      setActiveEventName(null);
      setPerPerson(null);
      setIsConfirmedForActive(false);
      return;
    }

    setActiveEventName(ev.name ?? null);
    const amt = Number((ev as any).cost_amount);
    setPerPerson(Number.isFinite(amt) ? amt : null);

    if (!myId) {
      setIsConfirmedForActive(false);
      return;
    }

    const { data: rsvp, error: rErr } = await supabase
      .from("event_rsvps")
      .select("status")
      .eq("event_id", ev.id)
      .eq("user_id", myId)
      .maybeSingle();

    if (rErr || !rsvp) {
      setIsConfirmedForActive(false);
      return;
    }
    setIsConfirmedForActive(rsvp.status === "confirmed");
  }, [partyId, myId]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadMembers(), loadIOUs(), loadActiveEvent()]);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [loadMembers, loadIOUs, loadActiveEvent]);

  /* ----- realtime for ious ----- */
  React.useEffect(() => {
    const ch = supabase
      .channel(`rt-ious-${partyId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "ious", event: "*", filter: `party_id=eq.${partyId}` },
        (payload) => {
          const n = payload.new as any;
          const o = payload.old as any;
          setIous((prev) => {
            if (payload.eventType === "INSERT" && n) {
              if (prev.some((x) => x.id === n.id)) return prev.map((x) => (x.id === n.id ? n : x));
              return [n, ...prev];
            }
            if (payload.eventType === "UPDATE" && n) {
              return prev.map((x) => (x.id === n.id ? n : x));
            }
            if (payload.eventType === "DELETE" && o) {
              return prev.filter((x) => x.id !== o.id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [partyId]);

  /* ----- realtime for active event changes ----- */
  React.useEffect(() => {
    const ch = supabase
      .channel(`rt-events-${partyId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "events", event: "*", filter: `party_id=eq.${partyId}` },
        () => {
          void loadActiveEvent();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [partyId, loadActiveEvent]);

  /* ----- derived ----- */
  const meOwe = React.useMemo(() => ious.filter((i) => i.debtor === myId), [ious, myId]);
  const owedToMe = React.useMemo(() => ious.filter((i) => i.creditor === myId), [ious, myId]);

  /* ----- actions with optimistic echo ----- */
  const markPaid = async (id: string) => {
    setIous((prev) => prev.map((x) => (x.id === id ? { ...x, status: "paid_marked" } : x)));
    const { error } = await supabase.from("ious").update({ status: "paid_marked" }).eq("id", id);
    if (error) {
      setIous((prev) => prev.map((x) => (x.id === id ? { ...x, status: "requested" } : x)));
      console.warn("markPaid error:", error);
    } else {
      setTimeout(() => void loadIOUs(), 600);
    }
  };

  const confirmReceived = async (id: string) => {
    const snapshot = ious;
    setIous((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from("ious").delete().eq("id", id);
    if (error) {
      console.warn("confirmReceived error:", error);
      setIous(snapshot);
    } else {
      setTimeout(() => void loadIOUs(), 600);
    }
  };

  const didntReceive = async (id: string) => {
    setIous((prev) => prev.map((x) => (x.id === id ? { ...x, status: "requested" } : x)));
    const { error } = await supabase.from("ious").update({ status: "requested" }).eq("id", id);
    if (error) {
      setIous((prev) => prev.map((x) => (x.id === id ? { ...x, status: "paid_marked" } : x)));
      console.warn("didntReceive error:", error);
    }
  };

  // Tuned vertical offset (keeps inputs above keyboard + header)
  const kbOffset = Platform.select({
    ios: insets.top + 64,     // header height guess; tweak if needed
    android: 0,
    default: 0,
  }) as number;

  /* ---------- UI state: which bucket is visible ---------- */
  const [tab, setTab] = React.useState<"create" | "you-owe" | "owed-to-you">("create");

  /* ---------- Transactions log (paid_marked entries) ---------- */
  const transactions = React.useMemo(() => {
    return ious
      .filter((i) => i.status === "paid_marked")
      .map((i) => {
        const from = members[i.debtor];
        const to = members[i.creditor];
        const meIsCreditor = i.creditor === myId;
        const meIsDebtor = i.debtor === myId;

        let text = "";
        let icon: keyof typeof Ionicons.glyphMap = "swap-horizontal";
        let color = "#9CA3AF";

        if (meIsCreditor) {
          text = `You were paid ${fmtMoney(i.amount)} by ${from?.name ?? "Someone"}`;
          icon = "cash-outline";
          color = "#22c55e";
        } else if (meIsDebtor) {
          text = `You paid ${fmtMoney(i.amount)} to ${to?.name ?? "Someone"}`;
          icon = "card-outline";
          color = "#ef4444";
        } else {
          text = `${from?.name ?? "Someone"} paid ${fmtMoney(i.amount)} to ${to?.name ?? "Someone"}`;
        }

        return { id: i.id, text, icon, color, ts: i.updated_at };
      })
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [ious, members, myId]);

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.page, { backgroundColor: P.surface, paddingBottom: 240 }]} // extra bottom space for keyboard
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
    >
      {/* Header */}
      <View style={[styles.headerBar, { borderColor: P.border }]}>
        <View style={styles.headerActions}>
          <PillButton P={P} label="Create" icon="add" active={tab === "create"} onPress={() => setTab("create")} />
          <PillButton P={P} label="Owe" icon="arrow-redo" active={tab === "you-owe"} onPress={() => setTab("you-owe")} />
          <PillButton P={P} label="Owed" icon="arrow-undo" active={tab === "owed-to-you"} onPress={() => setTab("owed-to-you")} />
        </View>
      </View>

      {/* Compact stat tiles */}
      <View style={styles.tileRow}>
        <LinearGradient
          colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { borderColor: P.border, backgroundColor: P.surfaceAlt }]}
        >
          <Text style={{ color: P.textMuted, fontFamily: fontSans, marginBottom: 2 }}>You owe</Text>
          <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 16 }}>
            {fmtMoney(meOwe.reduce((s, i) => s + (i.status === "requested" ? i.amount : 0), 0))}
          </Text>
        </LinearGradient>

        <LinearGradient
          colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { borderColor: P.border, backgroundColor: P.surfaceAlt }]}
        >
          <Text style={{ color: P.textMuted, fontFamily: fontSans, marginBottom: 2 }}>Owed to you</Text>
          <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 16 }}>
            {fmtMoney(owedToMe.reduce((s, i) => s + (i.status === "requested" ? i.amount : 0), 0))}
          </Text>
        </LinearGradient>

        <LinearGradient
          colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { borderColor: P.border, backgroundColor: P.surfaceAlt }]}
        >
          <Text style={{ color: P.textMuted, fontFamily: fontSans, marginBottom: 2 }}>Active event</Text>
          <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 16 }} numberOfLines={1}>
            {isConfirmedForActive && activeEventName ? activeEventName : "—"}
          </Text>
        </LinearGradient>
      </View>

      {/* Active event strip (visible only if confirmed) */}
      {isConfirmedForActive && perPerson != null && activeEventName ? (
        <Card P={P}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.badge, { borderColor: P.primary, backgroundColor: `${P.primary}12` }]}>
              <Ionicons name="checkmark-circle" size={14} color={P.primary} />
              <Text style={{ color: P.primary, fontFamily: fontHeavy }}>Confirmed</Text>
            </View>
            <Text style={{ color: P.textMuted, fontFamily: fontSans }}>Active event</Text>
          </View>
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 16 }}>{activeEventName}</Text>
            <Text style={{ color: P.text, marginTop: 6, fontFamily: fontSans }}>
              Your cost per person: <Text style={{ fontFamily: fontHeavy }}>{fmtMoney(perPerson)}</Text>
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Loading */}
      {loading ? (
        <Card P={P}>
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <ActivityIndicator />
            <Text style={{ color: P.textMuted, marginTop: 6, fontFamily: fontSans }}>Loading…</Text>
          </View>
        </Card>
      ) : (
        <>
          {/* TABBED CONTENT */}
          {tab === "create" && (
            <Card P={P}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: P.text, fontFamily: fontHeavy }]}>
                  Create IOU
                </Text>
              </View>
              <CreateIOUForm
                P={P}
                myId={myId}
                partyId={partyId}
                members={members}
                kbOffset={kbOffset}
                scrollToY={scrollToY}           // pass scroll control
              />
            </Card>
          )}

          {tab === "you-owe" && (
            <Card P={P}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: P.text, fontFamily: fontHeavy }]}>You owe</Text>
              </View>
              {meOwe.length === 0 ? (
                <Text style={{ color: P.textMuted, fontFamily: fontSans }}>No IOUs.</Text>
              ) : (
                meOwe.map((i) => {
                  const to = members[i.creditor];
                  const waiting = i.status === "paid_marked";
                  return (
                    <View
                      key={i.id}
                      style={[
                        styles.row,
                        { borderColor: P.border, flexDirection: "column", alignItems: "flex-start" },
                      ]}
                    >
                      {/* Top row: avatar + text */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%" }}>
                        <Avatar url={to?.avatar_url} name={to?.name || "Someone"} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{ color: P.text, fontFamily: fontSans, flexShrink: 1 }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            To{" "}
                            <Text style={{ fontFamily: fontHeavy, color: P.text }}>
                              {to?.name ?? "Someone"}
                            </Text>
                          </Text>
                          <Text
                            style={{ color: P.textMuted, fontFamily: fontSans }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {i.reason || "—"} • {fmtMoney(i.amount)}
                          </Text>
                        </View>
                      </View>

                      {/* Buttons row BELOW (smaller) */}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => (!waiting ? markPaid(i.id) : undefined)}
                          disabled={waiting}
                          activeOpacity={0.9}
                          style={[
                            styles.slimBtnSmall,
                            {
                              borderColor: waiting ? "#eab308" : "#22c55e",
                              backgroundColor: waiting ? "rgba(234,179,8,0.12)" : "rgba(34,197,94,0.12)",
                              opacity: waiting ? 0.8 : 1,
                            },
                          ]}
                        >
                          <Ionicons name={waiting ? "time" : "checkmark-done"} size={13} color={waiting ? "#eab308" : "#22c55e"} />
                          <Text style={{ color: waiting ? "#eab308" : "#22c55e", fontFamily: fontHeavy, fontSize: 13 }}>
                            {waiting ? "Waiting…" : "Mark paid"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </Card>
          )}

          {tab === "owed-to-you" && (
            <Card P={P}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: P.text, fontFamily: fontHeavy }]}>
                  Owed to you
                </Text>
              </View>
              {owedToMe.length === 0 ? (
                <Text style={{ color: P.textMuted, fontFamily: fontSans }}>No IOUs.</Text>
              ) : (
                owedToMe.map((i) => {
                  const from = members[i.debtor];
                  const canResolve = i.status === "paid_marked";
                  return (
                    <View
                      key={i.id}
                      style={[
                        styles.row,
                        { borderColor: P.border, flexDirection: "column", alignItems: "flex-start" },
                      ]}
                    >
                      {/* Top row: avatar + text */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%" }}>
                        <Avatar url={from?.avatar_url} name={from?.name || "Someone"} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{ color: P.text, fontFamily: fontSans, flexShrink: 1 }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            From{" "}
                            <Text style={{ fontFamily: fontHeavy, color: P.text }}>
                              {from?.name ?? "Someone"}
                            </Text>
                          </Text>
                          <Text
                            style={{ color: P.textMuted, fontFamily: fontSans }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {i.reason || "—"} • {fmtMoney(i.amount)}
                          </Text>
                        </View>
                      </View>

                      {/* Buttons row BELOW (smaller) */}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => confirmReceived(i.id)}
                          disabled={!canResolve}
                          activeOpacity={0.9}
                          style={[
                            styles.slimBtnSmall,
                            {
                              borderColor: "#22c55e",
                              backgroundColor: "rgba(34,197,94,0.12)",
                              opacity: canResolve ? 1 : 0.55,
                            },
                          ]}
                        >
                          <Ionicons name="checkmark-circle" size={13} color="#22c55e" />
                          <Text style={{ color: "#22c55e", fontFamily: fontHeavy, fontSize: 13 }}>
                            Received
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => didntReceive(i.id)}
                          disabled={!canResolve}
                          activeOpacity={0.9}
                          style={[
                            styles.slimBtnSmall,
                            {
                              borderColor: "#ef4444",
                              backgroundColor: "rgba(239,68,68,0.12)",
                              opacity: canResolve ? 1 : 0.55,
                            },
                          ]}
                        >
                          <Ionicons name="close-circle" size={13} color="#ef4444" />
                          <Text style={{ color: "#ef4444", fontFamily: fontHeavy, fontSize: 13 }}>
                            Didn’t
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </Card>
          )}

          {/* ---------- Transaction Log ---------- */}
          <Card P={P}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: P.text, fontFamily: fontHeavy }]}>
                Transaction Log
              </Text>
            </View>
            {transactions.length === 0 ? (
              <Text style={{ color: P.textMuted, fontFamily: fontSans }}>No transactions yet.</Text>
            ) : (
              transactions.map((t) => (
                <View key={t.id} style={styles.logRow}>
                  <Ionicons name={t.icon} size={16} color={t.color as string} />
                  <Text style={{ color: t.color as string, fontFamily: fontSans, flex: 1 }} numberOfLines={1}>
                    {t.text}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  page: {
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  headerBar: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  headerTitle: {
    fontSize: 18,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileRow: {
    flexDirection: "row",
    gap: 10,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 16,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inputShell: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  debtorSelect: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  primaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
    marginBottom: 8,
  },
  slimBtnSmall: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  modalBackdrop: {
    position: "absolute",
    inset: 0 as any,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalCenter: {
    position: "absolute",
    inset: 0 as any,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
});
