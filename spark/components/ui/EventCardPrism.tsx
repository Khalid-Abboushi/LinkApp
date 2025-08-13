// components/ui/EventCardPrism.tsx
import React from "react";
import {
  View,
  Text,
  ImageBackground,
  TouchableOpacity,
  Animated,
  Easing,
  Pressable,
  Modal,
  TextInput,
  Platform,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import DateTimePicker from "@react-native-community/datetimepicker";

/* =========================
   Palette + fonts
   ========================= */
export type Palette = {
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

/* =========================
   Types
   ========================= */
export type EventCardProps = {
  P: Palette;
  event: {
    id: string;
    name: string;
    description?: string | null;
    location_name?: string | null;
    hero_url?: string | null;
    likes: number;
    dislikes: number;
    net: number;
    myVote: -1 | 0 | 1;
    start_at?: string | null;
    end_at?: string | null;
  };
  onVote: (eventId: string, vote: -1 | 0 | 1) => void;
  canEditTime?: boolean; // owner/admin only
};

/* =========================
   Time helpers
   ========================= */
function partsFromISO(iso?: string | null) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
function toISO(date: string, time: string) {
  if (!date || !time) return null;
  // Local time -> ISO
  const dt = new Date(`${date}T${time}`);
  if (isNaN(+dt)) return null;
  return dt.toISOString();
}
function fmtRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "Time TBA";
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return { d, day, time, key: d.toDateString() };
  };
  if (start && end) {
    const s = fmt(start),
      e = fmt(end);
    return s.key === e.key ? `${s.day} • ${s.time} – ${e.time}` : `${s.day} ${s.time} → ${e.day} ${e.time}`;
  }
  if (start) {
    const s = fmt(start);
    return `${s.day} • ${s.time}`;
  }
  const e = fmt(end!);
  return `${e.day} • ends ${e.time}`;
}

/* =========================
   Web controls (real inputs)
   ========================= */
function WebDateTimeRow({
  P,
  label,
  date,
  time,
  onDate,
  onTime,
  onClear,
}: {
  P: Palette;
  label: string;
  date: string;
  time: string;
  onDate: (s: string) => void;
  onTime: (s: string) => void;
  onClear: () => void;
}) {
  // RNW allows raw DOM usage when Platform.OS === 'web'
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: P.textMuted, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* @ts-ignore */}
        <input
          type="date"
          value={date}
          onChange={(e: any) => onDate(e.target.value)}
          style={{
            color: "white",
            background: "transparent",
            border: `1px solid ${P.glassBorder}`,
            padding: "10px 12px",
            borderRadius: 12,
          }}
        />
        {/* @ts-ignore */}
        <input
          type="time"
          value={time}
          onChange={(e: any) => onTime(e.target.value)}
          style={{
            color: "white",
            background: "transparent",
            border: `1px solid ${P.glassBorder}`,
            padding: "10px 12px",
            borderRadius: 12,
          }}
        />
        <TouchableOpacity
          onPress={onClear}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: P.glassBorder,
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        >
          <Ionicons name="backspace" size={16} color={P.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* =========================
   Mobile-friendly Time Editor
   ========================= */
function TimeEditor({
  P,
  visible,
  onClose,
  eventId,
  startISO,
  endISO,
}: {
  P: Palette;
  visible: boolean;
  onClose: () => void;
  eventId: string;
  startISO?: string | null;
  endISO?: string | null;
}) {
  // Web state
  const sParts = partsFromISO(startISO);
  const eParts = partsFromISO(endISO);
  const [sDate, setSDate] = React.useState(sParts.date);
  const [sTime, setSTime] = React.useState(sParts.time);
  const [eDate, setEDate] = React.useState(eParts.date);
  const [eTime, setETime] = React.useState(eParts.time);

  // Native state
  const [sDateNative, setSDateNative] = React.useState<Date | null>(startISO ? new Date(startISO) : null);
  const [eDateNative, setEDateNative] = React.useState<Date | null>(endISO ? new Date(endISO) : null);
  const [showPicker, setShowPicker] = React.useState<null | "s-date" | "s-time" | "e-date" | "e-time">(null);

  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sp = partsFromISO(startISO);
    const ep = partsFromISO(endISO);
    setSDate(sp.date);
    setSTime(sp.time);
    setEDate(ep.date);
    setETime(ep.time);
    setSDateNative(startISO ? new Date(startISO) : null);
    setEDateNative(endISO ? new Date(endISO) : null);
    setErr(null);
  }, [visible, startISO, endISO]);

  const onSave = async () => {
    setErr(null);
    // Produce ISO for both platforms
    let sISO: string | null = null;
    let eISO: string | null = null;

    if (Platform.OS === "web") {
      sISO = toISO(sDate, sTime);
      eISO = toISO(eDate, eTime);
    } else {
      sISO = sDateNative ? sDateNative.toISOString() : null;
      eISO = eDateNative ? eDateNative.toISOString() : null;
    }

    if (sISO && eISO && new Date(sISO) > new Date(eISO)) {
      setErr("End must be after start.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("events").update({ start_at: sISO, end_at: eISO }).eq("id", eventId);
      if (error) throw error;
      onClose();
    } catch (e: any) {
      setErr(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Native picker change
  const onChangeNative = (kind: "s-date" | "s-time" | "e-date" | "e-time", d?: Date) => {
    if (!d) {
      setShowPicker(null);
      return;
    }
    if (kind.startsWith("s")) {
      const base = sDateNative ?? new Date();
      const merged =
        kind === "s-date"
          ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes())
          : new Date(base.getFullYear(), base.getMonth(), base.getDate(), d.getHours(), d.getMinutes());
      setSDateNative(merged);
    } else {
      const base = eDateNative ?? new Date();
      const merged =
        kind === "e-date"
          ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes())
          : new Date(base.getFullYear(), base.getMonth(), base.getDate(), d.getHours(), d.getMinutes());
      setEDateNative(merged);
    }
    // Close on Android immediate pick
    if (Platform.OS === "android") setShowPicker(null);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      {/* Backdrop */}
      <View style={{ position: "absolute", inset: 0 }}>
        <LinearGradient
          colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.55)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
      </View>

      {/* Centered sheet */}
      <View style={{ position: "absolute", inset: 0, justifyContent: "center", alignItems: "center", padding: 16 }}>
        <View
          style={{
            width: Math.min(Dimensions.get("window").width - 16, 760),
            borderRadius: 18,
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
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ color: P.text, fontFamily: fontHeavy }}>Set time range</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={P.textMuted} />
            </TouchableOpacity>
          </View>

          {/* body */}
          <View style={{ padding: 12 }}>
            {Platform.OS === "web" ? (
              <>
                <WebDateTimeRow
                  P={P}
                  label="Start"
                  date={sDate}
                  time={sTime}
                  onDate={setSDate}
                  onTime={setSTime}
                  onClear={() => {
                    setSDate("");
                    setSTime("");
                  }}
                />
                <WebDateTimeRow
                  P={P}
                  label="End"
                  date={eDate}
                  time={eTime}
                  onDate={setEDate}
                  onTime={setETime}
                  onClear={() => {
                    setEDate("");
                    setETime("");
                  }}
                />
              </>
            ) : (
              <>
                {/* Native pickers - two rows (date + time) for Start and End */}
                <NativePickerRow
                  P={P}
                  label="Start"
                  value={sDateNative}
                  onPickDate={() => setShowPicker("s-date")}
                  onPickTime={() => setShowPicker("s-time")}
                  onClear={() => setSDateNative(null)}
                />
                <NativePickerRow
                  P={P}
                  label="End"
                  value={eDateNative}
                  onPickDate={() => setShowPicker("e-date")}
                  onPickTime={() => setShowPicker("e-time")}
                  onClear={() => setEDateNative(null)}
                />
                {showPicker && (
                  <DateTimePicker
                    value={(showPicker.startsWith("s") ? sDateNative : eDateNative) ?? new Date()}
                    mode={showPicker.endsWith("date") ? "date" : "time"}
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    onChange={(_, d) => onChangeNative(showPicker, d || undefined)}
                  />
                )}
              </>
            )}

            {err ? <Text style={{ color: "#ef4444" }}>{err}</Text> : null}
          </View>

          {/* footer */}
          <View
            style={{
              padding: 12,
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 10,
              borderTopWidth: 1,
              borderColor: P.glassBorder,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: P.glassBorder,
                backgroundColor: P.glass,
              }}
            >
              <Text style={{ color: P.text, fontFamily: fontSans }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={saving}
              onPress={onSave}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: `${P.p1}AA`,
                backgroundColor: `${P.p1}26`,
              }}
            >
              <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>{saving ? "Saving…" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NativePickerRow({
  P,
  label,
  value,
  onPickDate,
  onPickTime,
  onClear,
}: {
  P: Palette;
  label: string;
  value: Date | null;
  onPickDate: () => void;
  onPickTime: () => void;
  onClear: () => void;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: P.textMuted, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <TouchableOpacity
          onPress={onPickDate}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: P.glassBorder,
            backgroundColor: P.glass,
          }}
        >
          <Text style={{ color: P.text }}>{value ? value.toLocaleDateString() : "Pick date"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onPickTime}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: P.glassBorder,
            backgroundColor: P.glass,
          }}
        >
          <Text style={{ color: P.text }}>{value ? value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Pick time"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClear}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: P.glassBorder,
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        >
          <Ionicons name="backspace" size={16} color={P.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* =========================
   Card Component (wrap layout)
   ========================= */
export default function EventCardPrism({ P, event, onVote, canEditTime }: EventCardProps) {
  const GREEN = "#22c55e";
  const RED = "#ef4444";
  const R = 20;
  const screenW = Dimensions.get("window").width;

  // entrance
  const enter = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  const enterT = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  // tilt + hotspot
  const rotX = React.useRef(new Animated.Value(0)).current;
  const rotY = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(1)).current;
  const spotX = React.useRef(new Animated.Value(0)).current;
  const spotY = React.useRef(new Animated.Value(0)).current;
  const cardW = React.useRef(1);
  const cardH = React.useRef(1);
  const maxTilt = 8;

  const onCardLayout = (e: any) => {
    cardW.current = e.nativeEvent.layout.width;
    cardH.current = e.nativeEvent.layout.height;
  };
  const toTilt = (x: number, y: number) => {
    const cx = cardW.current / 2,
      cy = cardH.current / 2;
    const dx = (x - cx) / cx;
    const dy = (y - cy) / cy;
    rotY.setValue(-dx * maxTilt);
    rotX.setValue(dy * maxTilt);
    spotX.setValue(x - 60);
    spotY.setValue(y - 60);
  };
  const onCardMove = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    toTilt(locationX, locationY);
  };
  const onCardDown = (e: any) => {
    Animated.spring(scale, { toValue: 0.985, useNativeDriver: true, friction: 7, tension: 120 }).start();
    onCardMove(e);
  };
  const onCardUp = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }),
      Animated.timing(rotX, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(rotY, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  const [showEdit, setShowEdit] = React.useState(false);

  // Responsive hero height
  const heroH = screenW < 380 ? 180 : 220;

  return (
    <Animated.View style={{ transform: [{ translateY: enterT }], opacity: enter }}>
      <View style={{ borderRadius: R + 4, padding: 1.2, overflow: "hidden", marginBottom: 16 }}>
        <LinearGradient
          colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.03)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: R + 4, padding: 1.2 }}
        >
          <Animated.View
            onLayout={onCardLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onCardDown}
            onResponderMove={onCardMove}
            onResponderRelease={onCardUp}
            style={{
              borderRadius: R,
              overflow: "hidden",
              backgroundColor: P.bg2,
              borderWidth: 1,
              borderColor: P.glassBorder,
              transform: [
                { perspective: 800 },
                { rotateX: rotX.interpolate({ inputRange: [-15, 15], outputRange: ["-15deg", "15deg"] }) },
                { rotateY: rotY.interpolate({ inputRange: [-15, 15], outputRange: ["-15deg", "15deg"] }) },
                { scale },
              ],
            }}
          >
            {/* hero */}
            <Pressable>
              <ImageBackground source={event.hero_url ? { uri: event.hero_url } : undefined} style={{ height: heroH }}>
                {/* tape/stripe */}
                <View style={{ position: "absolute", top: 12, left: -60, transform: [{ rotate: "-18deg" }] }}>
                  <LinearGradient
                    colors={[P.p2, `${P.p2}66`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ width: 150, height: 8, borderRadius: 999 }}
                  />
                </View>
                <LinearGradient
                  colors={[`${P.p2}85`, "transparent"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8 }}
                />
                <LinearGradient
                  colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.86)"]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120 }}
                />
              </ImageBackground>
            </Pressable>

            {/* hotspot */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 120,
                height: 120,
                borderRadius: 120,
                backgroundColor: `${P.p2}22`,
                transform: [{ translateX: spotX }, { translateY: spotY }],
                shadowColor: P.p2,
                shadowOpacity: 0.55,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 0 },
              }}
            />

            {/* body */}
            <View style={{ padding: 14 }}>
              <Text style={{ color: P.text, fontSize: 18, fontFamily: fontHeavy, letterSpacing: 0.3 }}>
                {event.name}
              </Text>
              {!!event.description && (
                <Text style={{ color: P.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6, fontFamily: fontSans }}>
                  {event.description}
                </Text>
              )}
              {!!event.location_name && (
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  <Text style={{ color: P.textMuted, fontSize: 12 }}>📍</Text>
                  <Text style={{ color: P.textMuted, fontSize: 12, fontFamily: fontSans }}>{event.location_name}</Text>
                </View>
              )}

              {/* controls bar — WRAPS, never cut off */}
              <View
                style={{
                  marginTop: 12,
                  padding: 8,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: P.glassBorder,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {/* LIKE */}
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => onVote(event.id, event.myVote === 1 ? 0 : 1)}
                  style={{
                    paddingHorizontal: 14,
                    height: 36,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: event.myVote === 1 ? "#22c55eB3" : P.glassBorder,
                    backgroundColor: event.myVote === 1 ? "rgba(34,197,94,0.12)" : P.glass,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: GREEN,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="thumbs-up" size={14} color="#06110a" />
                  </View>
                  <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 12 }}>{event.likes}</Text>
                </TouchableOpacity>

                {/* DISLIKE */}
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => onVote(event.id, event.myVote === -1 ? 0 : -1)}
                  style={{
                    paddingHorizontal: 14,
                    height: 36,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: event.myVote === -1 ? "#ef4444B3" : P.glassBorder,
                    backgroundColor: event.myVote === -1 ? "rgba(239,68,68,0.12)" : P.glass,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: RED,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="thumbs-down" size={14} color="#160909" />
                  </View>
                  <Text style={{ color: P.text, fontFamily: fontHeavy, fontSize: 12 }}>{event.dislikes}</Text>
                </TouchableOpacity>

                {/* net badge */}
                <View
                  style={{
                    paddingHorizontal: 12,
                    height: 32,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: P.glassBorder,
                    backgroundColor: P.glass,
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 54,
                  }}
                >
                  <Text
                    style={{
                      color: event.net >= 0 ? GREEN : RED,
                      fontFamily: fontHeavy,
                      fontSize: 12,
                      letterSpacing: 0.2,
                    }}
                  >
                    {event.net >= 0 ? `+${event.net}` : `${event.net}`}
                  </Text>
                </View>

                {/* time range pill + pencil */}
                <View style={{ position: "relative" }}>
                  <LinearGradient
                    colors={["rgba(168,139,250,0.35)", "rgba(2,132,199,0.25)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      paddingHorizontal: 12,
                      minHeight: 32,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: P.glassBorder,
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: "#F6F9FF", fontFamily: fontHeavy, fontSize: 12 }}>
                      {fmtRange(event.start_at, event.end_at)}
                    </Text>
                  </LinearGradient>

                  {canEditTime ? (
                    <TouchableOpacity
                      onPress={() => setShowEdit(true)}
                      style={{
                        position: "absolute",
                        right: -8,
                        top: -8,
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: P.glass,
                        borderWidth: 1,
                        borderColor: P.glassBorder,
                      }}
                    >
                      <Ionicons name="pencil" size={14} color={P.text} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Time editor modal */}
            {canEditTime ? (
              <TimeEditor
                P={P}
                visible={showEdit}
                onClose={() => setShowEdit(false)}
                eventId={event.id}
                startISO={event.start_at ?? null}
                endISO={event.end_at ?? null}
              />
            ) : null}
          </Animated.View>
        </LinearGradient>
      </View>

      {/* ground glow */}
      <LinearGradient
        colors={["transparent", `${P.p2}33`, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: "absolute", left: 28, right: 28, bottom: -10, height: 16, borderRadius: 12, opacity: 0.8 }}
      />
    </Animated.View>
  );
}
