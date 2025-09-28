// data/events.ts
import { supabase } from "@/lib/supabase";

export type SuggestionInput = {
  id: string;
  title: string;
  desc?: string;            // may contain address in your flow — we will NOT save it
  location?: string;        // optional venue name
  hero?: string | null;
  tags?: string[];
  minutes?: number;
  _address?: string | null; // set by AddToPartyDialog
  _geo?: { lat: number; lng: number; label: string } | null; // set by AddToPartyDialog
};

type AddResult =
  | { status: "created"; eventId: string }
  | { status: "exists"; eventId: string };

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function addSuggestionToParty(
  partyId: string,
  s: SuggestionInput
): Promise<AddResult> {
  // address comes from _address (parsed) or desc; both are fine as an address string
  const address = (s._address ?? s.desc ?? "").trim() || null;

  // venue/label preference: explicit location → geo label → title
  const location_name =
    (s.location?.trim() ||
      s._geo?.label?.trim() ||
      s.title?.trim() ||
      null) ?? null;

  const location_lat = num(s._geo?.lat);
  const location_lng = num(s._geo?.lng);

  // basic duplicate guard
  const { data: existing, error: existErr } = await supabase
    .from("events")
    .select("id")
    .eq("party_id", partyId)
    .ilike("name", s.title)
    .limit(1);

  if (existErr) throw existErr;
  if (existing && existing.length > 0) {
    return { status: "exists", eventId: existing[0].id };
  }

  const payload: any = {
    party_id: partyId,
    name: s.title,
    description: null,          // <-- leave description NULL, per your request
    location_name,              // venue/place
    location_address: address,  // address string
    location_lat,               // lat saved
    location_lng,               // lng saved
    hero_url: s.hero ?? null,
    active: false,
  };

  const { data, error } = await supabase
    .from("events")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;

  return { status: "created", eventId: data!.id };
}
