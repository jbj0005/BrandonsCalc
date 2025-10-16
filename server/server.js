import "dotenv/config";
import express from "express";
import cors from "cors";
import NodeCache from "node-cache";
import { fetch } from "undici";

const app = express();
const PORT = Number(process.env.PORT || 5174);
const MARKETCHECK_KEY = process.env.MARKETCHECK_KEY || "";
const BASE = (process.env.MARKETCHECK_BASE || "https://api.marketcheck.com/v2").replace(/\/$/, "");
if (!MARKETCHECK_KEY) console.warn("[mc] MARKETCHECK_KEY missing");

const cache = new NodeCache({ stdTTL: 60 });

app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOW_ORIGIN?.split(",").map((s) => s.trim()) ?? "*",
    credentials: false,
  })
);

function mcUrl(path, params = {}) {
  const u = new URL(`${BASE}${path}`);
  u.searchParams.set("api_key", MARKETCHECK_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function getJson(url) {
  const hit = cache.get(url);
  if (hit) return hit;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const bodyText = await r.text().catch(() => "");
    const error = new Error(
      `${r.status} ${r.statusText}${bodyText ? `: ${bodyText}` : ""}`
    );
    error.status = r.status;
    error.body = bodyText;
    throw error;
  }
  const data = await r.json();
  cache.set(url, data);
  return data;
}

function pickBestListing(listings, { pick = "nearest" } = {}) {
  if (!Array.isArray(listings) || !listings.length) return null;
  const arr = [...listings];
  if (pick === "freshest") {
    arr.sort((a, b) => Number(b.last_seen_at ?? 0) - Number(a.last_seen_at ?? 0));
  } else {
    arr.sort((a, b) => Number(a.dist ?? Infinity) - Number(b.dist ?? Infinity));
  }
  return arr[0] || null;
}

function normalizeListing(listing) {
  if (!listing) return {};
  const b = listing.build || {};
  const d = listing.dealer || listing.car_location || {};
  const m = listing.media || {};

  const year = Number(listing.year ?? b.year) || null;
  const make = listing.make ?? b.make ?? null;
  const model = listing.model ?? b.model ?? null;
  const trim = listing.trim ?? b.trim ?? null;
  const heading =
    listing.heading ||
    listing.headline ||
    listing.title ||
    listing.description ||
    null;

  const price = Number(listing.price);
  const miles = Number(listing.miles);

  const lat = Number(d.latitude);
  const lng = Number(d.longitude);

  return {
    vin: listing.vin ?? null,
    year,
    make,
    model,
    trim,
    mileage: Number.isFinite(miles) ? miles : null,
    asking_price: Number.isFinite(price) ? price : null,

    dealer_name: d.name ?? d.seller_name ?? null,
    dealer_phone: d.phone ?? null,
    dealer_street: d.street ?? d.address ?? null,
    dealer_city: d.city ?? null,
    dealer_state: d.state ?? d.state_code ?? null,
    dealer_zip: d.zip ?? d.postal_code ?? null,
    dealer_lat: Number.isFinite(lat) ? lat : null,
    dealer_lng: Number.isFinite(lng) ? lng : null,

    listing_id: listing.id ?? null,
    listing_source: "MARKETCHECK",
    listing_url: listing.vdp_url ?? null,
    photo_url: Array.isArray(m.photo_links) && m.photo_links[0] ? m.photo_links[0] : null,

    heading: heading ?? null,
    vehicle: heading || [year, make, model, trim].filter(Boolean).join(" "),
  };
}

// GET /api/mc/by-vin/:vin?zip=&radius=&pick=nearest|freshest
app.get("/api/mc/by-vin/:vin", async (req, res) => {
  try {
    const vin = String(req.params.vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
      return res.status(400).json({ error: "Invalid VIN" });
    }
    const zip = String(req.query.zip || "").replace(/\D/g, "");
    const radius = Number(req.query.radius || 200);
    const pick = req.query.pick === "freshest" ? "freshest" : "nearest";

    const buildSearchParams = (useZip) => ({
      vin,
      zip: useZip && zip ? zip : undefined,
      radius: useZip && zip ? radius : undefined,
      rows: 25,
      start: 0,
      sort_by: useZip && zip ? "dist" : "price",
    });
    let search = null;
    try {
      const searchUrl = mcUrl("/search/car/active", buildSearchParams(true));
      search = await getJson(searchUrl);
    } catch (err) {
      if (zip && err?.status === 422) {
        console.warn(
          "[/by-vin] zip-aware search failed, retrying without zip:",
          err?.body || err?.message || err
        );
        const fallbackUrl = mcUrl("/search/car/active", buildSearchParams(false));
        search = await getJson(fallbackUrl);
      } else {
        throw err;
      }
    }
    const best = pickBestListing(search?.listings || [], { pick });
    if (!best?.id) return res.json({ ok: true, found: false, vin });

    const detailUrl = mcUrl(`/listing/car/${encodeURIComponent(best.id)}`);
    let detail = null;
    try {
      detail = await getJson(detailUrl);
    } catch (e) {
      detail = null;
    }

    const payload = normalizeListing(detail || best);
    return res.json({ ok: true, found: true, vin, listing_id: best.id, payload });
  } catch (err) {
    console.error("[/by-vin] error:", err);
    const status =
      typeof err?.status === "number" && err.status >= 400 && err.status < 600
        ? err.status
        : 502;
    res.status(status).json({
      error: "VIN lookup failed",
      detail:
        typeof err?.body === "string" && err.body.trim()
          ? err.body.trim()
          : err?.message || "Unknown error",
    });
  }
});

// GET /api/mc/listing/:id
app.get("/api/mc/listing/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing listing id" });
    const url = mcUrl(`/listing/car/${encodeURIComponent(id)}`);
    const data = await getJson(url);
    return res.json({ ok: true, id, payload: normalizeListing(data) });
  } catch (err) {
    console.error("[/listing] error:", err);
    const status =
      typeof err?.status === "number" && err.status >= 400 && err.status < 600
        ? err.status
        : 502;
    res.status(status).json({
      error: "Listing details failed",
      detail:
        typeof err?.body === "string" && err.body.trim()
          ? err.body.trim()
          : err?.message || "Unknown error",
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
