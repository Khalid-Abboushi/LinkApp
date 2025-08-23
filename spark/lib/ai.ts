// spark/lib/ai.ts
export type AICard = {
  id: string;
  title: string;
  placeName?: string;
  imageUrl: string;
  priceFrom?: number;
  priceLabel?: string;       // "$$ • $15–$30" (server fills)
  currency?: "CAD" | "USD" | "EUR" | "GBP";
  includes?: string[];
  tags?: string[];
  description?: string;
  distanceMinutes?: number;

  // Yelp extras your server returns
  rating?: number;           // 0..5
  reviewCount?: number;      // #
  distanceText?: string;     // "1.2 km"
  mapsUrl?: string;
  bookingUrl?: string;
};


export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  "http://localhost:8787";           // local dev

// when deployed, set EXPO_PUBLIC_API_BASE in your app env to:
// https://<your-railway-subdomain>.up.railway.app



export interface GenerateParams {
  prompt?: string;
  lat: number;
  lng: number;
  maxCards?: number;
  minRating?: number;
  radiusMeters?: number;
  currency?: string;
  signal?: AbortSignal; // ✅ allow passing in AbortSignal
}

export async function generateAICards(params: GenerateParams): Promise<AICard[]> {
  const { signal, ...body } = params; // ✅ extract signal so we don’t stringify it

  const r = await fetch(`${API_BASE}/generate-trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal, // ✅ attach signal to fetch
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `Request failed (${r.status})`);
  }

  return r.json();
}
