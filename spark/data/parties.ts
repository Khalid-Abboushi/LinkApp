// data/parties.ts
import { supabase } from "@/lib/supabase";
import { uploadImageToPartyPics, type PickedImage } from "@/data/uploadImage";

/* ========= Types ========= */

export type Party = {
  id: string;
  name: string;
  picture_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type PartyEvent = {
  id: string;
  party_id: string;
  name: string;
  start_at: string | null;
};

type CreatedParty = {
  id: string;
  name: string;
  picture_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  chat_id?: string | null;
};

export type PartyWithEvents = Party & { events: PartyEvent[] };

/* ========= Helpers ========= */

function capName(name: string) {
  return name.trim().slice(0, 15);
}

function guessExtFromName(name?: string) {
  const m = (name || "").toLowerCase().match(/\.(\w+)$/);
  return (m?.[1] || "jpg").toLowerCase();
}

function contentTypeFromExt(ext: string) {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}

/**
 * Upload a local image (native file://, web blob:/http(s)) to the `party-pics` bucket
 * and return a PUBLIC url. Returns null if no image was provided.
 */
export async function uploadPartyImage(
  file: { uri: string; name?: string; type?: string } | null,
  opts?: { quality?: number }   // <-- second argument added
): Promise<string | null> {
  if (!file) return null;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not authenticated");

  // 1) Read file into a Blob (works on native + web)
  const res = await fetch(file.uri);
  if (!res.ok) throw new Error("Failed to read picked image");
  const blob = await res.blob();

  // 2) Build storage path + content-type
  const ext = guessExtFromName(file.name);
  const contentType = file.type || contentTypeFromExt(ext);
  const path = `${uid}/${Date.now()}.${ext}`;

  // 3) Upload
  const { error: upErr } = await supabase
    .storage
    .from("party-pics")
    .upload(path, blob, { contentType, upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  // 4) Public URL
  const { data } = supabase.storage.from("party-pics").getPublicUrl(path);
  return data.publicUrl ?? null;
}

/* ========= Create ========= */

/**
 * Create a party. If an image is provided, it is uploaded first and its public url
 * is stored in the party row. The RPC `app_create_party(p_name text, p_picture_url text)` is
 * expected to:
 *  - insert into parties (owner_id = auth.uid())
 *  - create a chat for the party (unique by party_id)
 *  - add the owner to party_members
 */
export async function createPartyWithImage(name: string, image?: PickedImage | null) {
  let picture_url: string | null = null;

  if (image?.uri) {
    try {
      picture_url = await uploadImageToPartyPics(image);
    } catch (e) {
      console.warn("Image upload failed, continuing without image:", e);
      picture_url = null;
    }
  }

  const { data, error } = await supabase.rpc("app_create_party", {
    p_name: name,
    p_picture_url: picture_url,
  });
  if (error) throw new Error(error.message);

  return Array.isArray(data) ? data[0] : data;
}


/* ========= Reads ========= */

export async function fetchMyParties(): Promise<PartyWithEvents[]> {
  // Ensure we have a session
  const { data: auth, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!auth.user) return [];

  // Get my parties via RPC (RLS-safe)
  const partiesRes = await supabase.rpc("app_get_my_parties");
  if (partiesRes.error) throw partiesRes.error;
  const parties = (partiesRes.data ?? []) as Party[];

  if (!parties.length) return [];

  // Get events for these parties (optional RPC)
  const ids = parties.map((p) => p.id);
  const eventsRes = await supabase.rpc("app_get_events_for_parties", { p_ids: ids });
  if (eventsRes.error) {
    console.warn("events RPC error:", eventsRes.error);
    return parties.map((p) => ({ ...p, events: [] }));
  }
  const events = (eventsRes.data ?? []) as PartyEvent[];

  // group by party_id & attach
  const byParty = new Map<string, PartyEvent[]>();
  for (const e of events) {
    const list = byParty.get(e.party_id) ?? [];
    list.push(e);
    byParty.set(e.party_id, list);
  }

  return parties.map((p) => ({ ...p, events: byParty.get(p.id) ?? [] }));
}
