import "dotenv/config";
import express from "express";
import cors from "cors";
import NodeCache from "node-cache";
import { fetch } from "undici";
import {
  MARKETCHECK_ENDPOINTS,
  VIN_ENRICHMENT_ENDPOINTS,
  VIN_SEARCH_ORDER,
} from "./marketcheck-endpoints.js";

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

function numericOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function stringOrNull(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function firstTruthy(...candidates) {
  for (const candidate of candidates) {
    if (
      candidate !== undefined &&
      candidate !== null &&
      String(candidate).trim() !== ""
    ) {
      return candidate;
    }
  }
  return null;
}

function parseVehicleFromUrl(url) {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    let year = null;
    let model = null;
    let make = null;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (/^\d{4}$/.test(segment)) {
        year = Number(segment);
        if (i >= 1) {
          model = segments[i - 1];
        }
        if (i >= 2) {
          make = segments[i - 2];
        }
        break;
      }
    }
    const normalizeToken = (token) =>
      token ? token.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() : null;
    return {
      year: Number.isFinite(year) ? year : null,
      make: normalizeToken(make),
      model: normalizeToken(model),
    };
  } catch {
    return {};
  }
}

function buildFallbackPayload({ vin, summary, specs, history }) {
  const buildData =
    summary?.build || specs?.build || summary?.vin?.build || specs?.vin?.build || {};
  const summaryVehicle =
    summary?.vin_summary ||
    summary?.vehicle ||
    summary?.summary ||
    summary?.build ||
    {};
  const specsVehicle = specs?.summary || specs?.specs || specs?.build || {};
  const historyListingsRaw = Array.isArray(history)
    ? history
    : history?.listings || history?.listing_history || history?.records || [];
  const historyListings = Array.isArray(historyListingsRaw)
    ? historyListingsRaw.slice()
    : [];
  historyListings.sort((a, b) => {
    const aTime = Number(a?.last_seen_at || a?.scraped_at || a?.timestamp || 0);
    const bTime = Number(b?.last_seen_at || b?.scraped_at || b?.timestamp || 0);
    return bTime - aTime;
  });
  const latestHistory = historyListings[0] || null;
  const latestBuild = latestHistory?.build || latestHistory?.vehicle || {};
  const latestDealer =
    latestHistory?.dealer ||
    latestHistory?.seller ||
    latestHistory?.dealer_details ||
    {};

  const year = numericOrNull(
    firstTruthy(
      buildData.year,
      summaryVehicle.year,
      specsVehicle.year,
      history?.year,
      latestHistory?.year,
      latestBuild.year
    )
  );
  const make = stringOrNull(
    firstTruthy(
      buildData.make,
      summaryVehicle.make,
      specsVehicle.make,
      latestHistory?.make,
      latestHistory?.dealer_make,
      latestBuild.make
    )
  );
  const model = stringOrNull(
    firstTruthy(
      buildData.model,
      summaryVehicle.model,
      specsVehicle.model,
      latestHistory?.model,
      latestBuild.model
    )
  );
  const trim = stringOrNull(
    firstTruthy(
      buildData.trim,
      summaryVehicle.trim,
      specsVehicle.trim,
      latestHistory?.trim,
      latestBuild.trim
    )
  );
  const heading = stringOrNull(
    firstTruthy(
      summaryVehicle.heading,
      summaryVehicle.title,
      summaryVehicle.description
    )
  );
  const mileage = numericOrNull(
    firstTruthy(
      latestHistory?.miles,
      latestHistory?.mileage,
      summaryVehicle.mileage,
      specsVehicle.mileage
    )
  );
  const askingPrice = numericOrNull(
    firstTruthy(
      latestHistory?.price,
      summaryVehicle.price,
      summaryVehicle.msrp,
      specsVehicle.price
    )
  );

  const dealerName = stringOrNull(
    firstTruthy(
      latestDealer.name,
      latestHistory?.dealer_name,
      latestHistory?.seller_name,
      latestHistory?.dealer,
      latestHistory?.dealer_company
    )
  );
  const dealerCity = stringOrNull(
    firstTruthy(latestDealer.city, latestHistory?.dealer_city, latestHistory?.city)
  );
  const dealerState = stringOrNull(
    firstTruthy(latestDealer.state, latestHistory?.dealer_state, latestHistory?.state)
  );
  const dealerZip = stringOrNull(
    firstTruthy(latestDealer.zip, latestHistory?.dealer_zip)
  );
  const dealerPhone = stringOrNull(
    firstTruthy(latestDealer.phone, latestHistory?.dealer_phone)
  );
  const dealerStreet = stringOrNull(
    firstTruthy(
      latestDealer.street,
      latestDealer.address,
      latestHistory?.dealer_street,
      latestHistory?.street
    )
  );
  const dealerLat = numericOrNull(
    firstTruthy(latestDealer.latitude, latestHistory?.latitude)
  );
  const dealerLng = numericOrNull(
    firstTruthy(latestDealer.longitude, latestHistory?.longitude)
  );

  const vehicleLabel = [year, make, model, trim].filter(Boolean).join(" ").trim();

  const hasCoreData = Boolean(year || make || model || trim || vehicleLabel);
  const parsedFromUrl = parseVehicleFromUrl(latestHistory?.vdp_url);

  const resolvedYear = year ?? parsedFromUrl.year ?? null;
  const resolvedMake = make ?? parsedFromUrl.make ?? null;
  const resolvedModel = model ?? parsedFromUrl.model ?? null;
  const resolvedVehicleLabel =
    vehicleLabel ||
    [resolvedYear, resolvedMake, resolvedModel, trim].filter(Boolean).join(" ").trim() ||
    null;

  if (
    !resolvedYear &&
    !resolvedMake &&
    !resolvedModel &&
    !trim &&
    !resolvedVehicleLabel &&
    !heading
  ) {
    return null;
  }

  return {
    source: "summary",
    payload: {
      vin,
      year: resolvedYear,
      make: resolvedMake,
      model: resolvedModel,
      trim,
      heading: heading || resolvedVehicleLabel || null,
      vehicle: resolvedVehicleLabel || heading || null,
      mileage,
      asking_price: askingPrice,
      dealer_name: dealerName,
      dealer_city: dealerCity,
      dealer_state: dealerState,
      dealer_zip: dealerZip,
      dealer_phone: dealerPhone,
      dealer_street: dealerStreet,
      dealer_lat: dealerLat,
      dealer_lng: dealerLng,
      listing_source: latestHistory?.source || "MARKETCHECK",
      photo_url: stringOrNull(
        firstTruthy(
          summaryVehicle.photo_url,
          summaryVehicle.primary_photo_url,
          specsVehicle.photo_url,
          latestHistory?.primary_photo_url
        )
      ),
      listing_id: stringOrNull(
        firstTruthy(
          latestHistory?.id,
          latestHistory?.listing_id,
          latestHistory?.listingid
        )
      ),
    },
  };
}

// GET /api/mc/by-vin/:vin?zip=&radius=&pick=nearest|freshest
app.get("/api/mc/by-vin/:vin", async (req, res) => {
  try {
    const vin = String(req.params.vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
      return res.status(400).json({ error: "Invalid VIN" });
    }
    const zip = "";
    const radius = 25;
    const pick = req.query.pick === "freshest" ? "freshest" : "nearest";

    const attemptsLog = [];
    let best = null;
    let searchSource = null;
    const context = { vin, zip, radius };

    for (const attempt of VIN_SEARCH_ORDER) {
      if (typeof attempt?.condition === "function" && !attempt.condition(context)) {
        continue;
      }
      const endpoint = MARKETCHECK_ENDPOINTS[attempt.endpoint];
      if (!endpoint?.path) {
        console.warn(`[mc] endpoint ${attempt?.endpoint} missing path definition`);
        continue;
      }
      const params =
        typeof attempt.params === "function"
          ? attempt.params(context)
          : endpoint.buildParams?.(context) ?? {};
      const url = mcUrl(endpoint.path, params);
      try {
        const response = await getJson(url);
        const listings = Array.isArray(response?.listings) ? response.listings : [];
        attemptsLog.push({
          endpoint: attempt.endpoint,
          description: attempt.description,
          resultCount: listings.length,
        });
        if (!listings.length) {
          continue;
        }
        const candidate = pickBestListing(listings, { pick });
        if (candidate) {
          best = candidate;
          searchSource = attempt.description || attempt.endpoint;
          break;
        }
      } catch (error) {
        attemptsLog.push({
          endpoint: attempt.endpoint,
          description: attempt.description,
          error: error?.message || String(error),
        });
        console.warn(
          `[mc] search attempt ${attempt.description ?? attempt.endpoint} failed`,
          error?.message || error
        );
      }
    }

    const listingEndpoint = MARKETCHECK_ENDPOINTS.listingById;
    let detail = null;
    if (best?.id && listingEndpoint) {
      const detailPath =
        listingEndpoint.buildPath?.({ id: best.id }) ?? listingEndpoint.path ?? null;
      if (detailPath) {
        try {
          const detailParams = listingEndpoint.buildParams?.({ id: best.id }) ?? {};
          detail = await getJson(mcUrl(detailPath, detailParams));
        } catch (error) {
          console.warn("[mc] listing detail lookup failed", error?.message || error);
          detail = null;
        }
      }
    }

    const enrichmentResults = {};
    await Promise.all(
      VIN_ENRICHMENT_ENDPOINTS.map(async ({ endpoint, description }) => {
        const def = MARKETCHECK_ENDPOINTS[endpoint];
        if (!def) return;
        const enrichmentPath =
          def.buildPath?.({ vin, listing: detail || best }) ?? def.path ?? null;
        if (!enrichmentPath) return;
        const enrichmentParams =
          def.buildParams?.({ vin, listing: detail || best }) ?? {};
        try {
          enrichmentResults[endpoint] = await getJson(
            mcUrl(enrichmentPath, enrichmentParams)
          );
        } catch (error) {
          console.warn(
            `[mc] enrichment ${description ?? endpoint} failed`,
            error?.message || error
          );
        }
      })
    );

    const fallback = buildFallbackPayload({
      vin,
      summary: enrichmentResults.vinSummary,
      specs: enrichmentResults.vinSpecs,
      history: enrichmentResults.historyByVin,
    });

    let payload = null;
    let payloadSource = null;
    if (best) {
      payload = normalizeListing(detail || best);
      payloadSource = searchSource || "active-listing";
    }
    if (!payload && fallback?.payload) {
      payload = fallback.payload;
      payloadSource = fallback.source || "summary";
      searchSource = searchSource || fallback.source;
    }

    const extras = {
      search_source: searchSource,
      search_attempts: attemptsLog,
      raw_listing: detail,
      summary: enrichmentResults.vinSummary ?? null,
      specs: enrichmentResults.vinSpecs ?? null,
      history: enrichmentResults.historyByVin ?? null,
      payload_source: payloadSource,
    };

    return res.json({
      ok: true,
      found: Boolean(payload),
      vin,
      listing_id: payload?.listing_id ?? best?.id ?? null,
      payload: payload ?? null,
      extras,
    });
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

// GET /api/mc/history/:vin
app.get("/api/mc/history/:vin", async (req, res) => {
  try {
    const vin = String(req.params.vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
      return res.status(400).json({ error: "Invalid VIN" });
    }
    const historyEndpoint = MARKETCHECK_ENDPOINTS.historyByVin;
    if (!historyEndpoint) {
      return res
        .status(500)
        .json({ error: "VIN history endpoint is not configured." });
    }
    const path =
      historyEndpoint.buildPath?.({ vin }) ?? historyEndpoint.path ?? null;
    if (!path) {
      return res
        .status(500)
        .json({ error: "VIN history endpoint path could not be resolved." });
    }
    const params = historyEndpoint.buildParams?.({ vin }) ?? {};
    const data = await getJson(mcUrl(path, params));
    return res.json({ ok: true, vin, history: data });
  } catch (err) {
    console.error("[/history] error:", err);
    const status =
      typeof err?.status === "number" && err.status >= 400 && err.status < 600
        ? err.status
        : 502;
    res.status(status).json({
      error: "VIN history lookup failed",
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
