// components/party/CreateEventModal.tsx
import React, { useEffect, useRef, useState, memo, forwardRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Image,
  Keyboard,
  TextInputProps,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";
import { uploadImageToPartyPics, type PickedImage } from "@/data/uploadImage";

/* =========================
   Palette
   ========================= */
export type AppPalette = {
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  surfaceAlt?: string;
  bg?: string;
  bg2?: string;
  glass?: string;
  glassBorder?: string;
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
   Small external components (stable types)
   ========================= */
const Label = memo(function Label({ text, P }: { text: string; P: AppPalette }) {
  return (
    <Text style={{ color: P.textMuted, fontFamily: fontSans, fontSize: 12, marginBottom: 6 }}>
      {text}
    </Text>
  );
});

const ModalInput = memo(
  forwardRef<TextInput, TextInputProps & { P: AppPalette }>(function ModalInput(
    { P, style, ...props },
    ref
  ) {
    return (
      <TextInput
        ref={ref}
        {...props}
        placeholderTextColor={P.textMuted}
        style={[
          {
            backgroundColor: P.surface,
            color: P.text,
            borderWidth: 1,
            borderColor: P.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === "ios" ? 12 : 10,
          },
          style,
        ]}
      />
    );
  })
);

/* =========================
   Types
   ========================= */
export type EventEditing = {
  id: string;
  name: string;
  description?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  cost_amount?: number | null;
  currency?: string | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  hero_url?: string | null;
  dress_code?: number | null;
};

export type InitialEvent = {
  id: string;
  party_id: string;
  name: string;
  description?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  hero_url?: string | null;
  cost_amount?: number | null;
  currency?: string | null;
  cost_mode?: string | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  dress_code?: number | null; // 0..4
  added_by?: string | null;
  start_at?: string | null;
  end_at?: string | null;
};

/* =========================
   Geocoding helper (Geoapify)
   ========================= */
async function geocodeAddress(address: string, apiKey: string) {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
    address
  )}&limit=1&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const data = await res.json();
  const f = data?.features?.[0];
  if (!f) throw new Error("No geocode results");
  const [lng, lat] = f.geometry?.coordinates ?? [];
  const label =
    f.properties?.formatted ||
    f.properties?.address_line1 ||
    address;
  return { lat: Number(lat), lng: Number(lng), label };
}

/* =========================
   Component
   ========================= */
export default function CreateEventModal({
  visible,
  onClose,
  onSaved,
  partyId,
  P,
  currencyDefault = "USD",
  mode,
  editing,
  initialEvent,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: (eventId: string) => void;
  partyId: string;
  P: AppPalette;
  currencyDefault?: string;
  mode?: "create" | "edit";
  editing?: EventEditing | null;
  initialEvent?: InitialEvent | null;
}) {
  const isEdit = mode === "edit" || !!editing || !!initialEvent;

  // fixed sizing
  const W = Dimensions.get("window").width;
  const H = Dimensions.get("window").height;
  const DIALOG_W = Math.min(W - 24, 760);
  const DIALOG_H = Math.max(420, Math.floor(H * 0.6));
  const HEADER_H = 52;
  const FOOTER_H = 64;
  const BODY_H = DIALOG_H - HEADER_H - FOOTER_H;

  /* ====== Form state ====== */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [cost, setCost] = useState<string>("0");
  const [minSize, setMinSize] = useState<string>("1");
  const [maxSize, setMaxSize] = useState<string>("12");
  const [currency] = useState<string>(currencyDefault);
  const [hero, setHero] = useState<string | null>(null);
  const [dress, setDress] = useState<number>(2);

  const [submitting, setSubmitting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  /* ====== Prefill: run once per open/target ====== */
  const editKey = editing?.id ?? initialEvent?.id ?? null;
  const didInitRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      didInitRef.current = false;
      return;
    }
    if (didInitRef.current) return;
    didInitRef.current = true;

    const src: Partial<EventEditing & InitialEvent> | null =
      (editing as any) ?? (initialEvent as any) ?? null;

    if (src) {
      setName(src.name ?? "");
      setDescription(src.description ?? "");
      setLocationName(src.location_name ?? "");
      setAddress(src.location_address ?? "");
      setCost(
        typeof src.cost_amount === "number" && !Number.isNaN(src.cost_amount)
          ? String(src.cost_amount)
          : ""
      );
      setMinSize(
        typeof src.min_group_size === "number" && !Number.isNaN(src.min_group_size)
          ? String(src.min_group_size)
          : "1"
      );
      setMaxSize(
        typeof src.max_group_size === "number" && !Number.isNaN(src.max_group_size)
          ? String(src.max_group_size)
          : "12"
      );
      setHero(src.hero_url ?? null);
      setDress(
        typeof src.dress_code === "number" && src.dress_code >= 0 ? src.dress_code : 2
      );
    } else {
      setName("");
      setDescription("");
      setLocationName("");
      setAddress("");
      setCost("0");
      setMinSize("1");
      setMaxSize("12");
      setHero(null);
      setDress(2);
    }
  }, [visible, editKey]);

  /* ====== Helpers ====== */
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setHero(asset.uri);
  };

  const uploadIfNeeded = async (): Promise<string | null> => {
    if (!hero) return null;
    if (/^https?:\/\//i.test(hero)) return hero;
    const url = await uploadImageToPartyPics({ uri: hero } as PickedImage);
    return url;
  };

  const validate = () => {
    if (!name.trim()) return "Name is required.";
    if (!description.trim()) return "Description is required.";
    if (!address.trim()) return "Address is required.";
    if (!/^\d+(\.\d+)?$/.test(cost)) return "Cost must be a number.";
    if (!/^\d+$/.test(minSize) || !/^\d+$/.test(maxSize))
      return "Group sizes must be whole numbers.";
    if (parseInt(minSize) > parseInt(maxSize)) return "Min group size cannot exceed Max.";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) {
      alert(err);
      return;
    }
    setSubmitting(true);
    setGeocoding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) {
        alert("Sign in required.");
        return;
      }

      const uploaded = await uploadIfNeeded();

      // Geocode the address (best-effort)
      let location_lat: number | null = null;
      let location_lng: number | null = null;
      let normalizedLocationName = locationName.trim() || null;

      try {
        const apiKey = process.env.EXPO_PUBLIC_GEOAPIFY_KEY;
        if (!apiKey) {
          console.warn("Missing EXPO_PUBLIC_GEOAPIFY_KEY; saving without lat/lng.");
        } else if (address.trim()) {
          const gc = await geocodeAddress(address.trim(), apiKey);
          location_lat = gc.lat;
          location_lng = gc.lng;
          if (!normalizedLocationName) normalizedLocationName = gc.label;
        }
      } catch (e) {
        console.warn("Geocoding failed; saving without lat/lng:", e);
      } finally {
        setGeocoding(false);
      }

      const payload: any = {
        party_id: partyId,
        name: name.trim(),
        description: description.trim(),
        location_name: normalizedLocationName,
        location_address: address.trim(),
        location_lat,
        location_lng,
        cost_amount: Number(cost),
        currency,
        cost_mode: "per_person",
        min_group_size: parseInt(minSize, 10),
        max_group_size: parseInt(maxSize, 10),
        organizer_id: uid,
        hero_url: uploaded ?? (hero || null),
        dress_code: dress,
      };

      const editId =
        (editing && editing.id) || (initialEvent && initialEvent.id) || null;

      if (isEdit && editId) {
        const { error } = await supabase.from("events").update(payload).eq("id", editId);
        if (error) throw error;
        onSaved?.(editId);
      } else {
        const { data, error } = await supabase
          .from("events")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        onSaved?.(data!.id);
      }

      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to save.");
    } finally {
      setSubmitting(false);
      setGeocoding(false);
    }
  };

  const closeKeyboardButton = (
    <TouchableOpacity
      onPress={() => Keyboard.dismiss()}
      style={{
        height: 44,
        width: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: P.border,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 8,
        backgroundColor: P.surface,
      }}
    >
      <Ionicons name="checkmark" size={18} color={P.text} />
    </TouchableOpacity>
  );

  /* ====== UI ====== */
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} />

      {/* Centered dialog */}
      <View
        style={{
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
        }}
      >
        <View
          style={{
            width: DIALOG_W,
            maxWidth: DIALOG_W,
            height: DIALOG_H,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: P.border,
            backgroundColor: P.surface,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              height: 52,
              borderBottomWidth: 1,
              borderColor: P.border,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: P.text, fontFamily: fontHeavy }}>
              {isEdit ? "Edit Event" : "Create Event"}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={P.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ height: BODY_H }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator
            >
              {/* Cover */}
              <Label text="Cover (optional)" P={P} />
              <View
                style={{
                  borderWidth: 1,
                  borderColor: P.border,
                  borderRadius: 14,
                  overflow: "hidden",
                  height: 160,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: P.surface,
                }}
              >
                {hero ? (
                  <Image source={{ uri: hero }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                ) : (
                  <Text style={{ color: P.textMuted }}>No image selected</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={pickImage}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignSelf: "flex-start",
                  borderWidth: 1,
                  borderColor: P.border,
                  backgroundColor: P.surface,
                }}
              >
                <Text style={{ color: P.text }}>{isEdit ? "Change" : "Choose"}</Text>
              </TouchableOpacity>

              {/* Name */}
              <Label text="Name*" P={P} />
              <ModalInput P={P} placeholder="Event name" value={name} onChangeText={setName} />

              {/* Description */}
              <Label text="Description*" P={P} />
              <ModalInput
                P={P}
                placeholder="Describe your event"
                value={description}
                onChangeText={setDescription}
                multiline
                style={{ height: 120, textAlignVertical: "top" }}
              />

              {/* Location name */}
              <Label text="Location Name" P={P} />
              <ModalInput P={P} placeholder="Venue / Place" value={locationName} onChangeText={setLocationName} />

              {/* Address */}
              <Label text="Address*" P={P} />
              <ModalInput P={P} placeholder="123 Main St..." value={address} onChangeText={setAddress} />

              {/* Cost */}
              <Label text="Cost per Person*" P={P} />
              <ModalInput
                P={P}
                placeholder="0"
                keyboardType="decimal-pad"
                value={cost}
                onChangeText={(t) => setCost(t.replace(/[^0-9.]/g, ""))}
              />

              {/* Group size + keyboard dismiss ✓ */}
              <Label text="Group Size (min / max)*" P={P} />
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ModalInput
                  P={P}
                  placeholder="1"
                  value={minSize}
                  onChangeText={(t) => setMinSize(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  style={{ flex: 1, marginRight: 10 }}
                />
                <ModalInput
                  P={P}
                  placeholder="12"
                  value={maxSize}
                  onChangeText={(t) => setMaxSize(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  style={{ flex: 1 }}
                />
                <View>{closeKeyboardButton}</View>
              </View>

              {/* Dress code simple dots */}
              <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: P.textMuted, fontSize: 12 }}>Least</Text>
                  <Text style={{ color: P.textMuted, fontSize: 12 }}>Most</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setDress(i)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        backgroundColor: i <= dress ? "#fff" : "transparent",
                        borderWidth: 2,
                        borderColor: i <= dress ? "#fff" : P.border,
                      }}
                    />
                  ))}
                  <Text style={{ marginLeft: 8, color: P.text, fontFamily: fontHeavy }}>
                    {["Comfort", "Casual", "Smart", "Dressy", "Fancy"][dress]}
                  </Text>
                </View>
              </View>

              {/* Geocoding status */}
              {submitting && geocoding && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <ActivityIndicator size="small" />
                  <Text style={{ color: P.textMuted, fontFamily: fontSans }}>
                    Geocoding address…
                  </Text>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Footer */}
          <View
            style={{
              height: FOOTER_H,
              borderTopWidth: 1,
              borderColor: P.border,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: P.border,
                backgroundColor: P.surface,
              }}
            >
              <Text style={{ color: P.text }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={submitting}
              onPress={save}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: `${P.primary}AA`,
                backgroundColor: `${P.primary}26`,
                opacity: submitting ? 0.8 : 1,
              }}
            >
              <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>
                {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function FloatingCreateEventCTA({
  P,
  onPress,
}: {
  P: AppPalette;
  onPress: () => void;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.92}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: `${P.primary}88`,
          backgroundColor: P.primary,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          shadowColor: P.primary,
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Ionicons name="add" size={16} color="#F6F9FF" />
        <Text style={{ color: "#F6F9FF", fontFamily: fontHeavy }}>Create Event</Text>
      </TouchableOpacity>
    </View>
  );
}
