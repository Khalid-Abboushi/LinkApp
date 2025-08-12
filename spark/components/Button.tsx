// components/ui/Button.tsx
import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  TextStyle,
  View,
  Platform,
} from "react-native";

type Variant = "solid" | "ghost" | "outline" | "soft";
type Tone = "neutral" | "primary" | "danger" | "success";

export type ButtonProps = {
  children?: React.ReactNode;
  title?: string; // legacy support
  onPress?: () => void;
  variant?: Variant;
  tone?: Tone;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  testID?: string;
};

const C = {
  neutral: { bg: "#1F2937", fg: "#E5E7EB", border: "#374151", soft: "#111827" },
  primary: { bg: "#7C3AED", fg: "#F5F3FF", border: "#6D28D9", soft: "#2E1065" },
  danger:  { bg: "#DC2626", fg: "#FEF2F2", border: "#B91C1C", soft: "#450A0A" },
  success: { bg: "#16A34A", fg: "#ECFDF5", border: "#15803D", soft: "#052e16" },
};

function pickColors(tone: Tone = "primary") {
  return C[tone] ?? C.primary;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  title,
  onPress,
  variant = "solid",
  tone = "primary",
  loading = false,
  disabled = false,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  testID,
}) => {
  const c = pickColors(tone);
  const base: ViewStyle = {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    opacity: disabled ? 0.6 : 1,
    ...(Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }
      : { elevation: variant === "solid" ? 2 : 0 }),
  };

  const variants: Record<Variant, ViewStyle> = {
    solid:   { backgroundColor: c.bg, borderColor: c.bg },
    ghost:   { backgroundColor: "transparent", borderColor: "transparent" },
    outline: { backgroundColor: "transparent", borderColor: c.border },
    soft:    { backgroundColor: c.soft, borderColor: c.border },
  };

  const labelColor =
    variant === "solid" ? c.fg : tone === "neutral" ? "#E5E7EB" : c.bg;

  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        variants[variant],
        pressed && !disabled ? { transform: [{ translateY: 1 }] } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          {leftIcon ? <View>{leftIcon}</View> : null}
          <Text style={[{ color: labelColor, fontWeight: "700" }, textStyle]}>
            {children ?? title}
          </Text>
          {rightIcon ? <View>{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
};

// Export default too, in case some files import default.
export default Button;
