import React from "react";
import { View, SafeAreaView, ViewProps, Platform } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";


export default function Screen({ style, children, ...rest }: ViewProps & { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={[
          {
            flex: 1,
            paddingHorizontal: 16,
            paddingVertical: 12,
            // subtle candy gradient based on the palette
            ...(Platform.OS === "web"
              ? { background: `linear-gradient(180deg, rgba(169,222,249,0.06), rgba(228,193,249,0.04) 40%, rgba(246,148,193,0.03))` } as any
              : {}),
          },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
