import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

type SecretCacheEntry = {
  value: string;
  expiresAt: number;
};

const SECRET_CACHE = new Map<string, SecretCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function fetchSecret(name: string): Promise<string> {
  const now = Date.now();
  const cached = SECRET_CACHE.get(name);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  if (!supabase) return "";
  const { data, error } = await supabase
    .from("secure_settings")
    .select("secret")
    .eq("name", name)
    .maybeSingle();
  if (error) {
    console.error("[runtime-config] secret fetch error", name, error.message);
    return "";
  }
  const value = typeof data?.secret === "string" ? data.secret.trim() : "";
  SECRET_CACHE.set(name, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const force =
    new URL(req.url).searchParams.get("force")?.toLowerCase() ?? "0";
  if (force === "1" || force === "true" || force === "yes") {
    SECRET_CACHE.clear();
  }

  const marketcheckBase =
    Deno.env.get("MARKETCHECK_BASE")?.trim() ||
    (await fetchSecret("marketcheck_api_base")) ||
    "https://api.marketcheck.com/v2";

  const googleMapsKey =
    Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim() ||
    (await fetchSecret("google_maps_api_key"));
  const googleMapsMapId =
    Deno.env.get("GOOGLE_MAPS_MAP_ID")?.trim() ||
    (await fetchSecret("google_maps_map_id")) ||
    "DEMO_MAP_ID";

  const marketcheckProxyBase = (() => {
    const override = Deno.env.get("MARKETCHECK_PROXY_BASE")?.trim();
    if (override) return override;
    const projectRef = SUPABASE_URL.replace(/^https?:\/\//, "")
      .split(".")[0]
      .trim();
    if (projectRef) {
      return `https://${projectRef}.functions.supabase.co/marketcheck`;
    }
    try {
      const { origin } = new URL(req.url);
      return `${origin.replace(/\/$/, "")}/marketcheck`;
    } catch {
      return "";
    }
  })();

  const payload = {
    marketcheck: {
      base: marketcheckBase,
      proxyBase: marketcheckProxyBase,
    },
    googleMaps: {
      apiKey: googleMapsKey,
      mapId: googleMapsMapId,
    },
  };

  return jsonResponse(payload);
});
