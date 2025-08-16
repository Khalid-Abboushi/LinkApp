// data/events.ts
import { supabase } from "@/lib/supabase";

/** Minimal shape from your Discover "Suggestion" */
export type SuggestionLike = {
  id: string;
  title: string;
  desc?: string;
  location?: string;
  minutes?: number;
  tags?: string[];
  hero?: string | null; // saved to events.hero_url
};

/**
 * Idempotent add: if an event with same (party_id, name, description) exists,
 * return {status:'exists'}. Otherwise insert and return {status:'created'}.
 * Also best-effort inserts tags into `event_tags` if present.
 */
export async function addSuggestionToParty(
  partyId: string,
  s: SuggestionLike
): Promise<{ status: "created" | "exists"; eventId: string }> {
  // 1) Duplicate check (same party + same name + same/null description)
  let foundId: string | null = null;

  if (s.desc == null) {
    const { data, error } = await supabase
      .from("events")
      .select("id")
      .eq("party_id", partyId)
      .eq("name", s.title)
      .is("description", null)
      .limit(1);
    if (error) throw error;
    if (data?.length) foundId = data[0].id as string;
  } else {
    const { data, error } = await supabase
      .from("events")
      .select("id")
      .eq("party_id", partyId)
      .eq("name", s.title)
      .eq("description", s.desc)
      .limit(1);
    if (error) throw error;
    if (data?.length) foundId = data[0].id as string;
  }

  if (foundId) {
    return { status: "exists", eventId: foundId };
  }

  // 2) Insert (send ONLY columns that definitely exist + are nullable or have defaults)
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  // IMPORTANT:
  // - If your column is named `added_by_user_id` (uuid), keep it as written.
  // - If you renamed it to `added_by` but the type is uuid, change the key to `added_by: userId`.
  const insertPayload: Record<string, any> = {
    party_id: partyId,
    name: s.title,
    description: s.desc ?? null,
    location_name: s.location ?? null,
    hero_url: s.hero ?? null,
    added_by_user_id: userId, // <-- adjust to `added_by` if that's your uuid column name
  };

  const { data: created, error: insErr } = await supabase
    .from("events")
    .insert([insertPayload])
    .select("id")
    .single();

  if (insErr) {
    // Surface the real Postgres error in your console so you can see the exact column that fails.
    console.log("addSuggestionToParty failed", {
      message: (insErr as any).message,
      details: (insErr as any).details,
      hint: (insErr as any).hint,
      code: (insErr as any).code,
      payload: insertPayload,
    });
    throw insErr;
  }

  const eventId = created!.id as string;

  // 3) Optional tag linking (best-effort)
  if (s.tags?.length) {
    try {
      await supabase
        .from("event_tags")
        .insert(s.tags.map((tag) => ({ event_id: eventId, tag })));
    } catch {
      /* ignore optional tag errors */
    }
  }

  return { status: "created", eventId };
}
