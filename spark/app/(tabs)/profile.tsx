import React from "react";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { Text, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";

export default function Profile() {
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const name =
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.username ||
    user?.email;

  return (
    <View>
      <Text style={{ fontSize: 24, fontWeight: "800", color: theme.colors.text.primary, marginBottom: 8 }}>
        Profile
      </Text>
      <Card>
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.text.primary, fontWeight: "700" }}>{name}</Text>
          <Text style={{ color: theme.colors.text.muted }}>{user?.email}</Text>
          <View style={{ height: 12 }} />
          <Button
            title="Settings"
            variant="outline"
            tone="neutral"
            onPress={() => {}}
          />
          <Button
            title="Sign out"
            variant="outline"
            tone="neutral"
            onPress={async () => {
              await signOut();
              router.replace("/");
            }}
          />
        </View>
      </Card>
    </View>
  );
}
