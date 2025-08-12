import React from "react";
import { TextInput, View, Text } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

export default function Input({
  label,
  hint,
  error,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label?: string; hint?: string; error?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: t.text.muted }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.text.muted}
        style={{
          backgroundColor: t.card,
          color: t.text.primary,
          borderColor: error ? t.danger[500] : t.border,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
        {...rest}
      />
      {error ? <Text style={{ color: t.danger[500] }}>{error}</Text> : hint ? <Text style={{ color: t.text.muted }}>{hint}</Text> : null}
    </View>
  );
}
