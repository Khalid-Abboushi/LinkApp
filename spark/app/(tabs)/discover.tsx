// app/(tabs)/discover.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  Platform,
  Animated,
  RefreshControl,
  ActivityIndicator,
  Keyboard,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import InteractiveCard from "@/components/ui/interactiveCard";

import { generateAICards, type AICard } from "../../lib/ai";
// Location
const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
const [priceTiers, setPriceTiers] = useState<Array<'$'|'$$'|'$$$'|'$$$$'>>([]);

/* =========================
   UTIL — image normalization + prefetch
   ========================= */
const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=1600&auto=format&fit=crop";

const normalizeImage = (u?: string | null) => {
  if (!u || typeof u !== "string") return FALLBACK_IMG;
  let s = u.trim();
  if (s.startsWith("//")) s = "https:" + s;
  if (!s.startsWith("http")) s = "https://" + s;
  // strip common query junk for cache hits
  return s.split("?")[0] || FALLBACK_IMG;
};

async function prefetchImages(urls: string[]) {
  const tasks = urls.map((u) => Image.prefetch(u).catch(() => false));
  try {
    await Promise.all(tasks);
  } catch {}
}
function debounce<F extends (...args: any[]) => void>(fn: F, ms = 400) {
  let t: any;
  return (...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* =========================
   THEME — palettes
   ========================= */
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
const PALETTES: Palette[] = [
  {
    name: "Luxe Neon",
    bg: "#070A0F",
    bg2: "#0C1120",
    text: "#ECF1FF",
    textMuted: "#B7C3DA",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.10)",
    p1: "#22D3EE",
    p2: "#A78BFA",
    p3: "#FB7185",
    p4: "#34D399",
  },
  {
    name: "Electric Sunset",
    bg: "#0B0814",
    bg2: "#140F2B",
    text: "#FFF5FE",
    textMuted: "#D9CBE2",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.12)",
    p1: "#F97316",
    p2: "#F43F5E",
    p3: "#8B5CF6",
    p4: "#06B6D4",
  },
  {
    name: "Cyber Lime",
    bg: "#060A06",
    bg2: "#0B130B",
    text: "#F1FFE9",
    textMuted: "#BCE5C0",
    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.10)",
    p1: "#A3E635",
    p2: "#22D3EE",
    p3: "#BEF264",
    p4: "#38BDF8",
  },
];
const MAX_W = 860;

/* =========================
   CATEGORIES & PRESETS
   ========================= */
const categories = [
  {
    key: "food",
    label: "Food & Drinks",
    img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop",
    match: [
      "restaurant",
      "food",
      "drink",
      "cafe",
      "pizza",
      "dessert",
      "brunch",
    ],
  },
  {
    key: "games",
    label: "Games",
    img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop",
    match: ["arcade", "barcade", "bowling", "board games", "escape room"],
  },
  {
    key: "outdoor",
    label: "Outdoors",
    img: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1200&auto=format&fit=crop",
    match: ["park", "trail", "hike", "picnic", "outdoor"],
  },
  {
    key: "music",
    label: "Music",
    img: "https://images.unsplash.com/photo-1506157786151-b8491531f063?q=80&w=1200&auto=format&fit=crop",
    match: ["live music", "concert", "karaoke", "dj"],
  },
  {
    key: "culture",
    label: "Culture",
    img: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=1200&auto=format&fit=crop",
    match: ["museum", "art", "gallery", "exhibit", "culture"],
  },
];

const presetKeywords: Record<string, string[]> = {
  "Retro night": ["retro arcade", "barcade", "pinball"],
  "Mystery picnic": ["scavenger", "walking tour", "picnic"],
  "Sports day": ["bowling", "climbing gym", "indoor karting"],
  Karaoke: ["karaoke"],
  "Board games": ["board game cafe"],
};

/* =========================
   UI PRIMS
   ========================= */
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

const Chip = ({
  label,
  active,
  onPress,
  color,
  mr = 10,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color: string;
  mr?: number;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.9}
    style={{
      marginRight: mr,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: active ? `${color}AA` : "rgba(255,255,255,0.12)",
      backgroundColor: active ? `${color}22` : "rgba(255,255,255,0.06)",
    }}
  >
    <Text
      style={{
        color: "#F8FAFF",
        fontSize: 12,
        fontFamily: fontSans,
        opacity: active ? 1 : 0.9,
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

/* =========================
   PAGE
   ========================= */
export default function Discover() {
  const [palIdx, setPalIdx] = useState(0);
  const P = PALETTES[palIdx % PALETTES.length];

  const [query, setQuery] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<any | null>(null);

  // AI/Yelp state
  const [aiCards, setAiCards] = useState<(AICard & { uid: string })[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Location
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [locLabel, setLocLabel] = useState("Near you");

  // On mount: ask location + load “popular near me”
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { setLocLabel("Location off"); return; }
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude:lat, longitude:lng } = p.coords;
        setCoords({ lat, lng });

        // nicer chip
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (place?.city) setLocLabel(`${place.city} • Popular`);
        } catch {}

        // first load — popular places (real Yelp)
        await fetchFromYelp({ lat, lng, prompt: "popular restaurants bars fun", maxCards: 6 });
      } catch {
        setLocLabel("Location unavailable");
      }
    })();
  }, []);

  // Build a Yelp query from search + presets + categories
  function buildPrompt() {
    const terms: string[] = [];
    const q = query.trim();
    if (q) terms.push(q);

    presets.forEach((p) => terms.push(...(presetKeywords[p] || [])));
    selectedCats.forEach((k) => {
      const c = categories.find((x) => x.key === k);
      if (c) terms.push(...c.match.map((s) => s.toLowerCase()));
    });

    if (!terms.length) return "popular restaurants bars fun";
    return Array.from(new Set(terms.map((t) => t.toLowerCase()))).join(", ");
  }
  const abortRef = useRef<AbortController | null>(null);
  // Core Yelp fetch
  async function fetchFromYelp(opts: {
    lat: number;
    lng: number;
    prompt?: string;
    maxCards?: number;
  }) {
    // keep current results on screen; just show spinner
    setAiError(null);
    setAiLoading(true);

    // cancel any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!coords) {
  setAiError("Location required");
  return;
}
      const raw = await generateAICards({
        prompt: buildPrompt(),
        lat: coords.lat,
        lng: coords.lng,
        maxCards: 10,
        maxMinutes: 20, // <= 20 minutes only
        mode: "auto", // or "drive" / "walk" / "bike"
        minRating: 3.5,
        radiusMeters: 20000,
        currency: "CAD",
        signal: controller.signal, // if you're using AbortController
      });

      // Normalize + prepare prefetch (don’t await so UI updates faster)
      const normalized = (raw || []).map((c: any, i: number) => {
        const img = normalizeImage(c.imageUrl);
        return { ...c, imageUrl: img, _seq: i };
      });
      // fire-and-forget prefetch to avoid blocking render
      prefetchImages(normalized.map((n: any) => n.imageUrl)).catch(() => {});

      // Sort: rating desc → reviews desc → original order
      normalized.sort(
        (a: any, b: any) =>
          (b.rating ?? 0) - (a.rating ?? 0) ||
          (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
          a._seq - b._seq
      );

      // De-dupe by business id
      const seen = new Set<string>();
      const deduped = normalized.filter((x: any) => {
        const id = String(x.id || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      // Stable unique key for rendering
      const withUid = deduped.map((x: any, i: number) => ({
        ...x,
        uid: `${x.id || "biz"}-${i}`,
      }));

      setAiCards(withUid.slice(0, 6));
    } catch (e: any) {
      // Swallow aborts quietly
      if (e?.name === "AbortError" || e?.message === "Aborted") return;
      setAiError(e?.message ?? "Something went wrong");
      setAiCards([]);
    } finally {
      // Only clear loading if this request wasn't aborted
      if (!controller.signal.aborted) setAiLoading(false);
    }
  }

  // Click “Suggest”
  const runAI = async () => {
    Keyboard.dismiss();
    if (!coords) {
      setAiError("Location required");
      return;
    }
    await fetchFromYelp({ lat: coords.lat, lng: coords.lng });
  };

  // Auto-refresh when toggling presets/categories (debounced)
  useEffect(() => {
    if (!coords) return;
    const t = setTimeout(
      () => fetchFromYelp({ lat: coords.lat, lng: coords.lng }),
      350
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, selectedCats]);

  // Scroll/Aurora
  const scrollY = useRef(new Animated.Value(0)).current;
  const HERO_H = 260;
  const heroTranslate = scrollY.interpolate({
    inputRange: [-100, 0, HERO_H],
    outputRange: [-30, 0, -HERO_H * 0.4],
    extrapolate: "clamp",
  });
  const heroScale = scrollY.interpolate({
    inputRange: [-120, 0],
    outputRange: [1.15, 1],
    extrapolateRight: "clamp",
  });

  const containerW = Math.min(Dimensions.get("window").width, MAX_W);
  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <View style={{ flex: 1, backgroundColor: P.bg }}>
      <Animated.ScrollView
        refreshControl={
          <RefreshControl
            refreshing={aiLoading}
            onRefresh={() => {
              if (coords) fetchFromYelp({ lat: coords.lat, lng: coords.lng });
            }}
            tintColor={P.text}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={{ alignItems: "center", paddingBottom: 140 }}
      >
        {/* HERO */}
        <Animated.View
          style={{
            transform: [{ translateY: heroTranslate }, { scale: heroScale }],
            width: "100%",
          }}
        >
          <View
            style={{
              width: containerW,
              alignSelf: "center",
              paddingHorizontal: 20,
              paddingTop: 70,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 34,
                  color: P.p2,
                  textShadowColor: `${P.p2}AA`,
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 16,
                  letterSpacing: 0.6,
                  fontFamily: fontHeavy,
                }}
              >
                DISCOVER
              </Text>
              <TouchableOpacity
                onPress={() => setPalIdx((i) => (i + 1) % PALETTES.length)}
                activeOpacity={0.9}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: P.glassBorder,
                  backgroundColor: P.glass,
                }}
              >
                <Text
                  style={{ color: P.text, fontFamily: fontSans, fontSize: 12 }}
                >
                  {PALETTES[(palIdx + 1) % PALETTES.length].name}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Context chip */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 10,
                gap: 10,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: P.glass,
                  borderWidth: 1,
                  borderColor: P.glassBorder,
                }}
              >
                <Text
                  style={{
                    color: P.textMuted,
                    fontSize: 12,
                    fontFamily: fontSans,
                  }}
                >
                  {locLabel}
                </Text>
              </View>
            </View>

            {/* Search + Suggest */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
              <BlurView
                intensity={40}
                tint="dark"
                style={{ flex: 1, borderRadius: 16, overflow: "hidden" }}
              >
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: P.glassBorder,
                    paddingHorizontal: 12,
                    paddingVertical: Platform.OS === "web" ? 8 : 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="search" size={16} color={P.textMuted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="What are you in the mood for?"
                    placeholderTextColor={P.textMuted}
                    style={{
                      color: P.text,
                      fontSize: 15,
                      flex: 1,
                      fontFamily: fontSans,
                    }}
                    returnKeyType="search"
                    onSubmitEditing={runAI}
                  />
                  {!!query?.length && (
                    <TouchableOpacity
                      onPress={() => setQuery("")}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="close" size={16} color={P.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </BlurView>
              {/* Simple Filters */}
<View
  style={{
    flexDirection: "row",
    marginTop: 16,
    justifyContent: "space-between",
    paddingHorizontal: 4,
  }}
>
  {/* Location Filter */}
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
    {["Near me", "Downtown", "Custom"].map((loc, i) => (
      <Chip
        key={loc}
        label={loc}
        color={[P.p1, P.p2, P.p3][i % 3]}
        active={locLabel === loc}
        onPress={() => setLocLabel(loc)}
        mr={10}
      />
    ))}
  </ScrollView>

  {/* Price Filter */}
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
    {["$", "$$", "$$$", "$$$$"].map((tier, i) => (
      <Chip
        key={tier}
        label={tier}
        color={P.p4}
        active={priceTiers.includes(tier as "$" | "$$" | "$$$" | "$$$$")}
        onPress={() =>
          setPriceTiers((prev) =>
            prev.includes(tier as "$" | "$$" | "$$$" | "$$$$")
              ? prev.filter((p) => p !== tier)
              : [...prev, tier as "$" | "$$" | "$$$" | "$$$$"]
          )
        }
        mr={8}
      />
    ))}
  </ScrollView>
</View>


              <TouchableOpacity
                onPress={runAI}
                activeOpacity={0.9}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: P.p2,
                  backgroundColor: `${P.p2}33`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {aiLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontFamily: fontHeavy }}>
                    Suggest
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {!!aiError && (
              <View
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#ff4d4f",
                  backgroundColor: "rgba(255,77,79,0.18)",
                }}
              >
                <Text style={{ color: "#ff4d4f" }}>{aiError}</Text>
              </View>
            )}

            
          
          </View>
        </Animated.View>

        {/* Categories */}
        {/*Add later */}
      
        {/* AI results */}
        <View
          style={{ width: containerW, paddingHorizontal: 20, marginTop: 30 }}
        >
          {aiLoading && aiCards.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : aiCards.length > 0 ? (
            aiCards.map((item, i) => {
              // Map Yelp AICard -> InteractiveCard shape
              const s = {
                id: item.id,
                title: item.title,
                desc:
                  item.description ||
                  item.includes?.slice(0, 3).join(" • ") ||
                  "",
                minutes: item.distanceMinutes ?? 120, // <-- use the real ETA
                group: "2–6",
                location: item.placeName || "Nearby",
                tags: [
                  ...(item.tags || []),
                  item.priceLabel || "",
                  typeof item.rating === "number"
                    ? `${item.rating.toFixed(1)}★ (${item.reviewCount ?? 0})`
                    : "",
                  item.distanceText || "",
                ].filter(Boolean),
                lat: (item as any).lat ?? null,
                lng: (item as any).lng ?? null,
                hero: item.imageUrl,
                rating: item.rating,
                reviewCount: item.reviewCount,
                priceLabel: item.priceLabel,
                distanceText: item.distanceText,
              };
              return (
                <InteractiveCard
                  key={item.uid}
                  s={s as any}
                  P={P}
                  idx={i}
                  saved={!!saved[item.uid]}
                  onSave={() =>
                    setSaved((p) => ({ ...p, [item.uid]: !p[item.uid] }))
                  }
                  onPreview={(x) => setPreview(x)}
                />
              );
            })
          ) : (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <Text style={{ color: P.textMuted, fontFamily: fontSans }}>
                No results yet. Try a different query or toggle a category.
              </Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* If you have your PreviewOverlay component, render it here */}
      {preview ? (
        // @ts-ignore
        <PreviewOverlay
          s={preview}
          accent={P.p2}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </View>
  );
}
