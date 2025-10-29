import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import {
  MARKETCHECK_ENDPOINTS,
  VIN_ENRICHMENT_ENDPOINTS,
  VIN_SEARCH_ORDER,
} from "../../../server/marketcheck-endpoints.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const SECRET_CACHE = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "Content-Type,Authorization",
  "cache-control": "no-store",
};

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function errorResponse(
  status: number,
  message: string,
  detail?: string
): Response {
  return jsonResponse(
    {
      error: message,
      detail: detail ?? message,
    },
    { status }
  );
}

function cacheGet(name: string): string | null {
  const record = SECRET_CACHE.get(name);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    SECRET_CACHE.delete(name);
    return null;
  }
  return record.value;
}

async function fetchSecret(name: string): Promise<string> {
  const cached = cacheGet(name);
  if (cached !== null) return cached;
  if (!supabase) return "";
  const { data, error } = await supabase
    .from("secure_settings")
    .select("secret")
    .eq("name", name)
    .maybeSingle();
  if (error) {
    console.error("[marketcheck] secret fetch error", name, error.message);
    return "";
  }
  const value = typeof data?.secret === "string" ? data.secret.trim() : "";
  SECRET_CACHE.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

let marketcheckApiKey = Deno.env.get("MARKETCHECK_API_KEY")?.trim() ?? "";
let marketcheckBase =
  Deno.env.get("MARKETCHECK_BASE")?.trim() ?? "https://api.marketcheck.com/v2";

async function resolveMarketcheckApiKey(): Promise<string> {
  if (marketcheckApiKey) return marketcheckApiKey;
  marketcheckApiKey = await fetchSecret("marketcheck_api_key");
  return marketcheckApiKey;
}

async function resolveMarketcheckBase(): Promise<string> {
  if (marketcheckBase) return marketcheckBase;
  const secretBase = await fetchSecret("marketcheck_api_base");
  marketcheckBase = secretBase || "https://api.marketcheck.com/v2";
  return marketcheckBase;
}

function mcUrl(
  base: string,
  path: string,
  params: Record<string, unknown>,
  apiKey: string
) {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath =
    typeof path === "string" && path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath || "", normalizedBase);
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const error = new Error(
      `${response.status} ${response.statusText}${
        bodyText ? `: ${bodyText}` : ""
      }`
    );
    (error as Error & { status?: number; body?: string }).status =
      response.status;
    (error as Error & { status?: number; body?: string }).body = bodyText;
    throw error;
  }
  return response.json();
}

function firstTruthy<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function numericOrNull(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function parseVehicleFromUrl(url: unknown) {
  if (!url || typeof url !== "string") return {};
  try {
    const parsed = new URL(url);
    const rawSegments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
    const disallowedToken =
      /^(new|used|certified|inventory|sale|car|truck|suv|for|at|with|and)$/i;
    const tokens: string[] = [];
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
    let year: number | null = null;
    let make: string | null = null;
    let modelTokens: string[] = [];
    let labelTokens: (string | number | null)[] = [];
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
      year,
      make: make ? make.replace(/\s+/g, " ").trim() : null,
      model: modelTokens.length
        ? modelTokens.join(" ").replace(/\s+/g, " ").trim()
        : null,
      label:
        labelTokens.length > 0
          ? labelTokens
              .map((item) => String(item ?? "").replace(/\s+/g, " ").trim())
              .filter(Boolean)
              .join(" ")
          : null,
    };
  } catch {
    return {};
  }
}

function buildFallbackPayload({
  vin,
  summary,
  specs,
  history,
}: {
  vin: string;
  summary: Record<string, unknown> | null;
  specs: Record<string, unknown> | null;
  history: unknown;
}) {
  const buildData =
    summary?.build ||
    (summary as any)?.vin?.build ||
    specs?.build ||
    specs?.summary ||
    {};
  const summaryVehicle =
    (summary as any)?.vin_summary ||
    (summary as any)?.vehicle ||
    (summary as any)?.summary ||
    (summary as any)?.build ||
    {};
  const specsVehicle = specs?.summary || specs?.specs || specs?.build || {};
  const historyListingsRaw = Array.isArray(history)
    ? history
    : (history as any)?.listings ||
      (history as any)?.listing_history ||
      (history as any)?.records ||
      [];
  const historyListings = Array.isArray(historyListingsRaw)
    ? [...historyListingsRaw]
    : [];
  historyListings.sort((a, b) => {
    const aTime = Number(
      (a as any)?.last_seen_at || (a as any)?.scraped_at || (a as any)?.timestamp || 0
    );
    const bTime = Number(
      (b as any)?.last_seen_at || (b as any)?.scraped_at || (b as any)?.timestamp || 0
    );
    return bTime - aTime;
  });
  const latestHistory: any = historyListings[0] || null;
  const latestBuild = latestHistory?.build || latestHistory?.vehicle || {};
  const latestDealer =
    latestHistory?.dealer ||
    latestHistory?.seller ||
    latestHistory?.dealer_details ||
    {};

  const year = numericOrNull(
    firstTruthy(
      (buildData as any)?.year,
      (summaryVehicle as any)?.year,
      (specsVehicle as any)?.year,
      (history as any)?.year,
      latestHistory?.year,
      latestBuild?.year
    )
  );
  const make = stringOrNull(
    firstTruthy(
      (buildData as any)?.make,
      (summaryVehicle as any)?.make,
      (specsVehicle as any)?.make,
      latestHistory?.make,
      latestHistory?.dealer_make,
      latestBuild?.make
    )
  );
  const model = stringOrNull(
    firstTruthy(
      (buildData as any)?.model,
      (summaryVehicle as any)?.model,
      (specsVehicle as any)?.model,
      latestHistory?.model,
      latestBuild?.model
    )
  );
  const trim = stringOrNull(
    firstTruthy(
      (buildData as any)?.trim,
      (summaryVehicle as any)?.trim,
      (specsVehicle as any)?.trim,
      latestHistory?.trim,
      latestBuild?.trim
    )
  );
  const heading = stringOrNull(
    firstTruthy(
      (summaryVehicle as any)?.heading,
      (summaryVehicle as any)?.title,
      (summaryVehicle as any)?.description
    )
  );
  const mileage = numericOrNull(
    firstTruthy(
      latestHistory?.miles,
      latestHistory?.mileage,
      (summaryVehicle as any)?.mileage,
      (specsVehicle as any)?.mileage
    )
  );
  const askingPrice = numericOrNull(
    firstTruthy(
      latestHistory?.price,
      (summaryVehicle as any)?.price,
      (summaryVehicle as any)?.msrp,
      (specsVehicle as any)?.price
    )
  );
  const dealerName = stringOrNull(
    firstTruthy(
      latestDealer?.name,
      latestHistory?.dealer_name,
      latestHistory?.seller_name,
      latestHistory?.dealer,
      latestHistory?.dealer_company
    )
  );
  const dealerCity = stringOrNull(
    firstTruthy(
      latestDealer?.city,
      latestHistory?.dealer_city,
      latestHistory?.city
    )
  );
  const dealerState = stringOrNull(
    firstTruthy(
      latestDealer?.state,
      latestHistory?.dealer_state,
      latestHistory?.state
    )
  );
  const dealerZip = stringOrNull(
    firstTruthy(latestDealer?.zip, latestHistory?.dealer_zip)
  );
  const dealerPhone = stringOrNull(
    firstTruthy(latestDealer?.phone, latestHistory?.dealer_phone)
  );
  const dealerStreet = stringOrNull(
    firstTruthy(
      latestDealer?.street,
      latestDealer?.address,
      latestHistory?.dealer_street,
      latestHistory?.street
    )
  );
  const dealerLat = numericOrNull(
    firstTruthy(latestDealer?.latitude, latestHistory?.latitude)
  );
  const dealerLng = numericOrNull(
    firstTruthy(latestDealer?.longitude, latestHistory?.longitude)
  );

  const vehicleLabel = [year, make, model, trim]
    .filter(Boolean)
    .join(" ")
    .trim();

  const parsedFromUrl = parseVehicleFromUrl(latestHistory?.vdp_url);
  const fallbackLabel =
    (parsedFromUrl as any).label || latestHistory?.seller_name || null;

  const resolvedYear = year ?? (parsedFromUrl as any).year ?? null;
  const resolvedMake = make ?? (parsedFromUrl as any).make ?? null;
  const resolvedModel = model ?? (parsedFromUrl as any).model ?? null;
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
          (summaryVehicle as any)?.photo_url,
          (summaryVehicle as any)?.primary_photo_url,
          (specsVehicle as any)?.photo_url,
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

function normalizeListing(listing: any) {
  if (!listing) return {};
  const build = listing.build || {};
  const dealer = listing.dealer || listing.car_location || {};
  const media = listing.media || {};

  const year = Number(listing.year ?? build.year) || null;
  const make = listing.make ?? build.make ?? null;
  const model = listing.model ?? build.model ?? null;
  const trim = listing.trim ?? build.trim ?? null;
  const vehicle =
    listing.heading ??
    listing.vehicle ??
    [year, make, model, trim].filter(Boolean).join(" ") ??
    null;

  return {
    year,
    make,
    model,
    trim,
    heading: listing.heading ?? vehicle ?? null,
    vehicle,
    vin: listing.vin ?? build.vin ?? null,
    mileage: listing.miles ?? listing.mileage ?? null,
    asking_price:
      listing.price ??
      listing.list_price ??
      listing.market_average_price ??
      null,
    dealer_name: dealer.name ?? null,
    dealer_street: dealer.street ?? dealer.address ?? null,
    dealer_city: dealer.city ?? null,
    dealer_state: dealer.state ?? null,
    dealer_zip: dealer.zip ?? null,
    dealer_phone: dealer.phone ?? null,
    dealer_lat: dealer.lat ?? dealer.latitude ?? null,
    dealer_lng: dealer.lon ?? dealer.longitude ?? null,
    listing_id: listing.id ?? null,
    listing_source: listing.source ?? listing.type ?? null,
    listing_url: listing.vdp_url ?? listing.inventory_url ?? null,
    photo_url:
      stringOrNull(media.photo_link) ??
      stringOrNull(media.primary_photo_url) ??
      null,
  };
}

function pickBestListing(
  listings: any[],
  options: { pick?: string } = {}
): any | null {
  if (!Array.isArray(listings) || !listings.length) return null;
  const arr = [...listings];
  if (options.pick === "freshest") {
    arr.sort(
      (a, b) =>
        Number(b.last_seen_at ?? 0) - Number(a.last_seen_at ?? 0)
    );
  } else {
    arr.sort((a, b) => Number(a.dist ?? Infinity) - Number(b.dist ?? Infinity));
  }
  return arr[0] ?? null;
}

async function handleByVin(url: URL): Promise<Response> {
  const vin = String(url.pathname.split("/").pop() ?? "")
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
    return errorResponse(400, "Invalid VIN");
  }

  const apiKey = await resolveMarketcheckApiKey();
  const base = await resolveMarketcheckBase();

  if (!apiKey) {
    return errorResponse(
      500,
      "MarketCheck API key missing",
      "Populate 'marketcheck_api_key' in secure_settings or set MARKETCHECK_API_KEY."
    );
  }

  const zipCandidate = stringOrNull(url.searchParams.get("zip"));
  const zip = zipCandidate ? zipCandidate.replace(/\D/g, "").slice(0, 5) : "";
  const radiusCandidate = numericOrNull(url.searchParams.get("radius"));
  const radius =
    radiusCandidate && radiusCandidate > 0
      ? Math.min(radiusCandidate, 100)
      : 100;
  const pick =
    url.searchParams.get("pick") === "freshest" ? "freshest" : "nearest";

  const attemptsLog: any[] = [];
  let best: any = null;
  let searchSource: string | null = null;
  const context = { vin, zip, radius };

  for (const attempt of VIN_SEARCH_ORDER) {
    if (typeof attempt?.condition === "function" && !attempt.condition(context)) {
      continue;
    }
    const endpoint = (MARKETCHECK_ENDPOINTS as any)[attempt.endpoint];
    if (!endpoint?.path) {
      attemptsLog.push({
        endpoint: attempt.endpoint,
        description: attempt.description,
        error: "Endpoint path missing",
      });
      continue;
    }
    const params =
      typeof attempt.params === "function"
        ? attempt.params(context)
        : endpoint.buildParams?.(context) ?? {};
    const targetUrl = mcUrl(base, endpoint.path, params, apiKey);
    try {
      const response = await getJson(targetUrl);
      const listings = Array.isArray(response?.listings)
        ? response.listings
        : [];
      attemptsLog.push({
        endpoint: attempt.endpoint,
        description: attempt.description,
        resultCount: listings.length,
      });
      if (!listings.length) continue;
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
        error: (error as Error)?.message ?? String(error),
      });
      console.warn(
        "[marketcheck] search attempt failed",
        attempt.description ?? attempt.endpoint,
        (error as Error)?.message ?? error
      );
    }
  }

  const enrichmentResults: Record<string, unknown> = {};
  const listingEndpoint = (MARKETCHECK_ENDPOINTS as any).listingById;
  let detail: any = null;
  if (best?.id && listingEndpoint) {
    const detailPath =
      listingEndpoint.buildPath?.({ id: best.id }) ??
      listingEndpoint.path ??
      null;
    if (detailPath) {
      try {
        const detailParams = listingEndpoint.buildParams?.({ id: best.id }) ?? {};
        detail = await getJson(mcUrl(base, detailPath, detailParams, apiKey));
      } catch (error) {
        console.warn("[marketcheck] listing detail lookup failed", error);
      }
    }
  }

  await Promise.all(
    VIN_ENRICHMENT_ENDPOINTS.map(async ({ endpoint, description }) => {
      const def = (MARKETCHECK_ENDPOINTS as any)[endpoint];
      if (!def) return;
      const enrichmentPath =
        def.buildPath?.({ vin, listing: detail || best }) ?? def.path ?? null;
      if (!enrichmentPath) return;
      const enrichmentParams =
        def.buildParams?.({ vin, listing: detail || best }) ?? {};
      try {
        enrichmentResults[endpoint] = await getJson(
          mcUrl(base, enrichmentPath, enrichmentParams, apiKey)
        );
      } catch (error) {
        console.warn(
          "[marketcheck] enrichment failed",
          description ?? endpoint,
          (error as Error)?.message ?? error
        );
      }
    })
  );

  const fallback = buildFallbackPayload({
    vin,
    summary: (enrichmentResults as any).vinSummary ?? null,
    specs: (enrichmentResults as any).vinSpecs ?? null,
    history: (enrichmentResults as any).historyByVin ?? null,
  });

  let payload: any = null;
  let payloadSource: string | null = null;

  if (best) {
    payload = normalizeListing(detail || best);
    payloadSource = searchSource || "active-listing";
  }

  if (!payload && fallback?.payload) {
    payload = fallback.payload;
    payloadSource = fallback.source || "summary";
    searchSource = searchSource || fallback.source || null;
  }

  const response = {
    ok: true,
    found: Boolean(payload),
    vin,
    listing_id: payload?.listing_id ?? best?.id ?? null,
    payload: payload ?? null,
    extras: {
      search_source: searchSource,
      search_attempts: attemptsLog,
      raw_listing: detail,
      summary: (enrichmentResults as any).vinSummary ?? null,
      specs: (enrichmentResults as any).vinSpecs ?? null,
      history: (enrichmentResults as any).historyByVin ?? null,
      payload_source: payloadSource,
    },
  };

  return jsonResponse(response);
}

async function handleListing(url: URL): Promise<Response> {
  const id = String(url.pathname.split("/").pop() ?? "").trim();
  if (!id) {
    return errorResponse(400, "Missing listing id");
  }
  const apiKey = await resolveMarketcheckApiKey();
  const base = await resolveMarketcheckBase();
  if (!apiKey) {
    return errorResponse(
      500,
      "MarketCheck API key missing",
      "Populate 'marketcheck_api_key' in secure_settings or set MARKETCHECK_API_KEY."
    );
  }
  const listingEndpoint = (MARKETCHECK_ENDPOINTS as any).listingById;
  const path =
    listingEndpoint?.buildPath?.({ id }) ?? `/listing/car/${encodeURIComponent(id)}`;
  const params = listingEndpoint?.buildParams?.({ id }) ?? {};
  try {
    const data = await getJson(mcUrl(base, path, params, apiKey));
    return jsonResponse({
      ok: true,
      id,
      payload: normalizeListing(data),
      raw: data ?? null,
    });
  } catch (error) {
    const status =
      (error as Error & { status?: number }).status ?? 502;
    return errorResponse(
      status,
      "Listing lookup failed",
      (error as Error)?.message ?? "Unknown error"
    );
  }
}

async function handleHistory(url: URL): Promise<Response> {
  const vin = String(url.pathname.split("/").pop() ?? "")
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
    return errorResponse(400, "Invalid VIN");
  }
  const apiKey = await resolveMarketcheckApiKey();
  const base = await resolveMarketcheckBase();
  if (!apiKey) {
    return errorResponse(
      500,
      "MarketCheck API key missing",
      "Populate 'marketcheck_api_key' in secure_settings or set MARKETCHECK_API_KEY."
    );
  }
  const historyEndpoint = (MARKETCHECK_ENDPOINTS as any).historyByVin;
  const path =
    historyEndpoint?.buildPath?.({ vin }) ?? `/history/car/${encodeURIComponent(vin)}`;
  const params = historyEndpoint?.buildParams?.({ vin }) ?? {};
  try {
    const data = await getJson(mcUrl(base, path, params, apiKey));
    return jsonResponse({
      ok: true,
      vin,
      history: data,
    });
  } catch (error) {
    const status =
      (error as Error & { status?: number }).status ?? 502;
    return errorResponse(
      status,
      "History lookup failed",
      (error as Error)?.message ?? "Unknown error"
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const routePath = url.pathname.replace(/^\/marketcheck/, "") || "/";

  if (routePath.startsWith("/by-vin/")) {
    return await handleByVin(url);
  }
  if (routePath.startsWith("/listing/")) {
    return await handleListing(url);
  }
  if (routePath.startsWith("/history/")) {
    return await handleHistory(url);
  }
  if (routePath === "/" || routePath === "") {
    return jsonResponse({
      ok: true,
      message: "MarketCheck proxy online",
    });
  }

  return errorResponse(404, "Not Found");
});
