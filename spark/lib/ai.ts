// spark/lib/ai.ts - Enhanced with location coordinates

export type AICard = {
  id: string;
  title: string;
  placeName?: string;
  imageUrl: string;
  priceFrom?: number;
  priceLabel?: string; // "$$ • $15–$30" (server fills)
  currency?: "CAD" | "USD" | "EUR" | "GBP";
  includes?: string[];
  tags?: string[];
  description?: string;
  distanceMinutes?: number;
  // Yelp extras your server returns
  rating?: number; // 0..5
  reviewCount?: number; // #
  distanceText?: string; // "1.2 km"
  mapsUrl?: string;
  bookingUrl?: string;
  distanceMeters?: number;
  distanceMinutes?: number;
  distanceText?: string;
  rating?: number;
  reviewCount?: number;
  priceLabel?: string;

  // NEW: Location coordinates
  lat?: number;
  lng?: number;
  address?: string;
  locationSource?: "yelp" | "geocoded" | "ai_extracted" | "manual";
};

export interface GenerateParams {
  prompt?: string;
  lat: number;
  lng: number;
  maxCards?: number;
  minRating?: number;
  radiusMeters?: number;
  currency?: string;
  signal?: AbortSignal;
  // NEW: Option to include location extraction from prompt
  extractLocations?: boolean;
}

// NEW: Location extraction utilities
export function extractLocationFromPrompt(prompt: string): string[] {
  const locationPatterns = [
    // City, State/Province patterns
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    // Street addresses
    /\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Ave|Rd|Blvd|Dr|Ln|Way|Ct)\b/gi,
    // "in [location]" or "near [location]" patterns
    /\b(?:in|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    // Famous landmarks or areas
    /\b(downtown|midtown|uptown|chinatown|little italy|financial district)\b/gi,
  ];

  const locations: string[] = [];

  locationPatterns.forEach((pattern) => {
    const matches = prompt.match(pattern);
    if (matches) {
      locations.push(...matches);
    }
  });

  return [...new Set(locations)]; // Remove duplicates
}

export async function generateAICards(
  params: GenerateParams
): Promise<AICard[]> {
  try {
    // Get and clean the API base URL
    let API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (!API_BASE || API_BASE === "undefined") {
      console.error("❌ EXPO_PUBLIC_API_BASE_URL is not set!");
      throw new Error("API base URL is not configured");
    }

    // Clean the URL - remove trailing slashes
    API_BASE = API_BASE.replace(/\/+$/, "");
    const { signal, extractLocations, ...body } = params;

    // NEW: Extract locations from prompt if requested
    let extractedLocations: string[] = [];
    if (extractLocations && params.prompt) {
      extractedLocations = extractLocationFromPrompt(params.prompt);
      console.log("🗺️ Extracted locations from prompt:", extractedLocations);
    }

    const url = `${API_BASE}/generate-trips`;
    console.log("🌐 Making API request to:", url);

    // Validate URL format
    if (!url.match(/^https?:\/\/.+/)) {
      console.error("❌ Invalid URL format:", url);
      throw new Error(`Invalid API URL format: ${url}`);
    }

    // Include extracted locations in the request body
    const requestBody = {
      ...body,
      ...(extractedLocations.length > 0 && { extractedLocations }),
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    console.log("📡 Response status:", r.status);
    console.log("📡 Response URL:", r.url);
    console.log("📡 Content-Type:", r.headers.get("content-type"));

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("❌ API error response:", txt);

      // Check if it's a routing error
      if (txt.includes("Cannot POST") || txt.includes("404")) {
        console.error(
          "❌ Endpoint not found. Check if your API has /generate-trips endpoint"
        );
        throw new Error("API endpoint not found: /generate-trips");
      }
      throw new Error(`API request failed: ${r.status} ${r.statusText}`);
    }

    // Check content type before parsing JSON
    const contentType = r.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      const text = await r.text();
      console.error("❌ Expected JSON but got:", contentType);
      console.error("Response preview:", text.substring(0, 200));
      throw new Error(`Expected JSON response but got ${contentType}`);
    }

    const data = await r.json();
    console.log("✅ API Success: Got", data.length, "cards");

    let cards: AICard[] = [];

    if (Array.isArray(data)) {
      cards = data;
    } else if (data && typeof data === "object") {
      // Try common wrapper properties
      const extractedCards =
        data.cards || data.data || data.results || data.trips;
      if (Array.isArray(extractedCards)) {
        console.log(
          "✅ Found cards in wrapper:",
          extractedCards.length,
          "items"
        );
        cards = extractedCards;
      }
    }

    if (cards.length === 0) {
      console.error("❌ Could not extract array from response");
      throw new Error("API response is not in expected format");
    }

    // NEW: Post-process cards to ensure they have coordinates
    const processedCards = await Promise.all(
      cards.map(async (card: AICard) => {
        // If card already has coordinates, keep them
        if (card.lat && card.lng) {
          return { ...card, locationSource: "yelp" as const };
        }

        // If we have a place name but no coordinates, we could geocode here
        // (but this might be better handled server-side to avoid rate limits)
        if (card.placeName && !card.lat && !card.lng) {
          console.log(`⚠️ Card "${card.title}" missing coordinates`);
          // You could add client-side geocoding here if needed
        }

        return card;
      })
    );

    return processedCards;
  } catch (error) {
    console.error("❌ generateAICards error:", error);
    throw error;
  }
}

// NEW: Helper function to convert AICard to database event record
export interface EventRecord {
  id: string;
  title: string;
  description?: string;
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  created_at?: string;
  updated_at?: string;
}

export function aiCardToEventRecord(card: AICard): EventRecord {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    location_address: card.placeName || card.address,
    location_lat: card.lat,
    location_lng: card.lng,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// NEW: Helper to validate coordinates
export function hasValidCoordinates(card: AICard): boolean {
  return (
    typeof card.lat === "number" &&
    typeof card.lng === "number" &&
    !isNaN(card.lat) &&
    !isNaN(card.lng) &&
    Math.abs(card.lat) <= 90 &&
    Math.abs(card.lng) <= 180
  );
}
