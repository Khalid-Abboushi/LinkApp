// components/ui/AddToPartyDialog.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  ImageBackground,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { fetchMyParties } from "@/data/parties";
import { addSuggestionToParty } from "@/data/events";
import { geocodeAddress } from "@/lib/geocode";

/* ===== Shared palette type (matches Discover) ===== */
type Palette = {
  name: string;
  bg: string;
  bg2: string;
  text: string;
  textMuted: string;
  glass: string;
  glassBorder: string;
  p1: string;
  p2: string;
  p3: string;
  p4: string;
};

type PartyRow = { id: string; name: string; picture_url?: string | null };

type SuggestionLike = {
  id: string;
  title: string;
  desc?: string;     // holds the address string in your data
  location?: string; // optional place/venue name
  minutes?: number;
  tags?: string[];
  hero?: string;
  // enriched by this dialog before saving:
  _address?: string | null;
  _geo?: { lat: number; lng: number; label: string } | null;
};

const fontHeavy = Platform.select({
  ios: "Avenir-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});
const fontSans = Platform.select({
  ios: "Avenir-Book",
  android: "sans-serif",
  default: "system-ui",
});

/** Fullscreen helper: fixed on web (so it ignores page scroll), absolute on native */
const FULLSCREEN: any =
  Platform.OS === "web"
    ? { position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }
    : { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };

/* =========================
   Wide shimmering party row
   ========================= */
function PartyPickRow({
  p,
  P,
  state,
  onAdd,
}: {
  p: PartyRow;
  P: Palette;
  state: "idle" | "loading" | "added" | "exists" | "error";
  onAdd: () => void;
}) {
  const w = Math.min(Dimensions.get("window").width - 40, 740);
  const h = 96;
  const R = 18;

  // subtle shine sweep
  const shine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1200),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const translateX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-w * 0.6, w],
  });

  // web-only rounded clipping fallback
  const clipRoundWeb =
    Platform.OS === "web"
      ? ({ clipPath: `inset(0 round ${R}px)` } as any)
      : undefined;

  const hasImg = !!p.picture_url;
  const blueLeft = `${P.p2}44`;
  const blueMid = "rgba(12, 22, 55, 0.28)";
  const blueDeep = "rgba(6, 12, 28, 0.55)";

  const disabled =
    state === "loading" || state === "added" || state === "exists";

  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: R,
        overflow: "hidden",
        marginBottom: 12,
        backgroundColor: P.bg2,
        borderWidth: 1,
        borderColor: P.glassBorder,
      }}
    >
      {/* soft frame */}
      <LinearGradient
        colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: R,
          pointerEvents: "none",
        }}
      />

      <ImageBackground
        source={hasImg ? { uri: p.picture_url! } : undefined}
        style={[{ flex: 1, flexDirection: "row" }, clipRoundWeb]}
        imageStyle={{ borderRadius: R }}
      >
        {/* top stripe */}
        <LinearGradient
          colors={[`${P.p2}66`, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6 }}
        />

        {/* legibility overlays */}
        {hasImg && (
          <>
            <LinearGradient
              colors={[blueLeft, blueMid, "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "70%",
              }}
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.45)"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "65%",
              }}
            />
            <LinearGradient
              colors={["transparent", blueDeep]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                right: 0,
                width: 140,
              }}
            />
          </>
        )}

        {/* sheen */}
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 90,
            transform: [{ translateX }],
          }}
        >
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.22)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        {/* content */}
        <View
          style={{
            flex: 1,
            paddingHorizontal: 14,
            alignItems: "center",
            flexDirection: "row",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                color: P.text,
                fontSize: 16,
                fontFamily: fontHeavy,
                letterSpacing: 0.2,
                textShadowColor: "rgba(0,0,0,0.55)",
                textShadowRadius: 6,
                textShadowOffset: { width: 0, height: 1 },
              }}
            >
              {p.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: P.textMuted,
                fontSize: 12,
                marginTop: 4,
                fontFamily: fontSans,
                textShadowColor: "rgba(0,0,0,0.45)",
                textShadowRadius: 5,
                textShadowOffset: { width: 0, height: 1 },
              }}
            >
              Add this idea to{" "}
              <Text style={{ color: P.text, fontFamily: fontHeavy }}>
                {p.name}
              </Text>
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={disabled ? 1 : 0.92}
            onPress={disabled ? undefined : onAdd}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor:
                state === "exists"
                  ? "rgba(255,255,255,0.18)"
                  : state === "added"
                  ? `${P.p1}AA`
                  : `${P.p1}AA`,
              backgroundColor:
                state === "loading"
                  ? "rgba(255,255,255,0.08)"
                  : state === "exists"
                  ? "rgba(255,255,255,0.06)"
                  : `${P.p1}26`,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: disabled ? 0.86 : 1,
            }}
          >
            {state === "loading" ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons
                name={
                  state === "exists"
                    ? "alert-circle"
                    : state === "added"
                    ? "checkmark-circle"
                    : "add"
                }
                size={18}
                color={"#F6F9FF"}
              />
            )}
            <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>
              {state === "exists"
                ? "ALREADY ADDED"
                : state === "added"
                ? "ADDED"
                : state === "loading"
                ? "ADDING…"
                : "ADD"}
            </Text>
          </TouchableOpacity>
        </View>
      </ImageBackground>
    </View>
  );
}

/* =========================
   Dialog
   ========================= */
export default function AddToPartyDialog({
  visible,
  onClose,
  P,
  suggestion,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  P: Palette;
  suggestion: SuggestionLike;
  onAdded?: (
    partyId: string,
    result: { status: "created" | "exists"; eventId: string }
  ) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [parties, setParties] = useState<PartyRow[]>([]);

  // per-party UI state
  const [rowState, setRowState] = useState<
    Record<"idle" | "loading" | "added" | "exists" | "error" | string, any>
  >({});

  // lock page scroll on web while dialog is open
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const body = document?.body as HTMLBodyElement | undefined;
    const prev = body?.style.overflow;
    if (visible && body) body.style.overflow = "hidden";
    return () => {
      if (body) body.style.overflow = prev ?? "";
    };
  }, [visible]);

  // load parties when dialog opens
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!visible) return;
      setLoading(true);
      try {
        const data = await fetchMyParties();
        if (!alive) return;
        const rows = data.map((p) => ({
          id: p.id,
          name: p.name,
          picture_url: p.picture_url ?? undefined,
        }));
        setParties(rows);
        // reset row states for fresh open
        const init: Record<string, "idle"> = {} as any;
        rows.forEach((r) => (init[r.id] = "idle"));
        setRowState(init);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible]);

  async function handleAdd(partyId: string) {
    setRowState((s) => ({ ...s, [partyId]: "loading" }));
    try {
      // ---- 1) Extract an address from the suggestion (you store it in `desc`) ----
      // Only take the first line if there are line breaks.
      const rawAddress =
        (suggestion.desc?.trim() || suggestion.location?.trim() || "").split(
          "\n"
        )[0];

      // ---- 2) Best-effort geocode with Geoapify ----
      let geo: { lat: number; lng: number; label: string } | null = null;
      const apiKey = process.env.EXPO_PUBLIC_GEOAPIFY_KEY;
      if (apiKey && rawAddress) {
        try {
          geo = await geocodeAddress(rawAddress, apiKey);
        } catch (e) {
          console.warn(
            "Geoapify geocode failed; proceeding without lat/lng:",
            e
          );
        }
      } else {
        if (!apiKey) console.warn("Missing EXPO_PUBLIC_GEOAPIFY_KEY");
        if (!rawAddress) console.warn("No address provided to geocode");
      }

      // ---- 3) Send enriched data to your insert helper ----
      const res = await addSuggestionToParty(partyId, {
        ...suggestion,
        _address: rawAddress || null,
        _geo: geo, // { lat, lng, label } | null
      } as SuggestionLike);

      setRowState((s) => ({
        ...s,
        [partyId]: res.status === "exists" ? "exists" : "added",
      }));
      onAdded?.(partyId, res);
    } catch (e) {
      setRowState((s) => ({ ...s, [partyId]: "error" }));
      console.warn("addSuggestionToParty failed", e);
      setTimeout(
        () => setRowState((s) => ({ ...s, [partyId]: "idle" })),
        1600
      );
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Fullscreen/backdrop (fixed on web) */}
      <View style={[FULLSCREEN, { zIndex: 9999 }]}>
        {/* Blur + dim */}
        <BlurView intensity={55} tint="dark" style={[FULLSCREEN]} />
        <View style={[FULLSCREEN, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
        {/* Click outside to close */}
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={FULLSCREEN} />
        {/* Centered sheet */}
        <View
          pointerEvents="box-none"
          style={[
            FULLSCREEN,
            { justifyContent: "center", alignItems: "center", padding: 20 },
          ]}
        >
          <View
            style={{
              width: Math.min(Dimensions.get("window").width - 20, 780),
              maxHeight: Dimensions.get("window").height * 0.76,
              borderRadius: 22,
              overflow: "hidden",
              backgroundColor: P.bg2,
              borderWidth: 1,
              borderColor: P.glassBorder,
            }}
          >
            {/* header */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: P.glassBorder,
                backgroundColor: P.bg2,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{ color: P.text, fontSize: 16, fontFamily: fontHeavy }}
              >
                Add to a party
              </Text>
              <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
                <Ionicons name="close" size={18} color={P.textMuted} />
              </TouchableOpacity>
            </View>

            {/* body */}
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator />
                <Text
                  style={{
                    color: P.textMuted,
                    marginTop: 10,
                    fontFamily: fontSans,
                  }}
                >
                  Loading your parties…
                </Text>
              </View>
            ) : parties.length === 0 ? (
              <View style={{ padding: 18 }}>
                <View
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: P.glass,
                    borderWidth: 1,
                    borderColor: P.glassBorder,
                  }}
                >
                  <Text
                    style={{
                      color: P.text,
                      fontFamily: fontHeavy,
                      marginBottom: 6,
                    }}
                  >
                    You aren’t in any parties yet
                  </Text>
                  <Text style={{ color: P.textMuted, fontFamily: fontSans }}>
                    Create one and invite your friends!
                  </Text>
                </View>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 18 }}>
                {parties.map((p) => (
                  <PartyPickRow
                    key={p.id}
                    p={p}
                    P={P}
                    state={rowState[p.id] ?? "idle"}
                    onAdd={() => handleAdd(p.id)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
