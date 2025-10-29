let mcApiBase = "/api/mc";
let mcAuthToken = "";
const DEFAULT_RADIUS = 100;

function isLikelyJwt(token) {
  return typeof token === "string" && token.split(".").length === 3;
}

function normalizeBase(base) {
  if (!base || typeof base !== "string") return "/api/mc";
  const trimmed = base.trim();
  if (!trimmed) return "/api/mc";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function setMarketcheckApiBase(base) {
  const normalized = normalizeBase(base);
  if (normalized) {
    mcApiBase = normalized;
  }
}

export function setMarketcheckAuthToken(token) {
  mcAuthToken = typeof token === "string" ? token.trim() : "";
}

function isSupabaseFunctionUrl(url) {
  return /^https?:\/\/.+\.functions\.supabase\.co/i.test(url);
}

function mergeHeaders(baseHeaders = {}) {
  const headers = new Headers(baseHeaders);
  if (mcAuthToken && isLikelyJwt(mcAuthToken) && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${mcAuthToken}`);
  }
  if (mcAuthToken && !headers.has("apikey")) {
    headers.set("apikey", mcAuthToken);
  }
  return headers;
}

async function fetchWithAuth(url, options = {}) {
  const init = { ...options };
  if (typeof init.headers === "undefined") {
    init.headers = {};
  }
  if (isSupabaseFunctionUrl(url)) {
    init.headers = mergeHeaders(init.headers);
  }
  return fetch(url, init);
}

function buildUrl(path, query = "") {
  const base = normalizeBase(mcApiBase);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}${query ? `?${query}` : ""}`;
}

export async function mcByVin(
  vin,
  { zip = "", radius = DEFAULT_RADIUS, pick = "nearest" } = {}
) {
  const qp = new URLSearchParams();
  if (zip) qp.set("zip", String(zip).replace(/\D/g, ""));
  const numericRadius = Number(radius);
  const normalizedRadius =
    Number.isFinite(numericRadius) && numericRadius > 0
      ? Math.min(numericRadius, DEFAULT_RADIUS)
      : 0;
  if (normalizedRadius) qp.set("radius", String(normalizedRadius));
  if (pick) qp.set("pick", pick);
  const r = await fetchWithAuth(
    buildUrl(`/by-vin/${encodeURIComponent(vin)}`, qp.toString())
  );
  if (!r.ok) {
    let message = `byVin failed (${r.status})`;
    let body = null;
    try {
      body = await r.json();
    } catch {
      try {
        const text = await r.text();
        if (text) body = text;
      } catch {
        /* ignore */
      }
    }
    if (body && typeof body === "object") {
      const detail =
        (typeof body.detail === "string" && body.detail.trim()) ||
        (typeof body.error === "string" && body.error.trim()) ||
        "";
      if (detail) message = detail;
    } else if (typeof body === "string" && body.trim()) {
      message = body.trim();
    }
    const error = new Error(message);
    error.status = r.status;
    throw error;
  }
  return r.json();
}

export async function mcListing(id) {
  const r = await fetchWithAuth(buildUrl(`/listing/${encodeURIComponent(id)}`));
  if (!r.ok) {
    const error = new Error(`listing failed (${r.status})`);
    error.status = r.status;
    try {
      const body = await r.json();
      error.body = body;
      if (body && typeof body === "object") {
        const detail =
          (typeof body.detail === "string" && body.detail.trim()) ||
          (typeof body.error === "string" && body.error.trim()) ||
          "";
        if (detail) error.message = detail;
      }
    } catch {
      /* ignore body parse errors */
    }
    throw error;
  }
  return r.json();
}

export async function mcHistory(vin) {
  const cleanVin = String(vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  const r = await fetchWithAuth(
    buildUrl(`/history/${encodeURIComponent(cleanVin)}`)
  );
  if (!r.ok) {
    const message = `history failed (${r.status})`;
    let detail = message;
    try {
      const body = await r.json();
      if (body && typeof body === "object") {
        detail =
          (typeof body.detail === "string" && body.detail.trim()) ||
          (typeof body.error === "string" && body.error.trim()) ||
          message;
      }
    } catch {
      /* ignore body parse errors */
    }
    const error = new Error(detail);
    error.status = r.status;
    throw error;
  }
  return r.json();
}
