// components/profile/NotificationsPanel.tsx
import React from "react";
import { View, Text, Pressable, Image, Platform } from "react-native";
import type { PendingIncoming, ProfileBrief } from "@/lib/friends";

const fontHeavy = Platform.select({ ios: "Avenir-Heavy", android: "sans-serif-medium", default: "system-ui" });
const fontSans  = Platform.select({ ios: "Avenir-Book",  android: "sans-serif",        default: "system-ui" });

export type Ephemeral = { id: string; title: string };

export default function NotificationsPanel({
  P,
  incoming,
  onAccept,
  onDecline,
  ephemeral,
}: {
  P: { surface: string; text: string; textMuted: string; border: string; primary: string };
  incoming: PendingIncoming[];              // friend requests to me (with avatar+name)
  onAccept: (reqId: string) => void;
  onDecline: (reqId: string) => void;
  ephemeral: Ephemeral[];                   // e.g., “You’re friends now with X”
}) {
  const Empty = (
    <Text style={{ color: P.textMuted, fontFamily: fontSans }}>No notifications.</Text>
  );

  return (
    <View style={{ backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, borderRadius: 12, padding: 16, alignSelf: "stretch" }}>
      {/* Ephemeral info cards */}
      {ephemeral.map((e) => (
        <View key={e.id} style={{ borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Text style={{ color: P.text, fontFamily: fontHeavy }}>{e.title}</Text>
        </View>
      ))}

      {/* Incoming friend requests */}
      {incoming.length === 0 ? (
        ephemeral.length === 0 ? Empty : null
      ) : (
        incoming.map((req) => (
          <View key={req.id} style={{ borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 10, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={{ uri: req.requester.avatar_url || "https://placehold.co/64x64/png" }} style={{ width: 32, height: 32, borderRadius: 999 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: P.text, fontFamily: fontHeavy }}>
                {req.requester.display_name || "User"}
              </Text>
              <Text style={{ color: P.textMuted, fontFamily: fontSans, fontSize: 12 }}>sent you a friend request</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => onAccept(req.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: P.primary }}>
                <Text style={{ color: P.text, fontFamily: fontHeavy }}>Accept</Text>
              </Pressable>
              <Pressable onPress={() => onDecline(req.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: P.border }}>
                <Text style={{ color: P.text, fontFamily: fontHeavy }}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
