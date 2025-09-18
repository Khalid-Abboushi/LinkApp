require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const { FOURSQUARE_API_KEY, DEFAULT_CURRENCY = "CAD" } = process.env;
if (!FOURSQUARE_API_KEY) {
  console.error("❌ Missing FOURSQUARE_API_KEY in env");
  process.exit(1);
}

const FOURSQUARE = axios.create({
  baseURL: "https://api.foursquare.com/v3/places/search",
  headers: { Authorization: `Bearer ${FOURSQUARE_API_KEY}` }, // ✅ Bearer added
  timeout: 8000, // 8 sec timeout
});
const fetchFoursquarePlaces = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/foursquare-search?query=pizza&near=Toronto`);
    const data = await res.json();
    console.log("📍 Foursquare results:", data);
    return data;
  } catch (err) {
    console.error("❌ Error fetching Foursquare:", err);
  }
};


// --- Helpers ---
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function estimateMinutes(distanceMeters, mode = "auto") {
  const WALK_MPS = 1.35,
    BIKE_MPS = 4.5,
    DRIVE_MPS = 9.7;
  let mps = DRIVE_MPS,
    overhead = 0;
  if (mode === "walk") mps = WALK_MPS;
  else if (mode === "bike") (mps = BIKE_MPS), (overhead = 1);
  else if (mode === "drive") (mps = DRIVE_MPS), (overhead = 4);
  else {
    if (distanceMeters < 1600) mps = WALK_MPS;
    else if (distanceMeters < 4000) (mps = BIKE_MPS), (overhead = 1);
    else (mps = DRIVE_MPS), (overhead = 4);
  }
  return Math.round(distanceMeters / mps / 60 + overhead);
}

function fmtDistance(m) {
  if (!Number.isFinite(m)) return "";
  if (m < 950) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

const priceMap = { 0: "Free", 1: "$ • ≤ $15", 2: "$$ • $15–$30", 3: "$$$ • $30–$60", 4: "$$$$ • ≥ $60" };

function toCard(biz, minutes, dMeters, photoUrl) {
  const address = biz.location?.formatted_address || "";
  const priceLabel = priceMap[biz.price] || "Price N/A";
  return {
    id: biz.fsq_id,
    title: biz.name,
    placeName: biz.name,
    imageUrl: photoUrl || "",
    priceFrom: biz.price ?? null,
    currency: DEFAULT_CURRENCY,
    includes: [biz.rating ? `${biz.rating}★` : null, (biz.categories || []).map((c) => c.name).slice(0, 2).join(" · ")].filter(Boolean),
    tags: [priceLabel].concat((biz.categories || []).map((c) => c.name).slice(0, 3)),
    description: address,
    mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${biz.name} ${address}`)}`,
    bookingUrl: biz.link || "",
    distanceMeters: dMeters,
    distanceText: fmtDistance(dMeters),
    distanceMinutes: minutes,
    rating: biz.rating,
    reviewCount: biz.stats?.total_ratings || 0,
    priceLabel,
  };
}

// --- Routes ---
app.get("/api/foursquare-search", async (req, res) => {
  try {
    const { query, near } = req.query;

    const response = await axios.get("https://api.foursquare.com/v3/places/search", {
      headers: {
        Authorization: process.env.FOURSQUARE_API_KEY, // 🔑 Must be "Bearer KEY"
      },
      params: {
        query: query || "coffee",
        near: near || "Toronto",
        limit: 10,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Foursquare API error:", error.response?.data || error.message);
    res
      .status(500)
      .json({ error: "server_error", detail: error.response?.data || error.message });
  }
});

app.post("/generate-trips", async (req, res) => {
  try {
    const { prompt = "", lat, lng, maxCards = 6, priceTiers, minPriceLevel, maxPriceLevel, radiusMeters = 6000, maxMinutes = 20, mode = "auto" } = req.body || {};
    if (typeof lat !== "number" || typeof lng !== "number")
      return res.status(400).json({ error: "lat and lng are required numbers" });

    const limit = Math.max(1, Math.min(Number(maxCards) || 6, 12));
    const params = new URLSearchParams({
      query: prompt || "fun things",
      ll: `${lat},${lng}`,
      radius: String(Math.min(Math.max(radiusMeters, 500), 40000)),
      limit: String(limit * 2),
    });

    const { data } = await FOURSQUARE.get(`/search?${params.toString()}`);
    let businesses = data.results || [];

    // --- Fetch photos sequentially to avoid aborts ---
    const photosById = {};
    for (const b of businesses) {
      try {
        const pRes = await FOURSQUARE.get(`/${b.fsq_id}/photos?limit=1`);
        if (pRes.data?.[0]) photosById[b.fsq_id] = `${pRes.data[0].prefix}original${pRes.data[0].suffix}`;
      } catch (err) {
        console.warn(`Photo fetch failed for ${b.fsq_id}:`, err.message);
      }
    }

    const enriched = businesses.map((b) => {
      const dMeters = b.distance || haversineMeters(lat, lng, b.geocodes.main.latitude, b.geocodes.main.longitude);
      const minutes = Number.isFinite(dMeters) ? estimateMinutes(dMeters, mode) : undefined;
      return { raw: b, dMeters, minutes };
    });

    const filtered = enriched.filter((e) => Number.isFinite(e.minutes) && e.minutes <= maxMinutes);

    const withinClientPrice = (biz) => {
      if (!biz.price) return true;
      if (minPriceLevel && biz.price < minPriceLevel) return false;
      if (maxPriceLevel && biz.price > maxPriceLevel) return false;
      if (Array.isArray(priceTiers) && priceTiers.length) {
        const symbols = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
        if (!priceTiers.includes(symbols[biz.price])) return false;
      }
      return true;
    };

    const final = filtered.filter((e) => withinClientPrice(e.raw));
    final.sort((a, b) => (a.minutes !== b.minutes ? a.minutes - b.minutes : (b.raw.rating || 0) - (a.raw.rating || 0)));
    const cards = final.slice(0, limit).map((e) => toCard(e.raw, e.minutes, e.dMeters, photosById[e.raw.fsq_id]));

    return res.json(cards);
  } catch (err) {
    console.error("Server error:", err?.response?.data || err.message);
    return res.status(500).json({
      error: "server_error",
      detail: err?.response?.data || err.message,
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
