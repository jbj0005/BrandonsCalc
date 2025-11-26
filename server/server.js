import "dotenv/config";
import express from "express";
import cors from "cors";
import NodeCache from "node-cache";
import { fetch } from "undici";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import twilio from 'twilio';
import sgMail from '@sendgrid/mail';
import { createClient } from '@supabase/supabase-js';
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

// Twilio Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";
const TWILIO_VERIFIED_NUMBER = process.env.TWILIO_VERIFIED_NUMBER || ""; // For trial account testing
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// SendGrid Configuration
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "";
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log("[sendgrid] API key configured");
} else {
  console.warn("[sendgrid] API key not set; email functionality will be disabled");
}

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

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes for MarketCheck API responses
const secretCache = new NodeCache({ stdTTL: 300 });

// Initialize Supabase client for MarketCheck cache (database layer)
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

if (supabase) {
  console.log('[mc-cache] Database cache enabled (Supabase connected)');
} else {
  console.warn('[mc-cache] Database cache disabled (Supabase not configured)');
}

/**
 * Check database cache for MarketCheck VIN response
 * @param {string} vin - Vehicle Identification Number
 * @returns {Promise<Object|null>} Cached response or null
 */
async function checkMarketCheckCache(vin) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('marketcheck_cache')
      .select('*')
      .eq('vin', vin)
      .single();

    if (error) {
      // Not found is expected, don't log as error
      if (error.code === 'PGRST116') {
        console.log(`[mc-cache] Cache MISS for VIN: ${vin}`);
        return null;
      }
      console.warn('[mc-cache] Database read error:', error.message);
      return null;
    }

    // Check if cache is expired
    if (data && new Date(data.expires_at) < new Date()) {
      console.log(`[mc-cache] Cache EXPIRED for VIN: ${vin}`);
      return null;
    }

    // Increment cache hits counter
    if (data) {
      await supabase
        .from('marketcheck_cache')
        .update({
          api_calls_saved: (data.api_calls_saved || 0) + 1,
          last_verified_at: new Date().toISOString()
        })
        .eq('vin', vin);

      console.log(`[mc-cache] Cache HIT for VIN: ${vin} (saved ${data.api_calls_saved + 1} API calls)`);
    }

    return data;
  } catch (error) {
    console.error('[mc-cache] Database cache check failed:', error);
    return null;
  }
}

/**
 * Write MarketCheck response to database cache
 * @param {Object} cacheData - Cache entry data
 * @param {string} cacheData.vin - Vehicle Identification Number
 * @param {Object} cacheData.mc_response - Full MarketCheck API response
 * @param {string} cacheData.mc_listing_id - Listing ID if found
 * @param {string} cacheData.mc_search_source - Search source (active/historical/summary)
 * @param {number} cacheData.ttl_days - Cache TTL in days (7 for active, 30 for historical)
 */
async function writeMarketCheckCache(cacheData) {
  if (!supabase) return;

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (cacheData.ttl_days || 7) * 24 * 60 * 60 * 1000);

    const { error } = await supabase
      .from('marketcheck_cache')
      .upsert({
        vin: cacheData.vin,
        mc_response: cacheData.mc_response,
        mc_listing_id: cacheData.mc_listing_id,
        mc_search_source: cacheData.mc_search_source,
        cached_at: now.toISOString(),
        last_verified_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true,
        api_calls_saved: 0
      }, {
        onConflict: 'vin'
      });

    if (error) {
      console.error('[mc-cache] Database cache write failed:', error.message);
    } else {
      console.log(`[mc-cache] Cached response for VIN: ${cacheData.vin} (expires in ${cacheData.ttl_days} days)`);
    }
  } catch (error) {
    console.error('[mc-cache] Database cache write error:', error);
  }
}

app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOW_ORIGIN?.split(",").map((s) => s.trim()) ?? "*",
    credentials: false,
  })
);

// Serve static files from parent directory (for Express Mode and other static assets)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(join(__dirname, '..')));

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

function logMarketCheckRateLimits(response) {
  if (!response?.headers) return;
  const interesting = [];
  response.headers.forEach((value, key) => {
    if (/rate-?limit/i.test(key)) {
      interesting.push(`${key}: ${value}`);
    }
  });
  if (interesting.length) {
    console.info(
      "[mc] Rate limit status →",
      interesting.join(" | ")
    );
  }
}

async function getJson(url) {
  const hit = cache.get(url);
  if (hit) return hit;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  logMarketCheckRateLimits(r);
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
      proxyBase: "/api/mc",
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
    if (!payload.marketcheck.proxyBase) {
      payload.marketcheck.proxyBase = "/api/mc";
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

/**
 * Shared garage + saved vehicles bundle (public)
 * Uses service role to fetch garage share link metadata and saved vehicles alongside garage vehicles.
 */
app.get("/api/share/:token/collections", async (req, res) => {
  const token = req.params.token;
  const requestedVehicleIdRaw = req.query.vehicle;
  const requestedVehicleId = Array.isArray(requestedVehicleIdRaw)
    ? requestedVehicleIdRaw[0]
    : requestedVehicleIdRaw;

  if (!token) {
    return res.status(400).json({ error: "Share token is required" });
  }

  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured on server" });
  }

  try {
    // Re-use existing RPC for validation and view counting
    const { data: garageVehicles, error: garageError } = await supabase.rpc(
      "get_shared_garage_vehicles",
      { p_token: token }
    );

    if (garageError) {
      return res
        .status(400)
        .json({ error: garageError.message || "Unable to load shared garage" });
    }

    let garageOwnerId =
      (garageVehicles && garageVehicles[0]?.garage_owner_id) ||
      (garageVehicles && garageVehicles[0]?.user_id) ||
      null;

    let filteredGarageVehicles = garageVehicles || [];
    if (requestedVehicleId) {
      filteredGarageVehicles = filteredGarageVehicles.filter(
        (v) => String(v.id) === String(requestedVehicleId)
      );
    }

    // If garage is empty, we still need the owner id (and to validate the link)
    if (!garageOwnerId) {
      const { data: linkRow, error: linkError } = await supabase
        .from("garage_share_links")
        .select(
          "garage_owner_id, revoked_at, expires_at, max_views, current_views"
        )
        .eq("token", token)
        .maybeSingle();

      if (linkError) {
        return res
          .status(400)
          .json({ error: linkError.message || "Invalid share link" });
      }
      if (!linkRow) {
        return res.status(404).json({ error: "Share link not found" });
      }

      const now = new Date();
      if (
        linkRow.revoked_at ||
        (linkRow.expires_at && new Date(linkRow.expires_at) < now) ||
        (linkRow.max_views &&
          linkRow.current_views >= (linkRow.max_views || 0))
      ) {
        return res.status(400).json({ error: "Share link is not active" });
      }

      // Increment view count for empty garages to mirror RPC behavior
      await supabase
        .from("garage_share_links")
        .update({
          current_views: (linkRow.current_views || 0) + 1,
        })
        .eq("token", token);

      garageOwnerId = linkRow.garage_owner_id;
    }

    let savedVehicles = [];

    if (garageOwnerId) {
      const { data: savedData, error: savedError } = await supabase
        .from("vehicles")
        .select(
          `
            id,
            user_id,
            vin,
            year,
            make,
            model,
            trim,
            mileage,
            condition,
            heading,
            asking_price,
            dealer_name,
            dealer_street,
            dealer_city,
            dealer_state,
            dealer_zip,
            dealer_phone,
            dealer_lat,
            dealer_lng,
            listing_id,
            listing_source,
            listing_url,
            photo_url,
            inserted_at
          `
        )
        .eq("user_id", garageOwnerId)
        .order("inserted_at", { ascending: false });

      if (savedError) {
        console.warn("[share] Failed to load saved vehicles:", savedError);
      } else {
        savedVehicles = savedData || [];
      }
    }

    return res.json({
      garageVehicles: filteredGarageVehicles,
      savedVehicles,
      garageOwnerId,
      token,
    });
  } catch (error) {
    console.error("[share] Failed to load shared collections:", error);
    return res
      .status(500)
      .json({ error: "Unable to load shared collections" });
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

    // Check database cache first (Layer 3: Persistent Cache)
    const cachedEntry = await checkMarketCheckCache(vin);
    if (cachedEntry && cachedEntry.mc_response) {
      console.log(`[mc-cache] Returning cached response for VIN: ${vin}`);
      return res.json(cachedEntry.mc_response);
    }

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

    const responseData = {
      ok: true,
      found: Boolean(payload),
      vin,
      listing_id: payload?.listing_id ?? best?.id ?? null,
      payload: payload ?? null,
      extras,
    };

    // Write to database cache (Layer 3: Persistent Cache)
    // Determine TTL based on search source: 7 days for active, 30 days for historical/summary
    const isActiveListing = searchSource && (
      searchSource.toLowerCase().includes('active') ||
      searchSource.toLowerCase().includes('fsbo')
    );
    const ttlDays = isActiveListing ? 7 : 30;

    await writeMarketCheckCache({
      vin,
      mc_response: responseData,
      mc_listing_id: responseData.listing_id,
      mc_search_source: searchSource || 'unknown',
      ttl_days: ttlDays
    });

    return res.json(responseData);
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

// GET /api/mc/search?year=2023&make=Honda&model=Accord&...
app.get("/api/mc/search", async (req, res) => {
  try {
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;

    // Extract search parameters
    const year = req.query.year ? String(req.query.year).trim() : "";
    const make = req.query.make ? String(req.query.make).trim() : "";
    const model = req.query.model ? String(req.query.model).trim() : "";
    const trim = req.query.trim ? String(req.query.trim).trim() : "";

    // Location parameters
    const rawZip = Array.isArray(req.query.zip) ? req.query.zip[0] : req.query.zip;
    const zip = rawZip ? String(rawZip).replace(/\D/g, "").slice(0, 5) : "";
    const rawRadius = Array.isArray(req.query.radius) ? req.query.radius[0] : req.query.radius;
    const radiusNum = Number(rawRadius);
    const radius = Number.isFinite(radiusNum) && radiusNum > 0
      ? Math.min(radiusNum, MAX_RADIUS)
      : 100;

    // Pagination
    const rows = Math.min(Number(req.query.rows) || 50, 100); // Max 100
    const start = Number(req.query.start) || 0;

    // Build query params
    const params = { rows, start, api_key: apiKey };
    if (year) params.year = year;
    if (make) params.make = make;
    if (model) params.model = model;
    if (trim) params.trim = trim;
    if (zip) params.zip = zip;
    if (radius) params.radius = radius;

    // Sort by distance if zip provided, else by price
    params.sort_by = zip ? "dist" : "price";
    params.sort_order = "asc";

    const url = mcUrl("/search/car/active", params, ""); // API key already in params
    console.log("[search] Querying:", { year, make, model, trim, zip, radius, rows });

    const data = await getJson(url);
    const listings = Array.isArray(data?.listings) ? data.listings : [];

    return res.json({
      ok: true,
      count: listings.length,
      total: data?.num_found || 0,
      listings: listings.map(normalizeListing),
      raw: data,
    });
  } catch (err) {
    console.error("[/search] error:", err);
    const status = err?.status || 500;
    res.status(status).json({
      error: "Vehicle search failed",
      detail: err?.message || "Unknown error",
    });
  }
});

// GET /api/mc/years?zip=32904
// Get list of available years based on user's location
app.get("/api/mc/years", async (req, res) => {
  try {
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;

    // Get zip code if provided, or use a default US center
    const rawZip = Array.isArray(req.query.zip) ? req.query.zip[0] : req.query.zip;
    const zip = rawZip ? String(rawZip).replace(/\D/g, "").slice(0, 5) : "64101"; // Kansas City, MO (center of US)
    const radius = 100; // API subscription limit

    // Search for vehicles and extract unique years
    // Fetch multiple pages to get comprehensive list
    const yearsSet = new Set();
    const rowsPerPage = 100;
    const maxPages = 5; // Fetch up to 500 total vehicles

    for (let page = 0; page < maxPages; page++) {
      const params = {
        api_key: apiKey,
        zip,
        radius,
        rows: rowsPerPage,
        start: page * rowsPerPage
      };

      const url = mcUrl("/search/car/active", params, "");

      try {
        const data = await getJson(url);
        const listings = Array.isArray(data?.listings) ? data.listings : [];

        if (listings.length === 0) {
          break; // No more results
        }

        // Extract unique years from this page
        listings.forEach(listing => {
          const year = listing?.year;
          if (year && (typeof year === 'string' || typeof year === 'number')) {
            const yearNum = parseInt(year);
            if (yearNum >= 1990 && yearNum <= new Date().getFullYear() + 1) {
              yearsSet.add(yearNum);
            }
          }
        });

        console.log(`[years] Page ${page + 1}: Found ${listings.length} vehicles, ${yearsSet.size} unique years so far`);

        // If we got fewer results than requested, we've reached the end
        if (listings.length < rowsPerPage) {
          break;
        }
      } catch (error) {
        console.error(`[years] Error fetching page ${page + 1}:`, error.message);
        break;
      }
    }

    // Convert to array and sort descending (newest first)
    const years = Array.from(yearsSet).sort((a, b) => b - a);

    return res.json({
      ok: true,
      zip,
      count: years.length,
      years
    });
  } catch (err) {
    console.error("[/years] error:", err);
    res.status(err?.status || 500).json({
      error: "Failed to fetch years",
      detail: err?.message || "Unknown error"
    });
  }
});

// GET /api/mc/makes?year=2024&zip=32904
// Get list of makes for a given year
app.get("/api/mc/makes", async (req, res) => {
  try {
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;

    const year = req.query.year ? String(req.query.year).trim() : "";

    if (!year) {
      return res.status(400).json({ error: "Year parameter is required" });
    }

    // Get zip code if provided, or use a default US center
    const rawZip = Array.isArray(req.query.zip) ? req.query.zip[0] : req.query.zip;
    const zip = rawZip ? String(rawZip).replace(/\D/g, "").slice(0, 5) : "64101"; // Kansas City, MO (center of US)
    const radius = 100; // API subscription limit

    // Search for vehicles and extract unique makes
    // Fetch multiple pages to get comprehensive list
    const makesSet = new Set();
    const rowsPerPage = 100;
    const maxPages = 5; // Fetch up to 500 total vehicles

    for (let page = 0; page < maxPages; page++) {
      const params = {
        api_key: apiKey,
        year,
        zip,
        radius,
        rows: rowsPerPage,
        start: page * rowsPerPage
      };

      const url = mcUrl("/search/car/active", params, "");

      try {
        const data = await getJson(url);
        const listings = Array.isArray(data?.listings) ? data.listings : [];

        if (listings.length === 0) {
          break; // No more results
        }

        // Extract unique makes from this page
        listings.forEach(listing => {
          const make = listing?.make || listing?.build?.make;
          if (make && typeof make === 'string' && make.trim()) {
            makesSet.add(make.trim().toLowerCase());
          }
        });

        console.log(`[makes] Page ${page + 1}: Found ${listings.length} vehicles, ${makesSet.size} unique makes so far`);

        // If we got fewer results than requested, we've reached the end
        if (listings.length < rowsPerPage) {
          break;
        }
      } catch (error) {
        console.error(`[makes] Error fetching page ${page + 1}:`, error.message);
        break;
      }
    }

    // Convert to array and capitalize properly
    const makes = Array.from(makesSet)
      .map(make => {
        // Capitalize first letter of each word
        return make.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      })
      .sort();

    return res.json({
      ok: true,
      year,
      count: makes.length,
      makes
    });
  } catch (err) {
    console.error("[/makes] error:", err);
    res.status(err?.status || 500).json({
      error: "Failed to fetch makes",
      detail: err?.message || "Unknown error"
    });
  }
});

// GET /api/mc/models?year=2024&make=Honda&zip=32904
// Get list of models for a given year and make
app.get("/api/mc/models", async (req, res) => {
  try {
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;

    const year = req.query.year ? String(req.query.year).trim() : "";
    const make = req.query.make ? String(req.query.make).trim() : "";

    if (!year || !make) {
      return res.status(400).json({ error: "Year and make parameters are required" });
    }

    // Get zip code if provided, or use a default US center
    const rawZip = Array.isArray(req.query.zip) ? req.query.zip[0] : req.query.zip;
    const zip = rawZip ? String(rawZip).replace(/\D/g, "").slice(0, 5) : "64101"; // Kansas City, MO (center of US)
    const radius = 100; // API subscription limit

    // Search for vehicles and extract unique models
    // Fetch multiple pages to get comprehensive list
    const modelsSet = new Set();
    const rowsPerPage = 100;
    const maxPages = 3; // Fetch up to 300 vehicles

    for (let page = 0; page < maxPages; page++) {
      const params = {
        api_key: apiKey,
        year,
        make,
        zip,
        radius,
        rows: rowsPerPage,
        start: page * rowsPerPage
      };

      const url = mcUrl("/search/car/active", params, "");

      try {
        const data = await getJson(url);
        const listings = Array.isArray(data?.listings) ? data.listings : [];

        if (listings.length === 0) {
          break;
        }

        // Extract unique models from this page
        listings.forEach(listing => {
          const model = listing?.model || listing?.build?.model;
          if (model && typeof model === 'string' && model.trim()) {
            modelsSet.add(model.trim().toLowerCase());
          }
        });

        console.log(`[models] Page ${page + 1}: Found ${listings.length} vehicles, ${modelsSet.size} unique models for ${make}`);

        if (listings.length < rowsPerPage) {
          break;
        }
      } catch (error) {
        console.error(`[models] Error fetching page ${page + 1}:`, error.message);
        break;
      }
    }

    // Convert to array and capitalize properly
    const models = Array.from(modelsSet)
      .map(model => {
        return model.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      })
      .sort();

    return res.json({
      ok: true,
      year,
      make,
      count: models.length,
      models
    });
  } catch (err) {
    console.error("[/models] error:", err);
    res.status(err?.status || 500).json({
      error: "Failed to fetch models",
      detail: err?.message || "Unknown error"
    });
  }
});

// GET /api/mc/trims?year=2024&make=Honda&model=Accord&zip=32904
// Get list of trims for a given year, make, and model
app.get("/api/mc/trims", async (req, res) => {
  try {
    const apiKey = await ensureApiKey(res);
    if (!apiKey) return;

    const year = req.query.year ? String(req.query.year).trim() : "";
    const make = req.query.make ? String(req.query.make).trim() : "";
    const model = req.query.model ? String(req.query.model).trim() : "";

    if (!year || !make || !model) {
      return res.status(400).json({ error: "Year, make, and model parameters are required" });
    }

    // Get zip code if provided, or use a default US center
    const rawZip = Array.isArray(req.query.zip) ? req.query.zip[0] : req.query.zip;
    const zip = rawZip ? String(rawZip).replace(/\D/g, "").slice(0, 5) : "64101"; // Kansas City, MO (center of US)
    const radius = 100; // API subscription limit

    // Search for vehicles and extract unique trims
    // Fetch multiple pages to get comprehensive list
    const trimsSet = new Set();
    const rowsPerPage = 100;
    const maxPages = 3; // Fetch up to 300 vehicles

    for (let page = 0; page < maxPages; page++) {
      const params = {
        api_key: apiKey,
        year,
        make,
        model,
        zip,
        radius,
        rows: rowsPerPage,
        start: page * rowsPerPage
      };

      const url = mcUrl("/search/car/active", params, "");

      try {
        const data = await getJson(url);
        const listings = Array.isArray(data?.listings) ? data.listings : [];

        if (listings.length === 0) {
          break;
        }

        // Extract unique trims from this page
        listings.forEach(listing => {
          const trim = listing?.trim || listing?.build?.trim;
          if (trim && typeof trim === 'string' && trim.trim()) {
            trimsSet.add(trim.trim().toLowerCase());
          }
        });

        console.log(`[trims] Page ${page + 1}: Found ${listings.length} vehicles, ${trimsSet.size} unique trims for ${make} ${model}`);

        if (listings.length < rowsPerPage) {
          break;
        }
      } catch (error) {
        console.error(`[trims] Error fetching page ${page + 1}:`, error.message);
        break;
      }
    }

    // Convert to array and capitalize properly
    const trims = Array.from(trimsSet)
      .map(trim => {
        return trim.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      })
      .sort();

    return res.json({
      ok: true,
      year,
      make,
      model,
      count: trims.length,
      trims
    });
  } catch (err) {
    console.error("[/trims] error:", err);
    res.status(err?.status || 500).json({
      error: "Failed to fetch trims",
      detail: err?.message || "Unknown error"
    });
  }
});

// GET /api/lenders
// Get list of active lenders from database; fall back to config/lenders.json
app.get("/api/lenders", async (req, res) => {
  const loadFromFile = async () => {
    const { readFile } = await import('fs/promises');
    const lendersPath = join(__dirname, '..', 'config', 'lenders.json');
    const lendersData = await readFile(lendersPath, 'utf-8');
    return JSON.parse(lendersData);
  };

  try {
    // If Supabase is not configured, use local config immediately
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      const lenders = await loadFromFile();
      return res.json(lenders);
    }

    // Fetch active lenders from database, sorted by display_order
    const url = new URL(`${SUPABASE_URL}/rest/v1/lenders`);
    url.searchParams.set('select', 'id,source,short_name,long_name,display_order,partnership_type,badge_text');
    url.searchParams.set('is_active', 'eq.true');
    url.searchParams.set('order', 'display_order.asc');

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    const lenders = await response.json();
    res.json(lenders);
  } catch (err) {
    console.error("[/api/lenders] error:", err);
    try {
      const lenders = await loadFromFile();
      return res.json(lenders);
    } catch (fileErr) {
      console.error("[/api/lenders] fallback error:", fileErr);
    }

    res.status(500).json({
      error: "Failed to fetch lenders",
      detail: err?.message || "Unknown error"
    });
  }
});

// Simple stub rates (fallback) keyed by lender source
const STUB_RATES_BY_SOURCE = {
  NFCU: [
    { vehicle_condition: 'new', term_min: 36, term_max: 72, base_apr: 4.99 },
    { vehicle_condition: 'used', term_min: 36, term_max: 72, base_apr: 5.49 },
  ],
  SCCU: [
    { vehicle_condition: 'new', term_min: 36, term_max: 84, base_apr: 5.25 },
    { vehicle_condition: 'used', term_min: 36, term_max: 72, base_apr: 5.75 },
  ],
  PENFED: [
    { vehicle_condition: 'new', term_min: 36, term_max: 84, base_apr: 5.15 },
    { vehicle_condition: 'used', term_min: 36, term_max: 72, base_apr: 5.65 },
  ],
  DCU: [
    { vehicle_condition: 'new', term_min: 36, term_max: 84, base_apr: 5.35 },
    { vehicle_condition: 'used', term_min: 36, term_max: 72, base_apr: 5.85 },
  ],
  LAUNCH: [
    { vehicle_condition: 'new', term_min: 36, term_max: 72, base_apr: 5.6 },
    { vehicle_condition: 'used', term_min: 36, term_max: 72, base_apr: 6.0 },
  ],
  NGFCU: [
    { vehicle_condition: 'new', term_min: 36, term_max: 72, base_apr: 5.4 },
    { vehicle_condition: 'used', term_min: 36, term_max: 72, base_apr: 5.9 },
  ],
  CCUFL: [
    { vehicle_condition: 'new', term_min: 36, term_max: 72, base_apr: 5.45 },
    { vehicle_condition: 'used', term_min: 36, term_max: 72, base_apr: 5.95 },
  ],
};

// GET /api/rates?source=NFCU
// Get lender rates from Supabase or fall back to stub rates
app.get("/api/rates", async (req, res) => {
  try {
    const source = req.query.source ? String(req.query.source).toUpperCase().trim() : "";

    if (!source) {
      return res.status(400).json({ error: "source parameter required" });
    }

    // Load lenders.json
    const { readFile } = await import('fs/promises');
    const lendersPath = join(__dirname, '..', 'config', 'lenders.json');
    const lendersData = await readFile(lendersPath, 'utf-8');
    const lenders = JSON.parse(lendersData);

    // Find lender by source or id
    const lender = lenders.find(l =>
      l.source?.toUpperCase() === source ||
      l.id?.toLowerCase() === source.toLowerCase()
    );

    if (!lender) {
      return res.status(404).json({
        error: "Lender not found",
        detail: `No lender configuration found for source: ${source}`
      });
    }

    // Try to fetch live rates from Supabase
    let liveRates = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        // Try both uppercase and lowercase source (Supabase has mixed case)
        const sourceLower = lender.source.toLowerCase();
        const sourceUpper = lender.source.toUpperCase();

        const url = new URL(`${SUPABASE_URL}/rest/v1/auto_rates`);
        url.searchParams.set('or', `(source.eq.${sourceLower},source.eq.${sourceUpper},source.eq.${lender.id})`);
        url.searchParams.set('select', '*');
        // Sort by lowest APR first, with intelligent tiebreakers for better rate selection
        url.searchParams.set('order', 'apr_percent.asc,effective_at.desc');

        const response = await fetch(url, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            // Transform Supabase format to frontend format (snake_case expected by frontend)
            liveRates = data.map(rate => ({
              source: rate.source,
              vehicle_condition: rate.vehicle_condition, // "new" or "used"
              loan_type: rate.loan_type, // "purchase" or "refinance"
              term_min: rate.term_range_min,
              term_max: rate.term_range_max,
              base_apr: rate.apr_percent,
              credit_score_min: rate.credit_score_min || 300,
              credit_score_max: rate.credit_score_max || 850,
              effective_date: rate.effective_at,
            }));
            console.log(`[rates] Returning ${liveRates.length} live rates for ${lender.shortName} from Supabase`);
          }
        }
      } catch (error) {
        console.warn(`[rates] Failed to fetch live rates from Supabase for ${source}:`, error.message);
      }
    }

    // Return live rates if available
    if (liveRates && liveRates.length > 0) {
      return res.json({
        ok: true,
        source: lender.source,
        lenderId: lender.id,
        lenderName: lender.longName,
        rates: liveRates,
        dataSource: 'supabase'
      });
    }

    // Fallback to stub rates from config map
    const stubRatesConfig = STUB_RATES_BY_SOURCE[lender.source?.toUpperCase()];
    if (stubRatesConfig && stubRatesConfig.length) {
      const effectiveDate = new Date().toISOString();
      const stubRates = stubRatesConfig.map((rate) => ({
        source: lender.source,
        vehicle_condition: rate.vehicle_condition,
        loan_type: 'purchase',
        term_min: rate.term_min,
        term_max: rate.term_max,
        base_apr: rate.base_apr,
        credit_score_min: 620,
        credit_score_max: 850,
        effective_date: effectiveDate,
      }));

      return res.json({
        ok: true,
        source: lender.source,
        lenderId: lender.id,
        lenderName: lender.longName,
        rates: stubRates,
        dataSource: 'stub',
      });
    }

    // No rates available - return error
    console.error(`[rates] No rates available in Supabase for ${lender.shortName}`);
    return res.status(404).json({
      ok: false,
      error: 'No rates available',
      source: lender.source,
      lenderId: lender.id,
      lenderName: lender.longName,
      message: `No rates found in Supabase for ${lender.longName}`
    });

  } catch (err) {
    console.error("[/rates] error:", err);
    res.status(500).json({
      error: "Failed to fetch rates",
      detail: err?.message || "Unknown error"
    });
  }
});

// POST /api/send-sms
// Send SMS with offer link via Twilio
app.post("/api/send-sms", async (req, res) => {
  try {
    // Check if Twilio is configured
    if (!twilioClient || !TWILIO_PHONE_NUMBER) {
      return res.status(500).json({
        error: "Twilio not configured",
        detail: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set in .env"
      });
    }

    const {
      offerId,
      offerName,
      recipientPhone,
      offerSummary,
      offerText
    } = req.body;

    if (!offerId) {
      return res.status(400).json({ error: "offerId is required" });
    }

    if (!recipientPhone) {
      return res.status(400).json({ error: "recipientPhone is required" });
    }

    // Format phone number to E.164 format if not already
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const formattedPhone = recipientPhone.startsWith('+')
      ? recipientPhone
      : `+1${cleanPhone}`;

    // Test Mode: Override recipient phone if TWILIO_VERIFIED_NUMBER is set (for trial accounts)
    let actualRecipient = formattedPhone;
    let isTestMode = false;
    let requestedPhone = formattedPhone;

    if (TWILIO_VERIFIED_NUMBER) {
      actualRecipient = TWILIO_VERIFIED_NUMBER.startsWith('+')
        ? TWILIO_VERIFIED_NUMBER
        : `+1${TWILIO_VERIFIED_NUMBER.replace(/\D/g, '')}`;
      isTestMode = true;
      console.log(`[send-sms] TEST MODE: Overriding recipient from ${formattedPhone} to verified number ${actualRecipient}`);
    }

    // Generate offer view URL
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const offerUrl = `${baseUrl}/offer.html?id=${offerId}`;

    const sanitizedSummary =
      typeof offerSummary === "string" && offerSummary.trim().length > 0
        ? offerSummary.trim()
        : null;

    let summaryFallback = null;
    if (!sanitizedSummary && typeof offerText === "string" && offerText.trim()) {
      const lines = offerText.trim().split(/\r?\n/).slice(0, 5);
      summaryFallback = lines.join("\n");
    }

    const messageSegments = [
      `Vehicle Purchase Offer${offerName ? ` - ${offerName}` : ""}`,
    ];

    if (sanitizedSummary) {
      messageSegments.push(sanitizedSummary);
    } else if (summaryFallback) {
      messageSegments.push(summaryFallback);
    }

    messageSegments.push(`View the full offer:\n${offerUrl}`);

    const message = messageSegments.join("\n\n");

    console.log(`[send-sms] Sending SMS to ${actualRecipient}`);

    // Send SMS via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: actualRecipient
    });

    console.log(`[send-sms] SMS sent successfully. SID: ${twilioMessage.sid}`);

    return res.json({
      ok: true,
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
      to: actualRecipient,
      testMode: isTestMode,
      requestedPhone: isTestMode ? requestedPhone : undefined
    });

  } catch (err) {
    console.error("[send-sms] error:", err);

    // Handle Twilio-specific errors
    if (err.code) {
      return res.status(400).json({
        error: "Twilio error",
        code: err.code,
        detail: err.message
      });
    }

    res.status(500).json({
      error: "Failed to send SMS",
      detail: err?.message || "Unknown error"
    });
  }
});

// GET /api/sms-status/:messageSid
// Check Twilio message delivery status
app.get("/api/sms-status/:messageSid", async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(500).json({ error: "Twilio not configured" });
    }

    const { messageSid } = req.params;

    // Fetch current message status from Twilio
    const message = await twilioClient.messages(messageSid).fetch();

    return res.json({
      ok: true,
      sid: message.sid,
      status: message.status, // queued, sending, sent, delivered, failed, undelivered
      to: message.to,
      dateUpdated: message.dateUpdated,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage
    });
  } catch (err) {
    console.error("[sms-status] Error:", err);
    return res.status(500).json({
      error: "Failed to fetch status",
      detail: err?.message
    });
  }
});

// POST /api/send-email
// Send email to user with offer copy
app.post("/api/send-email", async (req, res) => {
  try {
    const {
      offerId,
      recipientEmail,
      recipientName,
      offerText,
      offerSummary,
      vehicleInfo
    } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ error: "recipientEmail is required" });
    }

    if (!offerText) {
      return res.status(400).json({ error: "offerText is required" });
    }

    const subject = vehicleInfo
      ? `Your Vehicle Offer - ${vehicleInfo}`
      : "Your Vehicle Offer";

    // Check if SendGrid is configured
    if (!SENDGRID_API_KEY || !EMAIL_FROM) {
      console.warn("[send-email] SendGrid not configured");
      return res.status(500).json({
        error: "Email service not configured",
        detail: "SENDGRID_API_KEY and EMAIL_FROM must be set in .env"
      });
    }

    console.log("[send-email] Sending email to:", recipientEmail);
    console.log("[send-email] Subject:", subject);
    console.log("[send-email] Offer ID:", offerId);

    // Prepare email content
    const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your Vehicle Offer</h2>
        <p>${greeting}</p>
        <p>Thank you for using Brandon's Calculator. Here's a copy of your vehicle offer for your records:</p>

        ${offerSummary ? `<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <pre style="margin: 0; font-family: monospace; white-space: pre-wrap;">${offerSummary}</pre>
        </div>` : ''}

        <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0;">
          <pre style="margin: 0; font-family: monospace; white-space: pre-wrap;">${offerText}</pre>
        </div>

        <p style="color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <strong>Brandon's Calculator</strong><br>
          Generated with <a href="https://github.com/jbj0005/BrandonsCalc">Brandon's Calculator</a><br>
          Copyright 2026
        </p>
      </div>
    `;

    const textContent = `
${greeting}

Thank you for using Brandon's Calculator. Here's a copy of your vehicle offer for your records:

${offerSummary || ''}

${offerText}

---
Brandon's Calculator
Generated with Brandon's Calculator
https://github.com/jbj0005/BrandonsCalc
Copyright 2026
    `.trim();

    // Send email via SendGrid
    const msg = {
      to: recipientEmail,
      from: EMAIL_FROM,
      subject: subject,
      text: textContent,
      html: htmlContent
    };

    try {
      await sgMail.send(msg);
      console.log(`[send-email] Email sent successfully to ${recipientEmail}`);

      return res.json({
        ok: true,
        to: recipientEmail,
        subject: subject
      });
    } catch (sendError) {
      console.error("[send-email] SendGrid error:", sendError);
      throw sendError;
    }

  } catch (err) {
    console.error("[send-email] error:", err);
    res.status(500).json({
      error: "Failed to send email",
      detail: err?.message || "Unknown error"
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
