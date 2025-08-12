import React from "react";
import { Stack } from "expo-router";
import { View } from "react-native";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import RealtimeBridge from "@/providers/RealtimeBridge";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RealtimeBridge />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </AuthProvider>
    </ThemeProvider>
  );
}
