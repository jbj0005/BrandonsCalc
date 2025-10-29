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
const BASE = (process.env.MARKETCHECK_BASE || "https://api.marketcheck.com/v2").replace(/\/$/, "");
const MAX_RADIUS =
  (() => {
    const candidate = Number(process.env.MARKETCHECK_MAX_RADIUS || 100);
    return Number.isFinite(candidate) && candidate > 0 ? candidate : 100;
  })();

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_KEY ||
  "";
const SUPABASE_SECRET_TABLE =
  process.env.MARKETCHECK_SUPABASE_TABLE || "secure_settings";
const SUPABASE_SECRET_NAME_COLUMN =
  process.env.MARKETCHECK_SUPABASE_NAME_COLUMN || "name";
const SUPABASE_SECRET_VALUE_COLUMN =
  process.env.MARKETCHECK_SUPABASE_VALUE_COLUMN || "secret";
const SUPABASE_SECRET_KEY_NAME =
  process.env.MARKETCHECK_SUPABASE_KEY_NAME || "marketcheck_api_key";
const MARKETCHECK_BASE_SUPABASE_KEY_NAME =
  process.env.MARKETCHECK_SUPABASE_BASE_KEY_NAME || "marketcheck_api_base";
const GOOGLE_MAPS_API_KEY_SUPABASE_KEY_NAME =
  process.env.GOOGLE_MAPS_SUPABASE_KEY_NAME || "google_maps_api_key";
const GOOGLE_MAPS_MAP_ID_SUPABASE_KEY_NAME =
  process.env.GOOGLE_MAPS_SUPABASE_MAP_ID_NAME || "google_maps_map_id";

const GOOGLE_MAPS_API_KEY_FALLBACK =
  (process.env.GOOGLE_MAPS_API_KEY || "").trim();
const GOOGLE_MAPS_MAP_ID_FALLBACK =
  (process.env.GOOGLE_MAPS_MAP_ID || "").trim();

let MARKETCHECK_API_KEY =
  (process.env.MARKETCHECK_API_KEY || process.env.MARKETCHECK_KEY || "").trim();
let marketcheckKeyPromise = null;
if (!MARKETCHECK_API_KEY) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[mc] MARKETCHECK_API_KEY missing and Supabase credentials are not configured."
    );
  } else {
    console.info("[mc] MARKETCHECK_API_KEY not set; fetching from Supabase.");
  }
}

const cache = new NodeCache({ stdTTL: 60 });
const secretCache = new NodeCache({ stdTTL: 300 });

app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOW_ORIGIN?.split(",").map((s) => s.trim()) ?? "*",
    credentials: false,
  })
);

async function fetchSupabaseSecretValue(
  name,
  { force = false, cacheTtlSeconds = 300 } = {}
) {
  const normalized =
    typeof name === "string" ? name.trim() : String(name ?? "").trim();
  if (!normalized) return "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return "";
  }
  if (!force) {
    const cached = secretCache.get(normalized);
    if (typeof cached === "string" && cached) {
      return cached;
    }
  }
  const url = new URL(`${SUPABASE_URL}/rest/v1/${SUPABASE_SECRET_TABLE}`);
  url.searchParams.set(
    SUPABASE_SECRET_NAME_COLUMN,
    `eq.${normalized}`
  );
  url.searchParams.set("select", SUPABASE_SECRET_VALUE_COLUMN);
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `[supabase] ${response.status} ${response.statusText}${
        body ? `: ${body}` : ""
      }`
    );
  }
  const data = await response.json();
  if (!Array.isArray(data) || !data.length) {
    return "";
  }
  const candidate = data[0]?.[SUPABASE_SECRET_VALUE_COLUMN];
  if (candidate == null) {
    return "";
  }
  const value = String(candidate).trim();
  if (value && cacheTtlSeconds > 0) {
    secretCache.set(normalized, value, cacheTtlSeconds);
  }
  return value;
}

async function fetchMarketcheckKeyFromSupabase({ force = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[mc] Supabase credentials missing; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to fetch MarketCheck key."
    );
    return "";
  }
  const key = await fetchSupabaseSecretValue(SUPABASE_SECRET_KEY_NAME, {
    force,
  });
  if (!key) {
    console.warn(
      `[mc] Supabase secret '${SUPABASE_SECRET_KEY_NAME}' not found or empty in table '${SUPABASE_SECRET_TABLE}'.`
    );
  }
  return key;
}

async function resolveMarketcheckApiKey({ force = false } = {}) {
  if (!force && MARKETCHECK_API_KEY) return MARKETCHECK_API_KEY;
  if (!marketcheckKeyPromise || force) {
    marketcheckKeyPromise = (async () => {
      if (!force && MARKETCHECK_API_KEY) return MARKETCHECK_API_KEY;
      try {
        const fetched = await fetchMarketcheckKeyFromSupabase({ force });
        if (fetched) {
          MARKETCHECK_API_KEY = fetched;
          return MARKETCHECK_API_KEY;
        }
      } catch (error) {
        console.error(
          "[mc] Failed to fetch MarketCheck key from Supabase",
          error?.message || error
        );
        throw error;
      } finally {
        marketcheckKeyPromise = null;
      }
      return MARKETCHECK_API_KEY;
    })();
  }
  return marketcheckKeyPromise;
}

async function ensureApiKey(res) {
  try {
    const key = await resolveMarketcheckApiKey();
    if (key) return key;
  } catch (error) {
    const detail =
      typeof error?.message === "string" && error.message
        ? error.message
        : "MarketCheck key lookup failed.";
    res.status(500).json({
      error: "MarketCheck API key unavailable",
      detail,
    });
    return null;
  }
  res.status(500).json({
    error: "MarketCheck API key missing",
    detail:
      "Populate the 'marketcheck_api_key' secret in Supabase or set MARKETCHECK_API_KEY on the server.",
  });
  return null;
}

void resolveMarketcheckApiKey().catch(() => {
  /* initial fetch handled per request */
});

function mcUrl(path, params = {}, apiKey = MARKETCHECK_API_KEY) {
  const base = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const normalizedPath =
    typeof path === "string" && path.startsWith("/") ? path.slice(1) : path;
  const u = new URL(normalizedPath || "", base);
  if (apiKey) {
    u.searchParams.set("api_key", apiKey);
  }
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
    const rawSegments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
    const disallowedToken = /^(new|used|certified|inventory|sale|car|truck|suv|for|at|with|and)$/i;
    const tokens = [];
    for (const segment of rawSegments) {
      const decoded = decodeURIComponent(segment);
      const parts = decoded
        .split(/[-_+]+/g)
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((part) => !vinRegex.test(part));
      tokens.push(...parts);
    }
    if (!tokens.length) return {};
    let year = null;
    let make = null;
    let modelTokens = [];
    let labelTokens = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!year && /^(19|20)\d{2}$/.test(token)) {
        year = Number(token);
        const following = tokens
          .slice(i + 1, i + 5)
          .filter((item) => !disallowedToken.test(item));
        const preceding = tokens
          .slice(Math.max(0, i - 3), i)
          .filter((item) => !disallowedToken.test(item));
        if (following.length) {
          make = following.shift() || null;
          modelTokens = following.slice();
        } else if (preceding.length) {
          make = preceding.pop() || null;
          modelTokens = preceding.slice().reverse();
        }
        labelTokens = [
          year,
          make,
          modelTokens.length ? modelTokens.join(" ") : null,
        ].filter(Boolean);
        break;
      }
    }
    if (!labelTokens.length) {
      const fallbackLabel = tokens.filter((item) => !disallowedToken.test(item));
      labelTokens = fallbackLabel.slice(0, 4);
    }
    return {
      year: Number.isFinite(year) ? year : null,
      make: make ? make.replace(/\s+/g, " ").trim() : null,
      model: modelTokens.length
        ? modelTokens.join(" ").replace(/\s+/g, " ").trim()
        : null,
      label: labelTokens.length
        ? labelTokens
            .map((item) => item.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join(" ")
        : null,
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
  const fallbackLabel =
    parsedFromUrl.label || latestHistory?.seller_name || null;

  const resolvedYear = year ?? parsedFromUrl.year ?? null;
  const resolvedMake = make ?? parsedFromUrl.make ?? null;
  const resolvedModel = model ?? parsedFromUrl.model ?? null;
  const resolvedVehicleLabel =
    vehicleLabel ||
    [resolvedYear, resolvedMake, resolvedModel, trim]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    fallbackLabel ||
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
      heading: heading || resolvedVehicleLabel || fallbackLabel || null,
      vehicle: resolvedVehicleLabel || heading || fallbackLabel || null,
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

app.get("/api/config", async (req, res) => {
  const force =
    req.query.force === "1" ||
    req.query.force === "true" ||
    req.query.force === "yes";
  const payload = {
    marketcheck: {
      base: BASE,
    },
    googleMaps: {
      apiKey: GOOGLE_MAPS_API_KEY_FALLBACK,
      mapId: GOOGLE_MAPS_MAP_ID_FALLBACK,
    },
  };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    if (!payload.googleMaps.apiKey) {
      console.warn(
        "[config] Supabase credentials missing; Google Maps API key not available."
      );
    }
    return res.json(payload);
  }
  try {
    const [marketcheckBase, googleMapsApiKey, googleMapsMapId] =
      await Promise.all([
        fetchSupabaseSecretValue(MARKETCHECK_BASE_SUPABASE_KEY_NAME, {
          force,
        }),
        fetchSupabaseSecretValue(GOOGLE_MAPS_API_KEY_SUPABASE_KEY_NAME, {
          force,
        }),
        fetchSupabaseSecretValue(GOOGLE_MAPS_MAP_ID_SUPABASE_KEY_NAME, {
          force,
        }),
      ]);
    if (marketcheckBase) {
      payload.marketcheck.base = marketcheckBase;
    }
    if (googleMapsApiKey) {
      payload.googleMaps.apiKey = googleMapsApiKey;
    }
    if (googleMapsMapId) {
      payload.googleMaps.mapId = googleMapsMapId;
    }
    res.json(payload);
  } catch (error) {
    console.error(
      "[config] Failed to load runtime config",
      error?.message || error
    );
    const detail =
      typeof error?.message === "string" && error.message
        ? error.message
        : "Supabase lookup failed.";
    res.status(500).json({
      error: "Runtime config unavailable",
      detail,
    });
  }
});

app.get("/", (_req, res) => {
  res.type("text").send(
    "ExcelCalc proxy online. Use /api/config, /api/mc/... endpoints from the Vite dev server."
  );
});

// GET /api/mc/by-vin/:vin?zip=&radius=&pick=nearest|freshest
app.get("/api/mc/by-vin/:vin", async (req, res) => {
  try {
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;
    const vin = String(req.params.vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
      return res.status(400).json({ error: "Invalid VIN" });
    }
    const rawZip = Array.isArray(req.query.zip) ? req.query.zip[0] : req.query.zip;
    const zipCandidate = stringOrNull(rawZip);
    const zip = zipCandidate ? zipCandidate.replace(/\D/g, "").slice(0, 5) : "";

    const rawRadius = Array.isArray(req.query.radius)
      ? req.query.radius[0]
      : req.query.radius;
    const radiusCandidate = numericOrNull(rawRadius);
    const radius =
      Number.isFinite(radiusCandidate) && radiusCandidate > 0
        ? Math.min(radiusCandidate, MAX_RADIUS)
        : MAX_RADIUS;
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
      const url = mcUrl(endpoint.path, params, apiKey);
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
          detail = await getJson(mcUrl(detailPath, detailParams, apiKey));
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
            mcUrl(enrichmentPath, enrichmentParams, apiKey)
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
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing listing id" });
    const url = mcUrl(`/listing/car/${encodeURIComponent(id)}`, {}, apiKey);
    const data = await getJson(url);
    return res.json({ ok: true, id, payload: normalizeListing(data), raw: data ?? null });
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
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;
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
    const data = await getJson(mcUrl(path, params, apiKey));
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
