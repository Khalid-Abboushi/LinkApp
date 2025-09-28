// components/CreatePartyModal.tsx
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/** Image object compatible with our upload code */
export type PickedImage = {
  uri: string;
  name?: string | null;     // Android / some web
  fileName?: string | null; // iOS
  type?: string | null;     // Android
  mimeType?: string | null; // iOS
} | null;

export type CreatePartyPayload = {
  name: string;
  image: PickedImage;
};

export default function CreatePartyModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreatePartyPayload) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [image, setImage] = useState<PickedImage>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    const trimmed = name.trim();
    return !busy && trimmed.length > 0 && trimmed.length <= 30;
  }, [busy, name]);

  const reset = () => {
    setName("");
    setImage(null);
    setError(null);
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const pickFromLibrary = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          setError("Permission to access photos is required.");
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        setImage({
          uri: a.uri,
          name: a.fileName ?? `party_${Date.now()}.jpg`,
          fileName: a.fileName ?? null,
          type: a.mimeType ?? (a as any).type ?? "image/jpeg",
          mimeType: a.mimeType ?? null,
        });
        if (error) setError(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed picking image.");
    }
  }, [error]);

  // Web drag & drop support
  const dropRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;

    // RN Web gives a DOM node via getNode() in some versions
    // @ts-ignore
    const node = dropRef.current?.getNode?.() ?? dropRef.current;
    if (!node) return;

    const el = node as unknown as HTMLElement;

    const onDragOver = (ev: DragEvent) => {
      ev.preventDefault();
    };
    const onDrop = (ev: DragEvent) => {
      ev.preventDefault();
      const f = ev.dataTransfer?.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      setImage({
        uri: url,
        name: f.name,
        fileName: f.name,
        type: f.type || "image/jpeg",
        mimeType: f.type || "image/jpeg",
      });
      if (error) setError(null);
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [error]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Please enter a name.");
    if (trimmed.length > 30) return setError("Name must be 30 characters or less.");

    try {
      setBusy(true);
      setError(null);
      await onSubmit({ name: trimmed, image });
      reset();
      onClose();
    } catch (e: any) {
      console.error("Create party failed:", e);
      setError(e?.message ?? "Something went wrong creating the party.");
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 520,
            borderRadius: 16,
            backgroundColor: "#0F1220",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            padding: 16,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 10 }}>
            Create party
          </Text>

          <Text style={{ color: "#D0D4E0", marginBottom: 6 }}>Party name (max 30 characters)</Text>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t.slice(0, 30));
              if (error) setError(null);
            }}
            placeholder="e.g. Friday Crew"
            placeholderTextColor="rgba(255,255,255,0.5)"
            autoCapitalize="words"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "#fff",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 14,
            }}
            maxLength={30}
            editable={!busy}
          />

          <Text style={{ color: "#D0D4E0", marginBottom: 6 }}>Picture</Text>
          <View
            ref={dropRef}
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {image ? (
              <Image
                source={{ uri: image.uri }}
                style={{ width: 140, height: 140, borderRadius: 12, marginBottom: 10 }}
              />
            ) : (
              <Text
                style={{
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 10,
                  textAlign: "center",
                }}
              >
                {Platform.OS === "web"
                  ? "Drag & drop an image here, or pick from files."
                  : "Pick an image from your library."}
              </Text>
            )}

            <TouchableOpacity
              onPress={busy ? undefined : pickFromLibrary}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
              }}
              disabled={busy}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {busy ? "…" : "Choose image"}
              </Text>
            </TouchableOpacity>
          </View>

          {!!error && <Text style={{ color: "#F87171", marginTop: 10 }}>{error}</Text>}

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              onPress={handleClose}
              disabled={busy}
              style={{ paddingHorizontal: 14, paddingVertical: 10, opacity: busy ? 0.6 : 1 }}
            >
              <Text style={{ color: "#D0D4E0", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={!canSubmit}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: canSubmit ? "#4F46E5" : "rgba(79,70,229,0.45)",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              {busy && <ActivityIndicator color="#fff" />}
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {busy ? "Creating…" : "Create"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
