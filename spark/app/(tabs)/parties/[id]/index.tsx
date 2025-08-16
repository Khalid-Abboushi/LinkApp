// app/(tabs)/parties/[id].tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  SafeAreaView,
  Platform,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import PartyChat, { type AvatarMap, type NameMap } from "@/components/PartyChat";
import PartyDetails from "@/components/party/PartyDetails";
import CreateEventModal from "@/components/party/CreateEventModal";

import {
  type PartyRow,
  type MessageRow,
  getParty,
  ensurePartyChat,
  fetchAllMessages,
  sendMessage,
  getPartyMembers,
  type PartyMemberRow,
} from "@/data/partyRoom";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import TopTabs, { type TabKey } from "@/components/TopTabs";
import PartyEventsLive from "@/components/party/PartyEventsLive";
import PartyBudget from "@/components/party/PartyBudget";

/* ======= Dark (lighter) Palettes with brand names ======= */
type AppPalette = {
  appBg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  name: string;
};

const PALETTES: AppPalette[] = [
  {
    name: "Luxe Neon",
    appBg: "#0E131B",
    surface: "#121826",
    surfaceAlt: "#192133",
    text: "#E8EEF8",
    textMuted: "#9FB1C7",
    border: "#273247",
    primary: "#3B82F6",
  },
  {
    name: "Electric Sunset",
    appBg: "#0F1016",
    surface: "#151826",
    surfaceAlt: "#1B2033",
    text: "#ECEAF6",
    textMuted: "#B7B5CC",
    border: "#282E45",
    primary: "#7C3AED",
  },
  {
    name: "Cyber Lime",
    appBg: "#0C1413",
    surface: "#111A19",
    surfaceAlt: "#162220",
    text: "#E6F5F2",
    textMuted: "#A6C9C1",
    border: "#22312E",
    primary: "#10B981",
  },
];

type Tab = "details" | "chat" | "events" | "budget" | "gallery";
const MAX_W = 920;

export default function PartyRoom() {
  const { id: partyId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);

  const [palIdx, setPalIdx] = useState(0);
  const P = PALETTES[palIdx % PALETTES.length];

  const containerW = useMemo(
    () => Math.min(Dimensions.get("window").width, MAX_W),
    []
  );

  const [tab, setTab] = useState<Tab>("chat");
  const [party, setParty] = useState<PartyRow | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [members, setMembers] = useState<PartyMemberRow[]>([]);
  const [myId, setMyId] = useState<string | null>(null);

  // who am I
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  // Load party, ensure chat, fetch messages
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

  // Load members (for avatars + names)
  useEffect(() => {
    if (!partyId) return;
    getPartyMembers(partyId)
      .then(setMembers)
      .catch((e) => console.warn("members load error", e));
  }, [partyId]);

  // Realtime updates
  useChatRealtime(chatId, {
    onInsert: (row) =>
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row])),
    onUpdate: (row) => setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m))),
    onDelete: (row) => setMessages((prev) => prev.filter((m) => m.id !== row.id)),
  });

  // Maps for avatars and names (skip null/undefined keys)
  const { avatarMap, nameMap } = useMemo(() => {
    const avatars: AvatarMap = {};
    const names: NameMap = {};
    for (const m of members) {
      const id = m.user_id ?? m.profiles?.id;
      if (!id) continue;
      avatars[id] = m.profiles?.avatar_url ?? undefined;
      names[id] =
        m.profiles?.display_name ||
        m.profiles?.username ||
        (id.slice ? id.slice(0, 8) : undefined);
    }
    return { avatarMap: avatars, nameMap: names };
  }, [members]);

  // Optimistic send (parent-controlled)
  const onSendText = async (text: string) => {
    if (!text.trim() || !chatId) return;
    const tempId = `temp_${Date.now()}`;
    const temp: MessageRow = {
      id: tempId,
      chat_id: chatId,
      author_id: myId ?? "me",
      text: text.trim(),
      attachment_url: null,
      attachment_type: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };
    setMessages((prev) => [...prev, temp]);
    try {
      const saved = await sendMessage(chatId, text.trim());
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
      });
    } catch (e) {
      console.error("send error", e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: P.appBg }}>
      {/* Header */}
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: containerW,
            paddingHorizontal: 16,
            paddingTop: Platform.OS === "ios" ? 6 : 10,
            paddingBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text
            style={{ color: P.text, fontSize: 18, fontWeight: "700", flex: 1 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {party?.name || "Party"}
          </Text>

          <Pressable
            onPress={() => setPalIdx((i) => (i + 1) % PALETTES.length)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: P.border,
              backgroundColor: P.surfaceAlt,
              flexShrink: 0,
            }}
          >
            <Text style={{ color: P.text, fontSize: 12 }}>
              {PALETTES[(palIdx + 1) % PALETTES.length].name}
            </Text>
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={{ width: containerW, paddingHorizontal: 16, paddingBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TopTabs
              value={tab as TabKey}
              onChange={(t) => setTab(t)}
              colors={{
                surface: P.surface,
                surfaceAlt: P.surfaceAlt,
                text: P.text,
                textMuted: P.textMuted,
                border: P.border,
                primary: P.primary,
              }}
            />
          </ScrollView>
        </View>
      </View>

      {/* Content */}
      {tab === "chat" ? (
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ width: containerW, paddingHorizontal: 16, paddingBottom: 12, flex: 1 }}>
            <PartyChat
              P={{
                surface: P.surface,
                surfaceAlt: P.surfaceAlt,
                text: P.text,
                textMuted: P.textMuted,
                border: P.border,
                primary: P.primary,
              }}
              myId={myId}
              chatId={chatId}
              messages={messages}
              onSendText={onSendText}
              keyboardVerticalOffset={insets.bottom + 110}
              avatarMap={avatarMap}
              nameMap={nameMap}
            />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 96 }}>
          <View style={{ width: containerW, paddingHorizontal: 16 }}>
            {tab === "details" && (
              <View
                style={{
                  backgroundColor: P.surface,
                  borderColor: P.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  marginTop: 12,
                  padding: 16,
                  alignSelf: "stretch",
                }}
              >
                <Text style={{ color: P.text, fontWeight: "700", marginBottom: 8 }}>Details</Text>
                {party && <PartyDetails partyId={party.id} appPalette={P} />}
              </View>
            )}

            {tab === "events" && (
              <View
                style={{
                  backgroundColor: P.surface,
                  borderColor: P.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  marginTop: 12,
                  padding: 16,
                  alignSelf: "stretch",
                }}
              >
                {party ? (
                  <PartyEventsLive
                    partyId={party.id}
                    P={P}
                    onEditRequest={(ev) => {
                      setEditingEvent(ev);
                      setCreateOpen(true);
                    }}
                  />
                ) : (
                  <Text style={{ color: P.textMuted }}>Loading party…</Text>
                )}
              </View>
            )}

            {tab === "budget" && (
              <View
                style={{
                  backgroundColor: P.surface,
                  borderColor: P.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  marginTop: 12,
                  padding: 16,
                  alignSelf: "stretch",
                }}
              >
                {party ? (
                  <PartyBudget partyId={party.id} myId={myId} P={P} />
                ) : (
                  <Text style={{ color: P.textMuted }}>Loading party…</Text>
                )}
              </View>
            )}

            {tab === "gallery" && (
              <View
                style={{
                  backgroundColor: P.surface,
                  borderColor: P.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  marginTop: 12,
                  padding: 16,
                  alignSelf: "stretch",
                }}
              >
                <Text style={{ color: P.textMuted }}>Gallery coming soon.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ---- Screen-level floating CTA + modal (only on Events tab) ---- */}
    {tab === "events" && (
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 999 }}>
    {/* Center to content width used by PartyEventsLive: width: containerW - 20, px: 10 */}
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 20 + insets.bottom,
        alignItems: "center",
      }}
    >
      <View style={{ width: containerW - 20, paddingHorizontal: 10, alignSelf: "center" }}>
        <View style={{ alignItems: "flex-end" }}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => {
              setEditingEvent(null);   // so the modal opens in CREATE mode
              setCreateOpen(true);
            }}
            style={{
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: `${P.primary}AA`,
              backgroundColor: P.primary,
              shadowColor: P.primary,
              shadowOpacity: 0.35,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Text style={{ color: "#F6F9FF", fontWeight: "800", letterSpacing: 0.2 }}>
              Create Event
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>

    {party && (
      <CreateEventModal
        visible={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditingEvent(null); // leave edit mode when closing
        }}
        partyId={party.id}
        P={P}
        currencyDefault="USD"
        initialEvent={editingEvent}           // <<— prefill when editing
        mode={editingEvent ? "edit" : "create"} // optional, if your modal supports it
      />
    )}
      </View>
    )}
    </SafeAreaView>
  );
}
