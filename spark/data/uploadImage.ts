// data/uploadImage.ts
import { supabase } from "@/lib/supabase";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";

export type PickedImage = {
  uri: string;
  name?: string | null;
  fileName?: string | null;
  type?: string | null;
  mimeType?: string | null;
};

function toArrayBufferFromBase64(b64: string) {
  // atob is always available in RN/Expo
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}


// Always end up with real JPEG bytes + correct contentType
async function getJpegBytes(uri: string, maxWidth = 1600) {
  // No transform besides re-encode; optional resize keeps files small
  const m = await ImageManipulator.manipulateAsync(
    uri,
    maxWidth ? [{ resize: { width: maxWidth } }] : [],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!m.base64) throw new Error("Image re-encode failed (no base64).");
  const arrayBuffer = toArrayBufferFromBase64(m.base64);
  const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
  console.log(`[upload] JPEG size ~${sizeKB} KB`);

  return { arrayBuffer, ext: "jpg", contentType: "image/jpeg" as const };
}

export async function uploadImageToPartyPics(img: PickedImage): Promise<string> {
  if (!img?.uri) throw new Error("No image selected");

  const { data: u, error: uerr } = await supabase.auth.getUser();
  if (uerr) throw uerr;
  const uid = u.user?.id;
  if (!uid) throw new Error("Not authenticated");

  // 1) Re-encode (handles HEIC/HEIF/unknown + prevents 0-byte uploads)
  const { arrayBuffer, ext, contentType } = await getJpegBytes(img.uri);

  // 2) Build a safe path
  const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${uid}/${fname}`;

  // 3) Upload via ArrayBuffer (more reliable than Blob on iOS)
  const { error: upErr } = await supabase
    .storage
    .from("party-pics")
    .upload(path, arrayBuffer, {
      contentType,
      cacheControl: "3600",
      upsert: true,
    });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  // 4) Public URL
  const { data: pub } = supabase.storage.from("party-pics").getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("Could not get public URL");
  return pub.publicUrl;
}
