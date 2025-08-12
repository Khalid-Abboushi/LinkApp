// components/ui/Card.tsx
import React, { useMemo, useRef } from "react";
import {
  View,
  Platform,
  ViewStyle,
  StyleProp,
  ViewProps,
  Pressable,
  Animated,
} from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

type Variant = "elevated" | "outline" | "flat";
type Radius = "sm" | "md" | "lg" | "xl";
type Tone = "primary" | "success" | "danger" | "neutral";

interface CardProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  dense?: boolean;
  variant?: Variant;
  radius?: Radius;
  /** accent/glow color family */
  tone?: Tone;
  /** subtle outer glow matched to tone */
  glow?: boolean;
  /** press to scale & lift */
  interactive?: boolean;
  /** translucent glass look */
  glass?: boolean;
  /** soft layered gradient-like background (no extra deps) */
  gradient?: boolean;
}

export default function Card({
  children,
  style,
  padded = true,
  dense,
  variant = "elevated",
  radius = "lg",
  tone = "neutral",
  glow = false,
  interactive = true,
  glass = false,
  gradient = true,
  ...rest
}: CardProps) {
  const t = useTheme();
  const rMap: Record<Radius, number> = { sm: 10, md: 12, lg: 16, xl: 20 };

  // Animated press scale
  const scale = useRef(new Animated.Value(1)).current;
  const runPress = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 140,
    }).start();

  const toneColor =
    tone === "primary"
      ? t.brand[500]
      : tone === "success"
      ? t.success[500]
      : tone === "danger"
      ? t.danger[500]
      : t.border;

  const softTone =
    tone === "primary"
      ? t.brand[300]
      : tone === "success"
      ? t.success[300]
      : tone === "danger"
      ? t.danger[300]
      : t.border;

  const shadowWeb: ViewStyle =
    Platform.OS === "web"
      ? ({
          boxShadow:
            "0 18px 40px rgba(0,0,0,0.18), 0 6px 14px rgba(0,0,0,0.12)",
        } as any)
      : {};

  const shadowNative: ViewStyle =
    Platform.OS !== "web"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          elevation: 8,
        }
      : {};

  const elevated: ViewStyle =
    variant === "elevated" ? { ...shadowWeb, ...shadowNative } : {};

  const outline: ViewStyle =
    variant === "outline"
      ? { borderWidth: 1, borderColor: t.border }
      : {};

  // Base background
  const baseBg: ViewStyle =
    variant === "flat"
      ? { backgroundColor: t.cardSoft }
      : { backgroundColor: t.card };

  // Glass (web gets real blur; native gets translucent)
  const glassBg: ViewStyle = glass
    ? Platform.select({
        web: ({
          backgroundColor: "rgba(255,255,255,0.08)",
          // @ts-ignore web-only
          backdropFilter: "blur(10px) saturate(120%)",
          // @ts-ignore web-only
          WebkitBackdropFilter: "blur(10px) saturate(120%)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
        } as any),
        default: {
          backgroundColor:
            t.mode === "dark"
              ? "rgba(255,255,255,0.04)"
              : "rgba(255,255,255,0.6)",
          borderWidth: 1,
          borderColor:
            t.mode === "dark"
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.06)",
        },
      }) as ViewStyle
    : {};

  // Subtle tone glow
  const glowStyle: ViewStyle =
    glow
      ? Platform.select({
          web: ({
            boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 18px 50px ${hexToRgba(
              toneColor,
              0.25
            )}, 0 2px 8px ${hexToRgba(toneColor, 0.15)}`,
          } as any),
          default: {
            shadowColor: toneColor,
            shadowOpacity: 0.26,
            shadowRadius: 24,
            elevation: 10,
          },
        })!
      : {};

  const paddingStyle: ViewStyle = padded
    ? { padding: dense ? 12 : 16 }
    : {};

  const containerBase: ViewStyle = useMemo(
    () => ({
      borderRadius: rMap[radius],
      overflow: "hidden",
    }),
    [radius]
  );

  const Inner = (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        containerBase,
        baseBg,
        glassBg,
        elevated,
        outline,
        glowStyle,
        paddingStyle,
        // subtle 1px top highlight to add depth
        {
          borderTopColor: "rgba(255,255,255,0.06)",
          borderTopWidth: glass ? 0 : 0.5,
        },
        style,
      ]}
    >
      {/* gradient-ish layers without deps */}
      {gradient && (
        <>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor:
                t.mode === "dark"
                  ? "rgba(255,255,255,0.02)"
                  : "rgba(0,0,0,0.01)",
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -40,
              right: -30,
              width: 160,
              height: 160,
              borderRadius: 999,
              backgroundColor: hexToRgba(softTone, 0.18),
              transform: [{ rotate: "12deg" }],
              filter: Platform.OS === "web" ? "blur(20px)" : undefined,
            } as any}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: -50,
              left: -30,
              width: 200,
              height: 200,
              borderRadius: 999,
              backgroundColor: hexToRgba(toneColor, 0.12),
              transform: [{ rotate: "-8deg" }],
              filter: Platform.OS === "web" ? "blur(22px)" : undefined,
            } as any}
          />
        </>
      )}

      {/* thin accent bar for visual identity */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: hexToRgba(toneColor, 0.65),
          opacity: glass ? 0.75 : 0.6,
        }}
      />
      {children}
    </Animated.View>
  );

  if (!interactive) {
    return (
      <View {...rest} style={{ borderRadius: rMap[radius] }}>
        {Inner}
      </View>
    );
  }

  return (
    <Pressable
      {...rest}
      onPressIn={() => runPress(0.985)}
      onPressOut={() => runPress(1)}
      style={({ hovered }) => [
        { borderRadius: rMap[radius] },
        hovered
          ? Platform.OS === "web"
            ? ({
                // lightweight hover ring on web
                boxShadow: `0 0 0 2px ${hexToRgba(toneColor, 0.2)}`,
              } as any)
            : {}
          : {},
      ]}
    >
      {Inner}
    </Pressable>
  );
}

// small util: turns #RRGGBB into rgba
function hexToRgba(hex: string, a = 1) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${a})`;
}
