// components/TopTabs.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Animated, LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";

export type TabKey = "details" | "chat" | "events" | "polls" | "gallery";

type Colors = {
  surface: string;     // control background
  surfaceAlt: string;  // pill base
  text: string;
  textMuted: string;
  border: string;
  primary: string;     // accent
};

type Props = {
  value: TabKey;
  onChange: (t: TabKey) => void;
  tabs?: TabKey[];
  colors: Colors;
};

const DEFAULT_TABS: TabKey[] = ["details", "chat", "events", "polls", "gallery"];

export default function TopTabs({ value, onChange, tabs = DEFAULT_TABS, colors }: Props) {
  const containerWidthRef = useRef(0);
  const [ready, setReady] = useState(false);

  const count = tabs.length;
  const activeIndex = Math.max(0, tabs.indexOf(value));
  const x = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.timing(x, { toValue: activeIndex, duration: 220, useNativeDriver: true }).start();
  }, [activeIndex]);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
    setReady(true);
  };

  // pill metrics (equal width segments)
  const pillMetrics = useMemo(() => {
    const cw = containerWidthRef.current || 0;
    const w = cw ? cw / count : 0;
    const translateX = x.interpolate({
      inputRange: tabs.map((_, i) => i),
      outputRange: tabs.map((_, i) => i * w),
    });
    return { segmentW: w, translateX };
  }, [count]);

  // whole-bar SHINE (sweeps across the control)
  const shine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 3200, useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const shineTranslateX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-160, (containerWidthRef.current || 320) + 160],
  });

  const renderIcon = (t: TabKey, active: boolean) => {
    const c = active ? colors.text : colors.textMuted;
    switch (t) {
      case "details":
        return <Feather name="folder" size={16} color={c} />;
      case "chat":
        return <Ionicons name="chatbubble-ellipses-outline" size={16} color={c} />;
      case "events":
        return <Ionicons name="calendar-outline" size={16} color={c} />;
      case "polls":
        return <Ionicons name="bar-chart-outline" size={16} color={c} />;
      case "gallery":
      default:
        return <Ionicons name="images-outline" size={16} color={c} />;
    }
  };

  const label = (t: TabKey) =>
    t === "details" ? "Details" : t === "chat" ? "Chat" : t === "events" ? "Events" : t === "polls" ? "Polls" : "Gallery";

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2 }}>
      <View
        onLayout={onContainerLayout}
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: 14,
          overflow: "hidden",
          padding: 2,
          minWidth: 300,
          position: "relative",
        }}
      >
        {/* Whole-bar SHINE overlay (diagonal sweep) */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            bottom: 2,
            left: -160,           // start off-screen
            width: 160,           // width of shine band
            transform: [{ translateX: shineTranslateX }, { rotate: "18deg" }],
            opacity: 0.14,
          }}
        >
          <LinearGradient
            colors={["transparent", "#FFFFFF", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        {/* Soft ambient edge glow (static, subtle) */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 16,
            backgroundColor: colors.primary + "18",
          }}
        />

        {/* Active segment pill (no internal shimmer now) */}
        {ready && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 4,
              bottom: 4,
              left: 4,
              width: pillMetrics.segmentW ? pillMetrics.segmentW - 8 : 0,
              borderRadius: 10,
              transform: [{ translateX: pillMetrics.translateX }],
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[colors.primary, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, borderRadius: 10 }}
            />
          </Animated.View>
        )}

        {tabs.map((t) => {
          const active = value === t;
          return (
            <Pressable
              key={t}
              onPress={() => onChange(t)}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "90%" }}>
                {renderIcon(t, active)}
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? colors.text : colors.textMuted,
                    fontWeight: "700",
                  }}
                >
                  {label(t)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
