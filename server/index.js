// server/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const {
  YELP_API_KEY,              // required
  DEFAULT_CURRENCY = "CAD",
} = process.env;


if (!YELP_API_KEY) {
  console.error("❌ Missing YELP_API_KEY in .env");
  process.exit(1);
}

const FUSION = axios.create({
  baseURL: "https://api.yelp.com/v3",
  headers: { Authorization: `Bearer ${YELP_API_KEY}` },
});

// ---------- helpers ----------
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const toMetersRadius = (r) => {
  const x = Number(r);
  if (!Number.isFinite(x)) return 12000;
  return clamp(Math.round(x), 100, 40000);
};
const priceMapToLabel = (sym = "", currency = "CAD") => {
  // simple buckets for UI label
  const ranges = { "$": "≤ $15", "$$": "$15–$30", "$$$": "$30–$60", "$$$$": "≥ $60" };
  return ranges[sym] ? `${sym} • ${ranges[sym]}` : "Price N/A";
};
const metersToKmText = (m) => {
  if (!Number.isFinite(m)) return "";
  if (m < 950) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1)} km`;
};
// assume relaxed walking pace ~ 80 m/min (≈ 4.8 km/h)
const metersToMinutes = (m) => (Number.isFinite(m) ? Math.max(1, Math.round(m / 80)) : 120);

// Map Yelp business -> AICard the app expects
function toAICard(b, currency) {
  const distM = b.distance; // provided when lat/lng are in the search
  return {
    id: b.id,
    title: b.name,
    placeName: b.name,
    imageUrl: b.image_url || "",
    priceFrom: undefined, // optional
    priceLabel: priceMapToLabel(b.price, currency),
    currency,
    includes: [
      b.rating ? `${b.rating}★${b.review_count ? ` (${b.review_count})` : ""}` : null,
      (b.categories || []).map((c) => c.title).slice(0, 2).join(" · "),
    ].filter(Boolean),
    tags: [b.price || "Price N/A"].concat((b.categories || []).map((c) => c.title).slice(0, 3)),
    description: (b.location && (b.location.display_address || []).join(", ")) || b.location?.address1 || "",
    distanceMinutes: metersToMinutes(distM),
    distanceText: metersToKmText(distM),
    rating: b.rating,
    reviewCount: b.review_count,
    mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${b.name} ${(b.location && (b.location.display_address || []).join(", ")) || ""}`
    )}`,
    bookingUrl: b.url,
  };
}

// ---------- routes ----------
app.get("/", (_req, res) => res.send("OK"));

app.post("/generate-trips", async (req, res) => {
  try {
    const {
      prompt = "popular restaurants bars fun",
      lat,
      lng,
      maxCards = 6,
      radiusMeters = 15000,
      minRating = 0,
      currency = DEFAULT_CURRENCY,
    } = req.body || {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng are required numbers" });
    }

    const params = new URLSearchParams({
      term: String(prompt || "popular"),
      latitude: String(lat),
      longitude: String(lng),
      radius: String(toMetersRadius(radiusMeters)),
      limit: String(Math.max(6, Math.min(20, maxCards))), // grab a few more, we’ll trim
      sort_by: "best_match",
    });

    const { data } = await FUSION.get(`/businesses/search?${params.toString()}`);
    let businesses = data?.businesses || [];

    // filter & sort
    businesses = businesses
      .filter((b) => (b.rating || 0) >= minRating)
      .sort(
        (a, b) =>
          (b.rating || 0) - (a.rating || 0) ||
          (b.review_count || 0) - (a.review_count || 0) ||
          (a.distance || 0) - (b.distance || 0)
      );

    const cards = businesses.slice(0, maxCards).map((b) => toAICard(b, currency));
    res.json(cards);
  } catch (err) {
    console.error("Yelp Fusion error:", err?.response?.data || err.message);
    res.status(500).json({ error: "fusion_error", detail: err?.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
