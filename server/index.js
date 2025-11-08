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
  // rough-but-practical city averages
  const WALK_MPS = 1.35; // ~4.9 km/h
  const BIKE_MPS = 4.5; // ~16 km/h
  const DRIVE_MPS = 9.7; // ~35 km/h (urban)
  let mps = DRIVE_MPS;
  let overhead = 0; // parking/lights etc.

  if (mode === "walk") {
    mps = WALK_MPS;
  } else if (mode === "bike") {
    mps = BIKE_MPS;
    overhead = 1;
  } else if (mode === "drive") {
    mps = DRIVE_MPS;
    overhead = 4;
  } else {
    // auto: pick based on distance
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
  YELP_API_KEY, // required
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
  const ranges = { $: "≤ $15", $$: "$15–$30", $$$: "$30–$60", $$$$: "≥ $60" };
  return ranges[sym] ? `${sym} • ${ranges[sym]}` : "Price N/A";
};
const metersToKmText = (m) => {
  if (!Number.isFinite(m)) return "";
  if (m < 950) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1)} km`;
};
// assume relaxed walking pace ~ 80 m/min (≈ 4.8 km/h)
const metersToMinutes = (m) =>
  Number.isFinite(m) ? Math.max(1, Math.round(m / 80)) : 120;

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
      b.rating
        ? `${b.rating}★${b.review_count ? ` (${b.review_count})` : ""}`
        : null,
      (b.categories || [])
        .map((c) => c.title)
        .slice(0, 2)
        .join(" · "),
    ].filter(Boolean),
    tags: [b.price || "Price N/A"].concat(
      (b.categories || []).map((c) => c.title).slice(0, 3)
    ),
    description:
      (b.location && (b.location.display_address || []).join(", ")) ||
      b.location?.address1 ||
      "",
    distanceMinutes: metersToMinutes(distM),
    distanceText: metersToKmText(distM),
    rating: b.rating,
    reviewCount: b.review_count,
    mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${b.name} ${
        (b.location && (b.location.display_address || []).join(", ")) || ""
      }`
    )}`,
    bookingUrl: b.url,
  };
}

// ---------- routes ----------
app.get("/", (_req, res) => res.send("OK"));

app.post("/generate-trips", async (req, res) => {
  try {
    const {
      prompt = "",
      lat,
      lng,
      maxCards = 6,
      priceTiers,               // ["$", "$$"] optional
      minPriceLevel,            // 1..4 optional
      maxPriceLevel,            // 1..4 optional
      locale = "en_US",
      radiusMeters,
      maxMinutes = 20, // NEW: only return places <= this ETA
      mode = "auto", // "auto" | "walk" | "bike" | "drive"
    } = req.body || {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res
        .status(400)
        .json({ error: "lat and lng are required numbers" });
    }

    // 🔹 Map price symbols → Yelp price levels and build a price query
    const sym2lvl = { "$": 1, "$$": 2, "$$$": 3, "$$$$": 4 };

    const limit = Math.max(1, Math.min(Number(maxCards) || 6, 12));
    const radius = Math.min(Math.max(Number(radiusMeters) || 6000, 500), 40000);

    let businesses = [];

    // 🔹 Build Yelp price param if client asked for it
    let yelpPrice = undefined;
    if (Array.isArray(priceTiers) && priceTiers.length) {
      yelpPrice = priceTiers.map((s) => sym2lvl[s]).filter(Boolean).join(",");
    } else if (minPriceLevel || maxPriceLevel) {
      const lo = Math.max(1, minPriceLevel || 1);
      const hi = Math.min(4, maxPriceLevel || 4);
      yelpPrice = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).join(",");
    }

    // 1) Try AI Chat
    if (String(process.env.YELP_USE_AI || "true").toLowerCase() === "true") {
      try {
        const { data } = await AI.post("", {
          query: prompt,
          user_context: { locale, latitude: lat, longitude: lng },
        });
        businesses =
          data?.entities?.[0]?.businesses ||
          data?.businesses ||
          data?.results ||
          [];
      } catch (e) {
        console.warn(
          "[AI Chat] falling back to Fusion:",
          e?.response?.status || e?.message
        );
      }
    }

    // 2) If AI empty, Fusion search
    if (!businesses?.length) {
      const params = new URLSearchParams({
        term: prompt || "things to do",
        latitude: String(lat),
        longitude: String(lng),
        radius: String(radius),
        limit: String(Math.max(limit, 12)),
        sort_by: "best_match",
        open_now: "false",
      });

      // 🔹 Pass Yelp price filter when present
      if (yelpPrice) params.set("price", yelpPrice);

      const { data } = await FUSION.get(
        `/businesses/search?${params.toString()}`
      );
      businesses = data?.businesses || [];
    }

    // 🔹 Enforce min/max price filter even if AI route returned items
    const withinClientPrice = (biz) => {
      const level = (biz?.price || "").length || null;
      if (minPriceLevel && level && level < minPriceLevel) return false;
      if (maxPriceLevel && level && level > maxPriceLevel) return false;
      if (Array.isArray(priceTiers) && priceTiers.length) {
        const ok = priceTiers.includes(biz?.price || "");
        if (!ok) return false;
      }
      return true;
    };
    if (businesses?.length && (yelpPrice || minPriceLevel || maxPriceLevel || (priceTiers && priceTiers.length))) {
      businesses = businesses.filter(withinClientPrice);
    }

    // 3) Ensure we can compute distance -> ETA for each business
    const toResolve = [];
    const enriched = businesses.map((b) => {
      let dMeters = b.distance; // Fusion gives straight-line meters
      let coords =
        b.coordinates ||
        (b.latitude && b.longitude
          ? { latitude: b.latitude, longitude: b.longitude }
          : null);

      if (!dMeters && coords) {
        dMeters = haversineMeters(lat, lng, coords.latitude, coords.longitude);
      }
      if (!dMeters && b.id) {
        toResolve.push(b.id);
      }

      return { raw: b, dMeters, coords };
    });

    // Look up coordinates for those missing (Fusion details)
    if (toResolve.length) {
      const lookups = await Promise.allSettled(
        toResolve.map((id) => FUSION.get(`/businesses/${id}`))
      );
      const byId = new Map();
      lookups.forEach((r, i) => {
        if (r.status === "fulfilled") {
          const biz = r.value?.data;
          if (biz?.id) byId.set(biz.id, biz);
        }
      });
      enriched.forEach((e) => {
        if (!e.dMeters && e.raw?.id) {
          const det = byId.get(e.raw.id);
          const c = det?.coordinates;
          if (c?.latitude && c?.longitude) {
            e.coords = c;
            e.dMeters = haversineMeters(lat, lng, c.latitude, c.longitude);
          }
        }
        // fill missing price & image from details
       if (e.raw?.id) {
         const det = byId.get(e.raw.id);
         if (det?.price && !e.raw.price) e.raw.price = det.price;
         // prefer details’ image if search one is missing
         if (det?.image_url && !e.raw.image_url) e.raw.image_url = det.image_url;
       }
      });
    }

    // 4) Compute ETA + filter to <= maxMinutes
    const filtered = enriched
      .map((e) => {
        const d = e.dMeters;
        const minutes = Number.isFinite(d)
          ? estimateMinutes(d, mode)
          : undefined;
        return { raw: e.raw, dMeters: d, minutes };
      })
      .filter((x) => Number.isFinite(x.minutes) && x.minutes <= maxMinutes)
      // 🔹 Also keep enforcing price filter here just in case
      .filter((x) => withinClientPrice(x.raw));

    // 5) Sort: closest ETA first, then rating desc, then reviews desc
    filtered.sort((a, b) => {
      const ma = a.minutes ?? 9999;
      const mb = b.minutes ?? 9999;
      if (ma !== mb) return ma - mb;
      const ra = a.raw.rating ?? 0;
      const rb = b.raw.rating ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.raw.review_count ?? 0) - (a.raw.review_count ?? 0);
    });

    // 6) Map to your card shape (adds distance fields)
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
        currency: process.env.DEFAULT_CURRENCY || "CAD",
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
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          `${biz.name} ${address}`
        )}`,
        bookingUrl: biz.url,
        // NEW:
        distanceMeters: dMeters,
        distanceText: fmtDistance(dMeters),
        distanceMinutes: minutes,
        rating: biz.rating,
        reviewCount: biz.review_count,
        priceLabel: price || undefined,
      };
    }

    const cards = filtered
      .slice(0, limit)
      .map((x) => toCard(x.raw, x.minutes, x.dMeters));
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
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));