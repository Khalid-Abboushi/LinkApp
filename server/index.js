// server/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

// --- Distance / ETA helpers ---
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function estimateMinutes(distanceMeters, mode = "auto") {
  const WALK_MPS = 1.35;
  const BIKE_MPS = 4.5;
  const DRIVE_MPS = 9.7;
  let mps = DRIVE_MPS;
  let overhead = 0;

  if (mode === "walk") mps = WALK_MPS;
  else if (mode === "bike") {
    mps = BIKE_MPS;
    overhead = 1;
  } else if (mode === "drive") {
    mps = DRIVE_MPS;
    overhead = 4;
  } else {
    if (distanceMeters < 1600) mps = WALK_MPS;
    else if (distanceMeters < 4000) {
      mps = BIKE_MPS;
      overhead = 1;
    } else {
      mps = DRIVE_MPS;
      overhead = 4;
    }
  }

  const minutes = distanceMeters / mps / 60 + overhead;
  return Math.round(minutes);
}

function fmtDistance(m) {
  if (!Number.isFinite(m)) return "";
  if (m < 950) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

const app = express();
app.use(cors());
app.use(express.json());

const {
  YELP_API_KEY,
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
const priceMapToLabel = (sym = "", currency = "CAD") => {
  const ranges = { $: "≤ $15", $$: "$15–$30", $$$: "$30–$60", $$$$: "≥ $60" };
  return ranges[sym] ? `${sym} • ${ranges[sym]}` : "Price N/A";
};
const metersToMinutes = (m) =>
  Number.isFinite(m) ? Math.max(1, Math.round(m / 80)) : 120;

// ---------- routes ----------
app.get("/", (_req, res) => res.send("OK"));

app.post("/generate-trips", async (req, res) => {
  try {
    const {
      prompt = "",
      lat,
      lng,
      maxCards = 6,
      priceTiers,
      minPriceLevel,
      maxPriceLevel,
      locale = "en_US",
      radiusMeters,
      maxMinutes = 20,
      mode = "auto",
    } = req.body || {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res
        .status(400)
        .json({ error: "lat and lng are required numbers" });
    }

    const sym2lvl = { "$": 1, "$$": 2, "$$$": 3, "$$$$": 4 };
    const limit = Math.max(1, Math.min(Number(maxCards) || 6, 12));
    const radius = Math.min(Math.max(Number(radiusMeters) || 6000, 500), 40000);

    let businesses = [];

    // --- Yelp Fusion search ---
    const params = new URLSearchParams({
      term: prompt || "things to do",
      latitude: String(lat),
      longitude: String(lng),
      radius: String(radius),
      limit: String(Math.max(limit, 12)),
      sort_by: "best_match",
      open_now: "false",
    });

    // Price filters
    let yelpPrice = undefined;
    if (Array.isArray(priceTiers) && priceTiers.length) {
      yelpPrice = priceTiers.map((s) => sym2lvl[s]).filter(Boolean).join(",");
    } else if (minPriceLevel || maxPriceLevel) {
      const lo = Math.max(1, minPriceLevel || 1);
      const hi = Math.min(4, maxPriceLevel || 4);
      yelpPrice = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).join(",");
    }
    if (yelpPrice) params.set("price", yelpPrice);

    const { data } = await FUSION.get(
      `/businesses/search?${params.toString()}`
    );
    businesses = Array.isArray(data?.businesses) ? data.businesses : [];

    // --- Compute distance, ETA ---
    const enriched = businesses.map((b) => {
      const coords =
        b.coordinates ||
        (b.latitude && b.longitude
          ? { latitude: b.latitude, longitude: b.longitude }
          : null);
      const dMeters = coords
        ? haversineMeters(lat, lng, coords.latitude, coords.longitude)
        : b.distance || 0;
      const minutes = Number.isFinite(dMeters)
        ? estimateMinutes(dMeters, mode)
        : undefined;
      return { raw: b, dMeters, minutes };
    });

    // --- Filter & sort ---
    const filtered = enriched
      .filter((x) => Number.isFinite(x.minutes) && x.minutes <= maxMinutes)
      .sort((a, b) => {
        const ma = a.minutes ?? 9999;
        const mb = b.minutes ?? 9999;
        if (ma !== mb) return ma - mb;
        const ra = a.raw.rating ?? 0;
        const rb = b.raw.rating ?? 0;
        if (rb !== ra) return rb - ra;
        return (b.raw.review_count ?? 0) - (a.raw.review_count ?? 0);
      });

    // --- Convert to card format ---
    const priceMap = { $: 15, $$: 30, $$$: 60, $$$$: 100 };
    function toCard(biz, minutes, dMeters) {
      const price = biz.price || "";
      const img =
        biz.photos?.[0]?.url || biz.photos?.[0] || biz.image_url || "";
      const address =
        biz.location?.display_address?.join(", ") ||
        biz.location?.formatted_address ||
        biz.location?.address1 ||
        "";

      return {
        id: biz.id,
        title: biz.name,
        placeName: biz.name,
        imageUrl: img,
        priceFrom: priceMap[price] ?? 25,
        priceLabel: priceMapToLabel(price, DEFAULT_CURRENCY),
        currency: DEFAULT_CURRENCY,
        includes: [
          biz.rating
            ? `${biz.rating}★${
                biz.review_count ? ` (${biz.review_count})` : ""
              }`
            : null,
          (biz.categories || [])
            .map((c) => c.title)
            .slice(0, 2)
            .join(" · "),
        ].filter(Boolean),
        tags: [price || "Price N/A"].concat(
          (biz.categories || []).map((c) => c.title).slice(0, 3)
        ),
        description: address,
        distanceMeters: dMeters,
        distanceText: fmtDistance(dMeters),
        distanceMinutes: minutes,
        rating: biz.rating,
        reviewCount: biz.review_count,
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          `${biz.name} ${address}`
        )}`,
        bookingUrl: biz.url,
      };
    }

    const cards = filtered
      .slice(0, limit)
      .map((x) => toCard(x.raw, x.minutes, x.dMeters));

    // ✅ Always return an array (never object)
    return res.json(Array.isArray(cards) ? cards : []);
  } catch (err) {
    console.error("Server error:", err?.response?.data || err.message);
    return res.status(500).json({
      error: "server_error",
      detail: err?.response?.data || err.message,
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server listening on :${PORT}`));
