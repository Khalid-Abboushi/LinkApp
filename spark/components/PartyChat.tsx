// components/PartyChat.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import type { MessageRow } from "@/data/partyRoom";

type ChatPalette = {
  surface: string;     // chat background
  surfaceAlt: string;  // other-user bubble
  text: string;
  textMuted: string;
  border: string;
  primary: string;     // my bubble
};

export type AvatarMap = Record<string, string | undefined>;
export type NameMap   = Record<string, string | undefined>;

export default function PartyChat({
  P,
  myId,
  chatId,
  messages,
  onSendText,
  keyboardVerticalOffset = 0,
  avatarMap,
  nameMap,
}: {
  P: ChatPalette;
  myId: string | null;
  chatId: string | null;
  messages: MessageRow[];
  onSendText: (text: string) => void | Promise<void>;
  keyboardVerticalOffset?: number;
  avatarMap?: AvatarMap;
  nameMap?: NameMap;
}) {
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList<MessageRow>>(null);
  const didInitialAutoscroll = useRef(false);

  // FlatList is inverted → newest first
  const data = useMemo(() => [...messages].reverse(), [messages]);

  // initial auto-scroll once messages present
  useEffect(() => {
    if (!didInitialAutoscroll.current && messages.length > 0) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
          didInitialAutoscroll.current = true;
        }, 0);
      });
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !chatId) return;

    requestAnimationFrame(() => {
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 0);
    });

    setInput("");
    await onSendText(text);

    requestAnimationFrame(() => {
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 0);
    });
  };

  const timeHM = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const sameMinute = (a: string, b: string) => {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate() &&
      da.getHours() === db.getHours() &&
      da.getMinutes() === db.getMinutes()
    );
  };

  const NAME_LINE_HEIGHT = 10; // so avatar aligns with bubble top when name is shown

  const Bubble = ({ item, index }: { item: MessageRow; index: number }) => {
    const isMine = !!myId && item.author_id === myId;

    // Because data is NEWEST→OLDEST (inverted), the "older" neighbor is at index+1,
    // and the "newer" neighbor is at index-1.
    const older = index + 1 < data.length ? data[index + 1] : undefined;
    const newer = index > 0 ? data[index - 1] : undefined;

    // Show META (avatar + name) on the FIRST message of the chain:
    // if no older msg, or author changed vs older, or minute changed vs older.
    const startAuthorChanged = !older || older.author_id !== item.author_id;
    const startMinuteChanged = older ? !sameMinute(item.created_at, older.created_at) : true;
    const showMetaStart = startAuthorChanged || startMinuteChanged;

    // Show TIMESTAMP on the LAST message of the chain:
    // if no newer msg, or author changed vs newer, or minute changed vs newer.
    const endAuthorChanged = !newer || newer.author_id !== item.author_id;
    const endMinuteChanged = newer ? !sameMinute(item.created_at, newer.created_at) : true;
    const showTimeEnd = endAuthorChanged || endMinuteChanged;

    const displayName =
      nameMap?.[item.author_id] ??
      (item.author_id?.slice ? item.author_id.slice(0, 8) : "User");

    const avatarUri =
      (avatarMap?.[item.author_id] && avatarMap![item.author_id]!.length > 0
        ? avatarMap![item.author_id]
        : "https://placehold.co/32x32/png") as string;

    return (
      <View
        style={{
          flexDirection: isMine ? "row-reverse" : "row",
          alignItems: "flex-start",
          marginBottom: showMetaStart ? 12 : 6,
          gap: 8,
        }}
      >
        {/* Avatar rail — only for FIRST message of a chain (both sides).
           If you prefer to hide your own avatar, add && !isMine here. */}
        {showMetaStart ? (
          <Image
            source={{ uri: avatarUri }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: P.surfaceAlt,
              marginTop: NAME_LINE_HEIGHT + 9, // aligns avatar with bubble top (name sits above)
            }}
          />
        ) : (
          <View style={{ width: 28 }} />
        )}

        {/* Message column */}
        <View style={{ maxWidth: "78%", alignItems: isMine ? "flex-end" : "flex-start" }}>
          {/* Username only on first-of-chain */}
          {showMetaStart && (
            <Text
              style={{ color: P.textMuted, fontSize: 11, marginBottom: 4, lineHeight: NAME_LINE_HEIGHT }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
          )}

          {/* Bubble */}
          <View
            style={{
              backgroundColor: isMine ? P.primary : P.surfaceAlt,
              borderWidth: 1,
              borderColor: isMine ? "transparent" : P.border,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
              alignSelf: "flex-start",
            }}
          >
            {!!item.text && (
              <Text style={{ color: isMine ? "#fff" : P.text, lineHeight: 19 }}>{item.text}</Text>
            )}
          </View>

          {/* Timestamp only on last-of-chain */}
          {showTimeEnd && (
            <Text
              style={{
                color: isMine ? "rgba(255,255,255,0.85)" : P.textMuted,
                fontSize: 10,
                marginTop: 4,
              }}
            >
              {timeHM(item.created_at)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={{ flex: 1 }}
    >
      <View
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: P.border,
          backgroundColor: P.surface,
          borderRadius: 12,
        }}
      >
        <View style={{ flex: 1, padding: 12 }}>
          {!chatId || messages.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: P.textMuted }}>No messages yet — say hi 👋</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={data}
              inverted
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={false}
              maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
              contentContainerStyle={{ paddingVertical: 4 }}
              renderItem={({ item, index }) => <Bubble item={item} index={index} />}
            />
          )}

          {/* Composer */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              borderTopWidth: 1,
              borderTopColor: P.border,
              paddingTop: 10,
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={chatId ? "Message…" : "No chat for this party"}
              editable={!!chatId}
              placeholderTextColor={P.textMuted}
              style={{
                flex: 1,
                backgroundColor: P.surfaceAlt,
                color: P.text,
                borderWidth: 1,
                borderColor: P.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!chatId || !input.trim()}
              activeOpacity={0.85}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: !chatId || !input.trim() ? "#505968" : P.primary,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
