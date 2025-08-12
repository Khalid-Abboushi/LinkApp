// app/(tabs)/parties/[id].tsx

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";

import {
  type PartyRow,
  type MessageRow,
  getParty,
  ensurePartyChat,
  fetchAllMessages,
  sendMessage,
} from "@/data/partyRoom";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { getPartyMembers, type PartyMemberRow } from "@/data/partyRoom";
import { SafeAreaView, Platform } from "react-native";

/* ========= Palettes / fonts ========= */
type Palette = {
  name: string;
  bg: string;
  bg2: string;
  text: string;
  textMuted: string;
  glass: string;
  glassBorder: string;
  p1: string;
  p2: string;
  p3: string;
  p4: string;
};
const PALETTES: Palette[] = [
  {
    name: "Luxe Neon",
    bg: "#070A0F",
    bg2: "#0C1120",
    text: "#ECF1FF",
    textMuted: "#B7C3DA",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.10)",
    p1: "#22D3EE",
    p2: "#A78BFA",
    p3: "#FB7185",
    p4: "#34D399",
  },
  {
    name: "Electric Sunset",
    bg: "#0B0814",
    bg2: "#140F2B",
    text: "#FFF5FE",
    textMuted: "#D9CBE2",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.12)",
    p1: "#F97316",
    p2: "#F43F5E",
    p3: "#8B5CF6",
    p4: "#06B6D4",
  },
  {
    name: "Cyber Lime",
    bg: "#060A06",
    bg2: "#0B130B",
    text: "#F1FFE9",
    textMuted: "#BCE5C0",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.10)",
    p1: "#A3E635",
    p2: "#22D3EE",
    p3: "#BEF264",
    p4: "#38BDF8",
  },
];
const fontHeavy = "Avenir-Heavy";
const fontSans = "Avenir-Book";
const MAX_W = 860;

type Tab = "details" | "chat" | "events" | "polls" | "gallery";

/* ========= Tab chip ========= */
const TabChip = ({
  label,
  active,
  onPress,
  P,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  P: Palette;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: active ? `${P.p1}24` : "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: active ? `${P.p1}AA` : P.glassBorder,
      marginRight: 8,
    }}
  >
    <Text style={{ color: P.text, fontFamily: fontSans, fontWeight: "700" }}>
      {label}
    </Text>
  </TouchableOpacity>
);

/* ========= Edge glow ========= */
const EdgeGlow = ({ P }: { P: Palette }) => {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const fadeOut = () =>
    Animated.timing(op, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  return (
    <View
      onStartShouldSetResponder={(e) => e.nativeEvent.pageX < 24}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        y.setValue(e.nativeEvent.locationY);
        Animated.timing(op, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }}
      onResponderMove={(e) => y.setValue(e.nativeEvent.locationY)}
      onResponderRelease={fadeOut}
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 28, zIndex: 5 }}
    >
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          width: 120,
          height: 160,
          opacity: op,
          transform: [{ translateY: y }, { translateX: -40 }],
        }}
      >
        <LinearGradient
          colors={[`#A78BFA55`, `#A78BFA22`, "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            width: "100%",
            height: "100%",
            borderTopRightRadius: 80,
            borderBottomRightRadius: 80,
          }}
        />
      </Animated.View>
    </View>
  );
};

function SegTabs({
  value,
  onChange,
  items,
  P,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
  items: Tab[];
  P: Palette;
}) {
  return (
    <View
      style={{
        marginTop: 16,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: P.bg2,
        borderWidth: 1,
        borderColor: P.glassBorder,
        flexDirection: "row",
      }}
    >
      {items.map((t, i) => {
        const active = value === t;
        return (
          <TouchableOpacity
            key={t}
            onPress={() => onChange(t)}
            activeOpacity={0.9}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? `${P.p1}22` : "transparent",
              borderRightWidth: i < items.length - 1 ? 1 : 0,
              borderRightColor: P.glassBorder,
            }}
          >
            <Text
              style={{
                color: active ? P.text : P.textMuted,
                fontFamily: fontHeavy,
                letterSpacing: 0.2,
              }}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ========= Screen ========= */
export default function PartyRoomNeon() {
  const { id: partyId } = useLocalSearchParams<{ id: string }>();
  const [palIdx, setPalIdx] = useState(0);
  const P = PALETTES[palIdx % PALETTES.length];
  const containerW = Math.min(Dimensions.get("window").width, MAX_W);

  const [tab, setTab] = useState<Tab>("chat");
  const [party, setParty] = useState<PartyRow | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const [members, setMembers] = useState<PartyMemberRow[]>([]);


  // who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  // Load party, ensure chat, fetch initial messages
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!partyId) return;

      try {
        const p = await getParty(partyId);
        if (!cancelled) setParty(p);

        const cid = await ensurePartyChat(partyId);
        if (!cancelled) setChatId(cid);

        if (cid) {
          const rows = await fetchAllMessages(cid);
          if (!cancelled) setMessages(rows);
        } else if (!cancelled) {
          setMessages([]);
        }
      } catch (e) {
        console.error("party room load error:", e);
        if (!cancelled) {
          setChatId(null);
          setMessages([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [partyId]);

  useEffect(() => {
  if (!partyId) return;
  getPartyMembers(partyId)
    .then(setMembers)
    .catch((e) => console.warn("members load error", e));
}, [partyId]);


  // Realtime (robust) — single source of truth
  useChatRealtime(chatId, {
    onInsert: (row) =>
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row])),
    onUpdate: (row) => setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m))),
    onDelete: (row) => setMessages((prev) => prev.filter((m) => m.id !== row.id)),
  });

  // auto-scroll to latest when new message arrives
  useEffect(() => {
    if (!listRef.current) return;
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 0);
  }, [messages.length]);

  // send (optimistic)
  const onSend = async () => {
    const text = input.trim();
    if (!text || !chatId) return;

    const tempId = `temp_${Date.now()}`;
    const temp: MessageRow = {
      id: tempId,
      chat_id: chatId,
      author_id: myId ?? "me",
      text,
      attachment_url: null,
      attachment_type: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };

    setMessages((prev) => [...prev, temp]);
    setInput("");

    try {
      const saved = await sendMessage(chatId, text);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        const exists = withoutTemp.some((m) => m.id === saved.id);
        return exists ? withoutTemp : [...withoutTemp, saved];
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      console.error("send error", e);
    }
  };

  // aurora bg
  const aur = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(aur, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(aur, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);
  const aurShift = aur.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });

  return (
  <SafeAreaView style={{ flex: 1, backgroundColor: P.bg }}>
    <View style={{ flex: 1, paddingTop: Platform.OS === "ios" ? 4 : 12 }}>
      <EdgeGlow P={P} />

      {/* Aurora */}
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
        <Animated.View
          style={{
            position: "absolute",
            top: -40,
            left: -80,
            width: 360,
            height: 360,
            transform: [{ translateX: aurShift as any }],
          }}
        >
          <LinearGradient
            colors={[`${P.p2}25`, "transparent"]}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.8, y: 0.6 }}
            style={{ width: "100%", height: "100%", borderRadius: 999 }}
          />
        </Animated.View>
        <Animated.View
          style={{
            position: "absolute",
            bottom: 40,
            right: -60,
            width: 300,
            height: 300,
            transform: [{ translateX: Animated.multiply(aurShift as any, -0.7) as any }],
          }}
        >
          <LinearGradient
            colors={[`${P.p1}18`, "transparent"]}
            start={{ x: 0.2, y: 0.2 }}
            end={{ x: 0.9, y: 0.8 }}
            style={{ width: "100%", height: "100%", borderRadius: 999 }}
          />
        </Animated.View>
        <LinearGradient
          colors={[P.bg, "transparent"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.5 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 260 }}
        />
      </View>

      {/* Header + tabs */}
      <View style={{ alignItems: "center" }}>
        <View style={{ width: containerW, paddingHorizontal: 20, paddingTop: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text
              style={{
                fontSize: 26,
                color: P.p2,
                textShadowColor: `${P.p2}AA`,
                textShadowRadius: 16,
                letterSpacing: 0.5,
                fontFamily: fontHeavy,
              }}
            >
              {party?.name || "Party"}
            </Text>
            <TouchableOpacity
              onPress={() => setPalIdx((i) => (i + 1) % PALETTES.length)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: P.glassBorder,
                backgroundColor: P.glass,
              }}
            >
              <Text style={{ color: P.text, fontFamily: fontSans, fontSize: 12 }}>
                {PALETTES[(palIdx + 1) % PALETTES.length].name}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: P.textMuted, fontFamily: fontSans, marginTop: 6 }}>
            {party ? new Date(party.created_at).toLocaleDateString() : ""}
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row" }}>
              {(["details", "chat", "events", "polls", "gallery"] as Tab[]).map((t) => (
                <TabChip
                  key={t}
                  label={t[0].toUpperCase() + t.slice(1)}
                  active={tab === t}
                  onPress={() => setTab(t)}
                  P={P}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Content */}
      {tab === "chat" ? (
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ width: containerW, paddingHorizontal: 20, paddingTop: 12, flex: 1 }}>
            <View
              style={{
                borderRadius: 20,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: P.glassBorder,
                backgroundColor: P.bg2,
                flex: 1,
              }}
            >
              <View style={{ padding: 12, borderBottomWidth: 1, borderColor: P.glassBorder }}>
                <Text style={{ color: P.text, fontFamily: fontHeavy }}>Group Chat</Text>
              </View>

              <View style={{ flex: 1, padding: 12 }}>
                {(!chatId || messages.length === 0) ? (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: P.textMuted, fontFamily: fontSans }}>No messages yet — say hi 👋</Text>
                  </View>
                ) : (
                  <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(m) => m.id}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 8 }}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                    renderItem={({ item }) => {
                      const isMine = !!myId && item.author_id === myId;
                      return (
                        <View
                          style={{
                            marginBottom: 12,
                            flexDirection: isMine ? "row-reverse" : "row",
                            alignItems: "flex-end",
                          }}
                        >
                          <Image
                            source={{ uri: "https://placehold.co/40x40/png" }}
                            style={{ width: 28, height: 28, borderRadius: 999, marginHorizontal: 8 }}
                          />
                          <View
                            style={{
                              maxWidth: "76%",
                              backgroundColor: isMine ? `${P.p1}26` : "rgba(255,255,255,0.06)",
                              borderWidth: 1,
                              borderColor: isMine ? `${P.p1}99` : P.glassBorder,
                              borderRadius: 14,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                            }}
                          >
                            {!!item.text && (
                              <Text style={{ color: P.text, fontFamily: fontSans }}>{item.text}</Text>
                            )}
                            <Text
                              style={{
                                color: P.textMuted,
                                fontSize: 10,
                                marginTop: 4,
                                textAlign: isMine ? "right" : "left",
                              }}
                            >
                              {new Date(item.created_at).toLocaleTimeString()}
                            </Text>
                          </View>
                        </View>
                      );
                    }}
                  />
                )}

                {/* input row */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder={chatId ? "Message…" : "No chat for this party"}
                    editable={!!chatId}
                    placeholderTextColor={P.textMuted}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      color: P.text,
                      borderWidth: 1,
                      borderColor: P.glassBorder,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  />
                  <TouchableOpacity
                    onPress={onSend}
                    disabled={!chatId || !input.trim()}
                    activeOpacity={0.9}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: `${P.p1}26`,
                      borderWidth: 1,
                      borderColor: `${P.p1}AA`,
                      opacity: !chatId || !input.trim() ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: P.text, fontFamily: fontHeavy }}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 120 }}>
          <View style={{ width: containerW, paddingHorizontal: 20, paddingTop: 12 }}>
            {tab === "details" && (
              <View
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: P.glassBorder,
                  backgroundColor: P.bg2,
                  marginTop: 14,
                }}
              >
                <View style={{ padding: 16 }}>
                  <Text style={{ color: P.text, fontFamily: fontHeavy, marginBottom: 12 }}>
                    Details
                  </Text>
              
                  {(() => {
                    const owners = members.filter((m) => m.role === "owner");
                    const admins = members.filter((m) => m.role === "admin");
                    const regulars = members.filter((m) => m.role === "member");
                  
                    const Line = ({ label, ppl }: { label: string; ppl: PartyMemberRow[] }) => (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ color: P.textMuted, fontFamily: fontSans, marginBottom: 6 }}>
                          {label}
                        </Text>
                        {ppl.length === 0 ? (
                          <Text style={{ color: P.textMuted, fontFamily: fontSans }}> none </Text>
                        ) : (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                            {ppl.map((m) => {
                              const name =
                                m.profiles?.display_name ||
                                m.profiles?.username ||
                                m.user_id.slice(0, 8);
                              return (
                                <View
                                  key={m.user_id}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 999,
                                    backgroundColor: "rgba(255,255,255,0.06)",
                                    borderWidth: 1,
                                    borderColor: P.glassBorder,
                                  }}
                                >
                                  <Image
                                    source={{ uri: m.profiles?.avatar_url || "https://placehold.co/28x28/png" }}
                                    style={{ width: 18, height: 18, borderRadius: 999, marginRight: 6 }}
                                  />
                                  <Text style={{ color: P.text, fontFamily: fontSans }}>{name}</Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  
                    return (
                      <View>
                        <Line label="Owner" ppl={owners} />
                        <Line label="Admin" ppl={admins} />
                        <Line label={`Members (${regulars.length})`} ppl={regulars} />
                      </View>
                    );
                  })()}
                </View>
              </View>
            )}
            {tab === "events" && (
              <Text style={{ color: P.textMuted, marginTop: 16 }}>Events coming soon.</Text>
            )}
            {tab === "polls" && (
              <Text style={{ color: P.textMuted, marginTop: 16 }}>Polls coming soon.</Text>
            )}
            {tab === "gallery" && (
              <Text style={{ color: P.textMuted, marginTop: 16 }}>Gallery coming soon.</Text>
            )}
          </View>
        </ScrollView>
      )}
      </View>
  </SafeAreaView>
);
}
