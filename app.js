import { createClient } from "@supabase/supabase-js";
import creditTiers from "./config/credit-tiers.json";
import lendersConfig from "./config/lenders.json";
import { createRatesEngine } from "./rates/provider-engine.mjs";
import savedVehicleLabelConfig from "./config/saved-vehicle-label.json";
import {
  mcListing,
  mcHistory,
  setMarketcheckApiBase,
  setMarketcheckAuthToken,
} from "./mc-client.mjs";

const SUPABASE_URL = "https://txndueuqljeujlccngbj.supabase.co";
const SUPABASE_KEY = "sb_publishable_iq_fkrkjHODeoaBOa3vvEA_p9Y3Yz8X";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ratesEngine = createRatesEngine({ supabase });
const VEHICLES_TABLE = "vehicles";
const VEHICLE_SELECT_COLUMNS = `
  id,
  user_id,
  vehicle,
  heading,
  vin,
  year,
  make,
  model,
  trim,
  mileage,
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
  marketcheck_payload
`;
const VEHICLE_FIELD_LABELS = {
  vin: "VIN",
  vehicle: "Vehicle Name",
  year: "Year",
  make: "Make",
  model: "Model",
  trim: "Trim",
  mileage: "Mileage",
  asking_price: "Asking Price",
  dealer_name: "Dealer Name",
  dealer_phone: "Dealer Phone",
  dealer_street: "Dealer Street",
  dealer_city: "Dealer City",
  dealer_state: "Dealer State",
  dealer_zip: "Dealer ZIP",
  dealer_lat: "Dealer Latitude",
  dealer_lng: "Dealer Longitude",
};
const VEHICLE_FIELD_KEYS = Object.keys(VEHICLE_FIELD_LABELS);
const DUPLICATE_VEHICLE_REGEX =
  /duplicate key value violates unique constraint ["']?vehicles_user_vin_unique_idx["']?/i;
const AUTH_MODE_COPY = {
  signin: {
    title: "Sign In",
    primaryText: "Sign In",
    prompt: "Need an account?",
    toggle: "Create one",
    pending: "Signing in...",
  },
  signup: {
    title: "Create Account",
    primaryText: "Create Account",
    prompt: "Already have an account?",
    toggle: "Sign in",
    pending: "Creating account...",
    success:
      "Check your email to confirm your account. Once verified, sign in to continue.",
  },
};
const DEFAULT_RUNTIME_CONFIG = {
  marketcheckApiBase: "https://api.marketcheck.com/v2",
  marketcheckProxyBase: "/api/mc",
  googleMapsApiKey: "",
  googleMapsMapId: "DEMO_MAP_ID",
};

const SUPABASE_PROJECT_REF = SUPABASE_URL.replace(/^https?:\/\//, "")
  .split(".")[0]
  .trim();
const SUPABASE_FUNCTIONS_BASE = SUPABASE_PROJECT_REF
  ? `https://${SUPABASE_PROJECT_REF}.functions.supabase.co`
  : "";

function looksLikeJwt(token) {
  return typeof token === "string" && token.split(".").length === 3;
}

async function requestRuntimeConfig(url, { withAuth = false } = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (withAuth && SUPABASE_KEY) {
    headers.set("apikey", SUPABASE_KEY);
    if (looksLikeJwt(SUPABASE_KEY)) {
      headers.set("Authorization", `Bearer ${SUPABASE_KEY}`);
    }
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url} responded with ${response.status}`);
  }
  return response.json();
}

async function fetchRuntimeConfig() {
  const defaults = { ...DEFAULT_RUNTIME_CONFIG };
  if (typeof fetch === "undefined") {
    return defaults;
  }

  const sources = [{ url: "/api/config", withAuth: false }];
  if (SUPABASE_FUNCTIONS_BASE) {
    sources.push({
      url: `${SUPABASE_FUNCTIONS_BASE}/runtime-config`,
      withAuth: true,
    });
  }

  for (const { url, withAuth } of sources) {
    try {
      const data = await requestRuntimeConfig(url, { withAuth });
      const marketcheckBase =
        typeof data?.marketcheck?.base === "string"
          ? data.marketcheck.base.trim()
          : "";
      const marketcheckProxyBase =
        typeof data?.marketcheck?.proxyBase === "string"
          ? data.marketcheck.proxyBase.trim()
          : "";
      const googleMapsApiKey =
        typeof data?.googleMaps?.apiKey === "string"
          ? data.googleMaps.apiKey.trim()
          : "";
      const googleMapsMapId =
        typeof data?.googleMaps?.mapId === "string"
          ? data.googleMaps.mapId.trim()
          : "";
      return {
        marketcheckApiBase:
          marketcheckBase || defaults.marketcheckApiBase,
        marketcheckProxyBase:
          marketcheckProxyBase ||
          (url.startsWith("http")
            ? `${SUPABASE_FUNCTIONS_BASE}/marketcheck`
            : defaults.marketcheckProxyBase),
        googleMapsApiKey,
        googleMapsMapId: googleMapsMapId || defaults.googleMapsMapId,
      };
    } catch (error) {
      console.warn(
        "[config] Failed to load from",
        url,
        error?.message || error
      );
    }
  }

  console.warn("[config] Falling back to default runtime config");
  return defaults;
}

// Format inputs to accounting-style USD on Enter and on blur.
// Works for any input with class="usdFormat".
document.addEventListener("DOMContentLoaded", async () => {
  const runtimeConfig = await fetchRuntimeConfig();
  if (typeof window !== "undefined") {
    window.__BRANDONSCALC_RUNTIME_CONFIG__ = runtimeConfig;
  }
  setMarketcheckApiBase(runtimeConfig.marketcheckProxyBase);
  setMarketcheckAuthToken(SUPABASE_KEY);
  const GOOGLE_MAPS_API_KEY = runtimeConfig.googleMapsApiKey;
  const GOOGLE_MAPS_MAP_ID = runtimeConfig.googleMapsMapId;
  const USD_SELECTOR = ".usdFormat";
  const PERCENT_SELECTOR = ".percentFormat";
  const DEFAULT_APR = 0.0599;
  const DEFAULT_TERM_MONTHS = 72;
  const MIN_APR = 0;
  const MAX_FINANCE_APR = 0.15;
  const MAX_AFFORD_APR = 0.25;
  const MIN_TERM_MONTHS = 0;
  const MAX_TERM_MONTHS = 96;
  const MIN_AFFORD_TERM_MONTHS = 24;
  const MAX_AFFORD_TERM_MONTHS = 96;
  const PAYMENT_TOLERANCE = 0.01;
  const AFFORD_TERM_BUCKETS = [24, 36, 48, 60, 72, 84, 96];
  const DEFAULT_MAP_CENTER = { lat: 28.5383, lng: -81.3792 };
  const TAX_RATE_CONFIG = {
    FL: {
      stateRate: 0.06,
      counties: {
        HAMILTON: 0.02,
        BREVARD: 0.01,
      },
    },
  };
  const RATE_SOURCE_USER_DEFINED = "userDefined";
  const MIN_CREDIT_SCORE = 300;
  const MAX_CREDIT_SCORE = 850;
  const RATE_SOURCE_NFCU = "nfcu";
  const NFCU_SOURCE = "NFCU";

  const LENDERS = Array.isArray(lendersConfig) ? lendersConfig : [];
  const providerMetaByUpper = new Map();
  const providerMetaByNormalized = new Map();

  function normalizeToken(value, { stripCommon = false } = {}) {
    const lower = String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (!stripCommon) return lower;
    return lower.replace(
      /(federal|credit|union|bank|loan|loans|car|auto|buyingservice|corp|inc|llc|association|cooperative|cu)/g,
      ""
    );
  }

  function normalizeHomepageUrl(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return null;
    const candidate = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      if (!/^https?:$/i.test(url.protocol)) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function formatEffectiveDate(value) {
    if (!value) return "";
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toISOString().slice(0, 10);
    } catch {
      return String(value);
    }
  }

  function registerProviderMeta(key, meta) {
    if (!key) return;
    const upper = String(key).toUpperCase();
    if (upper && !providerMetaByUpper.has(upper)) {
      providerMetaByUpper.set(upper, meta);
    }
    const normalized = normalizeToken(key, { stripCommon: true });
    if (normalized && !providerMetaByNormalized.has(normalized)) {
      providerMetaByNormalized.set(normalized, meta);
    }
  }

  LENDERS.forEach((lender) => {
    const fallbackKey = String(
      lender?.source || lender?.id || lender?.shortName || ""
    ).toUpperCase();
    if (!fallbackKey) return;
    const homepageUrl =
      normalizeHomepageUrl(
        lender?.website || lender?.homepage || lender?.url || null
      ) ?? null;
    const sourceUrl = normalizeHomepageUrl(lender?.sourceUrl || null);
    const meta = {
      shortName: lender?.shortName || fallbackKey,
      longName: lender?.longName || lender?.shortName || fallbackKey,
      enabled: lender?.enabled !== false,
      homepageUrl: homepageUrl ?? sourceUrl ?? null,
      sourceUrl: sourceUrl ?? null,
    };
    registerProviderMeta(lender?.source, meta);
    registerProviderMeta(lender?.id, meta);
    registerProviderMeta(lender?.shortName, meta);
    registerProviderMeta(fallbackKey, meta);
  });

  const PROVIDER_META_OVERRIDES = {
    CCUFL: {
      shortName: "CCUFL",
      longName: "Community Credit Union of Florida",
    },
    CCU_IL: {
      shortName: "CCU",
      longName: "Consumers Credit Union (IL)",
    },
    CCU_ONLINE: {
      shortName: "CCU-Online",
      longName: "Consumers Credit Union (Online via Car Buying Service)",
    },
    CCU_MI: {
      shortName: "Consumers CU",
      longName: "Consumers Credit Union (MI)",
    },
    NGFCU: {
      shortName: "NGFCU",
      longName: "Northrop Grumman Federal Credit Union",
    },
    TRU: {
      shortName: "Tru",
      longName: "Truist Bank",
    },
    BOA: {
      shortName: "BoA",
      longName: "Bank of America",
    },
  };

  Object.entries(PROVIDER_META_OVERRIDES).forEach(([key, meta]) => {
    if (!key) return;
    registerProviderMeta(key, {
      shortName: meta?.shortName || meta?.short || key,
      longName: meta?.longName || meta?.long || meta?.name || key,
      enabled: meta?.enabled !== false,
      homepageUrl: meta?.homepageUrl || meta?.website || null,
      sourceUrl: meta?.sourceUrl || null,
    });
  });

  function resolveProviderMeta(token) {
    if (!token) return null;
    const upper = String(token).toUpperCase();
    if (providerMetaByUpper.has(upper)) {
      return providerMetaByUpper.get(upper);
    }
    const normalized = normalizeToken(token, { stripCommon: true });
    if (normalized && providerMetaByNormalized.has(normalized)) {
      return providerMetaByNormalized.get(normalized);
    }
    return null;
  }

  function formatProviderDisplayName(provider) {
    const fallbackName = "Provider";
    if (!provider) return fallbackName;

    const lookupKeys = [
      provider?.sourceUpper,
      provider?.source,
      provider?.id,
      provider?.shortName,
    ].filter(Boolean);

    let meta = null;
    for (const key of lookupKeys) {
      meta = resolveProviderMeta(key);
      if (meta) break;
    }

    const longName =
      meta?.longName ||
      provider?.longName ||
      meta?.shortName ||
      provider?.source ||
      provider?.sourceUpper ||
      provider?.shortName ||
      fallbackName;

    const shortName =
      meta?.shortName ||
      provider?.shortName ||
      provider?.source ||
      provider?.sourceUpper ||
      "";

    if (
      shortName &&
      longName &&
      shortName.trim().toLowerCase() !== longName.trim().toLowerCase()
    ) {
      return `${longName} (${shortName})`;
    }

    return longName || shortName || fallbackName;
  }

  if (typeof window !== "undefined") {
    window.excelcalcResolveProviderMeta = resolveProviderMeta;
  }

  let rateProviders = [];
  let lowestAprProviderName = "";

  const CREDIT_TIERS = (() => {
    if (!Array.isArray(creditTiers)) {
      return [
        {
          id: "default",
          label: "All Scores",
          minScore: MIN_CREDIT_SCORE,
          maxScore: MAX_CREDIT_SCORE,
          aprAdjustment: 0,
        },
      ];
    }
    const normalized = creditTiers
      .map((tier, index) => {
        const rawMin = Number(tier?.minScore ?? tier?.min ?? tier?.min_score);
        const rawMax = Number(tier?.maxScore ?? tier?.max ?? tier?.max_score);
        if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
          return null;
        }
        const minScore = Math.max(MIN_CREDIT_SCORE, Math.round(rawMin));
        const maxScore = Math.min(MAX_CREDIT_SCORE, Math.round(rawMax));
        if (maxScore < minScore) return null;
        const id =
          typeof tier?.id === "string" && tier.id.trim()
            ? tier.id.trim()
            : `tier${index + 1}`;
        const label =
          typeof tier?.label === "string" && tier.label.trim()
            ? tier.label.trim()
            : id;
        const adjustmentRaw = Number(
          tier?.aprAdjustment ?? tier?.apr_adjustment
        );
        const aprAdjustment = Number.isFinite(adjustmentRaw)
          ? Math.round(adjustmentRaw * 100) / 100
          : 0;
        return {
          id,
          label,
          minScore,
          maxScore,
          aprAdjustment,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.minScore - a.minScore);
    if (normalized.length === 0) {
      return [
        {
          id: "default",
          label: "All Scores",
          minScore: MIN_CREDIT_SCORE,
          maxScore: MAX_CREDIT_SCORE,
          aprAdjustment: 0,
        },
      ];
    }
    return normalized;
  })();

  const usdFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  const percentFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  });
  function createSuggestionStore(id) {
    let datalist = document.getElementById(id);
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = id;
      document.body.appendChild(datalist);
    }

    const map = new Map();

    function setItems(items) {
      map.clear();
      const fragment = document.createDocumentFragment();
      const seen = new Set();
      items.forEach((item) => {
        const name = typeof item?.name === "string" ? item.name.trim() : "";
        if (!name) return;
        const lower = name.toLowerCase();
        if (!map.has(lower) || item.amount != null) {
          map.set(lower, item.amount ?? map.get(lower) ?? null);
        }
        if (seen.has(lower)) return;
        seen.add(lower);
        const option = document.createElement("option");
        option.value = name;
        fragment.append(option);
      });
      datalist.replaceChildren(fragment);
      console.info("[fees] datalist populated", {
        id: datalist.id,
        optionCount: datalist.children.length,
      });
    }

    function getAmount(name) {
      if (!name) return null;
      return map.get(String(name).trim().toLowerCase()) ?? null;
    }

    return { datalist, setItems, getAmount };
  }

  const dealerFeeSuggestionStore = createSuggestionStore(
    "dealerFeeSuggestions"
  );
  const govFeeSuggestionStore = createSuggestionStore("govFeeSuggestions");

  if (typeof window !== "undefined") {
    window.supabase = supabase;
    window.feeSuggestionsDebug = {
      dealer: dealerFeeSuggestionStore,
      gov: govFeeSuggestionStore,
      logCounts() {
        console.info("[fees] option counts", {
          dealer: dealerFeeSuggestionStore?.datalist?.children?.length ?? 0,
          gov: govFeeSuggestionStore?.datalist?.children?.length ?? 0,
        });
      },
    };
  }

  function safeParseJSON(raw) {
    if (typeof raw !== "string") return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("[fees] failed to parse items JSON", { raw, error });
      return [];
    }
  }

  function normalizeFeeItems(records) {
    const list = Array.isArray(records) ? records : [];
    const dedup = new Map();
    list.forEach((item) => {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (!name) return;
      const lower = name.toLowerCase();
      let amount = null;
      if (typeof item.amount === "number" && Number.isFinite(item.amount)) {
        amount = item.amount;
      } else if (typeof item.amount === "string") {
        const parsed = Number(item.amount);
        if (Number.isFinite(parsed)) amount = parsed;
      }
      if (!dedup.has(lower) || amount != null) {
        dedup.set(lower, { name, amount });
      }
    });
    return Array.from(dedup.values());
  }

  async function fetchFeeItemsFromSet(tableName) {
    const { data, error } = await supabase
      .from(tableName)
      .select("id, label, items")
      .eq("active", true);
    if (error) throw error;
    const records = Array.isArray(data) ? data : [];
    const first = records[0] ?? null;
    const setId = first?.id ?? null;
    const rawItems = (records ?? []).flatMap((set) => {
      if (Array.isArray(set?.items)) return set.items;
      if (typeof set?.items === "string") return safeParseJSON(set.items);
      return [];
    });
    return {
      setId,
      rawItems,
      normalizedItems: normalizeFeeItems(rawItems),
    };
  }

  async function fetchFeeItemsFromView(viewName) {
    const { data, error } = await supabase
      .from(viewName)
      .select("name, amount, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    console.debug(`[fees] view raw ${viewName}`, data);
    const normalizedItems = normalizeFeeItems(data);
    const rawItems = (data ?? []).map((item) => ({
      name: typeof item?.name === "string" ? item.name : "",
      amount:
        typeof item?.amount === "number"
          ? item.amount
          : Number(item?.amount) || 0,
    }));
    return { normalizedItems, rawItems };
  }

  function setSuggestionItems(store, items, context, fallbackMessage) {
    if (items.length === 0) {
      console.warn(`[fees] ${context} empty.`, fallbackMessage ?? "");
      store.setItems([]);
      return;
    }
    store.setItems(items);
  }

  async function loadDealerFeeSuggestions() {
    try {
      let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet(
        "dealer_fee_sets"
      );
      dealerFeeSetState.id = setId;
      dealerFeeSetState.items = rawItems;
      let items = normalizedItems;
      let source = "dealer_fee_sets";
      if (!items.length) {
        console.warn("[fees] dealer sets empty, falling back to view");
        const viewResult = await fetchFeeItemsFromView("dealer_fee_items_v");
        items = viewResult.normalizedItems;
        dealerFeeSetState.items = viewResult.rawItems;
        source = "dealer_fee_items_v";
      }
      console.info("[fees] Loaded dealer suggestions", {
        count: items.length,
        source,
      });
      setSuggestionItems(dealerFeeSuggestionStore, items, `${source} dealer`);
    } catch (error) {
      console.error("Failed to load dealer fee suggestions", error);
      dealerFeeSuggestionStore.setItems([]);
    }
  }

  async function loadGovFeeSuggestions() {
    try {
      let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet(
        "gov_fee_sets"
      );
      govFeeSetState.id = setId;
      govFeeSetState.items = rawItems;
      let items = normalizedItems;
      let source = "gov_fee_sets";
      if (!items.length) {
        console.warn("[fees] gov sets empty, falling back to view");
        const viewResult = await fetchFeeItemsFromView("gov_fee_items_v");
        items = viewResult.normalizedItems;
        govFeeSetState.items = viewResult.rawItems;
        source = "gov_fee_items_v";
      }
      console.info("[fees] Loaded gov suggestions", {
        count: items.length,
        source,
      });
      setSuggestionItems(govFeeSuggestionStore, items, `${source} gov`);
    } catch (error) {
      console.error("Failed to load gov fee suggestions", error);
      govFeeSuggestionStore.setItems([]);
    }
  }

  const vehicleSelect = document.getElementById("vehicleSelect");
  const vehicleModal = document.getElementById("vehicleModal");
  const vehicleModalForm = document.getElementById("vehicleModalForm");
  const salePriceInput = document.getElementById("salePrice");
  const tradeOfferInput = document.getElementById("tradeOffer");
  const tradePayoffInput = document.getElementById("tradePayoff");
  const equityOutput = document.getElementById("equity");
  const cashDifferenceOutput = document.getElementById("cashDifference");
  const netTradeOutput = document.getElementById("netTrade");
  const savingsNote = document.getElementById("savingsNote");
  const totalFeesOutput = document.getElementById("totalTF");
  const totalDealerFeesOutput = document.getElementById("totalDealerFees");
  const totalGovtFeesOutput = document.getElementById("totalGovtFees");
  const calculatorForm = document.querySelector("#saleSummaryCard form.grid");
  const feesForm =
    document.querySelector("#feesCard form.grid3") ||
    document.querySelector("#feesCard form.grid5") ||
    document.querySelector("#feesCard form");
  const totalDealerFeesLabel =
    feesForm?.querySelector("label[for='totalDealerFees']") ?? null;
  const totalGovtFeesLabel =
    feesForm?.querySelector("label[for='totalGovtFees']") ?? null;
  const dealerFeesLabel =
    feesForm?.querySelector("label[for*='dealerFeeDesc']") ?? null;
  const dealerFeeDescInput = document.getElementById("dealerFeeDesc");
  const dealerFeeAmountInput = document.getElementById("dealerFeeAmount");
  const dealerFeeMinusBtn =
    dealerFeeAmountInput?.nextElementSibling instanceof HTMLButtonElement
      ? dealerFeeAmountInput.nextElementSibling
      : null;
  const dealerFeePlusBtn =
    dealerFeeMinusBtn?.nextElementSibling instanceof HTMLButtonElement
      ? dealerFeeMinusBtn.nextElementSibling
      : null;
  const govFeesLabel =
    feesForm?.querySelector("label[for*='govtFeeDesc']") ?? null;
  const govFeeDescInput = document.getElementById("govtFeeDesc");
  const govFeeAmountInput = document.getElementById("govtFeeAmount");
  const govFeeMinusBtn =
    govFeeAmountInput?.nextElementSibling instanceof HTMLButtonElement
      ? govFeeAmountInput.nextElementSibling
      : null;
  const govFeePlusBtn =
    govFeeMinusBtn?.nextElementSibling instanceof HTMLButtonElement
      ? govFeeMinusBtn.nextElementSibling
      : null;
  const totalFeesLabel =
    feesForm?.querySelector("label[for='totalTF']") ?? null;

  if (dealerFeeDescInput instanceof HTMLInputElement) {
    const listId = dealerFeeSuggestionStore?.datalist?.id;
    if (listId) dealerFeeDescInput.setAttribute("list", listId);
  }
  if (govFeeDescInput instanceof HTMLInputElement) {
    const listId = govFeeSuggestionStore?.datalist?.id;
    if (listId) govFeeDescInput.setAttribute("list", listId);
  }
  const taxableBaseOutput = document.getElementById("taxableBase");
  const stateTaxInput = document.getElementById("stateTax");
  const stateTaxTotalOutput = document.getElementById("stateTaxTotal");
  const countyTaxInput = document.getElementById("countyTax");
  const countyTaxTotalOutput = document.getElementById("countyTaxTotal");
  const totalTaxesOutput = document.getElementById("totalTaxes");
  const financeTFCheckbox = document.getElementById("financeTF");
  const financeNegEquityCheckbox = document.getElementById("financeNegEquity");
  const cashOutEquityCheckbox = document.getElementById("cashOutEquity");
  const financeNegEquityLabel = document.querySelector(
    "label[for='financeNegEquity']"
  );
  const cashOutEquityLabel = document.querySelector(
    "label[for='cashOutEquity']"
  );
  const cashDownInput = document.getElementById("cashDown");
  const cashToBuyerOutput = document.getElementById("cash2Buyer");
  const cashDueOutput = document.getElementById("cashDue");
  const saleSummaryCard = document.getElementById("saleSummaryCard");
  const amountFinancedOutput = document.getElementById("amountFinanced");
  const financeAprInput = document.getElementById("financeApr");
  const financeTermInput = document.getElementById("financeTerm");
  const rateSourceSelect = document.getElementById("rateSource");
  const rateSourceNameOutput = document.getElementById("rateSourceName");
  const vehicleConditionSelect = document.getElementById("vehicleCondition");
  const creditScoreInput = document.getElementById("creditScore");
  const floatingPaymentCard = document.getElementById("floatingPaymentCard");
  const floatingAprOutput = document.getElementById("floatingAprValue");
  const floatingTermOutput = document.getElementById("floatingTermValue");
  const floatingMaxFinancedOutput = document.getElementById(
    "floatingMaxFinanced"
  );
  const floatingMonthlyPaymentOutput =
    document.getElementById("floatingMonthlyPmt");
  const monthlyPaymentOutput = document.getElementById("monthlyPmt");
  const monthlyPaymentOutputs = [
    monthlyPaymentOutput,
    floatingMonthlyPaymentOutput,
  ].filter(Boolean);
  const currencyInputs = [
    salePriceInput,
    tradeOfferInput,
    tradePayoffInput,
    cashDownInput,
  ];
  currencyInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        formatInputEl(input);
        focusNextField(input);
      }
    });
  });
  const rateSourceStatusOutput = document.getElementById("rateSourceStatus");
  const financeTFNoteOutput = document.getElementById("financeTFNote");
  const financeNegEquityNoteOutput = document.getElementById(
    "financeNegEquityNote"
  );
  const cashOutEquityNoteOutput = document.getElementById("cashOutEquityNote");
  const affordabilityPaymentInput = document.getElementById("affordability");
  const affordabilityAprInput = document.getElementById("affordApr");
  const affordabilityTermInput = document.getElementById("affordTerm");
  if (affordabilityPaymentInput instanceof HTMLInputElement) {
    affordabilityPaymentInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        formatInputEl(affordabilityPaymentInput);
        focusNextField(affordabilityPaymentInput);
      }
    });
  }
  const maxTotalFinancedOutput = document.getElementById("maxTotalFinanced");
  const affordabilityGapNoteOutput =
    document.getElementById("affordabilityGap");
  const affordabilityStatusOutput = document.getElementById("reqAPR_TERM");
  const locationStateOutput = document.getElementById("locationState");
  const locationCountyOutput = document.getElementById("locationCounty");
  const locationStateTaxOutput = document.getElementById("locationStateTax");
  const locationCountyTaxOutput = document.getElementById("locationCountyTax");
  const editFeeButton = document.getElementById("editFeeButton");
  const editFeeModal = document.getElementById("editFeeModal");
  const editFeeForm = document.getElementById("editFeeForm");
  const editFeeTypeSelect = document.getElementById("editFeeType");
  const editFeeNameInput = document.getElementById("editFeeName");
  const editFeeAmountInput = document.getElementById("editFeeAmount");
  const editFeeStatus = document.getElementById("editFeeStatus");
  const editFeeCloseBtn = editFeeModal?.querySelector(
    "[data-editfee-action='close']"
  );
  const editFeeCancelBtn = editFeeForm?.querySelector(
    "[data-editfee-action='cancel']"
  );
  const authModal = document.getElementById("authModal");
  const authForm = document.getElementById("authForm");
  const authEmailInput = document.getElementById("authEmail");
  const authPasswordInput = document.getElementById("authPassword");
  const authModalTitle = document.getElementById("authModalTitle");
  const authModalStatusEl = authForm?.querySelector(".modalStatus") ?? null;
  const authModalPrimaryBtn = authForm?.querySelector(".modalPrimary") ?? null;
  const authModalSecondaryBtn =
    authForm?.querySelector(".modalSecondary") ?? null;
  const authModalCloseBtn = authModal?.querySelector(".modalClose") ?? null;
  const authModePromptEl =
    authForm?.querySelector("[data-auth-copy='prompt']") ?? null;
  const authModeToggleBtn =
    authForm?.querySelector("[data-auth-action='toggle-mode']") ?? null;
  const loginLinks = Array.from(document.querySelectorAll("[data-auth-link]"));
  const modalTitle = document.getElementById("vehicleModalTitle");
  const modalStatusEl = vehicleModalForm?.querySelector(".modalStatus") ?? null;
  const modalPrimaryBtn =
    vehicleModalForm?.querySelector(".modalPrimary") ?? null;
  const modalSecondaryBtn =
    vehicleModalForm?.querySelector(".modalSecondary") ?? null;
  const modalCloseBtn = vehicleModal?.querySelector(".modalClose") ?? null;
  const vehicleActionButtons = Array.from(
    document.querySelectorAll("[data-vehicle-action]")
  );
  const dealerMapContainer = document.getElementById("dealerMap");
  const dealerMapStatusEl = document.getElementById("dealerMapStatus");
  const initialDealerMapStatusMessage =
    dealerMapStatusEl?.textContent?.trim?.() ?? "";

  const modalFields = vehicleModalForm
    ? {
        vehicle: document.getElementById("modalVehicleName"),
        vin: document.getElementById("modalVin"),
        year: document.getElementById("modalYear"),
        make: document.getElementById("modalMake"),
        model: document.getElementById("modalModel"),
        trim: document.getElementById("modalTrim"),
        mileage: document.getElementById("modalMileage"),
        asking_price: document.getElementById("modalAskingPrice"),
        dealer_address: document.getElementById("modalDealerAddress"),
        dealer_street: document.getElementById("modalDealerStreet"),
        dealer_city: document.getElementById("modalDealerCity"),
        dealer_state: document.getElementById("modalDealerState"),
        dealer_zip: document.getElementById("modalDealerZip"),
        dealer_lat: document.getElementById("modalDealerLat"),
        dealer_lng: document.getElementById("modalDealerLng"),
        dealer_name: document.getElementById("modalDealerName"),
        dealer_phone: document.getElementById("modalDealerPhone"),
      }
    : null;

  if (modalFields?.dealer_address) {
    attachDealerAddressInputListeners(modalFields.dealer_address);
  }

  let vehiclesCache = [];
  let currentVehicleId = vehicleSelect?.value ?? "";
  let modalMode = "add";
  let currentAskingPrice = null;
  let currentUserId = null;
  let authModalResolve = null;
  let authModalPromise = null;
  let authMode = "signin";
  let dealerFeeGroup = null;
  let govFeeGroup = null;
  const dealerFeeSetState = { id: null, items: [] };
  const govFeeSetState = { id: null, items: [] };
  let affordAprUserOverride = false;
  const nfcuRateState = {
    rates: [],
    effectiveAt: null,
    loadingPromise: null,
    lastError: null,
  };
  const marketcheckListingDetailsCache = new Map();
  const vinHistoryCache = new Map();
  let vinEnrichmentState = {
    vin: "",
    payload: null,
    fetchedAt: 0,
  };
  let vinLookupPromise = null;
  let findModalLastActiveElement = null;
  const homeLocationState = { address: "", latLng: null, postalCode: "" };
  const dealerLocationState = {
    address: "",
    latLng: null,
    name: "",
    phone: "",
    url: "",
    listingId: "",
    city: "",
    state: "",
    zip: "",
    vehicleLabel: "",
    listingSource: "",
  };
  const mapState = {
    map: null,
    directionsService: null,
    directionsRenderer: null,
    homeMarker: null,
    dealerMarker: null,
  };
  let dealerLocationAutocomplete = null;
  let suppressDealerLocationClear = false;
  let markerLibraryPromise = null;
  let populateVinModulePromise = null;

  function loadVinPopulateModule() {
    if (!populateVinModulePromise) {
      populateVinModulePromise = import("./vin-populate.mjs");
    }
    return populateVinModulePromise;
  }

  /**
   * f(s) = formatted currency string, where
   *   s ∈ Strings, and
   *   n = Number(s stripped of all non [0-9.-]) if finite, else NaN.
   * If n is NaN, returns original s; else returns Intl.format(n).
   */
  function formatToUSDString(s) {
    if (s == null) return "";
    const raw = String(s);
    const n = Number(raw.replace(/[^0-9.-]+/g, ""));
    if (!isFinite(n)) return raw;
    return usdFormatter.format(n);
  }

  function formatInputEl(el) {
    if (!el) return;
    if (el instanceof HTMLInputElement && el.type === "text") {
      if (
        !el.classList.contains("usdFormat") &&
        !el.classList.contains("inputTax")
      ) {
        el.value = toTitleCase(el.value);
      }
    }
    if (salePriceInput && el === salePriceInput) {
      const computed = calculateSalePrice(el.value ?? "");
      if (computed == null) {
        const fallback = Number.isFinite(currentAskingPrice)
          ? normalizeCurrencyNumber(currentAskingPrice)
          : null;
        if (fallback != null) {
          el.value = formatCurrency(fallback);
          el.dataset.calculatedSalePrice = String(fallback);
        } else {
          el.value = "";
          delete el.dataset.calculatedSalePrice;
        }
        recomputeDeal();
        return;
      }
      const normalized = normalizeCurrencyNumber(computed);
      if (normalized != null) {
        el.value = formatCurrency(normalized);
        el.dataset.calculatedSalePrice = String(normalized);
      }
      recomputeDeal();
      return;
    }
    if (el.classList.contains("inputTax")) {
      const value = evaluatePercentValue(el.value, null);
      if (value != null) {
        el.dataset.numericValue = String(value);
        el.value = formatPercent(value);
      } else {
        delete el.dataset.numericValue;
        el.value = "";
      }
      recomputeDeal();
      return;
    }
    if (el.classList.contains("percentFormat")) {
      normalizePercentInput(el);
      recomputeDeal();
      return;
    }
    if (el.classList.contains("usdFormat")) {
      if (!(el instanceof HTMLInputElement)) {
        return;
      }
      const value = evaluateCurrencyValue(el.value);
      if (value != null) {
        el.dataset.numericValue = String(value);
        el.value = formatCurrency(value);
      } else {
        delete el.dataset.numericValue;
        el.value = "";
      }
      recomputeDeal();
      return;
    }
    if (el.type === "number") {
      const s = String(el.value ?? "");
      const n = Number(s.replace(/[^0-9.-]+/g, ""));
      if (isFinite(n)) el.value = n.toFixed(2);
      return;
    }
    el.value = formatToUSDString(el.value);
  }

  // Advance focus to the next logical form control so Enter behaves like Tab.
  function focusNextField(current) {
    if (!(current instanceof HTMLElement)) return;
    const scope =
      current instanceof HTMLInputElement && current.form
        ? current.form
        : document;
    const focusables = Array.from(
      scope.querySelectorAll(
        "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )
    ).filter((el) => el.tabIndex >= 0);
    const index = focusables.indexOf(current);
    if (index === -1) return;
    const next = focusables[index + 1];
    if (!next) return;
    next.focus();
    if (
      next instanceof HTMLInputElement ||
      next instanceof HTMLTextAreaElement
    ) {
      next.select?.();
    }
  }

  const nonDigitRegex = /[^0-9.-]+/g;
  const VIN_SANITIZE_REGEX = /[^A-HJ-NPR-Z0-9]/gi;
  const VIN_VALID_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

  function parseInteger(value) {
    if (value == null || value === "") return null;
    const n = parseInt(String(value).replace(nonDigitRegex, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  function parseDecimal(value) {
    if (value == null || value === "") return null;
    const n = Number(String(value).replace(nonDigitRegex, ""));
    return Number.isFinite(n) ? n : null;
  }

  function parseFloatOrNull(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeVin(value) {
    if (value == null) return "";
    return String(value).toUpperCase().replace(VIN_SANITIZE_REGEX, "");
  }

  function isValidVin(value) {
    const normalized = normalizeVin(value);
    return VIN_VALID_REGEX.test(normalized);
  }

  function pickDefined(object) {
    const result = {};
    for (const [key, value] of Object.entries(object || {})) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  function normalizeValueForComparison(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? Number(value) : null;
    }
    if (typeof value === "bigint") {
      return Number(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "";
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return Number(numeric);
      }
      return trimmed;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === "boolean") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function setAuthMode(
    mode,
    { resetStatus = false, clearPassword = false } = {}
  ) {
    const normalized = mode === "signup" ? "signup" : "signin";
    authMode = normalized;
    const copy = AUTH_MODE_COPY[normalized] ?? AUTH_MODE_COPY.signin;
    authForm?.setAttribute("data-auth-mode", normalized);
    if (authModal) {
      authModal.setAttribute("data-auth-mode", normalized);
    }
    if (authModalTitle) {
      authModalTitle.textContent = copy.title;
    }
    if (authModalPrimaryBtn) {
      authModalPrimaryBtn.textContent = copy.primaryText;
    }
    if (authModePromptEl) {
      authModePromptEl.textContent = copy.prompt;
    }
    if (authModeToggleBtn) {
      authModeToggleBtn.textContent = copy.toggle;
    }
    if (authPasswordInput instanceof HTMLInputElement) {
      authPasswordInput.autocomplete =
        normalized === "signup" ? "new-password" : "current-password";
      if (clearPassword) {
        authPasswordInput.value = "";
      }
    }
    if (resetStatus) {
      setAuthModalStatus();
    }
  }

  setAuthMode(authMode, { resetStatus: true, clearPassword: true });

  function normalizeCurrencyNumber(value) {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
  }
  function toTitleCase(str) {
    return String(str)
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .trim();
  }

  function normalizePostalCode(value) {
    const raw =
      typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (!raw) return "";
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length >= 9) {
      return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
    }
    if (digits.length >= 5) {
      return digits.slice(0, 5);
    }
    return "";
  }

  function pickFromSources(sources, paths, { transform } = {}) {
    if (!Array.isArray(sources) || !Array.isArray(paths)) return null;
    const applyTransform =
      typeof transform === "function" ? transform : (value) => value;
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      for (const path of paths) {
        const raw = getNestedValue(source, path);
        if (raw == null || raw === "") continue;
        const value = applyTransform(raw);
        if (value != null && value !== "") {
          return value;
        }
      }
    }
    return null;
  }

  function pickNumberFromSources(sources, paths) {
    if (!Array.isArray(sources) || !Array.isArray(paths)) return null;
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      for (const path of paths) {
        const raw = getNestedValue(source, path);
        const numeric = parseFloatOrNull(raw);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
      }
    }
    return null;
  }

  function collectDealerMetadataFromSources(sources = []) {
    const meta = {
      name: null,
      street: null,
      city: null,
      state: null,
      zip: null,
      phone: null,
      lat: null,
      lng: null,
      url: null,
    };

    const stringFieldPaths = {
      name: [
        "name",
        "seller_name",
        "dealer_name",
        "business_name",
        "store_name",
        "dealership_group_name",
      ],
      street: ["street", "address", "address_line", "dealer_street"],
      city: ["city", "dealer_city"],
      state: ["state", "state_code", "region", "dealer_state"],
      zip: ["zip", "postal_code", "postal", "dealer_zip"],
      phone: ["phone", "contact_phone", "seller_phone", "dealer_phone"],
      url: ["website", "dealer_url", "url"],
    };

    for (const [field, paths] of Object.entries(stringFieldPaths)) {
      const transform =
        field === "state"
          ? (value) => normalizeResultString(value).toUpperCase()
          : field === "zip"
          ? (value) => normalizePostalCode(value)
          : (value) => normalizeResultString(value);
      const value = pickFromSources(sources, paths, { transform });
      if (value) {
        meta[field] = value;
      }
    }

    const latPaths = [
      "latitude",
      "lat",
      "geo.lat",
      "location.lat",
      "coordinates.lat",
      "coordinate.lat",
      "dealer_lat",
    ];
    const lngPaths = [
      "longitude",
      "lng",
      "geo.lng",
      "location.lng",
      "coordinates.lng",
      "coordinates.lon",
      "coordinate.lng",
      "dealer_lng",
    ];
    const pickedLat = pickNumberFromSources(sources, latPaths);
    const pickedLng = pickNumberFromSources(sources, lngPaths);
    if (Number.isFinite(pickedLat)) {
      meta.lat = pickedLat;
    }
    if (Number.isFinite(pickedLng)) {
      meta.lng = pickedLng;
    }

    return meta;
  }

  function mergeDealerMetadata(primary = {}, secondary = {}) {
    const merged = { ...primary };
    const fields = ["name", "street", "city", "state", "zip", "phone", "url"];
    for (const field of fields) {
      if (!merged[field] && secondary[field]) {
        merged[field] = secondary[field];
      }
    }
    if (!Number.isFinite(merged.lat) && Number.isFinite(secondary.lat)) {
      merged.lat = secondary.lat;
    }
    if (!Number.isFinite(merged.lng) && Number.isFinite(secondary.lng)) {
      merged.lng = secondary.lng;
    }
    return merged;
  }

  function dealerMetadataNeedsDetails(meta) {
    if (!meta) return true;
    const missingAddress = !meta.street || !meta.city || !meta.state;
    const missingZip = !meta.zip;
    const missingCoords =
      !Number.isFinite(meta.lat) || !Number.isFinite(meta.lng);
    return missingAddress || missingZip || missingCoords;
  }

  async function fetchMarketcheckListingDetails(listingId) {
    const normalizedId = String(listingId ?? "").trim();
    if (!normalizedId) return null;
    if (marketcheckListingDetailsCache.has(normalizedId)) {
      return marketcheckListingDetailsCache.get(normalizedId) ?? null;
    }
    try {
      const result = await mcListing(normalizedId);
      const data = result?.raw ?? result?.payload ?? null;
      if (!data) {
        marketcheckListingDetailsCache.set(normalizedId, null);
        return null;
      }
      marketcheckListingDetailsCache.set(normalizedId, data);
      return data;
    } catch (error) {
      if (error?.status === 404) {
        marketcheckListingDetailsCache.set(normalizedId, null);
        return null;
      }
      console.error("MarketCheck details lookup failed", error);
      marketcheckListingDetailsCache.delete(normalizedId);
      throw error;
    }
  }

  function getNestedValue(source, path) {
    if (!source || !path) return undefined;
    const parts = Array.isArray(path) ? path : String(path).split(".");
    let current = source;
    for (const part of parts) {
      if (current == null) return undefined;
      const key = String(part);
      current =
        typeof current === "object" && key in current
          ? current[key]
          : undefined;
    }
    return current;
  }

  function coalesceFromEntries(entries, paths, transform) {
    if (!Array.isArray(entries) || !paths?.length) return null;
    const applyTransform =
      typeof transform === "function" ? transform : (value) => value;
    for (const { entry } of entries) {
      for (const path of paths) {
        const value = getNestedValue(entry, path);
        if (value !== undefined && value !== null && value !== "") {
          const transformed = applyTransform(value);
          if (
            transformed !== undefined &&
            transformed !== null &&
            transformed !== ""
          ) {
            return transformed;
          }
        }
      }
    }
    return null;
  }

  function parseVinTimestamp(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getTime();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value > 1e12) return value;
      if (value > 1e9) return value * 1000;
      return value;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return parseVinTimestamp(numeric);
    }
    if (typeof value === "string") {
      const date = new Date(value);
      const time = date.getTime();
      if (!Number.isNaN(time)) return time;
    }
    return null;
  }

  function setSalePriceFromVehicle(vehicle) {
    if (!salePriceInput) return;
    const rawPrice = vehicle?.asking_price;
    const numericPrice =
      typeof rawPrice === "number" ? rawPrice : parseDecimal(rawPrice);
    const priceNumber =
      numericPrice != null ? normalizeCurrencyNumber(numericPrice) : null;
    if (priceNumber != null) {
      currentAskingPrice = priceNumber;
      salePriceInput.value = formatCurrency(priceNumber);
      salePriceInput.dataset.askingPrice = String(priceNumber);
      salePriceInput.dataset.calculatedSalePrice = String(priceNumber);
    } else {
      currentAskingPrice = null;
      salePriceInput.value = "";
      delete salePriceInput.dataset.askingPrice;
      delete salePriceInput.dataset.calculatedSalePrice;
    }
    recomputeDeal();
  }

  function syncSalePriceWithSelection() {
    if (!salePriceInput) return;
    const vehicle = vehiclesCache.find((item) => {
      const itemId = typeof item?.id === "number" ? String(item.id) : item?.id;
      return itemId === currentVehicleId;
    });
    setSalePriceFromVehicle(vehicle ?? null);
    void setDealerLocationFromVehicle(vehicle ?? null);
  }

  function calculateSalePrice(rawValue) {
    const basePrice = Number.isFinite(currentAskingPrice)
      ? currentAskingPrice
      : null;
    const rawString = rawValue == null ? "" : String(rawValue).trim();

    if (rawString === "") {
      return basePrice;
    }

    const numeric = evaluateExpression(rawString);
    if (numeric == null) {
      return basePrice;
    }

    let result = numeric;
    const containsPercent = rawString.includes("%");

    if (containsPercent) {
      if (basePrice == null) return numeric;
      result = basePrice * (1 + numeric);
    } else if (/^[+-]/.test(rawString)) {
      if (basePrice == null) return numeric;
      result = basePrice + numeric;
    }

    if (!Number.isFinite(result)) {
      return basePrice;
    }

    const normalized = normalizeCurrencyNumber(result);
    return normalized != null ? normalized : basePrice;
  }

  function getSalePriceNumber() {
    if (!salePriceInput) {
      return Number.isFinite(currentAskingPrice)
        ? normalizeCurrencyNumber(currentAskingPrice)
        : null;
    }
    const datasetValue = salePriceInput.dataset.calculatedSalePrice;
    if (datasetValue && datasetValue.trim() !== "") {
      const n = Number(datasetValue);
      if (Number.isFinite(n)) {
        const normalized = normalizeCurrencyNumber(n);
        if (normalized != null) return normalized;
      }
    }
    const computed = calculateSalePrice(salePriceInput.value ?? "");
    if (computed != null) {
      const normalized = normalizeCurrencyNumber(computed);
      if (normalized != null) return normalized;
    }
    const evaluated = evaluateCurrencyValue(salePriceInput.value ?? "");
    return evaluated != null ? normalizeCurrencyNumber(evaluated) : null;
  }

  function getInputCurrencyValue(input) {
    if (!(input instanceof HTMLInputElement)) return null;
    const value = evaluateCurrencyValue(input.value);
    return value != null ? normalizeCurrencyNumber(value) : null;
  }

  function setCurrencyOutput(outputEl, value) {
    if (!outputEl) return;
    if (value == null) {
      if (outputEl instanceof HTMLOutputElement) {
        outputEl.value = "";
      }
      outputEl.textContent = "";
      outputEl.dataset.value = "";
      return;
    }
    const normalized = normalizeCurrencyNumber(value);
    if (normalized == null) {
      setCurrencyOutput(outputEl, null);
      return;
    }
    const formatted = formatToUSDString(normalized);
    if (outputEl instanceof HTMLOutputElement) {
      outputEl.value = formatted;
    }
    outputEl.textContent = formatted;
    outputEl.dataset.value = String(normalized);
  }

  function updateEquityColor(value) {
    if (!equityOutput) return;
    if (value == null) {
      equityOutput.style.backgroundColor = "";
      equityOutput.style.color = "";
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
      equityOutput.style.backgroundColor = "";
      equityOutput.style.color = "";
      return;
    }
    if (numeric > 0) {
      equityOutput.style.backgroundColor = "#d1f5d3";
      equityOutput.style.color = "#0f5132";
    } else {
      equityOutput.style.backgroundColor = "#f8d7da";
      equityOutput.style.color = "#842029";
    }
  }

  function setSavingsDisplay(askingPrice, salePrice) {
    if (!savingsNote) return;
    if (!Number.isFinite(askingPrice) || !Number.isFinite(salePrice)) {
      savingsNote.textContent = "";
      savingsNote.dataset.value = "";
      return;
    }

    const diff = normalizeCurrencyNumber(askingPrice - salePrice);
    if (diff == null || Math.abs(diff) < 0.005) {
      savingsNote.textContent = "";
      savingsNote.dataset.value = "";
      return;
    }

    if (diff > 0) {
      savingsNote.textContent = `Saving ${formatCurrency(diff)}!`;
      savingsNote.dataset.value = String(diff);
      return;
    }

    savingsNote.textContent = `+ ${formatCurrency(Math.abs(diff))}`;
    savingsNote.dataset.value = String(diff);
  }

  function recomputeDeal() {
    const salePrice = getSalePriceNumber();
    const tradeOffer = getInputCurrencyValue(tradeOfferInput);
    const tradePayoff = getInputCurrencyValue(tradePayoffInput);
    const askingPrice = Number.isFinite(currentAskingPrice)
      ? normalizeCurrencyNumber(currentAskingPrice)
      : null;

    const hasTrade = tradeOffer != null || tradePayoff != null;
    const equityValue = hasTrade
      ? (tradeOffer ?? 0) - (tradePayoff ?? 0)
      : null;

    const hasNegEquity = equityValue != null && equityValue < 0;
    if (financeNegEquityCheckbox instanceof HTMLInputElement) {
      if (hasNegEquity && !financeNegEquityCheckbox.dataset.userToggled) {
        financeNegEquityCheckbox.checked = true;
      }
      if (!hasNegEquity) {
        delete financeNegEquityCheckbox.dataset.userToggled;
      }
      financeNegEquityCheckbox.classList.toggle(
        "checkbox--neg-equity",
        hasNegEquity
      );
    }

    setCurrencyOutput(equityOutput, equityValue);
    updateEquityColor(equityValue);

    const hasSalePrice = Number.isFinite(salePrice);
    const hasTradeOfferValue = Number.isFinite(tradeOffer);
    if (!hasSalePrice && !hasTradeOfferValue) {
      setCurrencyOutput(cashDifferenceOutput, null);
    } else {
      const normalizedSale = hasSalePrice ? salePrice ?? 0 : 0;
      const normalizedTradeOffer = hasTradeOfferValue ? tradeOffer ?? 0 : 0;
      const cashDifference = normalizedSale - normalizedTradeOffer;
      setCurrencyOutput(cashDifferenceOutput, cashDifference);
    }

    if (!hasSalePrice && !Number.isFinite(equityValue)) {
      setCurrencyOutput(netTradeOutput, null);
    } else {
      const normalizedSale = hasSalePrice ? salePrice ?? 0 : 0;
      const normalizedEquity = Number.isFinite(equityValue)
        ? equityValue ?? 0
        : 0;
      const netTradeDifference = normalizedSale - normalizedEquity;
      setCurrencyOutput(netTradeOutput, netTradeDifference);
    }

    let effectiveSalePrice = salePrice;
    if (salePrice == null) {
      effectiveSalePrice = 0;
    }

    setSavingsDisplay(askingPrice, salePrice);

    const feeTotals = recomputeFees() ?? {
      dealerFees: 0,
      govFees: 0,
      totalFees: 0,
    };
    const taxTotals = recomputeTaxes({
      salePrice: effectiveSalePrice ?? 0,
      dealerFees: feeTotals.dealerFees ?? 0,
      tradeOffer: tradeOffer ?? 0,
    });
    const financingSnapshot = recomputeFinancing({
      salePrice: effectiveSalePrice ?? 0,
      tradeOffer: tradeOffer ?? 0,
      tradePayoff: tradePayoff ?? 0,
      equityValue: equityValue ?? 0,
      feeTotals,
      taxTotals,
    });
    const totalFeesAndTaxes =
      financingSnapshot?.totalFeesAndTaxes ??
      (feeTotals.totalFees ?? 0) + (taxTotals.totalTaxes ?? 0);
    recomputeAffordability({
      totalFeesAndTaxes,
      financeTaxesFees: Boolean(financingSnapshot?.financeTaxesFees),
      negEquityFinanced: financingSnapshot?.negEquityFinanced ?? 0,
      cashOutAmount: financingSnapshot?.cashOutAmount ?? 0,
    });
  }

  function createFeeGroup({
    type,
    form,
    primaryLabel,
    primaryDescInput,
    primaryAmountInput,
    minusButton,
    plusButton,
    sectionEndNode,
    suggestionStore,
  }) {
    if (
      !form ||
      !(primaryLabel instanceof HTMLElement) ||
      !(primaryDescInput instanceof HTMLInputElement) ||
      !(primaryAmountInput instanceof HTMLInputElement) ||
      !(minusButton instanceof HTMLButtonElement) ||
      !(plusButton instanceof HTMLButtonElement)
    ) {
      return null;
    }

    const rows = [];
    const originalLabelText = primaryLabel.textContent ?? "";
    const additionalLabelText = originalLabelText;

    function getRowNodes(row) {
      return [
        row.label,
        row.descInput,
        row.amountInput,
        row.minusBtn,
        row.plusBtn,
      ];
    }

    function getReferenceNode(afterRow) {
      const index = rows.indexOf(afterRow);
      if (index === -1) return sectionEndNode;
      const nextRow = rows[index + 1];
      if (nextRow) return nextRow.label;
      if (sectionEndNode && sectionEndNode.parentElement === form) {
        return sectionEndNode;
      }
      return null;
    }

    function insertRowNodes(row, referenceNode) {
      const nodes = getRowNodes(row);
      nodes.forEach((node) => {
        if (referenceNode && referenceNode.parentElement === form) {
          form.insertBefore(node, referenceNode);
        } else {
          form.appendChild(node);
        }
      });
    }

    function clearRowValues(row) {
      row.descInput.value = "";
      row.amountInput.value = "";
      delete row.amountInput.dataset.numericValue;
      formatInputEl(row.amountInput);
    }

    function removeRow(row) {
      const index = rows.indexOf(row);
      if (index === -1) return;
      if (row.isPrimary) {
        clearRowValues(row);
        recomputeDeal();
        return;
      }
      getRowNodes(row).forEach((node) => node.remove());
      rows.splice(index, 1);
      recomputeDeal();
    }

    function addRowAfter(targetRow) {
      const row = createRow(false);
      const referenceNode =
        sectionEndNode && sectionEndNode.parentElement === form
          ? sectionEndNode
          : null;
      insertRowNodes(row, referenceNode);
      const index = rows.indexOf(targetRow);
      if (index >= 0) {
        rows.splice(index + 1, 0, row);
      } else {
        rows.push(row);
      }
      attachRow(row);
      row.descInput.focus();
      row.descInput.select?.();
      recomputeDeal();
      return row;
    }

    function attachRow(row) {
      const handleEnterKey = (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const newRow = addRowAfter(row);
        if (newRow?.descInput instanceof HTMLInputElement) {
          newRow.descInput.focus();
          newRow.descInput.select?.();
        }
      };

      const maybeApplySuggestion = () => {
        if (!suggestionStore) return;
        const amount = suggestionStore.getAmount(row.descInput.value);
        if (amount == null) return;
        const normalized = normalizeCurrencyNumber(amount);
        const numericValue = normalized != null ? normalized : amount;
        row.amountInput.value = formatCurrency(numericValue);
        row.amountInput.dataset.numericValue = String(numericValue);
        recomputeDeal();
      };

      row.descInput.addEventListener("keydown", handleEnterKey);
      row.descInput.addEventListener("input", maybeApplySuggestion);
      row.descInput.addEventListener("change", maybeApplySuggestion);
      row.descInput.addEventListener("blur", maybeApplySuggestion);
      row.amountInput.addEventListener("input", () => {
        recomputeDeal();
      });
      row.amountInput.addEventListener("blur", () => {
        formatInputEl(row.amountInput);
      });
      row.amountInput.addEventListener("keydown", handleEnterKey);
      row.plusBtn.addEventListener("click", (event) => {
        event.preventDefault();
        addRowAfter(row);
      });
      row.minusBtn.addEventListener("click", (event) => {
        event.preventDefault();
        removeRow(row);
      });
    }

    function createRow(isPrimary) {
      const label = isPrimary ? primaryLabel : primaryLabel.cloneNode(true);
      if (!isPrimary) {
        label.textContent = additionalLabelText;
        label.removeAttribute("for");
      }

      const descInput = isPrimary
        ? primaryDescInput
        : primaryDescInput.cloneNode(true);
      if (!isPrimary) {
        descInput.value = "";
        descInput.removeAttribute("id");
        descInput.name && descInput.removeAttribute("name");
      }
      if (suggestionStore?.datalist?.id) {
        descInput.setAttribute("list", suggestionStore.datalist.id);
      } else {
        descInput.removeAttribute("list");
      }

      const amountInput = isPrimary
        ? primaryAmountInput
        : primaryAmountInput.cloneNode(true);
      amountInput.classList.add("usdFormat");
      if (!isPrimary) {
        amountInput.value = "";
        delete amountInput.dataset.numericValue;
        amountInput.removeAttribute("id");
        amountInput.name && amountInput.removeAttribute("name");
      }

      const minusBtn = isPrimary ? minusButton : minusButton.cloneNode(true);
      minusBtn.textContent = "-";
      minusBtn.setAttribute(
        "aria-label",
        `Remove ${type === "dealer" ? "dealer fee" : "gov't fee"}`
      );
      if (!isPrimary) {
        minusBtn.removeAttribute("id");
      }

      const plusBtn = isPrimary ? plusButton : plusButton.cloneNode(true);
      plusBtn.textContent = "+";
      plusBtn.setAttribute(
        "aria-label",
        `Add another ${type === "dealer" ? "dealer fee" : "gov't fee"}`
      );
      if (!isPrimary) {
        plusBtn.removeAttribute("id");
      }

      return {
        label,
        descInput,
        amountInput,
        minusBtn,
        plusBtn,
        isPrimary,
      };
    }

    minusButton.textContent = "-";
    plusButton.textContent = "+";

    const primaryRow = createRow(true);
    rows.push(primaryRow);
    attachRow(primaryRow);

    return {
      getTotal() {
        return rows.reduce((sum, row) => {
          const value = evaluateCurrencyValue(row.amountInput.value);
          return value != null ? sum + value : sum;
        }, 0);
      },
      clear() {
        while (rows.length > 1) {
          const row = rows.pop();
          getRowNodes(row).forEach((node) => node.remove());
        }
        clearRowValues(rows[0]);
      },
      addRowAfter,
    };
  }

  if (feesForm) {
    dealerFeeGroup = createFeeGroup({
      type: "dealer",
      form: feesForm,
      primaryLabel: dealerFeesLabel,
      primaryDescInput: dealerFeeDescInput,
      primaryAmountInput: dealerFeeAmountInput,
      minusButton: dealerFeeMinusBtn,
      plusButton: dealerFeePlusBtn,
      sectionEndNode: totalDealerFeesLabel ?? totalFeesLabel ?? totalFeesOutput,
      suggestionStore: dealerFeeSuggestionStore,
    });

    govFeeGroup = createFeeGroup({
      type: "gov",
      form: feesForm,
      primaryLabel: govFeesLabel,
      primaryDescInput: govFeeDescInput,
      primaryAmountInput: govFeeAmountInput,
      minusButton: govFeeMinusBtn,
      plusButton: govFeePlusBtn,
      sectionEndNode: totalGovtFeesLabel ?? totalFeesLabel ?? totalFeesOutput,
      suggestionStore: govFeeSuggestionStore,
    });
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) return "";
    const normalized = Math.round(value * 100) / 100;
    const formatted = usdFormatter.format(Math.abs(normalized));
    return normalized < 0 ? `(${formatted})` : formatted;
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "";
    const formatted = percentFormatter.format(Math.abs(value) * 100);
    return value < 0 ? `(${formatted}%)` : `${formatted}%`;
  }

  function calculateMonthlyPayment(principal, aprRate, termMonths) {
    if (!Number.isFinite(principal) || principal <= 0) return 0;
    if (!Number.isFinite(termMonths) || termMonths <= 0) return 0;
    const months = Math.round(termMonths);
    const rate = Number.isFinite(aprRate) ? aprRate : DEFAULT_APR;
    const monthlyRate = rate / 12;
    if (Math.abs(monthlyRate) < 1e-9) {
      return principal / months;
    }
    const factor = Math.pow(1 + monthlyRate, months);
    const denominator = factor - 1;
    if (Math.abs(denominator) < 1e-9) {
      return principal / months;
    }
    return principal * ((monthlyRate * factor) / denominator);
  }

  function paymentForPrincipal(principal, aprRate, termMonths) {
    return calculateMonthlyPayment(principal, aprRate, termMonths);
  }

  function principalFromPayment(payment, aprRate, termMonths) {
    if (!Number.isFinite(payment) || payment <= 0) return 0;
    if (!Number.isFinite(termMonths) || termMonths <= 0) return 0;
    const months = Math.round(termMonths);
    const monthlyRate = aprRate / 12;
    if (Math.abs(monthlyRate) < 1e-9) {
      return payment * months;
    }
    const factor = Math.pow(1 + monthlyRate, months);
    const numerator = payment * (factor - 1);
    const denominator = monthlyRate * factor;
    if (Math.abs(denominator) < 1e-12) {
      return payment * months;
    }
    return numerator / denominator;
  }

  function solveTermForPayment(principal, payment, aprRate) {
    if (!Number.isFinite(principal) || principal <= 0) return 0;
    if (!Number.isFinite(payment) || payment <= 0) return Infinity;
    const monthlyRate = aprRate / 12;
    if (Math.abs(monthlyRate) < 1e-9) {
      return principal / payment;
    }
    const ratio = 1 - (principal * monthlyRate) / payment;
    if (ratio <= 0) {
      return Infinity;
    }
    return -Math.log(ratio) / Math.log(1 + monthlyRate);
  }

  function solveAprForPayment(
    principal,
    payment,
    termMonths,
    lowerApr,
    upperApr
  ) {
    if (!Number.isFinite(principal) || principal <= 0) return null;
    if (!Number.isFinite(payment) || payment <= 0) return null;
    if (!Number.isFinite(termMonths) || termMonths <= 0) return null;

    const months = Math.round(termMonths);
    if (months <= 0) return null;

    const lo = Math.max(lowerApr, MIN_APR);
    const hi = Math.min(upperApr, MAX_AFFORD_APR);
    if (lo > hi) return null;

    const minPayment = paymentForPrincipal(principal, lo, months);
    if (payment < minPayment - PAYMENT_TOLERANCE) {
      return null;
    }

    let low = lo;
    let high = hi;
    let mid = lo;

    for (let i = 0; i < 40; i += 1) {
      mid = (low + high) / 2;
      const currentPayment = paymentForPrincipal(principal, mid, months);
      if (Math.abs(currentPayment - payment) <= PAYMENT_TOLERANCE) {
        break;
      }
      if (currentPayment > payment) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return Math.min(Math.max(mid, MIN_APR), MAX_AFFORD_APR);
  }

  function setCheckboxNote(outputEl, message = "") {
    if (!outputEl) return;
    outputEl.textContent = message ?? "";
  }

  function setCheckboxAvailability(checkbox, label, enabled) {
    const allow = Boolean(enabled);
    if (checkbox instanceof HTMLInputElement) {
      if (!allow) {
        checkbox.checked = false;
      }
      checkbox.disabled = !allow;
    }
    if (label instanceof HTMLElement) {
      label.classList.toggle("checkboxDisabled", !allow);
    }
  }

  function setRateSourceStatus(message = "", tone = "info") {
    if (!rateSourceStatusOutput) return;
    rateSourceStatusOutput.textContent = message ?? "";
    if (!message || tone === "info") {
      rateSourceStatusOutput.removeAttribute("data-tone");
    } else {
      rateSourceStatusOutput.dataset.tone = tone;
    }
  }

  function normalizeLoanType(value) {
    const raw = String(value ?? "").toLowerCase();
    if (raw.includes("used")) return "used";
    return "new";
  }

  function getCreditTierForScore(score) {
    if (!Number.isFinite(score)) return null;
    return (
      CREDIT_TIERS.find(
        (tier) => score >= tier.minScore && score <= tier.maxScore
      ) ?? null
    );
  }

  function getProviderDefinition(providerId) {
    if (!providerId) return null;
    const id = String(providerId).toLowerCase();
    return rateProviders.find((provider) => provider.id === id) || null;
  }

  function normalizeSourceKey(value) {
    return String(value || "").toUpperCase();
  }

  function describeProvider(sourceValue, effectiveAt = null) {
    if (!sourceValue) return null;
    const sourceRaw = String(sourceValue ?? "").trim();
    if (!sourceRaw) return null;
    const sourceUpper = normalizeSourceKey(sourceRaw);
    const meta = resolveProviderMeta(sourceUpper) ||
      resolveProviderMeta(sourceRaw) || {
        shortName: sourceUpper || sourceRaw,
        longName: sourceUpper || sourceRaw,
        enabled: true,
      };
    const idSource = sourceUpper || sourceRaw;
    return {
      id: idSource.toLowerCase(),
      source: sourceRaw,
      sourceUpper,
      shortName: meta.shortName || idSource,
      longName: meta.longName || meta.shortName || idSource,
      enabled: meta.enabled !== false,
      homepageUrl: meta.homepageUrl || meta.sourceUrl || null,
      sourceUrl: meta.sourceUrl || null,
      effectiveAt,
    };
  }

  async function loadAvailableRateProviders() {
    const sb = window.supabase || supabase;
    if (!sb) {
      return LENDERS.filter((l) => l?.enabled !== false)
        .map((l) =>
          describeProvider(l?.source || l?.id || l?.shortName || "", null)
        )
        .filter(Boolean);
    }

    try {
      const { data, error } = await sb
        .from("auto_rates")
        .select("source, effective_at")
        .order("effective_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const latestBySource = new Map();
      for (const row of Array.isArray(data) ? data : []) {
        const sourceRaw =
          typeof row?.source === "string" && row.source.trim()
            ? row.source.trim()
            : "";
        const sourceUpper = normalizeSourceKey(sourceRaw);
        if (!sourceUpper) continue;
        const effectiveAt = row?.effective_at ?? null;
        const existing = latestBySource.get(sourceUpper);
        if (!existing || (effectiveAt && effectiveAt > existing.effectiveAt)) {
          latestBySource.set(sourceUpper, {
            effectiveAt,
            sourceRaw: sourceRaw || sourceUpper,
          });
        }
      }
      const result = Array.from(latestBySource.entries())
        .map(([sourceUpper, info]) =>
          describeProvider(info.sourceRaw ?? sourceUpper, info.effectiveAt)
        )
        .filter((provider) => provider && provider.enabled !== false);
      if (result.length) return result;
    } catch (error) {
      console.warn(
        "[rates] Unable to load provider list from Supabase; falling back to configuration.",
        error
      );
    }

    return LENDERS.filter((l) => l?.enabled !== false)
      .map((l) =>
        describeProvider(l?.source || l?.id || l?.shortName || "", null)
      )
      .filter((provider) => provider && provider.enabled !== false);
  }

  function renderRateSourceOptions({ preserveSelection = true } = {}) {
    if (!(rateSourceSelect instanceof HTMLSelectElement)) return;

    const baseOptions = [
      { value: RATE_SOURCE_USER_DEFINED, label: "User Defined" },
      { value: "lowest", label: "Lowest Price by APR" },
    ];

    const previousValue = preserveSelection
      ? rateSourceSelect.value
      : RATE_SOURCE_USER_DEFINED;

    rateSourceSelect.textContent = "";
    baseOptions.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      rateSourceSelect.append(option);
    });

    rateProviders.forEach((provider) => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = `${provider.shortName} Rates`;
      option.dataset.longName = provider.longName;
      if (provider.effectiveAt) {
        option.dataset.effectiveAt = provider.effectiveAt;
      } else {
        option.removeAttribute("data-effective-at");
      }
      if (provider.homepageUrl) {
        option.dataset.homepageUrl = provider.homepageUrl;
      } else {
        delete option.dataset.homepageUrl;
      }
      rateSourceSelect.append(option);
    });

    const validValues = new Set([
      ...baseOptions.map((opt) => opt.value),
      ...rateProviders.map((provider) => provider.id),
    ]);

    let nextValue = previousValue;
    if (!validValues.has(nextValue)) {
      nextValue = rateProviders[0]?.id || RATE_SOURCE_USER_DEFINED;
    }
    const changed = rateSourceSelect.value !== nextValue;
    rateSourceSelect.value = nextValue;
    if (changed) {
      rateSourceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncRateSourceName();
  }

  async function initializeRateSourceOptions({
    preserveSelection = true,
  } = {}) {
    try {
      const providers = await loadAvailableRateProviders();
      rateProviders = providers;
    } catch (error) {
      console.error("[rates] Failed to load rate providers", error);
    }
    renderRateSourceOptions({ preserveSelection });
  }

  function syncRateSourceName(providerOverride = null) {
    if (!rateSourceNameOutput) return;
    const selected = rateSourceSelect?.value || "";
    if (!selected || selected === RATE_SOURCE_USER_DEFINED) {
      rateSourceNameOutput.textContent = "User Defined APR";
      return;
    }
    if (selected === "lowest") {
      rateSourceNameOutput.textContent =
        lowestAprProviderName || "Lowest Price by APR";
      return;
    }
    const providerMeta =
      providerOverride ??
      getProviderDefinition(selected) ??
      resolveProviderMeta(selected) ??
      resolveProviderMeta(normalizeSourceKey(selected)) ??
      null;
    if (providerMeta) {
      rateSourceNameOutput.textContent =
        providerMeta.longName ||
        providerMeta.shortName ||
        providerMeta.source ||
        providerMeta.sourceUpper ||
        selected.toUpperCase();
      return;
    }
    rateSourceNameOutput.textContent = selected
      ? String(selected).toUpperCase()
      : "";
  }

  function clearFinanceAprInput() {
    if (!(financeAprInput instanceof HTMLInputElement)) return;
    delete financeAprInput.dataset.numericValue;
    financeAprInput.value = "";
  }

  function refreshRateSourceAvailability() {
    syncAprInputReadOnly();
    syncRateSourceName();
  }

  async function applyCurrentRate({ silent = false } = {}) {
    if (!rateSourceSelect) return;
    const selected = rateSourceSelect.value;
    if (selected !== "lowest") {
      lowestAprProviderName = "";
    }
    syncRateSourceName();

    if (!selected || selected === RATE_SOURCE_USER_DEFINED) {
      setRateSourceStatus("");
      if (!silent) {
        try {
          recomputeDeal();
        } catch (error) {
          console.warn("[rates] recompute failed after rate reset", error);
        }
      }
      return;
    }

    if (selected === "lowest") {
      await applyLowestApr({ silent });
      return;
    }

    const provider = getProviderDefinition(selected);
    syncRateSourceName(provider);
    if (!provider) {
      clearFinanceAprInput();
      setRateSourceStatus("Selected rate provider is unavailable.", "warning");
      return;
    }

    const termMonths =
      parseInteger(financeTermInput?.value) ?? DEFAULT_TERM_MONTHS;
    if (!Number.isFinite(termMonths) || termMonths <= 0) {
      clearFinanceAprInput();
      setRateSourceStatus("Enter a valid term to fetch rates.", "warning");
      return;
    }

    const creditScoreRaw = parseInteger(creditScoreInput?.value);
    if (
      creditScoreRaw != null &&
      (creditScoreRaw < MIN_CREDIT_SCORE || creditScoreRaw > MAX_CREDIT_SCORE)
    ) {
      clearFinanceAprInput();
      setRateSourceStatus(
        `Credit score must be between ${MIN_CREDIT_SCORE} and ${MAX_CREDIT_SCORE}.`,
        "error"
      );
      return;
    }

    const condition = normalizeLoanType(vehicleConditionSelect?.value);
    const creditScore =
      creditScoreRaw != null ? Math.round(creditScoreRaw) : null;

    if (!silent) {
      setRateSourceStatus(`Loading ${provider.shortName} rates…`, "info");
    }
    let result;
    try {
      result = await ratesEngine.applyProviderRate(provider, {
        term: termMonths,
        condition,
        creditScore,
      });
    } catch (error) {
      console.error(
        `[rates] unexpected failure applying ${provider.source}`,
        error
      );
      clearFinanceAprInput();
      setRateSourceStatus(
        `Unable to load ${provider.shortName} rates right now.`,
        "error"
      );
      return;
    }

    if (result.status === "matched" && Number.isFinite(result.aprDecimal)) {
      const aprDecimal = Math.max(result.aprDecimal, MIN_APR);
      if (financeAprInput instanceof HTMLInputElement) {
        financeAprInput.value = formatPercent(aprDecimal);
        financeAprInput.dataset.numericValue = String(aprDecimal);
      }
      if (!silent) {
        setRateSourceStatus(result.note ?? "", "info");
      } else if (result.note) {
        setRateSourceStatus(result.note, "info");
      }
      if (!silent) {
        try {
          recomputeDeal();
        } catch (error) {
          console.warn(
            "[rates] recompute failed after provider rate apply",
            error
          );
        }
      }
      return;
    }

    clearFinanceAprInput();

    switch (result.status) {
      case "needsCreditScore":
        setRateSourceStatus(
          `${provider.shortName} requires a credit score for this term.`,
          "warning"
        );
        break;
      case "noMatch":
        setRateSourceStatus(
          `${provider.shortName} has no rate for ${condition} vehicles at ${termMonths}-month terms.`,
          "warning"
        );
        break;
      case "noMatchForScore":
        setRateSourceStatus(
          `${provider.shortName} has no rate for a credit score of ${
            creditScore ?? "?"
          } at ${termMonths}-month ${condition} terms.`,
          "warning"
        );
        break;
      case "noRates":
        setRateSourceStatus(
          `${provider.shortName} rates are not available.`,
          "warning"
        );
        break;
      case "invalidTerm":
        setRateSourceStatus("Enter a valid term to fetch rates.", "warning");
        break;
      case "error":
      default:
        if (result.error) {
          console.error(
            `[rates] failed to load rates for ${provider.source}`,
            result.error
          );
        }
        setRateSourceStatus(
          `Unable to load ${provider.shortName} rates right now.`,
          "error"
        );
        break;
    }
  }

  async function applyLowestApr({ silent = false } = {}) {
    const termMonths =
      parseInteger(financeTermInput?.value) ?? DEFAULT_TERM_MONTHS;
    if (!Number.isFinite(termMonths) || termMonths <= 0) {
      clearFinanceAprInput();
      lowestAprProviderName = "";
      syncRateSourceName();
      setRateSourceStatus(
        "Enter a valid term to find the lowest APR.",
        "warning"
      );
      return;
    }

    const condition = normalizeLoanType(vehicleConditionSelect?.value);
    const scoreRaw = parseInteger(creditScoreInput?.value);
    const creditScore =
      scoreRaw != null &&
      scoreRaw >= MIN_CREDIT_SCORE &&
      scoreRaw <= MAX_CREDIT_SCORE
        ? Math.round(scoreRaw)
        : null;

    if (!silent) {
      setRateSourceStatus("Finding lowest APR…", "info");
    }

    const candidates = [];
    let sawNeedsScore = false;

    for (const provider of rateProviders) {
      if (!provider?.enabled) continue;
      try {
        const res = await ratesEngine.applyProviderRate(provider, {
          term: termMonths,
          condition,
          creditScore,
        });
        if (res?.status === "matched" && Number.isFinite(res.aprDecimal)) {
          candidates.push({
            provider,
            apr: res.aprDecimal,
            note: res.note || "",
          });
        } else if (res?.status === "needsCreditScore") {
          sawNeedsScore = true;
        }
      } catch (error) {
        console.warn(
          `[rates] skipping ${provider?.source ?? provider?.id} for lowest APR`,
          error
        );
      }
    }

    if (!candidates.length) {
      clearFinanceAprInput();
      lowestAprProviderName = "";
      syncRateSourceName();
      if (sawNeedsScore) {
        setRateSourceStatus(
          "Enter a credit score to compare lowest APRs for this term.",
          "warning"
        );
      } else {
        setRateSourceStatus(
          "No provider has a rate for this term/condition.",
          "warning"
        );
      }
      return;
    }

    const winner = candidates.reduce((best, candidate) =>
      candidate.apr < best.apr ? candidate : best
    );

    if (financeAprInput instanceof HTMLInputElement) {
      const aprDecimal = Math.max(winner.apr, MIN_APR);
      financeAprInput.value = formatPercent(aprDecimal);
      financeAprInput.dataset.numericValue = String(aprDecimal);
    }

    const lowestProviderDisplayName = formatProviderDisplayName(
      winner.provider
    );
    lowestAprProviderName = `Lowest APR — ${lowestProviderDisplayName}`;
    syncRateSourceName();
    const statusNote =
      winner.note ||
      `Best available rate: ${lowestProviderDisplayName} at ${formatPercent(
        winner.apr
      )}`;
    setRateSourceStatus(statusNote, "info");

    if (!silent) {
      try {
        recomputeDeal();
      } catch (error) {
        console.warn("[rates] recompute failed after lowest APR apply", error);
      }
    }
  }

  function findNfcuRateMatch({ term, creditScore, loanType }) {
    const normalizedLoanType = normalizeLoanType(loanType);
    return (
      nfcuRateState.rates.find((rate) => {
        if (rate.loanType !== normalizedLoanType) return false;
        if (term < rate.termMin || term > rate.termMax) return false;
        if (
          creditScore < rate.creditScoreMin ||
          creditScore > rate.creditScoreMax
        ) {
          return false;
        }
        return true;
      }) ?? null
    );
  }

  async function ensureNfcuRatesLoaded() {
    if (nfcuRateState.rates.length && !nfcuRateState.lastError) {
      return nfcuRateState.rates;
    }
    if (nfcuRateState.loadingPromise) {
      return nfcuRateState.loadingPromise;
    }

    const fetchPromise = supabase
      .from("auto_rates")
      .select(
        "loan_type, term_range_min, term_range_max, term_label, credit_score_min, credit_score_max, credit_tier, credit_tier_label, apr_percent, base_apr_percent, apr_adjustment, effective_at"
      )
      .eq("source", NFCU_SOURCE)
      .order("effective_at", { ascending: false, nullsFirst: false })
      .order("term_range_min", { ascending: true })
      .order("credit_score_min", { ascending: false })
      .then(({ data, error }) => {
        if (error) throw error;
        const list = Array.isArray(data) ? data : [];
        const latestEffective = list.reduce((acc, row) => {
          if (!row?.effective_at) return acc;
          return !acc || row.effective_at > acc ? row.effective_at : acc;
        }, null);
        const relevant = latestEffective
          ? list.filter((row) => row.effective_at === latestEffective)
          : list;
        nfcuRateState.rates = relevant
          .map((row) => {
            const termMin = Number(row?.term_range_min);
            const termMax = Number(row?.term_range_max);
            const creditMin = Number(row?.credit_score_min);
            const creditMax = Number(row?.credit_score_max);
            const aprPercent = Number(row?.apr_percent);
            if (
              !Number.isFinite(termMin) ||
              !Number.isFinite(termMax) ||
              !Number.isFinite(creditMin) ||
              !Number.isFinite(creditMax) ||
              !Number.isFinite(aprPercent)
            ) {
              return null;
            }
            return {
              loanType: normalizeLoanType(row?.loan_type),
              termMin,
              termMax,
              termLabel:
                typeof row?.term_label === "string" && row.term_label.trim()
                  ? row.term_label.trim()
                  : `${termMin}-${termMax} mos.`,
              creditTier:
                typeof row?.credit_tier === "string" ? row.credit_tier : "",
              creditTierLabel:
                typeof row?.credit_tier_label === "string" &&
                row.credit_tier_label.trim()
                  ? row.credit_tier_label.trim()
                  : typeof row?.credit_tier === "string"
                  ? row.credit_tier
                  : "",
              creditScoreMin: creditMin,
              creditScoreMax: creditMax,
              aprPercent,
              baseAprPercent: Number(row?.base_apr_percent ?? aprPercent),
              aprAdjustment: Number(row?.apr_adjustment ?? 0),
              effectiveAt: latestEffective ?? row?.effective_at ?? null,
            };
          })
          .filter(Boolean);
        nfcuRateState.effectiveAt = latestEffective ?? null;
        nfcuRateState.lastError = null;
        return nfcuRateState.rates;
      })
      .catch((error) => {
        nfcuRateState.rates = [];
        nfcuRateState.effectiveAt = null;
        nfcuRateState.lastError = error;
        throw error;
      })
      .finally(() => {
        nfcuRateState.loadingPromise = null;
      });

    nfcuRateState.loadingPromise = fetchPromise;
    return fetchPromise;
  }

  function syncAprInputReadOnly() {
    const selected = rateSourceSelect?.value;
    const isLocked =
      selected && selected !== RATE_SOURCE_USER_DEFINED && selected !== null;
    if (financeAprInput instanceof HTMLInputElement) {
      financeAprInput.readOnly = Boolean(isLocked);
      financeAprInput.classList.toggle("input--readonly", Boolean(isLocked));
    }
  }

  function ensureUserDefinedAprForCustomEntry(reason = "") {
    if (!rateSourceSelect) return;
    const current = rateSourceSelect.value;
    if (
      !current ||
      current === RATE_SOURCE_USER_DEFINED ||
      current === "lowest"
    ) {
      return;
    }
    rateSourceSelect.value = RATE_SOURCE_USER_DEFINED;
    rateSourceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const message =
      reason && reason.trim().length > 0
        ? reason
        : "APR source switched to User Defined for custom entry.";
    setRateSourceStatus(message, "info");
  }

  function loadGooglePlacesScript() {
    if (typeof document === "undefined") return;
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn(
        "[maps] Google Maps API key missing; skipping script load."
      );
      return;
    }
    if (document.getElementById("google-maps-script")) {
      if (typeof window !== "undefined" && window.google?.maps?.places) {
        initLocationAutocomplete();
      }
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,marker&callback=initLocationAutocomplete&loading=async&v=beta`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  function setDealerMapStatus(message = "", tone = "") {
    if (!dealerMapStatusEl) return;
    const normalized =
      message == null
        ? ""
        : typeof message === "string"
        ? message
        : String(message);
    dealerMapStatusEl.replaceChildren();
    const trimmed = normalized.trim();
    if (trimmed) {
      const lines = normalized
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const grid = document.createElement("div");
      grid.className = "dealerMapStatus__grid";
      lines.forEach((line, index) => {
        const row = document.createElement("div");
        row.classList.add("dealerMapStatus__row");
        if (index === 0) {
          row.classList.add("dealerMapStatus__name");
        } else if (index === 1) {
          row.classList.add("dealerMapStatus__dealer");
        } else if (index === 2) {
          row.classList.add("dealerMapStatus__location");
        } else {
          row.classList.add("dealerMapStatus__meta");
        }
        row.textContent = line;
        grid.append(row);
      });
      dealerMapStatusEl.append(grid);
    }
    if (!tone) {
      dealerMapStatusEl.removeAttribute("data-tone");
    } else {
      dealerMapStatusEl.dataset.tone = tone;
    }
  }

  if (initialDealerMapStatusMessage) {
    setDealerMapStatus(initialDealerMapStatusMessage);
  }

  function toLatLngLiteral(value) {
    if (!value) return null;
    if (
      typeof value.lat === "function" &&
      typeof value.lng === "function" &&
      Number.isFinite(value.lat()) &&
      Number.isFinite(value.lng())
    ) {
      return { lat: value.lat(), lng: value.lng() };
    }
    if (
      typeof value.lat === "number" &&
      typeof value.lng === "number" &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng)
    ) {
      return { lat: value.lat, lng: value.lng };
    }
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number" &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
    ) {
      return { lat: value.latitude, lng: value.longitude };
    }
    return null;
  }

  async function ensureMapInitialized() {
    if (!dealerMapContainer) return false;
    const maps = window.google?.maps;
    if (!maps) return false;
    if (!mapState.map) {
      mapState.map = new maps.Map(dealerMapContainer, {
        center: DEFAULT_MAP_CENTER,
        zoom: 8,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapId: GOOGLE_MAPS_MAP_ID,
      });
      mapState.directionsService = new maps.DirectionsService();
      mapState.directionsRenderer = new maps.DirectionsRenderer({
        map: mapState.map,
        suppressMarkers: true,
        polylineOptions: { strokeColor: "#0d3b66", strokeWeight: 4 },
      });
    }
    const markerLib = await ensureMarkerLibraryLoaded();
    if (!markerLib?.AdvancedMarkerElement) {
      return false;
    }
    if (!mapState.homeMarker) {
      mapState.homeMarker = createMapMarker({
        label: "A",
        title: "Home",
      });
    }
    if (!mapState.dealerMarker) {
      mapState.dealerMarker = createMapMarker({
        label: "B",
        title: "Dealer",
      });
    }
    if (!mapState.homeMarker || !mapState.dealerMarker) {
      return false;
    }
    return Boolean(mapState.map);
  }

  async function ensureMarkerLibraryLoaded() {
    const maps = window.google?.maps;
    if (!maps) return null;
    if (maps.marker?.AdvancedMarkerElement) return maps.marker;
    if (typeof maps.importLibrary === "function") {
      if (!markerLibraryPromise) {
        markerLibraryPromise = maps.importLibrary("marker").catch((error) => {
          markerLibraryPromise = null;
          throw error;
        });
      }
      try {
        await markerLibraryPromise;
      } catch (error) {
        console.warn("[maps] marker library load failed", error);
        return null;
      }
      if (maps.marker?.AdvancedMarkerElement) {
        return maps.marker;
      }
    }
    return maps.marker ?? null;
  }

  function createMapMarker({ label = "", title = "" } = {}) {
    const maps = window.google?.maps;
    const markerLib = maps?.marker;
    if (!maps || !markerLib?.AdvancedMarkerElement) {
      return null;
    }
    const mapInstance = mapState.map ?? null;
    const glyph = String(label ?? "")
      .trim()
      .slice(0, 2)
      .toUpperCase();
    let contentElement = null;
    if (typeof markerLib.PinElement === "function") {
      try {
        const pinBaseConfig = {
          background: "#0d3b66",
          borderColor: "#0d3b66",
          glyphColor: "#ffffff",
        };
        let pin = null;
        if (glyph) {
          const modernConfig = {
            ...pinBaseConfig,
            glyphText: glyph,
          };
          try {
            pin = new markerLib.PinElement(modernConfig);
          } catch (innerError) {
            // Fallback for older marker libraries that still expect `glyph`
            const legacyConfig = {
              ...pinBaseConfig,
              glyph,
            };
            pin = new markerLib.PinElement(legacyConfig);
          }
        } else {
          pin = new markerLib.PinElement(pinBaseConfig);
        }
        contentElement = pin.element;
      } catch (error) {
        console.warn("[dealer-map] Unable to create PinElement", error);
      }
    }
    if (!contentElement && typeof document !== "undefined") {
      const fallback = document.createElement("div");
      fallback.textContent = glyph || "";
      fallback.style.cssText =
        "background:#0d3b66;color:#ffffff;border-radius:50%;padding:6px 8px;font-size:12px;font-weight:600;box-shadow:0 2px 4px rgba(0,0,0,0.3);";
      contentElement = fallback;
    }
    const marker = new markerLib.AdvancedMarkerElement({
      map: mapInstance ?? undefined,
      position: DEFAULT_MAP_CENTER,
      title: title ?? "",
      content: contentElement ?? undefined,
    });
    if (marker.map) {
      marker.map = null;
    }
    return marker;
  }

  function isValidCoordinatePair(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
    return true;
  }

  function updateMarker(marker, latLng, title = "") {
    if (!marker) return;
    const latValue = latLng?.lat;
    const lngValue = latLng?.lng;
    if (latLng && isValidCoordinatePair(latValue, lngValue)) {
      const position = { lat: latValue, lng: lngValue };
      marker.position = position;
      if (title) {
        marker.title = title;
      }
      if (!marker.map && mapState.map) {
        marker.map = mapState.map;
      }
    } else if (marker && "map" in marker) {
      marker.map = null;
    }
  }

  function buildDealerAddress({ street, address, city, state, zip } = {}) {
    const line1 = street || address || "";
    const line2 = [city, state].filter(Boolean).join(", ");
    const parts = [line1, line2, zip]
      .map((part) => {
        if (part == null) return "";
        const str = typeof part === "string" ? part : String(part);
        return str.trim();
      })
      .filter((part) => part.length > 0);
    return parts.join(", ");
  }

  function resolveComponentValue(component, { short = false } = {}) {
    const longKeys = [
      "long_name",
      "longName",
      "long_text",
      "longText",
      "text",
      "name",
    ];
    const shortKeys = [
      "short_name",
      "shortName",
      "short_text",
      "shortText",
      "abbr",
    ];
    const keys = short ? shortKeys : longKeys;
    for (const key of keys) {
      const value = component?.[key];
      if (value != null && value !== "") {
        return String(value);
      }
    }
    if (!short) {
      return resolveComponentValue(component, { short: true });
    }
    return "";
  }

  function extractDealerAddressParts(components) {
    let streetNumber = "";
    let route = "";
    let city = "";
    let postalTown = "";
    let sublocality = "";
    let adminLevel3 = "";
    let state = "";
    let postalCode = "";
    let postalCodeSuffix = "";

    for (const component of Array.isArray(components) ? components : []) {
      const types = Array.isArray(component?.types) ? component.types : [];
      if (types.includes("street_number")) {
        streetNumber = resolveComponentValue(component);
      }
      if (types.includes("route")) {
        route = resolveComponentValue(component);
      }
      if (types.includes("locality")) {
        city = resolveComponentValue(component);
      }
      if (types.includes("postal_town")) {
        postalTown = resolveComponentValue(component);
      }
      if (
        types.includes("sublocality") ||
        types.includes("sublocality_level_1")
      ) {
        sublocality = resolveComponentValue(component);
      }
      if (types.includes("administrative_area_level_3")) {
        adminLevel3 = resolveComponentValue(component);
      }
      if (types.includes("administrative_area_level_1")) {
        state = resolveComponentValue(component, { short: true });
      }
      if (types.includes("postal_code")) {
        postalCode = resolveComponentValue(component, { short: true });
      }
      if (types.includes("postal_code_suffix")) {
        postalCodeSuffix = resolveComponentValue(component, { short: true });
      }
    }

    const resolvedCity = city || postalTown || sublocality || adminLevel3 || "";

    const resolvedPostalCode =
      postalCode && postalCodeSuffix
        ? `${postalCode}-${postalCodeSuffix}`
        : postalCode;

    const rawStreet = [streetNumber, route].filter(Boolean).join(" ").trim();
    const street = rawStreet ? toTitleCase(rawStreet) : "";
    const normalizedCity = resolvedCity ? toTitleCase(resolvedCity) : "";
    const stateCode = state ? state.toUpperCase() : "";
    const zip = normalizePostalCode(resolvedPostalCode);

    return {
      street,
      city: normalizedCity,
      state: stateCode,
      zip,
    };
  }

  function setInputValue(input, value) {
    if (!(input instanceof HTMLInputElement)) return;
    if (value == null || value === "") {
      input.value = "";
    } else {
      input.value = String(value);
    }
  }

  function getDealerAddressControl() {
    return modalFields?.dealer_address ?? null;
  }

  function setDealerAddressValue(value) {
    const control = getDealerAddressControl();
    if (!control) return;
    suppressDealerLocationClear = true;
    try {
      if (control instanceof HTMLInputElement) {
        control.value = value ?? "";
      } else if (
        typeof control.value === "string" ||
        typeof control.value === "undefined"
      ) {
        control.value = value ?? "";
      } else if ("setAttribute" in control) {
        control.setAttribute("value", value ?? "");
      }
    } finally {
      suppressDealerLocationClear = false;
    }
  }

  function getDealerAddressValue() {
    const control = getDealerAddressControl();
    if (!control) return "";
    if (control instanceof HTMLInputElement) {
      return control.value.trim();
    }
    if (typeof control.value === "string") {
      return control.value.trim();
    }
    if (typeof control.getAttribute === "function") {
      return (control.getAttribute("value") ?? "").trim();
    }
    return "";
  }

  function attachDealerAddressInputListeners(control) {
    if (!control || !(control instanceof EventTarget)) return;
    const host = typeof control.dataset === "object" ? control : null;
    if (host && host.dataset?.dealerLocationListeners) {
      return;
    }
    const reset = () => {
      if (suppressDealerLocationClear) return;
      clearModalDealerLocation({ preserveAddress: true });
    };
    control.addEventListener("input", reset);
    control.addEventListener("change", reset);
    if (host && host.dataset) {
      host.dataset.dealerLocationListeners = "true";
    }
  }

  function clearModalDealerLocation({ preserveAddress = false } = {}) {
    if (!modalFields) return;
    if (!preserveAddress) {
      setDealerAddressValue("");
    }
    setInputValue(modalFields.dealer_street, "");
    setInputValue(modalFields.dealer_city, "");
    setInputValue(modalFields.dealer_state, "");
    setInputValue(modalFields.dealer_zip, "");
    setInputValue(modalFields.dealer_lat, "");
    setInputValue(modalFields.dealer_lng, "");
    setInputValue(modalFields.dealer_name, "");
    setInputValue(modalFields.dealer_phone, "");
  }

  function applyModalDealerLocation({
    street = "",
    city = "",
    state = "",
    zip = "",
    lat = null,
    lng = null,
    formattedAddress = "",
    name = "",
    phone = "",
  } = {}) {
    if (!modalFields) return;
    const displayAddress =
      formattedAddress || buildDealerAddress({ street, city, state, zip });
    setDealerAddressValue(displayAddress);
    setInputValue(modalFields.dealer_street, street);
    setInputValue(modalFields.dealer_city, city);
    setInputValue(modalFields.dealer_state, state);
    setInputValue(modalFields.dealer_zip, zip);
    setInputValue(
      modalFields.dealer_name,
      typeof name === "string" ? name : ""
    );
    setInputValue(
      modalFields.dealer_phone,
      typeof phone === "string" ? phone : ""
    );
    const latNumber = Number(lat);
    const lngNumber = Number(lng);
    setInputValue(
      modalFields.dealer_lat,
      Number.isFinite(latNumber) ? latNumber : ""
    );
    setInputValue(
      modalFields.dealer_lng,
      Number.isFinite(lngNumber) ? lngNumber : ""
    );
  }

  function extractDealerLocationFromPlace(place) {
    if (!place) {
      return {
        street: "",
        city: "",
        state: "",
        zip: "",
        formattedAddress: "",
        latLng: null,
        name: "",
        phone: "",
      };
    }
    const components =
      place.addressComponents || place.address_components || [];
    const addressParts = extractDealerAddressParts(components);
    const formattedAddress =
      place.formattedAddress ||
      place.formatted_address ||
      buildDealerAddress({
        street: addressParts.street,
        city: addressParts.city,
        state: addressParts.state,
        zip: addressParts.zip,
      });
    const latLng = toLatLngLiteral(
      place.location || place.geometry?.location || null
    );
    const displayName =
      (place.displayName && place.displayName.text) || place.displayName || "";
    const rawName =
      (typeof displayName === "string" && displayName) ||
      (typeof place.name === "string" && place.name) ||
      "";
    const rawPhone =
      (typeof place.formattedPhoneNumber === "string" &&
        place.formattedPhoneNumber) ||
      (typeof place.formatted_phone_number === "string" &&
        place.formatted_phone_number) ||
      (typeof place.internationalPhoneNumber === "string" &&
        place.internationalPhoneNumber) ||
      (typeof place.international_phone_number === "string" &&
        place.international_phone_number) ||
      "";
    return {
      ...addressParts,
      formattedAddress,
      latLng,
      name: rawName,
      phone: rawPhone,
    };
  }

  function initDealerLocationAutocomplete(places) {
    if (!places || dealerLocationAutocomplete) return;
    const currentControl = getDealerAddressControl();
    if (!currentControl) return;
    try {
      if (typeof places.PlaceAutocompleteElement === "function") {
        const existing = currentControl;
        const parent = existing.parentElement;
        const placeholder =
          (existing instanceof HTMLElement &&
            existing.getAttribute("placeholder")) ||
          "Search dealer or address";
        const ariaLabel =
          (existing instanceof HTMLElement &&
            existing.getAttribute("aria-label")) ||
          "Dealer location";
        const initialValue =
          existing instanceof HTMLInputElement
            ? existing.value
            : getDealerAddressValue();

        const element = new places.PlaceAutocompleteElement();
        element.id =
          (existing instanceof HTMLElement && existing.id) ||
          "modalDealerAddress";
        element.className =
          (existing instanceof HTMLElement && existing.className) || "";
        element.setAttribute("aria-label", ariaLabel);
        element.setAttribute("placeholder", placeholder);
        element.style.display = "block";
        element.style.width = "100%";
        if (initialValue) {
          element.value = initialValue;
        }

        if (parent) {
          parent.replaceChild(element, existing);
        } else {
          existing.replaceWith(element);
        }
        modalFields.dealer_address = element;
        dealerLocationAutocomplete = element;
        attachDealerAddressInputListeners(element);
        const handleDealerPlace = async (place) => {
          if (!place) return;
          if (typeof place.fetchFields === "function") {
            try {
              await place.fetchFields({
                fields: [
                  "addressComponents",
                  "formattedAddress",
                  "location",
                  "displayName",
                ],
              });
            } catch (error) {
              console.error(
                "[places] dealer PlaceAutocompleteElement base fetch failed",
                error
              );
            }
            const phoneFieldCandidates = [
              "formattedPhoneNumber",
              "internationalPhoneNumber",
            ];
            let phoneFieldsToFetch = phoneFieldCandidates;
            const { availableFields } = place;
            if (Array.isArray(availableFields)) {
              phoneFieldsToFetch = phoneFieldCandidates.filter((field) =>
                availableFields.includes(field)
              );
            } else if (
              availableFields &&
              typeof availableFields === "object" &&
              typeof availableFields.has === "function"
            ) {
              phoneFieldsToFetch = phoneFieldCandidates.filter((field) =>
                availableFields.has(field)
              );
            } else if (typeof place.isFieldAvailable === "function") {
              phoneFieldsToFetch = phoneFieldCandidates.filter((field) =>
                place.isFieldAvailable(field)
              );
            }
            if (phoneFieldsToFetch.length > 0) {
              try {
                await place.fetchFields({
                  fields: phoneFieldsToFetch,
                });
              } catch (error) {
                // Phone fields aren't available for every place type; skip quietly.
                console.debug(
                  "[places] dealer PlaceAutocompleteElement phone fetch skipped",
                  error?.message ?? error
                );
              }
            }
          }
          const details = extractDealerLocationFromPlace(place);
          const placeName =
            details.name ||
            place.displayName?.text ||
            place.displayName ||
            place.name ||
            details.formattedAddress;
          const placePhone =
            details.phone ||
            place.formattedPhoneNumber ||
            place.formatted_phone_number ||
            place.internationalPhoneNumber ||
            place.international_phone_number ||
            "";
          applyModalDealerLocation({
            street: details.street,
            city: details.city,
            state: details.state,
            zip: details.zip,
            lat: details.latLng?.lat ?? null,
            lng: details.latLng?.lng ?? null,
            formattedAddress: details.formattedAddress,
            name: placeName,
            phone: placePhone,
          });
          setDealerLocation({
            address: details.formattedAddress,
            latLng: details.latLng,
            name: placeName,
            phone: placePhone,
            city: details.city,
            state: details.state,
            zip: details.zip,
            vehicleLabel: getModalVehicleLabel() || getSelectedVehicleLabel(),
          });
        };

        const dealerPlaceListener = async (event) => {
          const prediction = event?.placePrediction;
          if (prediction && typeof prediction.toPlace === "function") {
            const place = prediction.toPlace();
            await handleDealerPlace(place);
            return;
          }
          const place = event?.detail?.place ?? null;
          await handleDealerPlace(place);
        };

        element.addEventListener("gmp-select", dealerPlaceListener);
        element.addEventListener("gmp-placeselect", dealerPlaceListener);
        return;
      }

      if (!(modalFields?.dealer_address instanceof HTMLInputElement)) {
        return;
      }

      dealerLocationAutocomplete = new places.Autocomplete(
        modalFields.dealer_address,
        {
          fields: [
            "address_components",
            "geometry",
            "formatted_address",
            "name",
          ],
          types: ["establishment", "geocode"],
        }
      );
      attachDealerAddressInputListeners(modalFields.dealer_address);
      dealerLocationAutocomplete.addListener("place_changed", () => {
        const place = dealerLocationAutocomplete?.getPlace?.();
        if (!place) return;
        const details = extractDealerLocationFromPlace(place);
        const placeName =
          details.name || place.name || details.formattedAddress || "";
        const placePhone =
          details.phone ||
          place.formatted_phone_number ||
          place.international_phone_number ||
          "";
        applyModalDealerLocation({
          street: details.street,
          city: details.city,
          state: details.state,
          zip: details.zip,
          lat: details.latLng?.lat ?? null,
          lng: details.latLng?.lng ?? null,
          formattedAddress: details.formattedAddress,
          name: placeName,
          phone: placePhone,
        });
        setDealerLocation({
          address: details.formattedAddress,
          latLng: details.latLng,
          name: placeName,
          phone: placePhone,
          city: details.city,
          state: details.state,
          zip: details.zip,
          vehicleLabel: getModalVehicleLabel() || getSelectedVehicleLabel(),
        });
      });
    } catch (error) {
      console.warn("[places] dealer autocomplete init failed", error);
    }
  }

  function setHomeLocation({ address = "", latLng = null, postalCode } = {}) {
    homeLocationState.address = address ?? "";
    homeLocationState.latLng = latLng;
    if (typeof postalCode === "string") {
      const trimmed = postalCode.trim();
      homeLocationState.postalCode = trimmed ? trimmed.slice(0, 5) : "";
    }
    if (!latLng && postalCode === undefined) {
      homeLocationState.postalCode = "";
    }
    void updateDirectionsMap();
  }

  function setDealerLocation({
    address = "",
    latLng = null,
    name = "",
    phone = "",
    url = "",
    listingId = "",
    city = "",
    state = "",
    zip = "",
    vehicleLabel = "",
    listingSource,
  } = {}) {
    dealerLocationState.address = address ?? "";
    dealerLocationState.latLng =
      latLng && isValidCoordinatePair(latLng.lat, latLng.lng)
        ? { lat: Number(latLng.lat), lng: Number(latLng.lng) }
        : null;
    dealerLocationState.name = name ?? "";
    dealerLocationState.phone = phone ?? "";
    dealerLocationState.url = url ?? "";
    dealerLocationState.listingId = listingId ?? "";
    dealerLocationState.city = city ?? "";
    dealerLocationState.state = state ?? "";
    dealerLocationState.zip = zip ?? "";
    dealerLocationState.vehicleLabel = vehicleLabel ?? "";
    if (listingSource !== undefined) {
      dealerLocationState.listingSource = listingSource ?? "";
    }
    void updateDirectionsMap();
  }

  function getSelectedVehicleLabel() {
    if (!currentVehicleId) return "";
    const match = vehiclesCache.find((item) => {
      const id = item?.id;
      if (id == null) return false;
      return String(id) === String(currentVehicleId);
    });
    return match ? buildVehicleLabel(match) : "";
  }

  function getModalVehicleLabel() {
    if (!modalFields) return "";
    const explicit = modalFields.vehicle?.value?.trim?.();
    if (explicit) return explicit;
    const year = modalFields.year?.value?.trim?.() || "";
    const make = modalFields.make?.value?.trim?.() || "";
    const model = modalFields.model?.value?.trim?.() || "";
    const trim = modalFields.trim?.value?.trim?.() || "";
    const makeModel = [make, model].filter(Boolean).join(" ").trim();
    return [year, makeModel || null, trim]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatCityStateZip(city, state, zip, fallback = "") {
    const cityPart = typeof city === "string" ? city.trim() : "";
    const statePart = typeof state === "string" ? state.trim() : "";
    const zipPart = typeof zip === "string" ? zip.trim() : "";
    const segments = [];
    if (cityPart) segments.push(cityPart);
    const stateSegments = [];
    if (statePart) stateSegments.push(statePart);
    if (zipPart) stateSegments.push(zipPart);
    if (stateSegments.length) {
      const joiner = stateSegments.length > 1 ? ", " : "";
      segments.push(stateSegments.join(joiner));
    }
    if (!segments.length && fallback) {
      return fallback;
    }
    return segments.join(", ");
  }

  function geocodeAddress(address) {
    return new Promise((resolve) => {
      const maps = window.google?.maps;
      if (!maps || !address) {
        resolve(null);
        return;
      }
      try {
        const geocoder = new maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
          if (
            status === "OK" &&
            Array.isArray(results) &&
            results[0]?.geometry?.location
          ) {
            const primary = results[0];
            const latLng = toLatLngLiteral(primary.geometry.location);
            const parts = extractDealerAddressParts(primary.address_components);
            const formattedAddress =
              primary.formatted_address || buildDealerAddress(parts);
            resolve({
              latLng,
              address: formattedAddress,
              street: parts.street,
              city: parts.city,
              state: parts.state,
              zip: parts.zip,
            });
          } else {
            resolve(null);
          }
        });
      } catch (error) {
        console.warn("[maps] geocode failed", error);
        resolve(null);
      }
    });
  }

  async function updateDirectionsMap() {
    if (!dealerMapContainer) return;
    if (!(await ensureMapInitialized())) {
      setDealerMapStatus(
        "Loading map... directions will appear once Google Maps is ready.",
        ""
      );
      return;
    }
    const maps = window.google?.maps;
    if (!maps) {
      setDealerMapStatus("Waiting for Google Maps to finish loading...", "");
      return;
    }

    const rawHome = homeLocationState.latLng;
    const home =
      rawHome && isValidCoordinatePair(rawHome.lat, rawHome.lng)
        ? rawHome
        : null;
    const rawDealer = dealerLocationState.latLng;
    const dealer =
      rawDealer && isValidCoordinatePair(rawDealer.lat, rawDealer.lng)
        ? rawDealer
        : null;

    const vehicleLineCandidate = (
      dealerLocationState.vehicleLabel ||
      getSelectedVehicleLabel() ||
      getModalVehicleLabel() ||
      dealerLocationState.name ||
      ""
    ).trim();
    const dealerNameCandidate = (dealerLocationState.name || "").trim();
    const vehicleLine = vehicleLineCandidate || dealerNameCandidate || "Dealer";
    const vehicleLineLower = vehicleLine.toLowerCase();
    const dealerLineRaw =
      dealerNameCandidate || dealerLocationState.listingSource || "";
    const dealerLine = dealerLineRaw.trim();
    const dealerLineDisplay =
      dealerLine && dealerLine.toLowerCase() !== vehicleLineLower
        ? dealerLine
        : "";
    const baseLocationLine = formatCityStateZip(
      dealerLocationState.city,
      dealerLocationState.state,
      dealerLocationState.zip,
      ""
    );
    const fallbackAddress = dealerLocationState.address || "";

    if (!dealer) {
      updateMarker(mapState.dealerMarker, null);
      if (home) {
        updateMarker(mapState.homeMarker, home, "Home");
        mapState.map.setCenter(home);
        mapState.map.setZoom(11);
        setDealerMapStatus(
          [
            vehicleLine,
            dealerLineDisplay,
            baseLocationLine || fallbackAddress,
            "Select a vehicle with dealer details to preview directions.",
          ]
            .filter((line) => line && line.trim().length > 0)
            .join("\n"),
          ""
        );
      } else {
        updateMarker(mapState.homeMarker, null);
        mapState.map.setCenter({ lat: 28.5383, lng: -81.3792 });
        mapState.map.setZoom(7);
        setDealerMapStatus(
          [
            vehicleLine,
            dealerLineDisplay,
            baseLocationLine || fallbackAddress,
            "Enter your home address and select a vehicle to view directions.",
          ]
            .filter((line) => line && line.trim().length > 0)
            .join("\n"),
          ""
        );
      }
      mapState.directionsRenderer?.set("directions", null);
      return;
    }

    updateMarker(
      mapState.dealerMarker,
      dealer,
      dealerLocationState.name || "Dealer"
    );

    if (!home) {
      updateMarker(mapState.homeMarker, null);
      mapState.directionsRenderer?.set("directions", null);
      mapState.map.setCenter(dealer);
      mapState.map.setZoom(12);
      const locationLine =
        baseLocationLine || formatCityStateZip("", "", "", fallbackAddress);
      setDealerMapStatus(
        [
          vehicleLine,
          dealerLineDisplay,
          locationLine,
          "Enter your home address to calculate directions.",
        ]
          .filter((line) => line && line.trim().length > 0)
          .join("\n"),
        "info"
      );
      return;
    }

    updateMarker(mapState.homeMarker, home, "Home");

    if (!mapState.directionsService || !mapState.directionsRenderer) return;

    const request = {
      origin: home,
      destination: dealer,
      travelMode: maps.TravelMode.DRIVING,
    };

    const routePromise =
      mapState.directionsService.route.length <= 1
        ? mapState.directionsService.route(request)
        : new Promise((resolve, reject) => {
            mapState.directionsService.route(request, (response, status) => {
              if (status === "OK") resolve(response);
              else reject(status);
            });
          });

    setDealerMapStatus("Calculating driving directions...", "");

    routePromise
      .then((response) => {
        mapState.directionsRenderer?.setDirections(response);
        const leg = response?.routes?.[0]?.legs?.[0];
        if (leg) {
          const locationLine = formatCityStateZip(
            dealerLocationState.city,
            dealerLocationState.state,
            dealerLocationState.zip,
            leg.end_address || fallbackAddress
          );
          const distance = leg.distance?.text
            ? `Distance: ${leg.distance.text}`
            : "";
          const eta = leg.duration?.text ? `ETA: ${leg.duration.text}` : "";
          const metaLine = [distance, eta].filter(Boolean).join(" | ");
          const bodyLines = [
            vehicleLine,
            dealerLineDisplay,
            locationLine,
            metaLine,
          ].filter((line) => line && line.trim().length > 0);
          setDealerMapStatus(bodyLines.join("\n"), "success");
        } else {
          setDealerMapStatus(
            "Directions ready. Review the map for details.",
            "success"
          );
        }
        if (leg?.start_location && leg?.end_location) {
          const bounds = new maps.LatLngBounds();
          bounds.extend(leg.start_location);
          bounds.extend(leg.end_location);
          mapState.map.fitBounds(bounds, 60);
        }
      })
      .catch((error) => {
        console.warn("[maps] directions failed", error);
        mapState.directionsRenderer?.set("directions", null);
        if (home) {
          try {
            const bounds = new maps.LatLngBounds();
            bounds.extend(new maps.LatLng(home.lat, home.lng));
            bounds.extend(new maps.LatLng(dealer.lat, dealer.lng));
            mapState.map.fitBounds(bounds, 60);
          } catch {
            mapState.map.setCenter(dealer);
            mapState.map.setZoom(12);
          }
          const locationLine =
            baseLocationLine ||
            formatCityStateZip(
              dealerLocationState.city,
              dealerLocationState.state,
              dealerLocationState.zip,
              fallbackAddress
            );
          setDealerMapStatus(
            [
              vehicleLine,
              dealerLineDisplay,
              locationLine,
              "Unable to calculate directions. Showing your home and dealer locations.",
            ]
              .filter(Boolean)
              .join("\n"),
            "error"
          );
        } else {
          mapState.map.setCenter(DEFAULT_MAP_CENTER);
          mapState.map.setZoom(6);
          setDealerMapStatus(
            [
              vehicleLine,
              dealerLineDisplay,
              baseLocationLine || fallbackAddress,
              "Unable to calculate directions. Showing Florida map until a home address is entered.",
            ]
              .filter(Boolean)
              .join("\n"),
            "error"
          );
        }
      });
  }

  async function setDealerLocationFromVehicle(vehicle) {
    if (!vehicle) {
      setDealerLocation({
        address: "",
        latLng: null,
        name: "",
        phone: "",
        url: "",
        listingId: "",
        city: "",
        state: "",
        zip: "",
        vehicleLabel: "",
        listingSource: "",
      });
      return;
    }
    const latRaw =
      vehicle.dealer_lat ??
      vehicle.dealer_latitude ??
      vehicle.dealerLatitude ??
      null;
    const lngRaw =
      vehicle.dealer_lng ??
      vehicle.dealer_longitude ??
      vehicle.dealerLongitude ??
      null;
    const latNumeric = parseFloatOrNull(latRaw);
    const lngNumeric = parseFloatOrNull(lngRaw);
    let latLng = isValidCoordinatePair(latNumeric, lngNumeric)
      ? { lat: latNumeric, lng: lngNumeric }
      : null;
    const address = buildDealerAddress({
      street: vehicle.dealer_street ?? vehicle.dealer_address,
      city: vehicle.dealer_city,
      state: vehicle.dealer_state,
      zip: vehicle.dealer_zip,
    });

    let displayAddress = address;
    if ((!latLng || !displayAddress) && address) {
      const geocoded = await geocodeAddress(address);
      if (geocoded?.latLng) {
        latLng = geocoded.latLng;
      }
      if (!displayAddress && geocoded?.address) {
        displayAddress = geocoded.address;
      }
    }

    const vehicleLabel = buildVehicleLabel(vehicle) || vehicle.vehicle || "";
    const dealerName = vehicle.dealer_name || "";

    setDealerLocation({
      address: displayAddress,
      latLng,
      name: dealerName,
      phone: vehicle.dealer_phone ?? "",
      url: vehicle.listing_url ?? "",
      listingId: vehicle.listing_id ?? "",
      city: vehicle.dealer_city ?? "",
      state: vehicle.dealer_state ?? "",
      zip: vehicle.dealer_zip ?? "",
      vehicleLabel,
      listingSource: vehicle.listing_source ?? "",
    });
  }

  async function setDealerLocationFromListing(listing) {
    if (!listing) {
      await setDealerLocationFromVehicle(null);
      return;
    }
    const dealerMeta = await resolveDealerMetadataForListing(listing);
    const metaLat = parseFloatOrNull(dealerMeta?.lat);
    const metaLng = parseFloatOrNull(dealerMeta?.lng);
    let latLng = isValidCoordinatePair(metaLat, metaLng)
      ? { lat: metaLat, lng: metaLng }
      : null;
    const address = buildDealerAddress({
      street: dealerMeta?.street,
      city: dealerMeta?.city,
      state: dealerMeta?.state,
      zip: dealerMeta?.zip,
    });

    let displayAddress = address;
    if (!latLng && address) {
      setDealerMapStatus("Locating dealer...", "info");
      const geocoded = await geocodeAddress(address);
      if (geocoded?.latLng) {
        latLng = geocoded.latLng;
      }
      if (!displayAddress && geocoded?.address) {
        displayAddress = geocoded.address;
      }
    }

    const dealerNameFromListing =
      dealerMeta?.name || listing.dealer?.name || listing.dealer_name || "";

    setDealerLocation({
      address: displayAddress,
      latLng,
      name: dealerNameFromListing,
      phone: dealerMeta?.phone ?? "",
      url:
        listing.vdp_url ||
        listing.vdpUrl ||
        listing.deeplink ||
        dealerMeta?.url ||
        listing.dealer?.website ||
        "",
      listingId:
        dealerMeta?.listingId ||
        listing.id ||
        listing.listing_id ||
        listing.vin ||
        "",
      city: dealerMeta?.city ?? "",
      state: dealerMeta?.state ?? "",
      zip: dealerMeta?.zip ?? "",
      vehicleLabel:
        listing.heading ||
        listing.title ||
        listing.vehicle ||
        dealerMeta?.name ||
        "",
      listingSource:
        listing.source || listing.listing_source || listing.listingSource || "",
    });
  }

  function setLocaleOutput(outputEl, value) {
    if (!outputEl) return;
    outputEl.textContent = value ?? "";
  }

  function setPercentOutput(outputEl, rate) {
    if (!outputEl) return;
    if (!Number.isFinite(rate)) {
      outputEl.textContent = "";
      if (outputEl.dataset) {
        delete outputEl.dataset.value;
      }
      return;
    }
    const normalized = Math.round(rate * 100000) / 100000;
    outputEl.textContent = formatPercent(normalized);
    outputEl.dataset.value = String(normalized);
  }

  function setLocaleTaxOutputs({ stateRate, countyRate }) {
    setPercentOutput(locationStateTaxOutput, stateRate);
    setPercentOutput(locationCountyTaxOutput, countyRate);
  }

  function setPercentInputValue(input, rate) {
    if (!(input instanceof HTMLInputElement)) return;
    const percentString = `${(Number(rate ?? 0) * 100).toFixed(2)}%`;
    input.value = percentString;
    formatInputEl(input);
  }

  async function loadLocaleFees(stateCode) {
    if (!stateCode) return;
    if (stateCode.toUpperCase() === "FL") {
      try {
        const response = await fetch("assets/florida_govt_vehicle_fees.json");
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        const items = (Array.isArray(data) ? data : []).map((item) => {
          const name =
            typeof item?.Description === "string"
              ? item.Description.trim()
              : "";
          const numericAmount = Number(item?.Amount);
          const amount = Number.isFinite(numericAmount) ? numericAmount : null;
          return {
            name,
            amount,
          };
        });
        govFeeSuggestionStore.setItems(items.filter((item) => item.name));
      } catch (error) {
        console.error("Failed to load Florida gov fees", error);
      }
    }
  }

  function applyLocaleTaxes({ stateCode, countyName }) {
    const config = TAX_RATE_CONFIG[stateCode?.toUpperCase?.() ?? ""] ?? null;
    const stateRate = config?.stateRate ?? 0;
    const countyRate =
      config?.counties?.[countyName?.toUpperCase?.() ?? ""] ?? 0;
    setPercentInputValue(stateTaxInput, stateRate);
    setPercentInputValue(countyTaxInput, countyRate);
    setLocaleTaxOutputs({ stateRate, countyRate });
  }

  function applyLocale({ stateCode, countyName }) {
    setLocaleOutput(locationStateOutput, stateCode ?? "");
    setLocaleOutput(locationCountyOutput, countyName ?? "");
    applyLocaleTaxes({ stateCode, countyName });
    void loadLocaleFees(stateCode);
    recomputeDeal();
  }

  function initLocationAutocomplete() {
    const maps = window.google?.maps;
    const places = maps?.places;
    if (!places) return;

    const anchorInput = document.getElementById("locationSearch");
    if (!anchorInput) return;

    if (typeof places.PlaceAutocompleteElement !== "function") {
      // Fallback for legacy environments that do not yet expose the new component.
      const autocomplete = new places.Autocomplete(anchorInput, {
        fields: ["address_components", "formatted_address", "geometry"],
        types: ["(regions)"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const components = place?.address_components ?? [];
        let stateCode = "";
        let countyName = "";
        let postalCode = "";
        components.forEach((component) => {
          const types = component.types ?? [];
          if (types.includes("administrative_area_level_1")) {
            stateCode = component.short_name ?? component.long_name ?? "";
          }
          if (types.includes("administrative_area_level_2")) {
            countyName = (component.long_name ?? component.short_name ?? "")
              .replace(/ County$/i, "")
              .trim();
          }
          if (types.includes("postal_code")) {
            postalCode = component.long_name ?? component.short_name ?? "";
          }
        });
        const formattedAddress = place?.formatted_address ?? "";
        const latLng = toLatLngLiteral(place?.geometry?.location);
        setHomeLocation({
          address: formattedAddress,
          latLng,
          postalCode,
        });
        applyLocale({ stateCode, countyName });
      });
      initDealerLocationAutocomplete(places);
      void updateDirectionsMap();
      return;
    }

    const extractRegionFromComponents = (components) => {
      let stateCode = "";
      let countyName = "";
      let postalCode = "";
      for (const component of Array.isArray(components) ? components : []) {
        const types = component?.types ?? [];
        if (types.includes("administrative_area_level_1")) {
          stateCode =
            component.shortText ||
            component.short_name ||
            component.longText ||
            component.long_name ||
            "";
        }
        if (types.includes("administrative_area_level_2")) {
          const raw =
            component.longText ||
            component.long_name ||
            component.shortText ||
            component.short_name ||
            "";
          countyName = raw.replace(/\s*County$/i, "").trim();
        }
        if (types.includes("postal_code")) {
          postalCode =
            component.longText ||
            component.long_name ||
            component.shortText ||
            component.short_name ||
            postalCode;
        }
      }
      return { stateCode, countyName, postalCode };
    };

    const geocodeCountyByLocation = (loc) =>
      new Promise((resolve) => {
        try {
          const geocoder = new maps.Geocoder();
          geocoder.geocode({ location: loc }, (results, status) => {
            if (status === "OK" && Array.isArray(results) && results[0]) {
              let county = "";
              let postalCode = "";
              for (const res of results) {
                const comps = res?.address_components || [];
                for (const component of comps) {
                  const types = component?.types ?? [];
                  if (
                    types.includes("administrative_area_level_2") &&
                    !county
                  ) {
                    const raw =
                      component.long_name || component.short_name || "";
                    county = raw.replace(/\s*County$/i, "").trim();
                  }
                  if (types.includes("postal_code") && !postalCode) {
                    postalCode =
                      component.long_name || component.short_name || "";
                  }
                }
              }
              resolve({ county, postalCode });
              return;
            }
            resolve({ county: "", postalCode: "" });
          });
        } catch (error) {
          console.warn("[places] county reverse geocode failed", error);
          resolve({ county: "", postalCode: "" });
        }
      });

    const replaceTarget =
      anchorInput.parentElement &&
      anchorInput.parentElement.classList?.contains("pac-wrapper")
        ? anchorInput.parentElement
        : anchorInput;

    const pac = new places.PlaceAutocompleteElement();
    pac.id = "locationSearch";
    if (anchorInput.className) pac.className = anchorInput.className;
    if (anchorInput.placeholder) {
      pac.setAttribute("placeholder", anchorInput.placeholder);
    }
    if (anchorInput.getAttribute("aria-label")) {
      pac.setAttribute("aria-label", anchorInput.getAttribute("aria-label"));
    }

    if (replaceTarget && replaceTarget.parentElement) {
      replaceTarget.parentElement.replaceChild(pac, replaceTarget);
    } else if (anchorInput.parentElement) {
      anchorInput.parentElement.replaceChild(pac, anchorInput);
    } else {
      anchorInput.replaceWith(pac);
    }

    const handlePlaceSelect = async (place) => {
      try {
        if (!place || typeof place.fetchFields !== "function") return;
        await place.fetchFields({
          fields: ["addressComponents", "formattedAddress", "location"],
        });

        let { stateCode, countyName, postalCode } = extractRegionFromComponents(
          place.addressComponents
        );

        if (place.location) {
          const { county: resolvedCounty, postalCode: resolvedPostal } =
            await geocodeCountyByLocation(place.location);
          if (!countyName && resolvedCounty) {
            countyName = resolvedCounty;
          }
          if (!postalCode && resolvedPostal) {
            postalCode = resolvedPostal;
          }
        }

        const formattedAddress =
          place.formattedAddress || place.formatted_address || "";
        const latLngLiteral = toLatLngLiteral(place.location);
        setHomeLocation({
          address: formattedAddress,
          latLng: latLngLiteral,
          postalCode,
        });
        applyLocale({ stateCode, countyName });
      } catch (error) {
        console.error("[places] selection handling failed", error);
      }
    };

    const homePlaceListener = async (event) => {
      const prediction = event?.placePrediction;
      if (prediction && typeof prediction.toPlace === "function") {
        const place = prediction.toPlace();
        await handlePlaceSelect(place);
        return;
      }
      const place = event?.detail?.place ?? null;
      await handlePlaceSelect(place);
    };

    pac.addEventListener("gmp-select", homePlaceListener);
    pac.addEventListener("gmp-placeselect", homePlaceListener);
    initDealerLocationAutocomplete(places);
    void updateDirectionsMap();
  }

  if (typeof window !== "undefined") {
    window.initLocationAutocomplete = initLocationAutocomplete;
    window.refreshRateSourceAvailability = refreshRateSourceAvailability;
  }

  initializeRateSourceOptions({ preserveSelection: true })
    .catch((error) => {
      console.error("[rates] Failed to initialize rate source options", error);
    })
    .finally(() => {
      refreshRateSourceAvailability();
      void applyCurrentRate({ silent: true });
    });
  async function applyNfcuRate({ silent = false } = {}) {
    if (!rateSourceSelect || rateSourceSelect.value !== RATE_SOURCE_NFCU) {
      return;
    }
    const termMonths =
      parseInteger(financeTermInput?.value) ?? DEFAULT_TERM_MONTHS;
    const creditScore = parseInteger(creditScoreInput?.value);
    const loanType = normalizeLoanType(vehicleConditionSelect?.value);

    if (creditScore == null) {
      setRateSourceStatus(
        "Enter a credit score to pull NFCU rates.",
        "warning"
      );
      return;
    }
    if (creditScore < MIN_CREDIT_SCORE || creditScore > MAX_CREDIT_SCORE) {
      setRateSourceStatus(
        `Credit score must be between ${MIN_CREDIT_SCORE} and ${MAX_CREDIT_SCORE}.`,
        "error"
      );
      return;
    }

    const tier = getCreditTierForScore(creditScore);
    if (!tier) {
      setRateSourceStatus(
        "No credit tier configuration matches that score.",
        "error"
      );
      return;
    }

    setRateSourceStatus("Loading NFCU rates...");
    try {
      await ensureNfcuRatesLoaded();
    } catch (error) {
      console.error("Failed to load NFCU rates", error);
      setRateSourceStatus(
        "Unable to load NFCU rates right now. Try again later.",
        "error"
      );
      return;
    }

    if (nfcuRateState.rates.length === 0) {
      setRateSourceStatus(
        "No NFCU rate data available yet. Run the Supabase import script first.",
        "warning"
      );
      return;
    }

    const match = findNfcuRateMatch({
      term: termMonths,
      creditScore,
      loanType,
    });

    if (!match) {
      setRateSourceStatus(
        `No NFCU rate for ${
          loanType === "used" ? "used" : "new"
        } vehicles at ${termMonths}-month terms in tier ${tier.label}.`,
        "warning"
      );
      return;
    }

    const aprPercent = Number(match.aprPercent);
    if (!Number.isFinite(aprPercent)) {
      setRateSourceStatus("Invalid APR received from NFCU data.", "error");
      return;
    }
    const aprDecimal = Math.max(aprPercent / 100, MIN_APR);

    if (financeAprInput instanceof HTMLInputElement) {
      financeAprInput.value = formatPercent(aprDecimal);
      financeAprInput.dataset.numericValue = String(aprDecimal);
    }

    const effectiveDetails = match.effectiveAt
      ? ` (effective ${match.effectiveAt})`
      : "";
    const tierLabel = tier.label ? ` • Tier ${tier.label}` : "";
    setRateSourceStatus(
      `NFCU ${loanType === "used" ? "Used" : "New"} ${
        match.termLabel
      }: ${aprPercent.toFixed(2)}%${tierLabel}${effectiveDetails}`
    );

    if (!silent) {
      recomputeDeal();
    }
  }

  function evaluateExpression(raw) {
    if (raw == null) return null;
    let expr = String(raw).trim();
    if (expr === "") return null;
    expr = expr.replace(/[$,\s]/g, "");
    if (/^\(([^()+\-*/]+)\)$/.test(expr)) {
      expr = `-${RegExp.$1}`;
    }
    expr = expr.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
    if (/[^0-9+\-*/().]/.test(expr)) return null;
    try {
      const result = Function('"use strict";return (' + expr + ");")();
      return Number.isFinite(result) ? result : null;
    } catch (error) {
      return null;
    }
  }

  function evaluateCurrencyValue(raw) {
    const value = evaluateExpression(raw);
    if (value == null) return null;
    return Math.round(value * 100) / 100;
  }

  function evaluatePercentValue(raw, fallback = null) {
    if (raw == null || String(raw).trim() === "") return fallback;
    const stringValue = String(raw).trim();
    const containsPercent = stringValue.includes("%");
    const value = evaluateExpression(stringValue);
    if (value == null) return fallback;
    if (containsPercent) return value;
    return Math.abs(value) >= 1 ? value / 100 : value;
  }

  function normalizePercentInput(input) {
    if (!(input instanceof HTMLInputElement)) return;
    const raw = input.value;
    if (!raw || raw.trim() === "") {
      delete input.dataset.numericValue;
      return;
    }
    const numericValue = evaluatePercentValue(raw, null);
    if (numericValue == null) {
      delete input.dataset.numericValue;
      return;
    }
    input.dataset.numericValue = String(numericValue);
    const formatted = formatPercent(numericValue);
    if (input.value !== formatted) {
      input.value = formatted;
      if (!input.readOnly && document.activeElement === input) {
        const caret = formatted.endsWith("%")
          ? Math.max(formatted.length - 1, 0)
          : formatted.length;
        input.setSelectionRange(caret, caret);
      }
    }
  }

  function syncAffordAprWithFinance({ force = false } = {}) {
    if (!affordabilityAprInput || !financeAprInput) return;
    if (!force && affordAprUserOverride) return;
    const financeApr = getPercentInputValue(financeAprInput, DEFAULT_APR);
    const aprValue = Number.isFinite(financeApr) ? financeApr : DEFAULT_APR;
    const formatted = formatPercent(aprValue);
    if (affordabilityAprInput instanceof HTMLInputElement) {
      affordabilityAprInput.value = formatted;
    } else {
      affordabilityAprInput.textContent = formatted;
    }
    affordabilityAprInput.dataset.numericValue = String(aprValue);
  }

  function syncAffordTermWithFinance(termMonthsParam) {
    if (!affordabilityTermInput) return;
    const parsedTerm =
      termMonthsParam != null && Number.isFinite(termMonthsParam)
        ? Math.round(termMonthsParam)
        : parseInteger(financeTermInput?.value);
    const normalized =
      parsedTerm != null && parsedTerm > 0 ? String(parsedTerm) : "";

    if (affordabilityTermInput instanceof HTMLSelectElement) {
      if (normalized) {
        const hasOption = Array.from(affordabilityTermInput.options).some(
          (opt) => opt.value === normalized
        );
        if (!hasOption) {
          const option = document.createElement("option");
          option.value = normalized;
          option.textContent = normalized;
          affordabilityTermInput.append(option);
        }
      }
      affordabilityTermInput.value = normalized;
      affordabilityTermInput.dataset.value = normalized;
    } else if (affordabilityTermInput instanceof HTMLInputElement) {
      affordabilityTermInput.value = normalized;
      affordabilityTermInput.dataset.value = normalized;
    } else if (affordabilityTermInput) {
      affordabilityTermInput.textContent = normalized;
      if (normalized) {
        affordabilityTermInput.dataset.value = normalized;
      } else {
        delete affordabilityTermInput.dataset.value;
      }
    }
  }

  function setCurrencyOutput(outputEl, value, { forceZero = false } = {}) {
    if (!outputEl) return;
    if (value == null && !forceZero) {
      if (outputEl instanceof HTMLOutputElement) {
        outputEl.value = "";
      }
      outputEl.textContent = "";
      delete outputEl.dataset.value;
      return;
    }
    const normalized = Math.round((value ?? 0) * 100) / 100;
    const formatted = formatCurrency(normalized);
    if (outputEl instanceof HTMLOutputElement) {
      outputEl.value = formatted;
    }
    outputEl.textContent = formatted;
    outputEl.dataset.value = String(normalized);
  }

  function getCurrencyInputValue(input) {
    if (!(input instanceof HTMLInputElement)) return null;
    return evaluateCurrencyValue(input.value);
  }

  function getPercentInputValue(input, defaultValue) {
    if (!input) return defaultValue;
    const datasetValue = input.dataset?.numericValue;
    if (datasetValue != null && datasetValue !== "") {
      const numeric = Number(datasetValue);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    if (!(input instanceof HTMLInputElement)) return defaultValue;
    const value = evaluatePercentValue(input.value, null);
    if (value == null) return defaultValue;
    return value;
  }

  function recomputeFees() {
    const dealerValue =
      dealerFeeGroup?.getTotal() ??
      getCurrencyInputValue(dealerFeeAmountInput) ??
      0;
    const govValue =
      govFeeGroup?.getTotal() ?? getCurrencyInputValue(govFeeAmountInput) ?? 0;
    const total = dealerValue + govValue;

    if (totalDealerFeesOutput) {
      setCurrencyOutput(totalDealerFeesOutput, dealerValue, {
        forceZero: true,
      });
    }
    if (totalGovtFeesOutput) {
      setCurrencyOutput(totalGovtFeesOutput, govValue, { forceZero: true });
    }
    setCurrencyOutput(totalFeesOutput, total, { forceZero: true });
    return { dealerFees: dealerValue, govFees: govValue, totalFees: total };
  }

  function recomputeTaxes({ salePrice, dealerFees, tradeOffer }) {
    const result = {
      taxableBase: 0,
      stateTaxAmount: 0,
      countyTaxAmount: 0,
      totalTaxes: 0,
    };

    if (!taxableBaseOutput) {
      return result;
    }

    const sale = Number.isFinite(salePrice) ? salePrice : 0;
    const dealer = Number.isFinite(dealerFees) ? dealerFees : 0;
    const tradeCredit = Number.isFinite(tradeOffer) ? tradeOffer : 0;
    const taxableBase = Math.max(sale - tradeCredit, 0) + dealer;
    result.taxableBase = taxableBase;

    setCurrencyOutput(taxableBaseOutput, taxableBase, {
      forceZero: sale !== 0 || dealer !== 0 || tradeCredit !== 0,
    });

    const stateRate = getPercentInputValue(stateTaxInput, 0.06);
    const countyRate = getPercentInputValue(countyTaxInput, 0.01);

    const stateTaxAmount = taxableBase * stateRate;
    const countyBaseSource = sale > 0 ? sale : taxableBase;
    const countyTaxableBase = Math.min(Math.max(countyBaseSource, 0), 5000);
    const countyTaxAmount = countyTaxableBase * countyRate;

    result.stateTaxAmount = stateTaxAmount;
    result.countyTaxAmount = countyTaxAmount;
    result.totalTaxes = stateTaxAmount + countyTaxAmount;

    setLocaleTaxOutputs({ stateRate, countyRate });

    setCurrencyOutput(stateTaxTotalOutput, stateTaxAmount, { forceZero: true });
    setCurrencyOutput(countyTaxTotalOutput, countyTaxAmount, {
      forceZero: true,
    });
    setCurrencyOutput(totalTaxesOutput, result.totalTaxes, {
      forceZero: true,
    });

    return result;
  }

  function recomputeFinancing({
    salePrice,
    tradeOffer,
    tradePayoff,
    equityValue,
    feeTotals,
    taxTotals,
  }) {
    const sale = Number.isFinite(salePrice) ? salePrice : 0;
    const tradeOfferValue = Number.isFinite(tradeOffer) ? tradeOffer : 0;
    const tradePayoffValue = Number.isFinite(tradePayoff) ? tradePayoff : 0;
    const equity = Number.isFinite(equityValue) ? equityValue : 0;
    const totalFees = Number.isFinite(feeTotals?.totalFees)
      ? feeTotals.totalFees
      : 0;
    const totalTaxes = Number.isFinite(taxTotals?.totalTaxes)
      ? taxTotals.totalTaxes
      : 0;
    const totalFeesAndTaxes = totalFees + totalTaxes;

    const rawCashDown = getCurrencyInputValue(cashDownInput);
    const cashDown = rawCashDown != null && rawCashDown > 0 ? rawCashDown : 0;
    const rawFinanceApr = getPercentInputValue(financeAprInput, DEFAULT_APR);
    const aprRate = Math.min(
      Math.max(rawFinanceApr ?? DEFAULT_APR, MIN_APR),
      MAX_FINANCE_APR
    );
    if (financeAprInput instanceof HTMLInputElement) {
      financeAprInput.dataset.numericValue = String(aprRate);
      const isFocused = document.activeElement === financeAprInput;
      const outOfBounds =
        rawFinanceApr != null &&
        (rawFinanceApr < MIN_APR || rawFinanceApr > MAX_FINANCE_APR);
      if (!isFocused || outOfBounds) {
        financeAprInput.value = formatPercent(aprRate);
      }
    }
    syncAffordAprWithFinance();
    const termValue = financeTermInput
      ? parseInteger(financeTermInput.value)
      : null;
    const termMonths =
      termValue != null && termValue > 0 ? termValue : DEFAULT_TERM_MONTHS;

    syncAffordTermWithFinance(termMonths);

    const financeTF = financeTFCheckbox?.checked ?? false;
    let financeNegEquity = financeNegEquityCheckbox?.checked ?? false;
    let cashOutEquity = cashOutEquityCheckbox?.checked ?? false;

    const posEquity = equity > 0 ? equity : 0;
    const negEquity = equity < 0 ? -equity : 0;

    setCheckboxAvailability(
      financeNegEquityCheckbox,
      financeNegEquityLabel,
      negEquity > 0
    );
    setCheckboxAvailability(
      cashOutEquityCheckbox,
      cashOutEquityLabel,
      posEquity > 0
    );

    financeNegEquity = financeNegEquityCheckbox?.checked ?? false;
    cashOutEquity = cashOutEquityCheckbox?.checked ?? false;

    let totalFinanced = sale - tradeOfferValue + tradePayoffValue;

    if (!financeNegEquity && negEquity > 0) {
      totalFinanced -= negEquity;
    }

    if (cashOutEquity && posEquity > 0) {
      totalFinanced += posEquity;
    }

    if (financeTF) {
      totalFinanced += totalFeesAndTaxes;
    }

    totalFinanced -= cashDown;
    totalFinanced = Math.max(totalFinanced, 0);

    setCurrencyOutput(amountFinancedOutput, totalFinanced, {
      forceZero: true,
    });

    const dueFeesTaxes = financeTF ? 0 : totalFeesAndTaxes;
    const dueNegEquity = financeNegEquity ? 0 : negEquity;
    const equityApplied = !cashOutEquity && financeTF ? posEquity : 0;

    const cashDueBeforeDown = Math.max(
      dueFeesTaxes + dueNegEquity - equityApplied,
      0
    );
    let cashDue = cashDown + cashDueBeforeDown;

    setCurrencyOutput(cashDueOutput, cashDue, { forceZero: true });
    const netCashToBuyer = cashOutEquity
      ? Math.max(posEquity - Math.max(cashDown, 0), 0)
      : 0;
    setCurrencyOutput(cashToBuyerOutput, netCashToBuyer, {
      forceZero: true,
    });

    const monthlyPayment = calculateMonthlyPayment(
      totalFinanced,
      aprRate,
      termMonths
    );

    const shouldForceMonthly = totalFinanced > 0 || termMonths > 0;
    monthlyPaymentOutputs.forEach((outputEl) => {
      setCurrencyOutput(outputEl, monthlyPayment, {
        forceZero: shouldForceMonthly,
      });
    });

    if (floatingAprOutput) {
      floatingAprOutput.textContent = formatPercent(aprRate);
    }
    if (floatingTermOutput) {
      floatingTermOutput.textContent = `${termMonths} mo`;
    }

    if (financeTFNoteOutput) {
      if (financeTF && totalFeesAndTaxes > 0 && monthlyPayment > 0) {
        const altAmount = Math.max(totalFinanced - totalFeesAndTaxes, 0);
        const altPayment = calculateMonthlyPayment(
          altAmount,
          aprRate,
          termMonths
        );
        const savings = monthlyPayment - altPayment;
        if (savings > 0.01) {
          setCheckboxNote(
            financeTFNoteOutput,
            `+ ${formatCurrency(savings)}/mo.`
          );
        } else {
          setCheckboxNote(financeTFNoteOutput, "");
        }
      } else {
        setCheckboxNote(financeTFNoteOutput, "");
      }
    }

    if (financeNegEquityNoteOutput) {
      if (financeNegEquity && negEquity > 0 && monthlyPayment > 0) {
        const altAmount = Math.max(totalFinanced - negEquity, 0);
        const altPayment = calculateMonthlyPayment(
          altAmount,
          aprRate,
          termMonths
        );
        const savings = monthlyPayment - altPayment;
        if (savings > 0.01) {
          setCheckboxNote(
            financeNegEquityNoteOutput,
            `+${formatCurrency(savings)}/mo.`
          );
        } else {
          setCheckboxNote(financeNegEquityNoteOutput, "");
        }
      } else {
        setCheckboxNote(financeNegEquityNoteOutput, "");
      }
    }

    if (cashOutEquityNoteOutput) {
      if (cashOutEquity && posEquity > 0) {
        setCheckboxNote(
          cashOutEquityNoteOutput,
          `+ ${formatCurrency(posEquity)} Total Financed`
        );
      } else {
        setCheckboxNote(cashOutEquityNoteOutput, "");
      }
    }

    return {
      financeTaxesFees: financeTF,
      totalFeesAndTaxes,
      negEquityFinanced: financeNegEquity ? negEquity : 0,
      cashOutAmount: cashOutEquity ? posEquity : 0,
    };
  }

  function recomputeAffordability({
    totalFeesAndTaxes,
    financeTaxesFees,
    negEquityFinanced = 0,
    cashOutAmount = 0,
  }) {
    // Resolve critical elements if not already bound (be permissive about selectors)
    if (!affordabilityPaymentInput) {
      window.affordabilityPaymentInput =
        document.querySelector("#affordability") ||
        document.querySelector("#desiredMonthlyPmt") ||
        document.querySelector('[data-role="affordability-payment"]') ||
        window.affordabilityPaymentInput;
    }
    if (!maxTotalFinancedOutput) {
      window.maxTotalFinancedOutput =
        document.querySelector("#maxTotalFinanced") ||
        document.querySelector('[data-role="max-total-financed"]') ||
        window.maxTotalFinancedOutput;
    }
    if (!affordabilityStatusOutput) {
      window.affordabilityStatusOutput =
        document.querySelector("#reqAPR_TERM") ||
        document.querySelector('[data-role="affordability-status"]') ||
        null; // optional
    }
    if (!affordabilityAprInput) {
      window.affordabilityAprInput =
        document.querySelector("#affordApr") ||
        document.querySelector('[data-role="affordability-apr"]') ||
        window.affordabilityAprInput;
    }
    if (!affordabilityTermInput) {
      window.affordabilityTermInput =
        document.querySelector("#affordTerm") ||
        document.querySelector('[data-role="affordability-term"]') ||
        window.affordabilityTermInput;
    }

    // Only hard-require the two critical nodes
    if (!affordabilityPaymentInput || !maxTotalFinancedOutput) {
      return;
    }

    // 1) Read desired monthly payment (USD)
    const desiredPayment =
      getCurrencyInputValue(affordabilityPaymentInput) ?? null;
    const payment =
      desiredPayment != null && desiredPayment > 0 ? desiredPayment : 0;

    // 2) Compute extras that might be financed (for gap/help text only)
    const extrasFinanced =
      (financeTaxesFees ? totalFeesAndTaxes : 0) +
      Math.max(negEquityFinanced, 0) +
      Math.max(cashOutAmount, 0);

    // 3) Determine APR and term from the current finance inputs
    //    Preference order: affordability APR control -> finance APR control -> DEFAULT_APR
    const aprFromAfford = getPercentInputValue(affordabilityAprInput, null);
    const aprFromFinance = getPercentInputValue(financeAprInput, DEFAULT_APR);
    let aprRate = aprFromAfford != null ? aprFromAfford : aprFromFinance;
    aprRate = Math.min(Math.max(aprRate, MIN_APR), MAX_AFFORD_APR);

    // Term: use selected affordability term if present, else finance term, else default
    const baseTermRaw =
      parseInteger(affordabilityTermInput?.dataset?.value) ??
      parseInteger(affordabilityTermInput?.value) ??
      parseInteger(financeTermInput?.value) ??
      DEFAULT_TERM_MONTHS;
    let termMonths = Math.min(
      Math.max(baseTermRaw, MIN_AFFORD_TERM_MONTHS),
      MAX_AFFORD_TERM_MONTHS
    );

    // Sync the displayed affordability APR/Term with what we're actually using
    if (affordabilityAprInput) {
      const formattedApr = formatPercent(aprRate);
      if (affordabilityAprInput instanceof HTMLInputElement) {
        affordabilityAprInput.value = formattedApr;
      } else {
        affordabilityAprInput.textContent = formattedApr;
      }
      affordabilityAprInput.dataset.numericValue = String(aprRate);
    }
    syncAffordTermWithFinance(termMonths);

    // If no payment given, show guidance and zero-out the output, then exit
    if (payment <= 0) {
      setCurrencyOutput(maxTotalFinancedOutput, 0, { forceZero: true });
      if (floatingMaxFinancedOutput) {
        setCurrencyOutput(floatingMaxFinancedOutput, 0, { forceZero: true });
      }
      if (affordabilityGapNoteOutput) {
        affordabilityGapNoteOutput.textContent =
          "Enter a monthly payment to estimate affordability.";
        delete affordabilityGapNoteOutput.dataset.tone;
      }
      affordabilityStatusOutput.textContent =
        "Enter a monthly payment to estimate affordability.";
      affordabilityStatusOutput.value =
        "Enter a monthly payment to estimate affordability.";
      maxTotalFinancedOutput.classList.remove("affordability--exceeded");
      return;
    }

    // 4) Core calculation: Loan limit (Max Total Financed) given PMT, APR, and Term.
    //    P = PMT * [ (1+i)^n - 1 ] / [ i * (1+i)^n ], where i = APR/12, n = term in months.
    const loanLimit = principalFromPayment(payment, aprRate, termMonths);

    // 5) Always display the computed Max Total Financed
    setCurrencyOutput(maxTotalFinancedOutput, loanLimit, { forceZero: true });
    if (floatingMaxFinancedOutput) {
      setCurrencyOutput(floatingMaxFinancedOutput, loanLimit, {
        forceZero: true,
      });
    }

    // 6) Compare against the user's current total financed to give an over/under signal
    const totalFinanced = amountFinancedOutput?.dataset?.value
      ? Number(amountFinancedOutput.dataset.value)
      : 0;

    maxTotalFinancedOutput.classList.toggle(
      "affordability--exceeded",
      totalFinanced > loanLimit + PAYMENT_TOLERANCE
    );

    if (affordabilityGapNoteOutput) {
      if (totalFinanced > 0) {
        const gap = totalFinanced - loanLimit;
        if (Math.abs(gap) > PAYMENT_TOLERANCE) {
          const isOver = gap > 0;
          affordabilityGapNoteOutput.textContent = `${
            isOver ? "Over budget" : "Remaining budget"
          }: ${formatCurrency(Math.abs(gap))}`;
          affordabilityGapNoteOutput.dataset.tone = isOver ? "over" : "under";
        } else {
          affordabilityGapNoteOutput.textContent = "Fits current financing.";
          delete affordabilityGapNoteOutput.dataset.tone;
        }
      } else {
        const remaining = Math.max(loanLimit - extrasFinanced, 0);
        affordabilityGapNoteOutput.textContent = `Remaining budget: ${formatCurrency(
          remaining
        )}`;
        affordabilityGapNoteOutput.dataset.tone = "under";
      }
    }

    // 7) Clear any lingering status message once we have a valid computation
    if (affordabilityStatusOutput) {
      affordabilityStatusOutput.textContent = "";
      affordabilityStatusOutput.value = "";
    }
  }

  function clearCalculator() {
    currentVehicleId = "";
    currentAskingPrice = null;
    if (vehicleSelect instanceof HTMLSelectElement) {
      vehicleSelect.value = "";
    }
    [salePriceInput, tradeOfferInput, tradePayoffInput].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.value = "";
      delete input.dataset.calculatedSalePrice;
      delete input.dataset.askingPrice;
    });

    if (savingsNote) {
      savingsNote.textContent = "";
      delete savingsNote.dataset.value;
    }

    if (stateTaxInput) {
      stateTaxInput.value = "6.0%";
      formatInputEl(stateTaxInput);
    }
    if (countyTaxInput) {
      countyTaxInput.value = "1.0%";
      formatInputEl(countyTaxInput);
    }

    if (cashDownInput instanceof HTMLInputElement) {
      cashDownInput.value = "";
      delete cashDownInput.dataset.numericValue;
    }

    if (financeAprInput instanceof HTMLInputElement) {
      financeAprInput.value = `${(DEFAULT_APR * 100).toFixed(2)}%`;
      formatInputEl(financeAprInput);
    }
    if (financeTermInput) {
      const defaultTermString = String(DEFAULT_TERM_MONTHS);
      if (financeTermInput instanceof HTMLSelectElement) {
        financeTermInput.value = defaultTermString;
      } else if (financeTermInput instanceof HTMLInputElement) {
        financeTermInput.value = defaultTermString;
      }
    }

    if (affordabilityPaymentInput instanceof HTMLInputElement) {
      affordabilityPaymentInput.value = "1000";
      formatInputEl(affordabilityPaymentInput);
    }
    affordAprUserOverride = false;
    if (affordabilityAprInput instanceof HTMLInputElement) {
      syncAffordAprWithFinance({ force: true });
    }
    syncAffordTermWithFinance();
    if (creditScoreInput instanceof HTMLInputElement) {
      creditScoreInput.value = "750";
    }
    if (maxTotalFinancedOutput) {
      setCurrencyOutput(maxTotalFinancedOutput, 0, { forceZero: true });
      maxTotalFinancedOutput.classList.remove("affordability--exceeded");
    }
    if (floatingMaxFinancedOutput) {
      setCurrencyOutput(floatingMaxFinancedOutput, 0, { forceZero: true });
    }
    if (affordabilityGapNoteOutput) {
      affordabilityGapNoteOutput.textContent = "";
      delete affordabilityGapNoteOutput.dataset.tone;
    }
    if (affordabilityStatusOutput) {
      affordabilityStatusOutput.textContent = "";
      affordabilityStatusOutput.value = "";
    }

    if (financeTFCheckbox instanceof HTMLInputElement) {
      financeTFCheckbox.checked = true;
    }
    if (financeNegEquityCheckbox instanceof HTMLInputElement) {
      financeNegEquityCheckbox.checked = true;
    }
    if (cashOutEquityCheckbox instanceof HTMLInputElement) {
      cashOutEquityCheckbox.checked = false;
    }

    if (dealerFeeGroup) {
      dealerFeeGroup.clear();
    } else {
      if (dealerFeeDescInput instanceof HTMLInputElement) {
        dealerFeeDescInput.value = "";
      }
      if (dealerFeeAmountInput instanceof HTMLInputElement) {
        dealerFeeAmountInput.value = "";
        formatInputEl(dealerFeeAmountInput);
      }
    }
    if (govFeeGroup) {
      govFeeGroup.clear();
    } else {
      if (govFeeDescInput instanceof HTMLInputElement) {
        govFeeDescInput.value = "";
      }
      if (govFeeAmountInput instanceof HTMLInputElement) {
        govFeeAmountInput.value = "";
        formatInputEl(govFeeAmountInput);
      }
    }
    if (totalDealerFeesOutput) {
      setCurrencyOutput(totalDealerFeesOutput, 0, { forceZero: true });
    }
    if (totalGovtFeesOutput) {
      setCurrencyOutput(totalGovtFeesOutput, 0, { forceZero: true });
    }
    setCurrencyOutput(totalFeesOutput, 0, { forceZero: true });
    setCurrencyOutput(cashToBuyerOutput, 0, { forceZero: true });
    setCurrencyOutput(cashDueOutput, 0, { forceZero: true });
    setCurrencyOutput(amountFinancedOutput, 0, { forceZero: true });
    monthlyPaymentOutputs.forEach((outputEl) => {
      setCurrencyOutput(outputEl, 0, { forceZero: true });
    });
    if (floatingAprOutput) {
      floatingAprOutput.textContent = formatPercent(DEFAULT_APR);
    }
    if (floatingTermOutput) {
      floatingTermOutput.textContent = `${DEFAULT_TERM_MONTHS} mo`;
    }
    formatInputEl(tradeOfferInput);
    formatInputEl(tradePayoffInput);
    syncSalePriceWithSelection();
    formatInputEl(salePriceInput);
    recomputeDeal();
    const selectedSource = rateSourceSelect?.value;
    if (selectedSource && selectedSource !== RATE_SOURCE_USER_DEFINED) {
      void applyCurrentRate({ silent: false }).catch((error) => {
        console.error("[clear] rate refresh failed", error);
        recomputeDeal();
      });
    }
  }

  function attachCalculatorEventListeners() {
    const attachFormattedField = (input, { onInput } = {}) => {
      if (!(input instanceof HTMLInputElement)) return;
      const handleFormat = () => formatInputEl(input);
      input.addEventListener("blur", handleFormat);
      input.addEventListener("change", handleFormat);
      if (typeof onInput === "function") {
        input.addEventListener("input", onInput);
      }
    };

    attachFormattedField(cashDownInput, { onInput: recomputeDeal });
    attachFormattedField(affordabilityPaymentInput, { onInput: recomputeDeal });
    attachFormattedField(financeAprInput);

    if (affordabilityAprInput instanceof HTMLInputElement) {
      attachFormattedField(affordabilityAprInput, {
        onInput: () => {
          affordAprUserOverride = true;
          recomputeDeal();
        },
      });
    }

    const handleCheckbox = (checkbox, { afterToggle } = {}) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      checkbox.addEventListener("change", () => {
        if (typeof afterToggle === "function") {
          afterToggle(checkbox);
        }
        recomputeDeal();
      });
    };

    handleCheckbox(financeTFCheckbox);
    handleCheckbox(financeNegEquityCheckbox, {
      afterToggle: (checkbox) => {
        checkbox.dataset.userToggled = "true";
      },
    });
    handleCheckbox(cashOutEquityCheckbox);

    const syncRatesOrRecompute = () => {
      const selectedSource = rateSourceSelect?.value;
      if (!selectedSource || selectedSource === RATE_SOURCE_USER_DEFINED) {
        recomputeDeal();
        return;
      }
      void applyCurrentRate({ silent: false }).catch((error) => {
        console.error("[rates] applyCurrentRate failed", error);
        recomputeDeal();
      });
    };

    if (financeTermInput) {
      financeTermInput.addEventListener("change", syncRatesOrRecompute);
      financeTermInput.addEventListener("input", syncRatesOrRecompute);
    }
    if (creditScoreInput instanceof HTMLInputElement) {
      ["input", "change", "blur"].forEach((eventName) => {
        creditScoreInput.addEventListener(eventName, syncRatesOrRecompute);
      });
    }
    if (vehicleConditionSelect instanceof HTMLSelectElement) {
      vehicleConditionSelect.addEventListener("change", syncRatesOrRecompute);
    }
    if (rateSourceSelect instanceof HTMLSelectElement) {
      rateSourceSelect.addEventListener("change", () => {
        affordAprUserOverride = false;
        syncRatesOrRecompute();
      });
    }
    if (
      affordabilityTermInput instanceof HTMLSelectElement ||
      affordabilityTermInput instanceof HTMLInputElement
    ) {
      ["change", "input"].forEach((eventName) => {
        affordabilityTermInput.addEventListener(eventName, () => {
          recomputeDeal();
        });
      });
    }
  }

  function upsertVehicleInCache(vehicle) {
    if (!vehicle || !vehicle.id) return;
    const index = vehiclesCache.findIndex((item) => item.id === vehicle.id);
    if (index === -1) {
      vehiclesCache.push(vehicle);
    } else {
      vehiclesCache[index] = vehicle;
    }
  }

  function setCurrentUser(userId) {
    const normalized = userId ? String(userId) : null;
    const previous = currentUserId;
    currentUserId = normalized;
    if (!currentUserId) {
      vehiclesCache = [];
      renderVehicleSelectOptions([]);
      currentVehicleId = "";
      syncSalePriceWithSelection();
      return;
    }
    if (previous !== currentUserId) {
      void loadSavedVehicles();
      void ensureVehiclesLoaded({ preserveSelection: true });
    }
  }

  function applySession(session) {
    setCurrentUser(session?.user?.id ?? null);
    return Boolean(currentUserId);
  }

  async function hydrateSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("[auth] getSession failed", error);
        setCurrentUser(null);
        return false;
      }
      return applySession(data?.session ?? null);
    } catch (error) {
      console.warn("[auth] getSession threw", error);
      setCurrentUser(null);
      return false;
    }
  }

  function renderVehicleSelectOptions(list) {
    if (!(vehicleSelect instanceof HTMLSelectElement)) return;
    const previousSelection =
      currentVehicleId != null ? String(currentVehicleId) : "";

    const fragment = document.createDocumentFragment();
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = currentUserId
      ? "--Select a Saved Vehicle--"
      : "Sign in to view your saved vehicles";
    fragment.append(defaultOption);

    list.forEach((vehicle) => {
      const option = document.createElement("option");
      option.value = vehicle?.id != null ? String(vehicle.id) : "";
      option.textContent = buildVehicleLabel(vehicle);
      fragment.append(option);
    });

    vehicleSelect.replaceChildren(fragment);
    vehicleSelect.disabled = !currentUserId;

    const stillExists =
      previousSelection &&
      list.some((vehicle) => String(vehicle?.id ?? "") === previousSelection);
    const nextSelection = stillExists
      ? previousSelection
      : list.length
      ? String(list[0]?.id ?? "")
      : "";

    currentVehicleId = nextSelection;
    vehicleSelect.value = nextSelection;
    syncSalePriceWithSelection();
  }

  async function loadSavedVehicles() {
    if (!vehicleSelect) return;
    if (!currentUserId) {
      vehiclesCache = [];
      renderVehicleSelectOptions([]);
      return;
    }
    const selectCols = `${VEHICLE_SELECT_COLUMNS}, inserted_at`;
    const { data, error } = await supabase
      .from(VEHICLES_TABLE)
      .select(selectCols)
      .eq("user_id", currentUserId);

    if (error) {
      console.error("[vehicles] fetch failed", error);
      vehiclesCache = [];
      renderVehicleSelectOptions([]);
      return;
    }

    const list = Array.isArray(data) ? data.slice() : [];
    list.sort((a, b) => {
      const ta = Date.parse(a.inserted_at || a.created_at || 0) || 0;
      const tb = Date.parse(b.inserted_at || b.created_at || 0) || 0;
      return tb - ta;
    });

    vehiclesCache = list.map((vehicle) => ({
      ...vehicle,
      id: vehicle?.id != null ? String(vehicle.id) : "",
    }));

    renderVehicleSelectOptions(vehiclesCache);
  }

  async function initAuthAndVehicles() {
    await hydrateSession();

    supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user?.id ?? null);
    });

    if (currentUserId) {
      await loadSavedVehicles();
    } else {
      renderVehicleSelectOptions([]);
    }
  }

  async function loadVehicles(preserveId) {
    if (!vehicleSelect) return;
    if (!currentUserId) {
      vehiclesCache = [];
      renderVehicleSelectOptions([]);
      return;
    }

    const { data, error } = await supabase
      .from(VEHICLES_TABLE)
      .select(VEHICLE_SELECT_COLUMNS)
      .eq("user_id", currentUserId)
      .order("inserted_at", { ascending: false });

    if (error) {
      console.error("Failed to load vehicles", error);
      vehiclesCache = [];
      vehicleSelect.innerHTML = "";
      return;
    }

    vehiclesCache = (Array.isArray(data) ? data : []).map((vehicle) => ({
      ...vehicle,
      id:
        typeof vehicle?.id === "number" || typeof vehicle?.id === "bigint"
          ? String(vehicle.id)
          : vehicle?.id ?? "",
    }));

    const targetId =
      preserveId != null && preserveId !== ""
        ? String(preserveId)
        : currentVehicleId ?? "";

    vehicleSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "--Select a Saved Vehicle--";
    vehicleSelect.append(defaultOption);

    vehiclesCache.forEach((vehicle) => {
      const option = document.createElement("option");
      option.value = vehicle.id ?? "";
      option.textContent = buildVehicleLabel(vehicle);
      if (vehicle.id === targetId) {
        option.selected = true;
        currentVehicleId = vehicle.id;
      }
      vehicleSelect.append(option);
    });

    if (
      !vehiclesCache.some((vehicle) => {
        const vid =
          typeof vehicle?.id === "number" ? String(vehicle.id) : vehicle?.id;
        return vid && vid === currentVehicleId;
      })
    ) {
      currentVehicleId = "";
      vehicleSelect.value = "";
    }

    syncSalePriceWithSelection();
    recomputeDeal();
  }

  async function enrichVehicleModalFromListing(vehicle) {
    if (!vehicle) return;
    try {
      await Promise.resolve(setDealerLocationFromVehicle?.(vehicle));
    } catch (error) {
      console.warn("[vehicles] enrichVehicleModalFromListing failed", error);
    }
  }

  async function ensureVehiclesLoaded({ preserveSelection = true } = {}) {
    if (!vehicleSelect) return;
    if (!currentUserId) return;
    if (vehiclesCache.length) return;
    const targetId =
      preserveSelection && currentVehicleId ? String(currentVehicleId) : "";
    await loadVehicles(targetId);
  }

  async function fetchVehicleById(id) {
    if (!id) return null;
    if (!currentUserId) return null;
    try {
      const { data, error } = await supabase
        .from(VEHICLES_TABLE)
        .select(VEHICLE_SELECT_COLUMNS)
        .eq("id", id)
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (error) {
        if (error.code !== "PGRST116") {
          console.warn("[vehicles] fetchVehicleById failed", error);
        }
        return null;
      }
      if (!data) return null;
      return {
        ...data,
        id:
          typeof data.id === "number" || typeof data.id === "bigint"
            ? String(data.id)
            : data.id ?? "",
      };
    } catch (error) {
      console.warn("[vehicles] fetchVehicleById threw", error);
      return null;
    }
  }

  function moneyToNumber(value) {
    if (typeof evaluateCurrencyValue === "function") {
      const evaluated = evaluateCurrencyValue(value ?? "");
      if (Number.isFinite(evaluated)) return evaluated;
    }
    const parsed = parseDecimal(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function collectVehicleModalPayload() {
    if (!modalFields) {
      return { vin: "", payload: {} };
    }

    const rawVin = normalizeVin(modalFields.vin?.value ?? "");
    const vin = rawVin.length ? rawVin : null;
    const yearValue = parseInteger(modalFields.year?.value);
    const makeValue = modalFields.make?.value?.trim() || "";
    const modelValue = modalFields.model?.value?.trim() || "";
    const trimValue = modalFields.trim?.value?.trim() || "";
    const mileageValue = parseInteger(modalFields.mileage?.value);
    const vehicleName = modalFields.vehicle?.value?.trim() || "";

    const askingPriceRaw = moneyToNumber(modalFields.asking_price?.value ?? "");
    const askingPrice =
      askingPriceRaw != null ? normalizeCurrencyNumber(askingPriceRaw) : null;

    const dealerName = modalFields.dealer_name?.value?.trim() || "";
    const dealerPhone = modalFields.dealer_phone?.value?.trim() || "";
    const dealerStreet = modalFields.dealer_street?.value?.trim() || "";
    const dealerCity = modalFields.dealer_city?.value?.trim() || "";
    const dealerState = modalFields.dealer_state?.value?.trim() || "";
    const dealerZip = modalFields.dealer_zip?.value?.trim() || "";
    const dealerLat = parseFloatOrNull(modalFields.dealer_lat?.value ?? "");
    const dealerLng = parseFloatOrNull(modalFields.dealer_lng?.value ?? "");

    const payload = pickDefined({
      vehicle: vehicleName || null,
      year: yearValue ?? null,
      make: makeValue || null,
      model: modelValue || null,
      trim: trimValue || null,
      mileage: mileageValue ?? null,
      asking_price: askingPrice,
      dealer_name: dealerName || null,
      dealer_phone: dealerPhone || null,
      dealer_street: dealerStreet || null,
      dealer_city: dealerCity || null,
      dealer_state: dealerState || null,
      dealer_zip: dealerZip || null,
      dealer_lat: dealerLat ?? null,
      dealer_lng: dealerLng ?? null,
    });

    return { vin, payload };
  }

  async function updateSelectedVehicleFromModal({
    triggerButton = null,
    closeModalAfter = false,
  } = {}) {
    if (!modalFields) return false;
    const hasUser = await requireUser(true);
    if (!hasUser) return false;

    if (!currentVehicleId) {
      setModalStatus("Select a vehicle to update.", "error");
      return false;
    }

    const previousVehicle =
      vehiclesCache.find(
        (item) => String(item?.id ?? "") === String(currentVehicleId)
      ) ?? null;

    const { vin, payload } = collectVehicleModalPayload();
    if (vin && vin.length !== 17) {
      setModalStatus("Enter a valid 17-character VIN.", "error");
      modalFields.vin?.focus();
      return false;
    }

    const updatePayload = { ...payload, vin };
    if (!Object.keys(updatePayload).length) {
      setModalStatus("Nothing to update.", "info");
      return false;
    }

    const restoreButton = (() => {
      if (!(triggerButton instanceof HTMLButtonElement)) return () => {};
      const originalText = triggerButton.textContent;
      triggerButton.disabled = true;
      triggerButton.textContent = "Updating…";
      return () => {
        triggerButton.disabled = false;
        triggerButton.textContent = originalText ?? "Update";
      };
    })();

    setModalInputsDisabled(true);
    modalPrimaryBtn?.setAttribute("disabled", "true");
    setModalStatus("Saving vehicle…", "info");

    try {
      const performUpdate = async () => {
        const { data, error } = await supabase
          .from(VEHICLES_TABLE)
          .update(updatePayload)
          .eq("id", currentVehicleId)
          .eq("user_id", currentUserId)
          .select(VEHICLE_SELECT_COLUMNS)
          .single();
        if (error) throw error;
        if (!data) throw new Error("Vehicle update returned no data.");
        return {
          ...data,
          id:
            typeof data.id === "number" || typeof data.id === "bigint"
              ? String(data.id)
              : data.id ?? "",
        };
      };

      let normalized = null;
      let duplicateHandled = false;

      try {
        normalized = await performUpdate();
      } catch (error) {
        if (DUPLICATE_VEHICLE_REGEX.test(error?.message || "") && vin) {
          console.warn(
            "[vehicles] duplicate VIN detected during update, replacing existing record"
          );
          try {
            setModalStatus(
              "Duplicate vehicle found. Replacing previous save…",
              "info"
            );
            const deleteQuery = supabase
              .from(VEHICLES_TABLE)
              .delete()
              .eq("user_id", currentUserId)
              .eq("vin", vin);
            if (currentVehicleId) {
              deleteQuery.neq("id", currentVehicleId);
            }
            const { error: deleteError } = await deleteQuery;
            if (deleteError) throw deleteError;
            vehiclesCache = vehiclesCache.filter((vehicle) => {
              const vehicleVin = normalizeVin(vehicle?.vin ?? "");
              return (
                vehicleVin !== vin ||
                String(vehicle?.id ?? "") === String(currentVehicleId ?? "")
              );
            });
            normalized = await performUpdate();
            duplicateHandled = true;
          } catch (replacementError) {
            console.error(
              "Vehicle update duplicate replacement failed",
              replacementError
            );
            const message =
              replacementError &&
              typeof replacementError === "object" &&
              "message" in replacementError
                ? String(replacementError.message)
                : "Unable to replace existing vehicle.";
            setModalStatus(message, "error");
            return false;
          }
        } else {
          console.error("Vehicle update failed", error);
          const message =
            error && typeof error === "object" && "message" in error
              ? String(error.message)
              : "Unable to update vehicle.";
          setModalStatus(message, "error");
          return false;
        }
      }

      if (!normalized) {
        setModalStatus("Vehicle update failed. Please try again.", "error");
        return false;
      }

      const changedFields = [];
      if (previousVehicle) {
        VEHICLE_FIELD_KEYS.forEach((key) => {
          if (!(key in updatePayload)) return;
          const before = normalizeValueForComparison(previousVehicle[key]);
          const after = normalizeValueForComparison(normalized[key]);
          if (!Object.is(before, after)) {
            changedFields.push(VEHICLE_FIELD_LABELS[key] || key);
          }
        });
      } else {
        VEHICLE_FIELD_KEYS.forEach((key) => {
          if (key in updatePayload) {
            changedFields.push(VEHICLE_FIELD_LABELS[key] || key);
          }
        });
      }

      currentVehicleId = normalized.id || String(currentVehicleId);
      upsertVehicleInCache(normalized);
      renderVehicleSelectOptions(vehiclesCache);
      setSalePriceFromVehicle?.(normalized);
      await Promise.resolve(setDealerLocationFromVehicle?.(normalized));
      fillModalFields(normalized);
      try {
        recomputeDeal?.();
      } catch (error) {
        console.warn("[vehicles] recompute failed after update", error);
      }
      const updatePrefix = duplicateHandled
        ? "Vehicle updated after replacing a duplicate"
        : "Vehicle updated";
      const statusMessage =
        changedFields.length > 0
          ? `${updatePrefix}: ${changedFields.join(", ")}.`
          : `${updatePrefix} (no field changes detected).`;
      setModalStatus(statusMessage, "success");
      if (closeModalAfter) {
        closeModal();
      }
      return true;
    } finally {
      setModalInputsDisabled(false);
      modalPrimaryBtn?.removeAttribute("disabled");
      restoreButton();
    }
  }

  function setModalStatus(message = "", tone = "info") {
    if (!modalStatusEl) return;
    modalStatusEl.textContent = message ?? "";
    if (!message || tone === "info") {
      modalStatusEl.removeAttribute("data-tone");
    } else {
      modalStatusEl.dataset.tone = tone;
    }
  }

  function setEditFeeStatus(message = "", tone = "info") {
    if (!editFeeStatus) return;
    editFeeStatus.textContent = message ?? "";
    if (!message || tone === "info") {
      editFeeStatus.removeAttribute("data-tone");
    } else {
      editFeeStatus.dataset.tone = tone;
    }
  }

  function setEditFeeFormDisabled(disabled) {
    if (!editFeeForm) return;
    Array.from(editFeeForm.elements).forEach((el) => {
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLButtonElement
      ) {
        el.disabled = disabled;
      }
    });
  }

  function toggleAuthModal(show) {
    if (!authModal) return;
    authModal.setAttribute("aria-hidden", show ? "false" : "true");
    if (show) {
      document.body.style.overflow = "hidden";
    } else if (vehicleModal?.getAttribute("aria-hidden") === "false") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  function setAuthModalStatus(message = "", tone = "info") {
    if (!authModalStatusEl) return;
    authModalStatusEl.textContent = message ?? "";
    if (!message || tone === "info") {
      authModalStatusEl.removeAttribute("data-tone");
    } else {
      authModalStatusEl.dataset.tone = tone;
    }
  }

  function setAuthModalInputsDisabled(disabled) {
    const flag = Boolean(disabled);
    if (authEmailInput instanceof HTMLInputElement) {
      authEmailInput.disabled = flag;
    }
    if (authPasswordInput instanceof HTMLInputElement) {
      authPasswordInput.disabled = flag;
    }
    if (authModeToggleBtn instanceof HTMLButtonElement) {
      if (flag) {
        authModeToggleBtn.setAttribute("disabled", "true");
      } else {
        authModeToggleBtn.removeAttribute("disabled");
      }
    }
    if (flag) {
      authModalPrimaryBtn?.setAttribute("disabled", "true");
      authModalSecondaryBtn?.setAttribute("disabled", "true");
    } else {
      authModalPrimaryBtn?.removeAttribute("disabled");
      authModalSecondaryBtn?.removeAttribute("disabled");
    }
  }

  function closeAuthModal(success = false) {
    if (!authModal) return;
    toggleAuthModal(false);
    authForm?.reset();
    setAuthMode("signin", { resetStatus: true, clearPassword: true });
    setAuthModalInputsDisabled(false);
    const resolve = authModalResolve;
    authModalResolve = null;
    authModalPromise = null;
    resolve?.(success);
  }

  function openAuthModal(mode = "signin") {
    if (!authModal) return Promise.resolve(false);
    if (authModalResolve) {
      setAuthMode(mode, { resetStatus: true, clearPassword: true });
      return authModalPromise ?? Promise.resolve(false);
    }
    authForm?.reset();
    setAuthMode(mode, { resetStatus: true, clearPassword: true });
    setAuthModalInputsDisabled(false);
    toggleAuthModal(true);
    authModalPromise = new Promise((resolve) => {
      authModalResolve = resolve;
    });
    requestAnimationFrame(() => {
      if (authEmailInput instanceof HTMLInputElement) {
        authEmailInput.focus();
        authEmailInput.select?.();
      }
    });
    return authModalPromise;
  }

  async function promptForLogin() {
    if (!authModal) return false;
    const result = await openAuthModal();
    if (result) {
      await hydrateSession();
      await loadSavedVehicles();
      await ensureVehiclesLoaded({ preserveSelection: false });
    }
    return Boolean(result);
  }

  async function requireUser(interactive = true) {
    if (currentUserId) return true;
    const hasSession = await hydrateSession();
    if (hasSession) return true;
    if (!interactive) return false;
    await promptForLogin();
    return Boolean(currentUserId);
  }

  function updateEditFeeNameList(type) {
    if (!editFeeNameInput) return;
    const store =
      type === "gov" ? govFeeSuggestionStore : dealerFeeSuggestionStore;
    const listId = store?.datalist?.id ?? "";
    if (listId) {
      editFeeNameInput.setAttribute("list", listId);
    } else {
      editFeeNameInput.removeAttribute("list");
    }
  }

  function openEditFeeModal() {
    if (!editFeeModal) return;
    editFeeForm?.reset();
    updateEditFeeNameList(editFeeTypeSelect?.value ?? "dealer");
    setEditFeeStatus("");
    editFeeModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      editFeeNameInput?.focus();
      editFeeNameInput?.select?.();
    });
  }

  function closeEditFeeModal() {
    if (!editFeeModal) return;
    editFeeModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    editFeeForm?.reset();
    setEditFeeStatus("");
    formatInputEl(editFeeAmountInput);
    updateEditFeeNameList(editFeeTypeSelect?.value ?? "dealer");
  }

  function getFeeStateByType(type) {
    return type === "gov" ? govFeeSetState : dealerFeeSetState;
  }

  function getSuggestionStoreByType(type) {
    return type === "gov" ? govFeeSuggestionStore : dealerFeeSuggestionStore;
  }

  async function handleEditFeeSubmit(event) {
    event.preventDefault();
    if (!editFeeForm || !editFeeNameInput || !editFeeAmountInput) return;

    const typeValue = editFeeTypeSelect?.value === "gov" ? "gov" : "dealer";
    const rawName = editFeeNameInput.value ?? "";
    const trimmedName = rawName.trim();
    if (!trimmedName) {
      setEditFeeStatus("Description is required.", "error");
      editFeeNameInput.focus();
      return;
    }
    const amountValue = evaluateCurrencyValue(editFeeAmountInput.value ?? "");
    if (amountValue == null || Number.isNaN(amountValue)) {
      setEditFeeStatus("Enter a valid amount.", "error");
      editFeeAmountInput.focus();
      return;
    }
    const normalizedAmount = normalizeCurrencyNumber(amountValue) ?? 0;

    setEditFeeFormDisabled(true);
    setEditFeeStatus("Saving...");

    try {
      const state = getFeeStateByType(typeValue);
      const tableName =
        typeValue === "gov" ? "gov_fee_sets" : "dealer_fee_sets";
      if (!state.id) {
        setEditFeeStatus("Active fee set not available.", "error");
        return;
      }

      const normalizedName = toTitleCase(trimmedName);
      const items = Array.isArray(state.items)
        ? state.items.map((item) => ({ ...item }))
        : [];

      let found = false;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] ?? {};
        const existingName =
          typeof item?.name === "string" ? item.name.trim().toLowerCase() : "";
        if (existingName && existingName === normalizedName.toLowerCase()) {
          items[i] = {
            ...item,
            name: normalizedName,
            amount: normalizedAmount,
          };
          found = true;
          break;
        }
      }

      if (!found) {
        items.push({ name: normalizedName, amount: normalizedAmount });
      }

      const updatedItems = items.map((item) => {
        const amountNumber = normalizeCurrencyNumber(
          typeof item?.amount === "number" ? item.amount : Number(item?.amount)
        );
        return {
          ...item,
          name: typeof item?.name === "string" ? item.name : normalizedName,
          amount: amountNumber ?? 0,
        };
      });

      const { data: updatedRows, error } = await supabase
        .from(tableName)
        .update({ items: updatedItems })
        .eq("id", state.id)
        .select("id, items");
      if (error) throw error;

      const returnedItems =
        Array.isArray(updatedRows) && updatedRows[0]?.items
          ? updatedRows[0].items
          : updatedItems;

      state.items = Array.isArray(returnedItems) ? returnedItems : updatedItems;
      const normalized = normalizeFeeItems(state.items);
      const store = getSuggestionStoreByType(typeValue);
      store?.setItems(normalized);
      setEditFeeStatus("Fee saved.", "success");
      await (typeValue === "gov"
        ? loadGovFeeSuggestions()
        : loadDealerFeeSuggestions());
      closeEditFeeModal();
      recomputeDeal();
    } catch (error) {
      console.error("Failed to save fee", error);
      const message =
        error?.message ?? "Unable to save fee. Please try again in a moment.";
      setEditFeeStatus(message, "error");
    } finally {
      setEditFeeFormDisabled(false);
    }
  }

  function setModalInputsDisabled(disabled) {
    if (!modalFields) return;
    Object.values(modalFields).forEach((input) => {
      if (
        input instanceof HTMLInputElement ||
        (input && typeof input === "object" && "disabled" in input)
      ) {
        try {
          input.disabled = Boolean(disabled);
        } catch {
          /* noop */
        }
      }
    });
  }

  function fillModalFields(vehicle) {
    if (!modalFields) return;
    const v = vehicle ?? {};
    const vinFromData = typeof v?.vin === "string" ? v.vin.trim() : "";
    const listingLooksLikeVin =
      typeof v?.listing_id === "string" &&
      /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(v.listing_id)
        ? v.listing_id.trim()
        : "";
    if (modalFields.vin) {
      modalFields.vin.value = (
        vinFromData ||
        listingLooksLikeVin ||
        ""
      ).toUpperCase();
    }
    const fallbackVin = normalizeVin(vinFromData || listingLooksLikeVin || "");
    vinEnrichmentState = {
      vin: fallbackVin,
      payload: null,
      fetchedAt: 0,
    };
    if (modalFields.vehicle) modalFields.vehicle.value = v.vehicle ?? "";
    if (modalFields.year)
      modalFields.year.value = v.year != null ? String(v.year) : "";
    if (modalFields.make) modalFields.make.value = v.make ?? "";
    if (modalFields.model) modalFields.model.value = v.model ?? "";
    if (modalFields.trim) modalFields.trim.value = v.trim ?? "";
    if (modalFields.mileage)
      modalFields.mileage.value = v.mileage != null ? String(v.mileage) : "";
    if (modalFields.asking_price) {
      modalFields.asking_price.value =
        v.asking_price != null ? formatToUSDString(v.asking_price) : "";
    }
    if (
      modalFields.dealer_address ||
      modalFields.dealer_street ||
      modalFields.dealer_city ||
      modalFields.dealer_state ||
      modalFields.dealer_zip ||
      modalFields.dealer_lat ||
      modalFields.dealer_lng
    ) {
      if (vehicle) {
        const latRaw =
          v.dealer_lat ?? v.dealer_latitude ?? v.dealerLatitude ?? null;
        const lngRaw =
          v.dealer_lng ?? v.dealer_longitude ?? v.dealerLongitude ?? null;
        const latNumeric = latRaw != null ? parseDecimal(String(latRaw)) : null;
        const lngNumeric = lngRaw != null ? parseDecimal(String(lngRaw)) : null;
        applyModalDealerLocation({
          street: v.dealer_street ?? v.dealer_address ?? "",
          city: v.dealer_city ?? "",
          state: v.dealer_state ?? "",
          zip: v.dealer_zip ?? "",
          lat: latNumeric,
          lng: lngNumeric,
          name: v.dealer_name ?? "",
          phone: v.dealer_phone ?? "",
          formattedAddress:
            v.dealer_address_display ??
            buildDealerAddress({
              street: v.dealer_street ?? v.dealer_address,
              city: v.dealer_city,
              state: v.dealer_state,
              zip: v.dealer_zip,
            }),
        });
      } else {
        clearModalDealerLocation();
      }
    }
  }

  function deriveVinPrefillFromRecords(records, vin) {
    if (!Array.isArray(records) || records.length === 0) return null;

    const PRICE_PATHS = [
      "price",
      "list_price",
      "current_price",
      "asking_price",
      "sale_price",
      "sales_price",
      "retail_price",
    ];
    const MILEAGE_PATHS = [
      "miles",
      "mileage",
      "odometer",
      "odometer_reading",
      "odom_reading",
    ];
    const DEALER_NAME_PATHS = [
      "dealer.name",
      "seller_name",
      "seller.name",
      "store.name",
    ];
    const DEALER_STREET_PATHS = [
      "dealer.street",
      "dealer.address",
      "dealer.address_line",
      "seller_address",
      "location.address",
    ];
    const DEALER_CITY_PATHS = ["dealer.city", "seller_city", "location.city"];
    const DEALER_STATE_PATHS = [
      "dealer.state",
      "seller_state",
      "location.state",
    ];
    const DEALER_ZIP_PATHS = [
      "dealer.zip",
      "seller_zip",
      "location.zip",
      "dealer.postal_code",
    ];
    const DEALER_PHONE_PATHS = [
      "dealer.phone",
      "seller_phone",
      "contact_phone",
      "phone",
    ];
    const DEALER_LAT_PATHS = [
      "dealer.latitude",
      "dealer.lat",
      "dealer.geo.lat",
      "dealer.location.lat",
    ];
    const DEALER_LNG_PATHS = [
      "dealer.longitude",
      "dealer.lng",
      "dealer.geo.lng",
      "dealer.location.lon",
      "dealer.location.lng",
    ];
    const DEALER_ADDRESS_PATHS = [
      "dealer.formatted_address",
      "formatted_address",
      "dealer.address_full",
      "dealer.full_address",
    ];
    const VIN_PATHS = ["vin", "vehicle.vin", "build.vin"];
    const YEAR_PATHS = ["build.year", "vehicle.year", "year", "specs.year"];
    const MAKE_PATHS = ["build.make", "vehicle.make", "make"];
    const MODEL_PATHS = ["build.model", "vehicle.model", "model"];
    const TRIM_PATHS = ["build.trim", "vehicle.trim", "trim"];
    const HEADING_PATHS = ["heading", "title", "vehicle", "description"];
    const LISTING_ID_PATHS = ["listing_id", "id", "listingId", "mc_listing_id"];
    const LISTING_URL_PATHS = ["vdp_url", "url", "deep_link", "dealer.website"];
    const SOURCE_PATHS = ["source", "listing_source", "origin"];

    const enriched = records.map((entry, index) => {
      const timestamps = [
        entry?.last_seen_at,
        entry?.last_seen,
        entry?.updated_at,
        entry?.scraped_at,
        entry?.list_date,
        entry?.first_seen,
        entry?.created_at,
      ]
        .map((value) => parseVinTimestamp(value))
        .filter((value) => typeof value === "number");
      const recency = timestamps.length ? Math.max(...timestamps) : 0;
      const hasPrice = PRICE_PATHS.some((path) => {
        const value = getNestedValue(entry, path);
        return value !== undefined && value !== null && value !== "";
      });
      const hasDealer = DEALER_NAME_PATHS.some((path) => {
        const value = getNestedValue(entry, path);
        return value !== undefined && value !== null && value !== "";
      });
      const hasLocation =
        DEALER_CITY_PATHS.some((path) => {
          const value = getNestedValue(entry, path);
          return value !== undefined && value !== null && value !== "";
        }) ||
        DEALER_STATE_PATHS.some((path) => {
          const value = getNestedValue(entry, path);
          return value !== undefined && value !== null && value !== "";
        });
      const hasUrl = LISTING_URL_PATHS.some((path) => {
        const value = getNestedValue(entry, path);
        return value !== undefined && value !== null && value !== "";
      });
      const richness =
        (hasPrice ? 8 : 0) +
        (hasDealer ? 4 : 0) +
        (hasLocation ? 2 : 0) +
        (hasUrl ? 1 : 0);
      return { entry, index, recency, richness };
    });

    enriched.sort((a, b) => {
      if (b.richness !== a.richness) return b.richness - a.richness;
      if (b.recency !== a.recency) return b.recency - a.recency;
      return a.index - b.index;
    });

    const ordered = enriched;

    const vinNormalized =
      normalizeVin(
        coalesceFromEntries(ordered, VIN_PATHS, normalizeVin) || vin || ""
      ) || "";
    const year = coalesceFromEntries(ordered, YEAR_PATHS, parseInteger);
    const make = coalesceFromEntries(ordered, MAKE_PATHS, (value) =>
      String(value).trim()
    );
    const model = coalesceFromEntries(ordered, MODEL_PATHS, (value) =>
      String(value).trim()
    );
    const trim = coalesceFromEntries(ordered, TRIM_PATHS, (value) =>
      String(value).trim()
    );
    const heading = coalesceFromEntries(ordered, HEADING_PATHS, (value) =>
      String(value).trim()
    );
    const milesRaw = coalesceFromEntries(ordered, MILEAGE_PATHS, parseInteger);
    const priceRaw = coalesceFromEntries(ordered, PRICE_PATHS, parseDecimal);
    const dealerName = coalesceFromEntries(
      ordered,
      DEALER_NAME_PATHS,
      (value) => String(value).trim()
    );
    const dealerStreet = coalesceFromEntries(
      ordered,
      DEALER_STREET_PATHS,
      (value) => String(value).trim()
    );
    const dealerCity = coalesceFromEntries(
      ordered,
      DEALER_CITY_PATHS,
      (value) => String(value).trim()
    );
    const dealerState = coalesceFromEntries(
      ordered,
      DEALER_STATE_PATHS,
      (value) => String(value).trim()
    );
    const dealerZip = coalesceFromEntries(ordered, DEALER_ZIP_PATHS, (value) =>
      String(value).trim()
    );
    const dealerPhone = coalesceFromEntries(
      ordered,
      DEALER_PHONE_PATHS,
      (value) => String(value).trim()
    );
    const dealerLat = coalesceFromEntries(
      ordered,
      DEALER_LAT_PATHS,
      parseFloatOrNull
    );
    const dealerLng = coalesceFromEntries(
      ordered,
      DEALER_LNG_PATHS,
      parseFloatOrNull
    );
    const dealerAddressDisplay = coalesceFromEntries(
      ordered,
      DEALER_ADDRESS_PATHS,
      (value) => String(value).trim()
    );
    const listingId = coalesceFromEntries(ordered, LISTING_ID_PATHS, (value) =>
      String(value).trim()
    );
    const listingUrl = coalesceFromEntries(
      ordered,
      LISTING_URL_PATHS,
      (value) => String(value).trim()
    );
    const listingSource = coalesceFromEntries(ordered, SOURCE_PATHS, (value) =>
      String(value).trim()
    );

    const askingPrice =
      priceRaw != null ? normalizeCurrencyNumber(priceRaw) : null;
    const mileage = milesRaw != null ? milesRaw : null;

    const normalizedDealerState = dealerState
      ? dealerState.slice(0, 2).toUpperCase()
      : "";
    const normalizedDealerCity = dealerCity ? toTitleCase(dealerCity) : "";
    const normalizedDealerStreet = dealerStreet
      ? toTitleCase(dealerStreet)
      : "";
    const normalizedDealerZip = dealerZip ? normalizePostalCode(dealerZip) : "";
    const normalizedDealerName = dealerName ? toTitleCase(dealerName) : "";

    const vehicleLabel =
      heading ||
      [year != null ? String(year) : null, make, model, trim]
        .filter(Boolean)
        .join(" ") ||
      null;

    return {
      vin: vinNormalized || null,
      vehicle: vehicleLabel,
      year: year ?? null,
      make: make ? toTitleCase(make) : null,
      model: model ? toTitleCase(model) : null,
      trim: trim ? String(trim).trim() : null,
      mileage,
      asking_price: askingPrice,
      dealer_name: normalizedDealerName || null,
      dealer_street: normalizedDealerStreet || null,
      dealer_city: normalizedDealerCity || null,
      dealer_state: normalizedDealerState || null,
      dealer_zip: normalizedDealerZip || null,
      dealer_phone: dealerPhone || null,
      dealer_lat: Number.isFinite(dealerLat) ? dealerLat : null,
      dealer_lng: Number.isFinite(dealerLng) ? dealerLng : null,
      dealer_address_display: dealerAddressDisplay || null,
      listing_id:
        listingId || (vinNormalized ? `vin-history:${vinNormalized}` : null),
      listing_source: listingSource || "marketcheck:vin-history",
      listing_url: listingUrl || null,
    };
  }

  async function fetchVinHistoryRecords(vin) {
    const normalizedVin = normalizeVin(vin);
    if (!normalizedVin) return [];
    if (vinHistoryCache.has(normalizedVin)) {
      return vinHistoryCache.get(normalizedVin) ?? [];
    }
    try {
      const result = await mcHistory(normalizedVin);
      const historyPayload =
        result?.history !== undefined ? result.history : result ?? [];
      const records = Array.isArray(historyPayload)
        ? historyPayload
        : Array.isArray(historyPayload?.history)
        ? historyPayload.history
        : Array.isArray(historyPayload?.records)
        ? historyPayload.records
        : Array.isArray(historyPayload?.data)
        ? historyPayload.data
        : Array.isArray(historyPayload?.results)
        ? historyPayload.results
        : [];
      vinHistoryCache.set(normalizedVin, records);
      return records;
    } catch (error) {
      vinHistoryCache.delete(normalizedVin);
      throw error;
    }
  }

  function applyVinPrefillToModal(prefill) {
    if (!modalFields || !prefill) return false;
    let updated = false;

    const applyTextField = (input, value, formatter) => {
      if (!(input instanceof HTMLInputElement)) return false;
      if (value == null || value === "") return false;
      const formatterFn =
        typeof formatter === "function" ? formatter : (candidate) => candidate;
      const formatted = formatterFn(value);
      if (formatted == null || formatted === "") return false;
      const current = input.value?.trim?.() ?? "";
      if (current) return false;
      setInputValue(input, formatted);
      return true;
    };

    updated =
      applyTextField(modalFields.vehicle, prefill.vehicle, (value) =>
        String(value)
      ) || updated;
    updated =
      applyTextField(modalFields.year, prefill.year, (value) =>
        value != null ? String(value) : ""
      ) || updated;
    updated =
      applyTextField(modalFields.make, prefill.make, (value) =>
        toTitleCase(value)
      ) || updated;
    updated =
      applyTextField(modalFields.model, prefill.model, (value) =>
        toTitleCase(value)
      ) || updated;
    updated =
      applyTextField(modalFields.trim, prefill.trim, (value) =>
        String(value).trim()
      ) || updated;

    if (
      modalFields.mileage instanceof HTMLInputElement &&
      prefill.mileage != null &&
      Number.isFinite(Number(prefill.mileage))
    ) {
      const currentMileage = parseInteger(modalFields.mileage.value);
      if (currentMileage == null) {
        const mileageValue = Math.round(Math.abs(Number(prefill.mileage)));
        setInputValue(modalFields.mileage, mileageValue);
        updated = true;
      }
    }

    if (
      modalFields.asking_price instanceof HTMLInputElement &&
      prefill.asking_price != null
    ) {
      const existingValue = evaluateCurrencyValue(
        modalFields.asking_price.value
      );
      if (existingValue == null || existingValue === 0) {
        modalFields.asking_price.value = formatCurrency(prefill.asking_price);
        modalFields.asking_price.dataset.numericValue = String(
          prefill.asking_price
        );
        formatInputEl(modalFields.asking_price);
        updated = true;
      }
    }

    const existingStreet =
      modalFields.dealer_street instanceof HTMLInputElement
        ? modalFields.dealer_street.value.trim()
        : "";
    const existingCity =
      modalFields.dealer_city instanceof HTMLInputElement
        ? modalFields.dealer_city.value.trim()
        : "";
    const existingState =
      modalFields.dealer_state instanceof HTMLInputElement
        ? modalFields.dealer_state.value.trim()
        : "";
    const existingZip =
      modalFields.dealer_zip instanceof HTMLInputElement
        ? modalFields.dealer_zip.value.trim()
        : "";
    const existingName =
      modalFields.dealer_name instanceof HTMLInputElement
        ? modalFields.dealer_name.value.trim()
        : "";
    const existingPhone =
      modalFields.dealer_phone instanceof HTMLInputElement
        ? modalFields.dealer_phone.value.trim()
        : "";
    const existingLat = parseFloatOrNull(modalFields.dealer_lat?.value ?? "");
    const existingLng = parseFloatOrNull(modalFields.dealer_lng?.value ?? "");

    const mergedStreet = existingStreet || prefill.dealer_street || "";
    const mergedCity = existingCity || prefill.dealer_city || "";
    const mergedState = existingState || prefill.dealer_state || "";
    const mergedZip = existingZip || prefill.dealer_zip || "";
    const mergedName = existingName || prefill.dealer_name || "";
    const mergedPhone = existingPhone || prefill.dealer_phone || "";
    const mergedLat =
      Number.isFinite(existingLat) && existingLat != null
        ? existingLat
        : prefill.dealer_lat;
    const mergedLng =
      Number.isFinite(existingLng) && existingLng != null
        ? existingLng
        : prefill.dealer_lng;

    const shouldUpdateDealer =
      (!existingStreet && prefill.dealer_street) ||
      (!existingCity && prefill.dealer_city) ||
      (!existingState && prefill.dealer_state) ||
      (!existingZip && prefill.dealer_zip) ||
      (!existingName && prefill.dealer_name) ||
      (!existingPhone && prefill.dealer_phone) ||
      (!Number.isFinite(existingLat) && Number.isFinite(prefill.dealer_lat)) ||
      (!Number.isFinite(existingLng) && Number.isFinite(prefill.dealer_lng));

    if (shouldUpdateDealer) {
      const formattedAddress =
        prefill.dealer_address_display ||
        buildDealerAddress({
          street: mergedStreet,
          city: mergedCity,
          state: mergedState,
          zip: mergedZip,
        });
      applyModalDealerLocation({
        street: mergedStreet,
        city: mergedCity,
        state: mergedState,
        zip: mergedZip,
        lat: Number.isFinite(mergedLat) ? mergedLat : null,
        lng: Number.isFinite(mergedLng) ? mergedLng : null,
        formattedAddress,
        name: mergedName,
        phone: mergedPhone,
      });
      const latLng =
        Number.isFinite(mergedLat) && Number.isFinite(mergedLng)
          ? { lat: mergedLat, lng: mergedLng }
          : null;
      setDealerLocation({
        address: formattedAddress,
        latLng,
        name: mergedName || (modalFields.vehicle?.value ?? ""),
        phone: mergedPhone || "",
        listingId: prefill.listing_id ?? "",
        city: mergedCity,
        state: mergedState,
        zip: mergedZip,
        vehicleLabel:
          getModalVehicleLabel() || prefill.vehicle || mergedName || "",
      });
      updated = true;
    }

    return updated;
  }

  async function populateModalFromVin(vin, { force = false } = {}) {
    const normalizedVin = normalizeVin(vin);
    if (!normalizedVin || normalizedVin.length !== 17) return;

    const hasUser = await requireUser(true);
    if (!hasUser) {
      setModalStatus("Sign in to use VIN lookup.", "error");
      return;
    }

    const vinInput =
      modalFields?.vin instanceof HTMLInputElement ? modalFields.vin : null;
    const recentLookup =
      vinEnrichmentState.vin === normalizedVin &&
      vinEnrichmentState.payload &&
      Date.now() - (vinEnrichmentState.fetchedAt ?? 0) < 5 * 60 * 1000;
    if (recentLookup && !force) {
      applyVinPrefillToModal(vinEnrichmentState.payload);
      return;
    }

    if (vinInput) {
      vinInput.dataset.lastLookupVin = normalizedVin;
    }

    const vehiclesCacheRef = { value: vehiclesCache };
    const targetVehicleId =
      modalMode === "update" || modalMode === "delete"
        ? currentVehicleId
        : null;

    const lookupPromise = (async () => {
      setModalStatus("Fetching vehicle from MarketCheck…", "info");
      try {
        const { populateVehicleFromVinSecure } = await loadVinPopulateModule();
        const { row, payload } = await populateVehicleFromVinSecure({
          vin: normalizedVin,
          userId: currentUserId,
          vehicleId: targetVehicleId,
          vehicleSelectEl: vehicleSelect,
          vehiclesCacheRef,
          modalFields,
          homeZip: homeLocationState.postalCode,
        });
        vehiclesCache = vehiclesCacheRef.value;
        if (row?.id != null) {
          currentVehicleId = String(row.id);
        }
        renderVehicleSelectOptions(vehiclesCache);
        const prefill = payload || row || null;
        if (prefill) {
          if (prefill.vehicle && modalFields?.vehicle) {
            setInputValue(modalFields.vehicle, prefill.vehicle);
          }
          applyVinPrefillToModal(prefill);
        }
        if (modalFields?.asking_price) {
          formatInputEl(modalFields.asking_price);
        }
        vinEnrichmentState = {
          vin: normalizedVin,
          payload: prefill,
          fetchedAt: Date.now(),
        };
        syncSalePriceWithSelection();
        setModalStatus("Vehicle details loaded from MarketCheck.", "success");
      } catch (error) {
        console.error("MarketCheck VIN lookup failed", error);
        const message =
          (error && typeof error === "object" && "message" in error
            ? String(error.message)
            : null) ?? "Unable to fetch vehicle details right now.";
        setModalStatus(message, "error");
        if (vinInput) {
          delete vinInput.dataset.lastLookupVin;
        }
      }
    })();

    vinLookupPromise = lookupPromise;
    await lookupPromise;
    if (vinLookupPromise === lookupPromise) {
      vinLookupPromise = null;
    }
  }

  function handleVinInput(event) {
    if (!(event?.target instanceof HTMLInputElement)) return;
    if (modalMode === "delete") return;
    const normalized = normalizeVin(event.target.value);
    if (event.target.value !== normalized) {
      event.target.value = normalized;
    }
    if (!normalized) {
      delete event.target.dataset.lastLookupVin;
      vinEnrichmentState = { vin: "", payload: null, fetchedAt: 0 };
    }
  }

  function handleVinLookup(event) {
    if (!(event?.target instanceof HTMLInputElement)) return;
    if (modalMode === "delete") return;
    const normalized = normalizeVin(event.target.value);
    if (normalized.length !== 17) {
      return;
    }
    const lastLookup = event.target.dataset.lastLookupVin || "";
    const stale =
      Date.now() - (vinEnrichmentState.fetchedAt ?? 0) > 5 * 60 * 1000;
    if (normalized !== lastLookup || stale) {
      event.target.dataset.lastLookupVin = normalized;
      void populateModalFromVin(normalized, { force: stale });
    }
  }

  const DEFAULT_VEHICLE_LABEL_CONFIG_RAW = {
    segments: [
      {
        fields: ["year", "make", "model", "trim"],
        join: " ",
      },
      {
        fields: [{ field: "asking_price", format: "currency" }],
        prefix: "• ",
      },
    ],
    fallbackFields: ["vehicle", "vin"],
  };

  const VEHICLE_LABEL_CONFIG = normalizeVehicleLabelConfig(
    savedVehicleLabelConfig,
    DEFAULT_VEHICLE_LABEL_CONFIG_RAW
  );

  function normalizeVehicleLabelConfig(rawConfig, defaultConfig) {
    const baseConfig =
      rawConfig && typeof rawConfig === "object" ? rawConfig : {};
    const resolvedSegments = Array.isArray(baseConfig.segments)
      ? baseConfig.segments
      : Array.isArray(defaultConfig?.segments)
      ? defaultConfig.segments
      : [];

    const segments = resolvedSegments
      .map(normalizeVehicleLabelSegment)
      .filter(Boolean);

    if (!segments.length && Array.isArray(defaultConfig?.segments)) {
      defaultConfig.segments
        .map(normalizeVehicleLabelSegment)
        .filter(Boolean)
        .forEach((segment) => segments.push(segment));
    }

    const fallbackSource = Array.isArray(baseConfig.fallbackFields)
      ? baseConfig.fallbackFields
      : Array.isArray(defaultConfig?.fallbackFields)
      ? defaultConfig.fallbackFields
      : [];
    const fallbackFields = fallbackSource
      .map((field) => String(field ?? "").trim())
      .filter(Boolean);

    return {
      segments,
      fallbackFields: fallbackFields.length
        ? fallbackFields
        : Array.isArray(defaultConfig?.fallbackFields)
        ? defaultConfig.fallbackFields
        : ["vehicle"],
    };
  }

  function normalizeVehicleLabelSegment(segment) {
    if (!segment) return null;
    if (typeof segment === "string") {
      const field = normalizeVehicleLabelField(segment);
      if (!field) return null;
      return {
        fields: [field],
        fieldJoin: " ",
        prefix: "",
        suffix: "",
        separator: " ",
      };
    }
    if (Array.isArray(segment)) {
      const fields = segment
        .map(normalizeVehicleLabelField)
        .filter(Boolean);
      if (!fields.length) return null;
      return {
        fields,
        fieldJoin: " ",
        prefix: "",
        suffix: "",
        separator: " ",
      };
    }
    if (typeof segment === "object") {
      const fieldsSource = Array.isArray(segment.fields)
        ? segment.fields
        : segment.field != null
        ? [segment.field]
        : [];
      const fields = fieldsSource
        .map(normalizeVehicleLabelField)
        .filter(Boolean);
      if (!fields.length) return null;
      const fieldJoin =
        typeof segment.join === "string" ? segment.join : " ";
      const prefix =
        typeof segment.prefix === "string" ? segment.prefix : "";
      const suffix =
        typeof segment.suffix === "string" ? segment.suffix : "";
      const separator =
        typeof segment.separator === "string"
          ? segment.separator
          : " ";
      return { fields, fieldJoin, prefix, suffix, separator };
    }
    return null;
  }

  function normalizeVehicleLabelField(entry) {
    if (entry == null) return null;
    if (typeof entry === "string") {
      const fieldName = entry.trim();
      if (!fieldName) return null;
      return {
        type: "field",
        field: fieldName,
        format: null,
        prefix: "",
        suffix: "",
      };
    }
    if (typeof entry === "object") {
      if ("literal" in entry) {
        const literalValue = String(entry.literal ?? "");
        if (!literalValue) return null;
        return {
          type: "literal",
          value: literalValue,
          prefix: typeof entry.prefix === "string" ? entry.prefix : "",
          suffix: typeof entry.suffix === "string" ? entry.suffix : "",
        };
      }
      const fieldName =
        typeof entry.field === "string"
          ? entry.field
          : typeof entry.key === "string"
          ? entry.key
          : typeof entry.name === "string"
          ? entry.name
          : "";
      const trimmedField = fieldName.trim();
      if (!trimmedField) return null;
      const format =
        typeof entry.format === "string"
          ? entry.format.toLowerCase()
          : null;
      const prefix =
        typeof entry.prefix === "string" ? entry.prefix : "";
      const suffix =
        typeof entry.suffix === "string" ? entry.suffix : "";
      return {
        type: "field",
        field: trimmedField,
        format,
        prefix,
        suffix,
      };
    }
    return null;
  }

  function getVehicleFieldValue(vehicle, path) {
    if (!vehicle || !path) return null;
    const segments = String(path)
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!segments.length) return null;
    let value = vehicle;
    for (const key of segments) {
      if (value == null || typeof value !== "object") {
        return null;
      }
      value = value[key];
    }
    return value;
  }

  function formatVehicleFieldValue(vehicle, descriptor) {
    if (!descriptor) return "";
    if (descriptor.type === "literal") {
      const literalPrefix =
        typeof descriptor.prefix === "string" ? descriptor.prefix : "";
      const literalSuffix =
        typeof descriptor.suffix === "string" ? descriptor.suffix : "";
      const literalValue = `${literalPrefix}${descriptor.value ?? ""}${literalSuffix}`;
      return literalValue.trim() ? literalValue : "";
    }
    const rawValue = getVehicleFieldValue(vehicle, descriptor.field);
    if (rawValue == null) return "";
    let value =
      typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === "") return "";

    switch (descriptor.format) {
      case "currency":
        value = formatToUSDString(value);
        break;
      case "upper":
      case "uppercase":
        value = String(value).toUpperCase();
        break;
      case "lower":
      case "lowercase":
        value = String(value).toLowerCase();
        break;
      case "title":
      case "titlecase":
        value = toTitleCase(value);
        break;
      default:
        value = typeof value === "string" ? value : String(value);
        break;
    }

    const prefix =
      typeof descriptor.prefix === "string" ? descriptor.prefix : "";
    const suffix =
      typeof descriptor.suffix === "string" ? descriptor.suffix : "";
    const result = `${prefix}${value}${suffix}`;
    return result.trim() ? result : "";
  }

  function renderVehicleLabelSegment(vehicle, segment) {
    if (!segment || !Array.isArray(segment.fields)) return "";
    const joiner =
      typeof segment.fieldJoin === "string" ? segment.fieldJoin : " ";
    const parts = segment.fields
      .map((descriptor) => formatVehicleFieldValue(vehicle, descriptor))
      .filter(Boolean);
    if (!parts.length) return "";
    const body = parts.join(joiner).trim();
    if (!body) return "";
    const prefix =
      typeof segment.prefix === "string" ? segment.prefix : "";
    const suffix =
      typeof segment.suffix === "string" ? segment.suffix : "";
    const assembled = `${prefix}${body}${suffix}`;
    return assembled.trim();
  }

  function buildVehicleLabel(vehicle) {
    if (!vehicle) return "Unnamed Vehicle";
    const segments = Array.isArray(VEHICLE_LABEL_CONFIG.segments)
      ? VEHICLE_LABEL_CONFIG.segments
      : [];
    let label = "";
    for (const segment of segments) {
      const rendered = renderVehicleLabelSegment(vehicle, segment);
      if (!rendered) continue;
      if (!label) {
        label = rendered;
      } else {
        const separator =
          typeof segment.separator === "string" ? segment.separator : " ";
        label = `${label}${separator}${rendered}`;
      }
    }
    label = label.replace(/\s{2,}/g, " ").trim();
    if (label) {
      return label;
    }

    const fallbacks = Array.isArray(VEHICLE_LABEL_CONFIG.fallbackFields)
      ? VEHICLE_LABEL_CONFIG.fallbackFields
      : [];
    for (const field of fallbacks) {
      const fallbackValue = getVehicleFieldValue(vehicle, field);
      if (fallbackValue == null) continue;
      const value =
        typeof fallbackValue === "string"
          ? fallbackValue.trim()
          : String(fallbackValue);
      if (value) {
        return value;
      }
    }

    return "Vehicle";
  }

  let lastActiveElement = null;

  function toggleModal(show) {
    if (!vehicleModal) return;
    vehicleModal.setAttribute("aria-hidden", show ? "false" : "true");
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  function closeModal() {
    if (!vehicleModalForm) return;
    toggleModal(false);
    setModalInputsDisabled(false);
    vehicleModalForm.reset();
    clearModalDealerLocation();
    modalPrimaryBtn?.classList.remove("danger");
    modalPrimaryBtn?.removeAttribute("disabled");
    setModalStatus();
    vinEnrichmentState = { vin: "", payload: null, fetchedAt: 0 };
    vinLookupPromise = null;
    if (modalFields?.vin instanceof HTMLInputElement) {
      delete modalFields.vin.dataset.lastLookupVin;
    }
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
    lastActiveElement = null;
  }

  async function openModal(mode) {
    if (!vehicleModalForm || !modalPrimaryBtn) return;
    if (currentUserId && vehiclesCache.length === 0) {
      await loadVehicles(currentVehicleId);
    }

    let selectedVehicle = null;
    if (mode === "update" || mode === "delete") {
      if (!currentVehicleId) {
        alert("Select a vehicle from the list before continuing.");
        vehicleSelect?.focus();
        return;
      }

      const cachedVehicle = vehiclesCache.find(
        (item) => item.id === currentVehicleId
      );

      selectedVehicle = await fetchVehicleById(currentVehicleId);

      if (!selectedVehicle && cachedVehicle) {
        selectedVehicle = cachedVehicle;
      }

      if (!selectedVehicle) {
        alert("Unable to load the selected vehicle. Please try again.");
        vehicleSelect?.focus();
        return;
      }
    }

    modalMode = mode;
    lastActiveElement = document.activeElement;
    modalPrimaryBtn.classList.remove("danger");
    modalPrimaryBtn.removeAttribute("disabled");
    setModalInputsDisabled(false);
    setModalStatus();

    switch (mode) {
      case "update":
        modalTitle.textContent = "Update Vehicle";
        modalPrimaryBtn.textContent = "Update";
        fillModalFields(selectedVehicle ?? null);
        void enrichVehicleModalFromListing(selectedVehicle ?? null);
        break;
      case "delete":
        modalTitle.textContent = "Delete Vehicle";
        modalPrimaryBtn.textContent = "Delete";
        modalPrimaryBtn.classList.add("danger");
        fillModalFields(selectedVehicle ?? null);
        setModalInputsDisabled(true);
        setModalStatus("This vehicle will be permanently removed.", "error");
        break;
      default:
        modalTitle.textContent = "Add Vehicle";
        modalPrimaryBtn.textContent = "Save";
        fillModalFields(null);
        break;
    }

    toggleModal(true);

    const focusTarget =
      mode === "delete"
        ? modalPrimaryBtn
        : modalFields?.vehicle ?? modalPrimaryBtn;
    if (focusTarget && typeof focusTarget.focus === "function") {
      requestAnimationFrame(() => {
        focusTarget.focus();
        if (focusTarget instanceof HTMLInputElement) {
          focusTarget.select?.();
        }
      });
    }
  }

  async function resolveDealerMetadataForListing(listing) {
    if (!listing) {
      return {
        name: null,
        street: null,
        city: null,
        state: null,
        zip: null,
        phone: null,
        lat: null,
        lng: null,
        url: null,
        listingId: null,
        listingSource:
          typeof listing?.source === "string" ? listing.source : null,
      };
    }
    const candidateListingId =
      listing?.id ?? listing?.listing_id ?? listing?.listingId ?? null;
    let listingId =
      typeof candidateListingId === "string"
        ? candidateListingId.trim()
        : candidateListingId != null
        ? String(candidateListingId).trim()
        : "";
    const listingVin = normalizeVin(listing?.vin ?? "");
    const baseSources = [
      listing?.dealer ?? null,
      listing?.car_location ?? null,
      listing?.location ?? null,
      listing,
    ];
    let meta = collectDealerMetadataFromSources(baseSources);
    if (!meta.url) {
      const fallbackUrl =
        listing?.vdp_url ||
        listing?.vdpUrl ||
        listing?.deeplink ||
        getNestedValue(listing, "dealer.website");
      if (fallbackUrl) {
        meta.url = normalizeResultString(fallbackUrl);
      }
    }
    if (!meta.zip && meta.street && meta.city && meta.state) {
      const zipFromListing = normalizePostalCode(
        getNestedValue(listing, "dealer.zip") ||
          getNestedValue(listing, "car_location.zip") ||
          getNestedValue(listing, "zip")
      );
      if (zipFromListing) {
        meta.zip = zipFromListing;
      }
    }
    let vinPrefill = null;
    if (
      (!listingId || dealerMetadataNeedsDetails(meta)) &&
      isValidVin(listingVin)
    ) {
      try {
        const records = await fetchVinHistoryRecords(listingVin);
        vinPrefill = deriveVinPrefillFromRecords(records, listingVin);
        if (vinPrefill) {
          const vinLat = Number(vinPrefill.dealer_lat);
          const vinLng = Number(vinPrefill.dealer_lng);
          const vinMeta = {
            name: vinPrefill.dealer_name ?? null,
            street: vinPrefill.dealer_street ?? null,
            city: vinPrefill.dealer_city ?? null,
            state: vinPrefill.dealer_state ?? null,
            zip: vinPrefill.dealer_zip ?? null,
            phone: vinPrefill.dealer_phone ?? null,
            lat: Number.isFinite(vinLat) ? vinLat : null,
            lng: Number.isFinite(vinLng) ? vinLng : null,
            url: vinPrefill.listing_url ?? null,
          };
          meta = mergeDealerMetadata(meta, vinMeta);
          if (!listingId && vinPrefill.listing_id) {
            listingId = String(vinPrefill.listing_id).trim();
          }
        }
      } catch (error) {
        console.warn("VIN history lookup failed for dealer enrichment", error);
      }
    }
    const needsDetails = dealerMetadataNeedsDetails(meta);
    if (needsDetails && listingId) {
      try {
        const details = await fetchMarketcheckListingDetails(listingId);
        if (details) {
          const detailSources = [
            details.mc_dealership ?? null,
            details.dealer ?? null,
            details.car_location ?? null,
          ];
          const detailMeta = collectDealerMetadataFromSources(detailSources);
          if (!detailMeta.url) {
            const detailUrl =
              details.vdp_url ||
              details.vdpUrl ||
              details.deeplink ||
              getNestedValue(details, "dealer.website") ||
              getNestedValue(details, "mc_dealership.website");
            if (detailUrl) {
              detailMeta.url = normalizeResultString(detailUrl);
            }
          }
          meta = mergeDealerMetadata(meta, detailMeta);
        }
      } catch (error) {
        console.warn("Unable to fetch MarketCheck listing details", error);
      }
    }
    return {
      name: meta.name || null,
      street: meta.street || null,
      city: meta.city || null,
      state: meta.state || null,
      zip: meta.zip || null,
      phone: meta.phone || null,
      lat: Number.isFinite(meta.lat) ? meta.lat : null,
      lng: Number.isFinite(meta.lng) ? meta.lng : null,
      url: meta.url || null,
      listingId: listingId || null,
      listingSource:
        typeof listing?.source === "string"
          ? listing.source
          : typeof listing?.listing_source === "string"
          ? listing.listing_source
          : typeof vinPrefill?.listing_source === "string"
          ? vinPrefill.listing_source
          : null,
    };
  }

  function getListingMeta(listing) {
    if (!listing || typeof listing !== "object") {
      return {
        year: null,
        make: "",
        model: "",
        trim: "",
        distance: null,
        price: null,
      };
    }
    if (listingMetaCache.has(listing)) {
      return listingMetaCache.get(listing);
    }
    const meta = {
      year: null,
      make: "",
      model: "",
      trim: "",
      distance: null,
      price: null,
    };
    const yearCandidates = [
      getNestedValue(listing, "build.year"),
      listing?.year,
      getNestedValue(listing, "vehicle.year"),
      getNestedValue(listing, "specs.year"),
    ];
    for (const candidate of yearCandidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric)) {
        meta.year = numeric;
        break;
      }
    }
    const makeCandidates = [
      getNestedValue(listing, "build.make"),
      listing?.make,
      getNestedValue(listing, "vehicle.make"),
    ];
    for (const candidate of makeCandidates) {
      const normalized = normalizeResultString(candidate);
      if (normalized) {
        meta.make = normalized;
        break;
      }
    }
    const modelCandidates = [
      getNestedValue(listing, "build.model"),
      listing?.model,
      getNestedValue(listing, "vehicle.model"),
    ];
    for (const candidate of modelCandidates) {
      const normalized = normalizeResultString(candidate);
      if (normalized) {
        meta.model = normalized;
        break;
      }
    }
    const trimCandidates = [
      getNestedValue(listing, "build.trim"),
      listing?.trim,
      getNestedValue(listing, "vehicle.trim"),
    ];
    for (const candidate of trimCandidates) {
      const normalized = normalizeResultString(candidate);
      if (normalized) {
        meta.trim = normalized;
        break;
      }
    }
    const distanceCandidates = [
      listing?.distance,
      getNestedValue(listing, "dealer.distance"),
      getNestedValue(listing, "dealer.distance_miles"),
      getNestedValue(listing, "dealer.distanceMiles"),
      getNestedValue(listing, "dealer.geo.distance"),
    ];
    for (const candidate of distanceCandidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric >= 0) {
        meta.distance = numeric;
        break;
      }
    }
    const priceCandidates = [
      listing?.price,
      listing?.list_price,
      listing?.sale_price,
      getNestedValue(listing, "pricing.price"),
    ];
    for (const candidate of priceCandidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric >= 0) {
        meta.price = numeric;
        break;
      }
    }
    listingMetaCache.set(listing, meta);
    return meta;
  }

  async function setDealerLocationFromVehicle(vehicle) {
    if (!vehicle) {
      setDealerLocation({
        address: "",
        latLng: null,
        name: "",
        phone: "",
        url: "",
        listingId: "",
        city: "",
        state: "",
        zip: "",
        vehicleLabel: "",
        listingSource: "",
      });
      return;
    }
    const latRaw =
      vehicle.dealer_lat ??
      vehicle.dealer_latitude ??
      vehicle.dealerLatitude ??
      null;
    const lngRaw =
      vehicle.dealer_lng ??
      vehicle.dealer_longitude ??
      vehicle.dealerLongitude ??
      null;
    const latNumeric = parseFloatOrNull(latRaw);
    const lngNumeric = parseFloatOrNull(lngRaw);
    let latLng = isValidCoordinatePair(latNumeric, lngNumeric)
      ? { lat: latNumeric, lng: lngNumeric }
      : null;
    const address = buildDealerAddress({
      street: vehicle.dealer_street ?? vehicle.dealer_address,
      city: vehicle.dealer_city,
      state: vehicle.dealer_state,
      zip: vehicle.dealer_zip,
    });

    let displayAddress = address;
    if ((!latLng || !displayAddress) && address) {
      const geocoded = await geocodeAddress(address);
      if (geocoded?.latLng) {
        latLng = geocoded.latLng;
      }
      if (!displayAddress && geocoded?.address) {
        displayAddress = geocoded.address;
      }
    }

    const vehicleLabel = buildVehicleLabel(vehicle) || vehicle.vehicle || "";
    const dealerName = vehicle.dealer_name || "";

    setDealerLocation({
      address: displayAddress,
      latLng,
      name: dealerName || vehicleLabel || "Dealer",
      phone: vehicle.dealer_phone ?? "",
      url: vehicle.listing_url ?? "",
      listingId: vehicle.listing_id ?? "",
      city: vehicle.dealer_city ?? "",
      state: vehicle.dealer_state ?? "",
      zip: vehicle.dealer_zip ?? "",
      vehicleLabel,
      listingSource: vehicle.listing_source ?? "",
    });
  }

  async function setDealerLocationFromListing(listing) {
    if (!listing) {
      await setDealerLocationFromVehicle(null);
      return;
    }
    const dealerMeta = await resolveDealerMetadataForListing(listing);
    const metaLat = parseFloatOrNull(dealerMeta?.lat);
    const metaLng = parseFloatOrNull(dealerMeta?.lng);
    let latLng = isValidCoordinatePair(metaLat, metaLng)
      ? { lat: metaLat, lng: metaLng }
      : null;
    const address = buildDealerAddress({
      street: dealerMeta?.street,
      city: dealerMeta?.city,
      state: dealerMeta?.state,
      zip: dealerMeta?.zip,
    });

    let displayAddress = address;
    if (!latLng && address) {
      setDealerMapStatus("Locating dealer...", "info");
      const geocoded = await geocodeAddress(address);
      if (geocoded?.latLng) {
        latLng = geocoded.latLng;
      }
      if (!displayAddress && geocoded?.address) {
        displayAddress = geocoded.address;
      }
    }

    setDealerLocation({
      address: displayAddress,
      latLng,
      name: dealerMeta?.name ?? listing.heading ?? "",
      phone: dealerMeta?.phone ?? "",
      url:
        listing.vdp_url ||
        listing.vdpUrl ||
        listing.deeplink ||
        dealerMeta?.url ||
        listing.dealer?.website ||
        "",
      listingId:
        dealerMeta?.listingId ||
        listing.id ||
        listing.listing_id ||
        listing.vin ||
        "",
      city: dealerMeta?.city ?? "",
      state: dealerMeta?.state ?? "",
      zip: dealerMeta?.zip ?? "",
      vehicleLabel:
        listing.heading ||
        listing.title ||
        listing.vehicle ||
        dealerMeta?.name ||
        "",
      listingSource:
        listing.source || listing.listing_source || listing.listingSource || "",
    });
  }

  function setLocaleOutput(outputEl, value) {
    if (!outputEl) return;
    outputEl.textContent = value ?? "";
  }

  function setPercentOutput(outputEl, rate) {
    if (!outputEl) return;
    if (!Number.isFinite(rate)) {
      outputEl.textContent = "";
      if (outputEl.dataset) {
        delete outputEl.dataset.value;
      }
      return;
    }
    const normalized = Math.round(rate * 100000) / 100000;
    outputEl.textContent = formatPercent(normalized);
    outputEl.dataset.value = String(normalized);
  }

  function setLocaleTaxOutputs({ stateRate, countyRate }) {
    setPercentOutput(locationStateTaxOutput, stateRate);
    setPercentOutput(locationCountyTaxOutput, countyRate);
  }

  function setPercentInputValue(input, rate) {
    if (!(input instanceof HTMLInputElement)) return;
    const percentString = `${(Number(rate ?? 0) * 100).toFixed(2)}%`;
    input.value = percentString;
    formatInputEl(input);
  }

  async function loadLocaleFees(stateCode) {
    if (!stateCode) return;
    if (stateCode.toUpperCase() === "FL") {
      try {
        const response = await fetch("assets/florida_govt_vehicle_fees.json");
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        const items = (Array.isArray(data) ? data : []).map((item) => {
          const name =
            typeof item?.Description === "string"
              ? item.Description.trim()
              : "";
          const numericAmount = Number(item?.Amount);
          const amount = Number.isFinite(numericAmount) ? numericAmount : null;
          return {
            name,
            amount,
          };
        });
        govFeeSuggestionStore.setItems(items.filter((item) => item.name));
      } catch (error) {
        console.error("Failed to load Florida gov fees", error);
      }
    }
  }

  function applyLocaleTaxes({ stateCode, countyName }) {
    const config = TAX_RATE_CONFIG[stateCode?.toUpperCase?.() ?? ""] ?? null;
    const stateRate = config?.stateRate ?? 0;
    const countyRate =
      config?.counties?.[countyName?.toUpperCase?.() ?? ""] ?? 0;
    setPercentInputValue(stateTaxInput, stateRate);
    setPercentInputValue(countyTaxInput, countyRate);
    setLocaleTaxOutputs({ stateRate, countyRate });
  }

  function applyLocale({ stateCode, countyName }) {
    setLocaleOutput(locationStateOutput, stateCode ?? "");
    setLocaleOutput(locationCountyOutput, countyName ?? "");
    applyLocaleTaxes({ stateCode, countyName });
    void loadLocaleFees(stateCode);
    recomputeDeal();
  }

  function initLocationAutocomplete() {
    const maps = window.google?.maps;
    const places = maps?.places;
    if (!places) return;

    const anchorInput = document.getElementById("locationSearch");
    if (!anchorInput) return;

    if (typeof places.PlaceAutocompleteElement !== "function") {
      // Fallback for legacy environments that do not yet expose the new component.
      const autocomplete = new places.Autocomplete(anchorInput, {
        fields: ["address_components", "formatted_address", "geometry"],
        types: ["(regions)"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const components = place?.address_components ?? [];
        let stateCode = "";
        let countyName = "";
        let postalCode = "";
        components.forEach((component) => {
          const types = component.types ?? [];
          if (types.includes("administrative_area_level_1")) {
            stateCode = component.short_name ?? component.long_name ?? "";
          }
          if (types.includes("administrative_area_level_2")) {
            countyName = (component.long_name ?? component.short_name ?? "")
              .replace(/ County$/i, "")
              .trim();
          }
          if (types.includes("postal_code")) {
            postalCode = component.long_name ?? component.short_name ?? "";
          }
        });
        const formattedAddress = place?.formatted_address ?? "";
        const latLng = toLatLngLiteral(place?.geometry?.location);
        setHomeLocation({
          address: formattedAddress,
          latLng,
          postalCode,
        });
        applyLocale({ stateCode, countyName });
      });
      initDealerLocationAutocomplete(places);
      void updateDirectionsMap();
      return;
    }

    const extractRegionFromComponents = (components) => {
      let stateCode = "";
      let countyName = "";
      let postalCode = "";
      for (const component of Array.isArray(components) ? components : []) {
        const types = component?.types ?? [];
        if (types.includes("administrative_area_level_1")) {
          stateCode =
            component.shortText ||
            component.short_name ||
            component.longText ||
            component.long_name ||
            "";
        }
        if (types.includes("administrative_area_level_2")) {
          const raw =
            component.longText ||
            component.long_name ||
            component.shortText ||
            component.short_name ||
            "";
          countyName = raw.replace(/\s*County$/i, "").trim();
        }
        if (types.includes("postal_code")) {
          postalCode =
            component.longText ||
            component.long_name ||
            component.shortText ||
            component.short_name ||
            postalCode;
        }
      }
      return { stateCode, countyName, postalCode };
    };

    const geocodeCountyByLocation = (loc) =>
      new Promise((resolve) => {
        try {
          const geocoder = new maps.Geocoder();
          geocoder.geocode({ location: loc }, (results, status) => {
            if (status === "OK" && Array.isArray(results) && results[0]) {
              let county = "";
              let postalCode = "";
              for (const res of results) {
                const comps = res?.address_components || [];
                for (const component of comps) {
                  const types = component?.types ?? [];
                  if (
                    types.includes("administrative_area_level_2") &&
                    !county
                  ) {
                    const raw =
                      component.long_name || component.short_name || "";
                    county = raw.replace(/\s*County$/i, "").trim();
                  }
                  if (types.includes("postal_code") && !postalCode) {
                    postalCode =
                      component.long_name || component.short_name || "";
                  }
                }
              }
              resolve({ county, postalCode });
              return;
            }
            resolve({ county: "", postalCode: "" });
          });
        } catch (error) {
          console.warn("[places] county reverse geocode failed", error);
          resolve({ county: "", postalCode: "" });
        }
      });

    const replaceTarget =
      anchorInput.parentElement &&
      anchorInput.parentElement.classList?.contains("pac-wrapper")
        ? anchorInput.parentElement
        : anchorInput;

    const pac = new places.PlaceAutocompleteElement();
    pac.id = "locationSearch";
    if (anchorInput.className) pac.className = anchorInput.className;
    if (anchorInput.placeholder) {
      pac.setAttribute("placeholder", anchorInput.placeholder);
    }
    if (anchorInput.getAttribute("aria-label")) {
      pac.setAttribute("aria-label", anchorInput.getAttribute("aria-label"));
    }

    if (replaceTarget && replaceTarget.parentElement) {
      replaceTarget.parentElement.replaceChild(pac, replaceTarget);
    } else if (anchorInput.parentElement) {
      anchorInput.parentElement.replaceChild(pac, anchorInput);
    } else {
      anchorInput.replaceWith(pac);
    }

    const handlePlaceSelect = async (place) => {
      try {
        if (!place || typeof place.fetchFields !== "function") return;
        await place.fetchFields({
          fields: ["addressComponents", "formattedAddress", "location"],
        });

        let { stateCode, countyName, postalCode } = extractRegionFromComponents(
          place.addressComponents
        );

        if (place.location) {
          const { county: resolvedCounty, postalCode: resolvedPostal } =
            await geocodeCountyByLocation(place.location);
          if (!countyName && resolvedCounty) {
            countyName = resolvedCounty;
          }
          if (!postalCode && resolvedPostal) {
            postalCode = resolvedPostal;
          }
        }

        const formattedAddress =
          place.formattedAddress || place.formatted_address || "";
        const latLngLiteral = toLatLngLiteral(place.location);
        setHomeLocation({
          address: formattedAddress,
          latLng: latLngLiteral,
          postalCode,
        });
        applyLocale({ stateCode, countyName });
      } catch (error) {
        console.error("[places] selection handling failed", error);
      }
    };

    const homePlaceListener = async (event) => {
      const prediction = event?.placePrediction;
      if (prediction && typeof prediction.toPlace === "function") {
        const place = prediction.toPlace();
        await handlePlaceSelect(place);
        return;
      }
      const place = event?.detail?.place ?? null;
      await handlePlaceSelect(place);
    };

    pac.addEventListener("gmp-select", homePlaceListener);
    pac.addEventListener("gmp-placeselect", homePlaceListener);
    initDealerLocationAutocomplete(places);
    void updateDirectionsMap();
  }

  if (typeof window !== "undefined") {
    window.initLocationAutocomplete = initLocationAutocomplete;
    window.refreshRateSourceAvailability = refreshRateSourceAvailability;
  }

  initializeRateSourceOptions({ preserveSelection: true })
    .catch((error) => {
      console.error("[rates] Failed to initialize rate source options", error);
    })
    .finally(() => {
      refreshRateSourceAvailability();
      void applyCurrentRate({ silent: true });
    });
  async function applyNfcuRate({ silent = false } = {}) {
    if (!rateSourceSelect || rateSourceSelect.value !== RATE_SOURCE_NFCU) {
      return;
    }
    const termMonths =
      parseInteger(financeTermInput?.value) ?? DEFAULT_TERM_MONTHS;
    const creditScore = parseInteger(creditScoreInput?.value);
    const loanType = normalizeLoanType(vehicleConditionSelect?.value);

    if (creditScore == null) {
      setRateSourceStatus(
        "Enter a credit score to pull NFCU rates.",
        "warning"
      );
      return;
    }
    if (creditScore < MIN_CREDIT_SCORE || creditScore > MAX_CREDIT_SCORE) {
      setRateSourceStatus(
        `Credit score must be between ${MIN_CREDIT_SCORE} and ${MAX_CREDIT_SCORE}.`,
        "error"
      );
      return;
    }

    const tier = getCreditTierForScore(creditScore);
    if (!tier) {
      setRateSourceStatus(
        "No credit tier configuration matches that score.",
        "error"
      );
      return;
    }

    setRateSourceStatus("Loading NFCU rates...");
    try {
      await ensureNfcuRatesLoaded();
    } catch (error) {
      console.error("Failed to load NFCU rates", error);
      setRateSourceStatus(
        "Unable to load NFCU rates right now. Try again later.",
        "error"
      );
      return;
    }

    if (nfcuRateState.rates.length === 0) {
      setRateSourceStatus(
        "No NFCU rate data available yet. Run the Supabase import script first.",
        "warning"
      );
      return;
    }

    const match = findNfcuRateMatch({
      term: termMonths,
      creditScore,
      loanType,
    });

    if (!match) {
      setRateSourceStatus(
        `No NFCU rate for ${
          loanType === "used" ? "used" : "new"
        } vehicles at ${termMonths}-month terms in tier ${tier.label}.`,
        "warning"
      );
      return;
    }

    const aprPercent = Number(match.aprPercent);
    if (!Number.isFinite(aprPercent)) {
      setRateSourceStatus("Invalid APR received from NFCU data.", "error");
      return;
    }
    const aprDecimal = Math.max(aprPercent / 100, MIN_APR);

    if (financeAprInput instanceof HTMLInputElement) {
      financeAprInput.value = formatPercent(aprDecimal);
      financeAprInput.dataset.numericValue = String(aprDecimal);
    }

    const effectiveDetails = match.effectiveAt
      ? ` (effective ${match.effectiveAt})`
      : "";
    const tierLabel = tier.label ? ` • Tier ${tier.label}` : "";
    setRateSourceStatus(
      `NFCU ${loanType === "used" ? "Used" : "New"} ${
        match.termLabel
      }: ${aprPercent.toFixed(2)}%${tierLabel}${effectiveDetails}`
    );

    if (!silent) {
      recomputeDeal();
    }
  }

  function evaluateExpression(raw) {
    if (raw == null) return null;
    let expr = String(raw).trim();
    if (expr === "") return null;
    expr = expr.replace(/[$,\s]/g, "");
    if (/^\(([^()+\-*/]+)\)$/.test(expr)) {
      expr = `-${RegExp.$1}`;
    }
    expr = expr.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
    if (/[^0-9+\-*/().]/.test(expr)) return null;
    try {
      const result = Function('"use strict";return (' + expr + ");")();
      return Number.isFinite(result) ? result : null;
    } catch (error) {
      return null;
    }
  }

  function evaluateCurrencyValue(raw) {
    const value = evaluateExpression(raw);
    if (value == null) return null;
    return Math.round(value * 100) / 100;
  }

  function evaluatePercentValue(raw, fallback = null) {
    if (raw == null || String(raw).trim() === "") return fallback;
    const stringValue = String(raw).trim();
    const containsPercent = stringValue.includes("%");
    const value = evaluateExpression(stringValue);
    if (value == null) return fallback;
    if (containsPercent) return value;
    return Math.abs(value) >= 1 ? value / 100 : value;
  }

  function normalizePercentInput(input) {
    if (!(input instanceof HTMLInputElement)) return;
    const raw = input.value;
    if (!raw || raw.trim() === "") {
      delete input.dataset.numericValue;
      return;
    }
    const numericValue = evaluatePercentValue(raw, null);
    if (numericValue == null) {
      delete input.dataset.numericValue;
      return;
    }
    input.dataset.numericValue = String(numericValue);
    const formatted = formatPercent(numericValue);
    if (input.value !== formatted) {
      input.value = formatted;
      if (!input.readOnly && document.activeElement === input) {
        const caret = formatted.endsWith("%")
          ? Math.max(formatted.length - 1, 0)
          : formatted.length;
        input.setSelectionRange(caret, caret);
      }
    }
  }

  function syncAffordAprWithFinance({ force = false } = {}) {
    if (!affordabilityAprInput || !financeAprInput) return;
    if (!force && affordAprUserOverride) return;
    const financeApr = getPercentInputValue(financeAprInput, DEFAULT_APR);
    const aprValue = Number.isFinite(financeApr) ? financeApr : DEFAULT_APR;
    const formatted = formatPercent(aprValue);
    if (affordabilityAprInput instanceof HTMLInputElement) {
      affordabilityAprInput.value = formatted;
    } else {
      affordabilityAprInput.textContent = formatted;
    }
    affordabilityAprInput.dataset.numericValue = String(aprValue);
  }

  function syncAffordTermWithFinance(termMonthsParam) {
    if (!affordabilityTermInput) return;
    const parsedTerm =
      termMonthsParam != null && Number.isFinite(termMonthsParam)
        ? Math.round(termMonthsParam)
        : parseInteger(financeTermInput?.value);
    const normalized =
      parsedTerm != null && parsedTerm > 0 ? String(parsedTerm) : "";

    if (affordabilityTermInput instanceof HTMLSelectElement) {
      if (normalized) {
        const hasOption = Array.from(affordabilityTermInput.options).some(
          (opt) => opt.value === normalized
        );
        if (!hasOption) {
          const option = document.createElement("option");
          option.value = normalized;
          option.textContent = normalized;
          affordabilityTermInput.append(option);
        }
      }
      affordabilityTermInput.value = normalized;
      affordabilityTermInput.dataset.value = normalized;
    } else if (affordabilityTermInput instanceof HTMLInputElement) {
      affordabilityTermInput.value = normalized;
      affordabilityTermInput.dataset.value = normalized;
    } else if (affordabilityTermInput) {
      affordabilityTermInput.textContent = normalized;
      if (normalized) {
        affordabilityTermInput.dataset.value = normalized;
      } else {
        delete affordabilityTermInput.dataset.value;
      }
    }
  }

  function setCurrencyOutput(outputEl, value, { forceZero = false } = {}) {
    if (!outputEl) return;
    if (value == null && !forceZero) {
      if (outputEl instanceof HTMLOutputElement) {
        outputEl.value = "";
      }
      outputEl.textContent = "";
      delete outputEl.dataset.value;
      return;
    }
    const normalized = Math.round((value ?? 0) * 100) / 100;
    const formatted = formatCurrency(normalized);
    if (outputEl instanceof HTMLOutputElement) {
      outputEl.value = formatted;
    }
    outputEl.textContent = formatted;
    outputEl.dataset.value = String(normalized);
  }

  function getCurrencyInputValue(input) {
    if (!(input instanceof HTMLInputElement)) return null;
    return evaluateCurrencyValue(input.value);
  }

  function getPercentInputValue(input, defaultValue) {
    if (!input) return defaultValue;
    const datasetValue = input.dataset?.numericValue;
    if (datasetValue != null && datasetValue !== "") {
      const numeric = Number(datasetValue);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    if (!(input instanceof HTMLInputElement)) return defaultValue;
    const value = evaluatePercentValue(input.value, null);
    if (value == null) return defaultValue;
    return value;
  }

  function recomputeFees() {
    const dealerValue =
      dealerFeeGroup?.getTotal() ??
      getCurrencyInputValue(dealerFeeAmountInput) ??
      0;
    const govValue =
      govFeeGroup?.getTotal() ?? getCurrencyInputValue(govFeeAmountInput) ?? 0;
    const total = dealerValue + govValue;

    if (totalDealerFeesOutput) {
      setCurrencyOutput(totalDealerFeesOutput, dealerValue, {
        forceZero: true,
      });
    }
    if (totalGovtFeesOutput) {
      setCurrencyOutput(totalGovtFeesOutput, govValue, { forceZero: true });
    }
    setCurrencyOutput(totalFeesOutput, total, { forceZero: true });
    return { dealerFees: dealerValue, govFees: govValue, totalFees: total };
  }

  function recomputeTaxes({ salePrice, dealerFees, tradeOffer }) {
    const result = {
      taxableBase: 0,
      stateTaxAmount: 0,
      countyTaxAmount: 0,
      totalTaxes: 0,
    };

    if (!taxableBaseOutput) {
      return result;
    }

    const sale = Number.isFinite(salePrice) ? salePrice : 0;
    const dealer = Number.isFinite(dealerFees) ? dealerFees : 0;
    const tradeCredit = Number.isFinite(tradeOffer) ? tradeOffer : 0;
    const taxableBase = Math.max(sale - tradeCredit, 0) + dealer;
    result.taxableBase = taxableBase;

    setCurrencyOutput(taxableBaseOutput, taxableBase, {
      forceZero: sale !== 0 || dealer !== 0 || tradeCredit !== 0,
    });

    const stateRate = getPercentInputValue(stateTaxInput, 0.06);
    const countyRate = getPercentInputValue(countyTaxInput, 0.01);

    const stateTaxAmount = taxableBase * stateRate;
    const countyBaseSource = sale > 0 ? sale : taxableBase;
    const countyTaxableBase = Math.min(Math.max(countyBaseSource, 0), 5000);
    const countyTaxAmount = countyTaxableBase * countyRate;

    result.stateTaxAmount = stateTaxAmount;
    result.countyTaxAmount = countyTaxAmount;
    result.totalTaxes = stateTaxAmount + countyTaxAmount;

    setLocaleTaxOutputs({ stateRate, countyRate });

    setCurrencyOutput(stateTaxTotalOutput, stateTaxAmount, { forceZero: true });
    setCurrencyOutput(countyTaxTotalOutput, countyTaxAmount, {
      forceZero: true,
    });
    setCurrencyOutput(totalTaxesOutput, result.totalTaxes, {
      forceZero: true,
    });

    return result;
  }

  function recomputeFinancing({
    salePrice,
    tradeOffer,
    tradePayoff,
    equityValue,
    feeTotals,
    taxTotals,
  }) {
    const sale = Number.isFinite(salePrice) ? salePrice : 0;
    const tradeOfferValue = Number.isFinite(tradeOffer) ? tradeOffer : 0;
    const tradePayoffValue = Number.isFinite(tradePayoff) ? tradePayoff : 0;
    const equity = Number.isFinite(equityValue) ? equityValue : 0;
    const totalFees = Number.isFinite(feeTotals?.totalFees)
      ? feeTotals.totalFees
      : 0;
    const totalTaxes = Number.isFinite(taxTotals?.totalTaxes)
      ? taxTotals.totalTaxes
      : 0;
    const totalFeesAndTaxes = totalFees + totalTaxes;

    const rawCashDown = getCurrencyInputValue(cashDownInput);
    const cashDown = rawCashDown != null && rawCashDown > 0 ? rawCashDown : 0;
    const rawFinanceApr = getPercentInputValue(financeAprInput, DEFAULT_APR);
    const aprRate = Math.min(
      Math.max(rawFinanceApr ?? DEFAULT_APR, MIN_APR),
      MAX_FINANCE_APR
    );
    if (financeAprInput instanceof HTMLInputElement) {
      financeAprInput.dataset.numericValue = String(aprRate);
      const isFocused = document.activeElement === financeAprInput;
      const outOfBounds =
        rawFinanceApr != null &&
        (rawFinanceApr < MIN_APR || rawFinanceApr > MAX_FINANCE_APR);
      if (!isFocused || outOfBounds) {
        financeAprInput.value = formatPercent(aprRate);
      }
    }
    syncAffordAprWithFinance();
    const termValue = financeTermInput
      ? parseInteger(financeTermInput.value)
      : null;
    const termMonths =
      termValue != null && termValue > 0 ? termValue : DEFAULT_TERM_MONTHS;

    syncAffordTermWithFinance(termMonths);

    const financeTF = financeTFCheckbox?.checked ?? false;
    let financeNegEquity = financeNegEquityCheckbox?.checked ?? false;
    let cashOutEquity = cashOutEquityCheckbox?.checked ?? false;

    const posEquity = equity > 0 ? equity : 0;
    const negEquity = equity < 0 ? -equity : 0;

    setCheckboxAvailability(
      financeNegEquityCheckbox,
      financeNegEquityLabel,
      negEquity > 0
    );
    setCheckboxAvailability(
      cashOutEquityCheckbox,
      cashOutEquityLabel,
      posEquity > 0
    );

    financeNegEquity = financeNegEquityCheckbox?.checked ?? false;
    cashOutEquity = cashOutEquityCheckbox?.checked ?? false;

    let totalFinanced = sale - tradeOfferValue + tradePayoffValue;

    if (!financeNegEquity && negEquity > 0) {
      totalFinanced -= negEquity;
    }

    if (cashOutEquity && posEquity > 0) {
      totalFinanced += posEquity;
    }

    if (financeTF) {
      totalFinanced += totalFeesAndTaxes;
    }

    totalFinanced -= cashDown;
    totalFinanced = Math.max(totalFinanced, 0);

    setCurrencyOutput(amountFinancedOutput, totalFinanced, {
      forceZero: true,
    });

    const dueFeesTaxes = financeTF ? 0 : totalFeesAndTaxes;
    const dueNegEquity = financeNegEquity ? 0 : negEquity;
    const equityApplied = !cashOutEquity && financeTF ? posEquity : 0;

    const cashDueBeforeDown = Math.max(
      dueFeesTaxes + dueNegEquity - equityApplied,
      0
    );
    let cashDue = cashDown + cashDueBeforeDown;

    setCurrencyOutput(cashDueOutput, cashDue, { forceZero: true });
    const netCashToBuyer = cashOutEquity
      ? Math.max(posEquity - Math.max(cashDown, 0), 0)
      : 0;
    setCurrencyOutput(cashToBuyerOutput, netCashToBuyer, {
      forceZero: true,
    });

    const monthlyPayment = calculateMonthlyPayment(
      totalFinanced,
      aprRate,
      termMonths
    );

    const shouldForceMonthly = totalFinanced > 0 || termMonths > 0;
    monthlyPaymentOutputs.forEach((outputEl) => {
      setCurrencyOutput(outputEl, monthlyPayment, {
        forceZero: shouldForceMonthly,
      });
    });

    if (floatingAprOutput) {
      floatingAprOutput.textContent = formatPercent(aprRate);
    }
    if (floatingTermOutput) {
      floatingTermOutput.textContent = `${termMonths} mo`;
    }

    if (financeTFNoteOutput) {
      if (financeTF && totalFeesAndTaxes > 0 && monthlyPayment > 0) {
        const altAmount = Math.max(totalFinanced - totalFeesAndTaxes, 0);
        const altPayment = calculateMonthlyPayment(
          altAmount,
          aprRate,
          termMonths
        );
        const savings = monthlyPayment - altPayment;
        if (savings > 0.01) {
          setCheckboxNote(
            financeTFNoteOutput,
            `+ ${formatCurrency(savings)}/mo.`
          );
        } else {
          setCheckboxNote(financeTFNoteOutput, "");
        }
      } else {
        setCheckboxNote(financeTFNoteOutput, "");
      }
    }

    if (financeNegEquityNoteOutput) {
      if (financeNegEquity && negEquity > 0 && monthlyPayment > 0) {
        const altAmount = Math.max(totalFinanced - negEquity, 0);
        const altPayment = calculateMonthlyPayment(
          altAmount,
          aprRate,
          termMonths
        );
        const savings = monthlyPayment - altPayment;
        if (savings > 0.01) {
          setCheckboxNote(
            financeNegEquityNoteOutput,
            `+${formatCurrency(savings)}/mo.`
          );
        } else {
          setCheckboxNote(financeNegEquityNoteOutput, "");
        }
      } else {
        setCheckboxNote(financeNegEquityNoteOutput, "");
      }
    }

    if (cashOutEquityNoteOutput) {
      if (cashOutEquity && posEquity > 0) {
        setCheckboxNote(
          cashOutEquityNoteOutput,
          `+ ${formatCurrency(posEquity)} Total Financed`
        );
      } else {
        setCheckboxNote(cashOutEquityNoteOutput, "");
      }
    }

    return {
      financeTaxesFees: financeTF,
      totalFeesAndTaxes,
      negEquityFinanced: financeNegEquity ? negEquity : 0,
      cashOutAmount: cashOutEquity ? posEquity : 0,
    };
  }

  function recomputeAffordability({
    totalFeesAndTaxes,
    financeTaxesFees,
    negEquityFinanced = 0,
    cashOutAmount = 0,
  }) {
    // Resolve critical elements if not already bound (be permissive about selectors)
    if (!affordabilityPaymentInput) {
      window.affordabilityPaymentInput =
        document.querySelector("#affordability") ||
        document.querySelector("#desiredMonthlyPmt") ||
        document.querySelector('[data-role="affordability-payment"]') ||
        window.affordabilityPaymentInput;
    }
    if (!maxTotalFinancedOutput) {
      window.maxTotalFinancedOutput =
        document.querySelector("#maxTotalFinanced") ||
        document.querySelector('[data-role="max-total-financed"]') ||
        window.maxTotalFinancedOutput;
    }
    if (!affordabilityStatusOutput) {
      window.affordabilityStatusOutput =
        document.querySelector("#reqAPR_TERM") ||
        document.querySelector('[data-role="affordability-status"]') ||
        null; // optional
    }
    if (!affordabilityAprInput) {
      window.affordabilityAprInput =
        document.querySelector("#affordApr") ||
        document.querySelector('[data-role="affordability-apr"]') ||
        window.affordabilityAprInput;
    }
    if (!affordabilityTermInput) {
      window.affordabilityTermInput =
        document.querySelector("#affordTerm") ||
        document.querySelector('[data-role="affordability-term"]') ||
        window.affordabilityTermInput;
    }

    // Only hard-require the two critical nodes
    if (!affordabilityPaymentInput || !maxTotalFinancedOutput) {
      return;
    }

    // 1) Read desired monthly payment (USD)
    const desiredPayment =
      getCurrencyInputValue(affordabilityPaymentInput) ?? null;
    const payment =
      desiredPayment != null && desiredPayment > 0 ? desiredPayment : 0;

    // 2) Compute extras that might be financed (for gap/help text only)
    const extrasFinanced =
      (financeTaxesFees ? totalFeesAndTaxes : 0) +
      Math.max(negEquityFinanced, 0) +
      Math.max(cashOutAmount, 0);

    // 3) Determine APR and term from the current finance inputs
    //    Preference order: affordability APR control -> finance APR control -> DEFAULT_APR
    const aprFromAfford = getPercentInputValue(affordabilityAprInput, null);
    const aprFromFinance = getPercentInputValue(financeAprInput, DEFAULT_APR);
    let aprRate = aprFromAfford != null ? aprFromAfford : aprFromFinance;
    aprRate = Math.min(Math.max(aprRate, MIN_APR), MAX_AFFORD_APR);

    // Term: use selected affordability term if present, else finance term, else default
    const baseTermRaw =
      parseInteger(affordabilityTermInput?.dataset?.value) ??
      parseInteger(affordabilityTermInput?.value) ??
      parseInteger(financeTermInput?.value) ??
      DEFAULT_TERM_MONTHS;
    let termMonths = Math.min(
      Math.max(baseTermRaw, MIN_AFFORD_TERM_MONTHS),
      MAX_AFFORD_TERM_MONTHS
    );

    // Sync the displayed affordability APR/Term with what we're actually using
    if (affordabilityAprInput) {
      const formattedApr = formatPercent(aprRate);
      if (affordabilityAprInput instanceof HTMLInputElement) {
        affordabilityAprInput.value = formattedApr;
      } else {
        affordabilityAprInput.textContent = formattedApr;
      }
      affordabilityAprInput.dataset.numericValue = String(aprRate);
    }
    syncAffordTermWithFinance(termMonths);

    // If no payment given, show guidance and zero-out the output, then exit
    if (payment <= 0) {
      setCurrencyOutput(maxTotalFinancedOutput, 0, { forceZero: true });
      if (floatingMaxFinancedOutput) {
        setCurrencyOutput(floatingMaxFinancedOutput, 0, { forceZero: true });
      }
      if (affordabilityGapNoteOutput) {
        affordabilityGapNoteOutput.textContent =
          "Enter a monthly payment to estimate affordability.";
        delete affordabilityGapNoteOutput.dataset.tone;
      }
      affordabilityStatusOutput.textContent =
        "Enter a monthly payment to estimate affordability.";
      affordabilityStatusOutput.value =
        "Enter a monthly payment to estimate affordability.";
      maxTotalFinancedOutput.classList.remove("affordability--exceeded");
      return;
    }

    // 4) Core calculation: Loan limit (Max Total Financed) given PMT, APR, and Term.
    //    P = PMT * [ (1+i)^n - 1 ] / [ i * (1+i)^n ], where i = APR/12, n = term in months.
    const loanLimit = principalFromPayment(payment, aprRate, termMonths);

    // 5) Always display the computed Max Total Financed
    setCurrencyOutput(maxTotalFinancedOutput, loanLimit, { forceZero: true });
    if (floatingMaxFinancedOutput) {
      setCurrencyOutput(floatingMaxFinancedOutput, loanLimit, {
        forceZero: true,
      });
    }

    // 6) Compare against the user's current total financed to give an over/under signal
    const totalFinanced = amountFinancedOutput?.dataset?.value
      ? Number(amountFinancedOutput.dataset.value)
      : 0;

    maxTotalFinancedOutput.classList.toggle(
      "affordability--exceeded",
      totalFinanced > loanLimit + PAYMENT_TOLERANCE
    );

    if (affordabilityGapNoteOutput) {
      if (totalFinanced > 0) {
        const gap = totalFinanced - loanLimit;
        if (Math.abs(gap) > PAYMENT_TOLERANCE) {
          const isOver = gap > 0;
          affordabilityGapNoteOutput.textContent = `${
            isOver ? "Over budget" : "Remaining budget"
          }: ${formatCurrency(Math.abs(gap))}`;
          affordabilityGapNoteOutput.dataset.tone = isOver ? "over" : "under";
        } else {
          affordabilityGapNoteOutput.textContent = "Fits current financing.";
          delete affordabilityGapNoteOutput.dataset.tone;
        }
      } else {
        const remaining = Math.max(loanLimit - extrasFinanced, 0);
        affordabilityGapNoteOutput.textContent = `Remaining budget: ${formatCurrency(
          remaining
        )}`;
        affordabilityGapNoteOutput.dataset.tone = "under";
      }
    }

    // 7) Clear any lingering status message once we have a valid computation
    if (affordabilityStatusOutput) {
      affordabilityStatusOutput.textContent = "";
      affordabilityStatusOutput.value = "";
    }
  }

  function clearCalculator() {
    currentVehicleId = "";
    currentAskingPrice = null;
    if (vehicleSelect instanceof HTMLSelectElement) {
      vehicleSelect.value = "";
    }
    [salePriceInput, tradeOfferInput, tradePayoffInput].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.value = "";
      delete input.dataset.calculatedSalePrice;
      delete input.dataset.askingPrice;
    });

    if (savingsNote) {
      savingsNote.textContent = "";
      delete savingsNote.dataset.value;
    }

    if (stateTaxInput) {
      stateTaxInput.value = "6.0%";
      formatInputEl(stateTaxInput);
    }
    if (countyTaxInput) {
      countyTaxInput.value = "1.0%";
      formatInputEl(countyTaxInput);
    }

    if (cashDownInput instanceof HTMLInputElement) {
      cashDownInput.value = "";
      delete cashDownInput.dataset.numericValue;
    }

    if (financeAprInput instanceof HTMLInputElement) {
      financeAprInput.value = `${(DEFAULT_APR * 100).toFixed(2)}%`;
      formatInputEl(financeAprInput);
    }
    if (financeTermInput) {
      const defaultTermString = String(DEFAULT_TERM_MONTHS);
      if (financeTermInput instanceof HTMLSelectElement) {
        financeTermInput.value = defaultTermString;
      } else if (financeTermInput instanceof HTMLInputElement) {
        financeTermInput.value = defaultTermString;
      }
    }

    if (affordabilityPaymentInput instanceof HTMLInputElement) {
      affordabilityPaymentInput.value = "1000";
      formatInputEl(affordabilityPaymentInput);
    }
    affordAprUserOverride = false;
    if (affordabilityAprInput instanceof HTMLInputElement) {
      syncAffordAprWithFinance({ force: true });
    }
    syncAffordTermWithFinance();
    if (creditScoreInput instanceof HTMLInputElement) {
      creditScoreInput.value = "750";
    }
    if (maxTotalFinancedOutput) {
      setCurrencyOutput(maxTotalFinancedOutput, 0, { forceZero: true });
      maxTotalFinancedOutput.classList.remove("affordability--exceeded");
    }
    if (floatingMaxFinancedOutput) {
      setCurrencyOutput(floatingMaxFinancedOutput, 0, { forceZero: true });
    }
    if (affordabilityGapNoteOutput) {
      affordabilityGapNoteOutput.textContent = "";
      delete affordabilityGapNoteOutput.dataset.tone;
    }
    if (affordabilityStatusOutput) {
      affordabilityStatusOutput.textContent = "";
      affordabilityStatusOutput.value = "";
    }

    if (financeTFCheckbox instanceof HTMLInputElement) {
      financeTFCheckbox.checked = true;
    }
    if (financeNegEquityCheckbox instanceof HTMLInputElement) {
      financeNegEquityCheckbox.checked = true;
    }
    if (cashOutEquityCheckbox instanceof HTMLInputElement) {
      cashOutEquityCheckbox.checked = false;
    }

    if (dealerFeeGroup) {
      dealerFeeGroup.clear();
    } else {
      if (dealerFeeDescInput instanceof HTMLInputElement) {
        dealerFeeDescInput.value = "";
      }
      if (dealerFeeAmountInput instanceof HTMLInputElement) {
        dealerFeeAmountInput.value = "";
        formatInputEl(dealerFeeAmountInput);
      }
    }
    if (govFeeGroup) {
      govFeeGroup.clear();
    } else {
      if (govFeeDescInput instanceof HTMLInputElement) {
        govFeeDescInput.value = "";
      }
      if (govFeeAmountInput instanceof HTMLInputElement) {
        govFeeAmountInput.value = "";
        formatInputEl(govFeeAmountInput);
      }
    }
    if (totalDealerFeesOutput) {
      setCurrencyOutput(totalDealerFeesOutput, 0, { forceZero: true });
    }
    if (totalGovtFeesOutput) {
      setCurrencyOutput(totalGovtFeesOutput, 0, { forceZero: true });
    }
    setCurrencyOutput(totalFeesOutput, 0, { forceZero: true });
    setCurrencyOutput(cashToBuyerOutput, 0, { forceZero: true });
    setCurrencyOutput(cashDueOutput, 0, { forceZero: true });
    setCurrencyOutput(amountFinancedOutput, 0, { forceZero: true });
    monthlyPaymentOutputs.forEach((outputEl) => {
      setCurrencyOutput(outputEl, 0, { forceZero: true });
    });
    if (floatingAprOutput) {
      floatingAprOutput.textContent = formatPercent(DEFAULT_APR);
    }
    if (floatingTermOutput) {
      floatingTermOutput.textContent = `${DEFAULT_TERM_MONTHS} mo`;
    }
    formatInputEl(tradeOfferInput);
    formatInputEl(tradePayoffInput);
    syncSalePriceWithSelection();
    formatInputEl(salePriceInput);
    recomputeDeal();
    const selectedSource = rateSourceSelect?.value;
    if (selectedSource && selectedSource !== RATE_SOURCE_USER_DEFINED) {
      void applyCurrentRate({ silent: false }).catch((error) => {
        console.error("[clear] rate refresh failed", error);
        recomputeDeal();
      });
    }
  }

  function upsertVehicleInCache(vehicle) {
    if (!vehicle || !vehicle.id) return;
    const index = vehiclesCache.findIndex((item) => item.id === vehicle.id);
    if (index === -1) {
      vehiclesCache.push(vehicle);
    } else {
      vehiclesCache[index] = vehicle;
    }
  }

  function setModalStatus(message = "", tone = "info") {
    if (!modalStatusEl) return;
    modalStatusEl.textContent = message ?? "";
    if (!message || tone === "info") {
      modalStatusEl.removeAttribute("data-tone");
    } else {
      modalStatusEl.dataset.tone = tone;
    }
  }

  function setEditFeeStatus(message = "", tone = "info") {
    if (!editFeeStatus) return;
    editFeeStatus.textContent = message ?? "";
    if (!message || tone === "info") {
      editFeeStatus.removeAttribute("data-tone");
    } else {
      editFeeStatus.dataset.tone = tone;
    }
  }

  function setEditFeeFormDisabled(disabled) {
    if (!editFeeForm) return;
    Array.from(editFeeForm.elements).forEach((el) => {
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLButtonElement
      ) {
        el.disabled = disabled;
      }
    });
  }

  function updateEditFeeNameList(type) {
    if (!editFeeNameInput) return;
    const store =
      type === "gov" ? govFeeSuggestionStore : dealerFeeSuggestionStore;
    const listId = store?.datalist?.id ?? "";
    if (listId) {
      editFeeNameInput.setAttribute("list", listId);
    } else {
      editFeeNameInput.removeAttribute("list");
    }
  }

  function openEditFeeModal() {
    if (!editFeeModal) return;
    editFeeForm?.reset();
    updateEditFeeNameList(editFeeTypeSelect?.value ?? "dealer");
    setEditFeeStatus("");
    editFeeModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      editFeeNameInput?.focus();
      editFeeNameInput?.select?.();
    });
  }

  function closeEditFeeModal() {
    if (!editFeeModal) return;
    editFeeModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    editFeeForm?.reset();
    setEditFeeStatus("");
    formatInputEl(editFeeAmountInput);
    updateEditFeeNameList(editFeeTypeSelect?.value ?? "dealer");
  }

  function getFeeStateByType(type) {
    return type === "gov" ? govFeeSetState : dealerFeeSetState;
  }

  function getSuggestionStoreByType(type) {
    return type === "gov" ? govFeeSuggestionStore : dealerFeeSuggestionStore;
  }

  async function handleEditFeeSubmit(event) {
    event.preventDefault();
    if (!editFeeForm || !editFeeNameInput || !editFeeAmountInput) return;

    const typeValue = editFeeTypeSelect?.value === "gov" ? "gov" : "dealer";
    const rawName = editFeeNameInput.value ?? "";
    const trimmedName = rawName.trim();
    if (!trimmedName) {
      setEditFeeStatus("Description is required.", "error");
      editFeeNameInput.focus();
      return;
    }
    const amountValue = evaluateCurrencyValue(editFeeAmountInput.value ?? "");
    if (amountValue == null || Number.isNaN(amountValue)) {
      setEditFeeStatus("Enter a valid amount.", "error");
      editFeeAmountInput.focus();
      return;
    }
    const normalizedAmount = normalizeCurrencyNumber(amountValue) ?? 0;

    setEditFeeFormDisabled(true);
    setEditFeeStatus("Saving...");

    try {
      const state = getFeeStateByType(typeValue);
      const tableName =
        typeValue === "gov" ? "gov_fee_sets" : "dealer_fee_sets";
      if (!state.id) {
        setEditFeeStatus("Active fee set not available.", "error");
        return;
      }

      const normalizedName = toTitleCase(trimmedName);
      const items = Array.isArray(state.items)
        ? state.items.map((item) => ({ ...item }))
        : [];

      let found = false;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] ?? {};
        const existingName =
          typeof item?.name === "string" ? item.name.trim().toLowerCase() : "";
        if (existingName && existingName === normalizedName.toLowerCase()) {
          items[i] = {
            ...item,
            name: normalizedName,
            amount: normalizedAmount,
          };
          found = true;
          break;
        }
      }

      if (!found) {
        items.push({ name: normalizedName, amount: normalizedAmount });
      }

      const updatedItems = items.map((item) => {
        const amountNumber = normalizeCurrencyNumber(
          typeof item?.amount === "number" ? item.amount : Number(item?.amount)
        );
        return {
          ...item,
          name: typeof item?.name === "string" ? item.name : normalizedName,
          amount: amountNumber ?? 0,
        };
      });

      const { data: updatedRows, error } = await supabase
        .from(tableName)
        .update({ items: updatedItems })
        .eq("id", state.id)
        .select("id, items");
      if (error) throw error;

      const returnedItems =
        Array.isArray(updatedRows) && updatedRows[0]?.items
          ? updatedRows[0].items
          : updatedItems;

      state.items = Array.isArray(returnedItems) ? returnedItems : updatedItems;
      const normalized = normalizeFeeItems(state.items);
      const store = getSuggestionStoreByType(typeValue);
      store?.setItems(normalized);
      setEditFeeStatus("Fee saved.", "success");
      await (typeValue === "gov"
        ? loadGovFeeSuggestions()
        : loadDealerFeeSuggestions());
      closeEditFeeModal();
      recomputeDeal();
    } catch (error) {
      console.error("Failed to save fee", error);
      const message =
        error?.message ?? "Unable to save fee. Please try again in a moment.";
      setEditFeeStatus(message, "error");
    } finally {
      setEditFeeFormDisabled(false);
    }
  }

  function setModalInputsDisabled(disabled) {
    if (!modalFields) return;
    Object.values(modalFields).forEach((input) => {
      if (
        input instanceof HTMLInputElement ||
        (input && typeof input === "object" && "disabled" in input)
      ) {
        try {
          input.disabled = Boolean(disabled);
        } catch {
          /* noop */
        }
      }
    });
  }

  function fillModalFields(vehicle) {
    if (!modalFields) return;
    const v = vehicle ?? {};
    const vinFromData = typeof v?.vin === "string" ? v.vin.trim() : "";
    const listingLooksLikeVin =
      typeof v?.listing_id === "string" &&
      /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(v.listing_id)
        ? v.listing_id.trim()
        : "";
    if (modalFields.vin) {
      modalFields.vin.value = (
        vinFromData ||
        listingLooksLikeVin ||
        ""
      ).toUpperCase();
    }
    const fallbackVin = normalizeVin(vinFromData || listingLooksLikeVin || "");
    vinEnrichmentState = {
      vin: fallbackVin,
      payload: null,
      fetchedAt: 0,
    };
    if (modalFields.vehicle) modalFields.vehicle.value = v.vehicle ?? "";
    if (modalFields.year)
      modalFields.year.value = v.year != null ? String(v.year) : "";
    if (modalFields.make) modalFields.make.value = v.make ?? "";
    if (modalFields.model) modalFields.model.value = v.model ?? "";
    if (modalFields.trim) modalFields.trim.value = v.trim ?? "";
    if (modalFields.mileage)
      modalFields.mileage.value = v.mileage != null ? String(v.mileage) : "";
    if (modalFields.asking_price) {
      modalFields.asking_price.value =
        v.asking_price != null ? formatToUSDString(v.asking_price) : "";
    }
    if (
      modalFields.dealer_address ||
      modalFields.dealer_street ||
      modalFields.dealer_city ||
      modalFields.dealer_state ||
      modalFields.dealer_zip ||
      modalFields.dealer_lat ||
      modalFields.dealer_lng
    ) {
      if (vehicle) {
        const latRaw =
          v.dealer_lat ?? v.dealer_latitude ?? v.dealerLatitude ?? null;
        const lngRaw =
          v.dealer_lng ?? v.dealer_longitude ?? v.dealerLongitude ?? null;
        const latNumeric = latRaw != null ? parseDecimal(String(latRaw)) : null;
        const lngNumeric = lngRaw != null ? parseDecimal(String(lngRaw)) : null;
        applyModalDealerLocation({
          street: v.dealer_street ?? v.dealer_address ?? "",
          city: v.dealer_city ?? "",
          state: v.dealer_state ?? "",
          zip: v.dealer_zip ?? "",
          lat: latNumeric,
          lng: lngNumeric,
          name: v.dealer_name ?? "",
          phone: v.dealer_phone ?? "",
          formattedAddress:
            v.dealer_address_display ??
            buildDealerAddress({
              street: v.dealer_street ?? v.dealer_address,
              city: v.dealer_city,
              state: v.dealer_state,
              zip: v.dealer_zip,
            }),
        });
      } else {
        clearModalDealerLocation();
      }
    }
  }

  function deriveVinPrefillFromRecords(records, vin) {
    if (!Array.isArray(records) || records.length === 0) return null;

    const PRICE_PATHS = [
      "price",
      "list_price",
      "current_price",
      "asking_price",
      "sale_price",
      "sales_price",
      "retail_price",
    ];
    const MILEAGE_PATHS = [
      "miles",
      "mileage",
      "odometer",
      "odometer_reading",
      "odom_reading",
    ];
    const DEALER_NAME_PATHS = [
      "dealer.name",
      "seller_name",
      "seller.name",
      "store.name",
    ];
    const DEALER_STREET_PATHS = [
      "dealer.street",
      "dealer.address",
      "dealer.address_line",
      "seller_address",
      "location.address",
    ];
    const DEALER_CITY_PATHS = ["dealer.city", "seller_city", "location.city"];
    const DEALER_STATE_PATHS = [
      "dealer.state",
      "seller_state",
      "location.state",
    ];
    const DEALER_ZIP_PATHS = [
      "dealer.zip",
      "seller_zip",
      "location.zip",
      "dealer.postal_code",
    ];
    const DEALER_PHONE_PATHS = [
      "dealer.phone",
      "seller_phone",
      "contact_phone",
      "phone",
    ];
    const DEALER_LAT_PATHS = [
      "dealer.latitude",
      "dealer.lat",
      "dealer.geo.lat",
      "dealer.location.lat",
    ];
    const DEALER_LNG_PATHS = [
      "dealer.longitude",
      "dealer.lng",
      "dealer.geo.lng",
      "dealer.location.lon",
      "dealer.location.lng",
    ];
    const DEALER_ADDRESS_PATHS = [
      "dealer.formatted_address",
      "formatted_address",
      "dealer.address_full",
      "dealer.full_address",
    ];
    const VIN_PATHS = ["vin", "vehicle.vin", "build.vin"];
    const YEAR_PATHS = ["build.year", "vehicle.year", "year", "specs.year"];
    const MAKE_PATHS = ["build.make", "vehicle.make", "make"];
    const MODEL_PATHS = ["build.model", "vehicle.model", "model"];
    const TRIM_PATHS = ["build.trim", "vehicle.trim", "trim"];
    const HEADING_PATHS = ["heading", "title", "vehicle", "description"];
    const LISTING_ID_PATHS = ["listing_id", "id", "listingId", "mc_listing_id"];
    const LISTING_URL_PATHS = ["vdp_url", "url", "deep_link", "dealer.website"];
    const SOURCE_PATHS = ["source", "listing_source", "origin"];

    const enriched = records.map((entry, index) => {
      const timestamps = [
        entry?.last_seen_at,
        entry?.last_seen,
        entry?.updated_at,
        entry?.scraped_at,
        entry?.list_date,
        entry?.first_seen,
        entry?.created_at,
      ]
        .map((value) => parseVinTimestamp(value))
        .filter((value) => typeof value === "number");
      const recency = timestamps.length ? Math.max(...timestamps) : 0;
      const hasPrice = PRICE_PATHS.some((path) => {
        const value = getNestedValue(entry, path);
        return value !== undefined && value !== null && value !== "";
      });
      const hasDealer = DEALER_NAME_PATHS.some((path) => {
        const value = getNestedValue(entry, path);
        return value !== undefined && value !== null && value !== "";
      });
      const hasLocation =
        DEALER_CITY_PATHS.some((path) => {
          const value = getNestedValue(entry, path);
          return value !== undefined && value !== null && value !== "";
        }) ||
        DEALER_STATE_PATHS.some((path) => {
          const value = getNestedValue(entry, path);
          return value !== undefined && value !== null && value !== "";
        });
      const hasUrl = LISTING_URL_PATHS.some((path) => {
        const value = getNestedValue(entry, path);
        return value !== undefined && value !== null && value !== "";
      });
      const richness =
        (hasPrice ? 8 : 0) +
        (hasDealer ? 4 : 0) +
        (hasLocation ? 2 : 0) +
        (hasUrl ? 1 : 0);
      return { entry, index, recency, richness };
    });

    enriched.sort((a, b) => {
      if (b.richness !== a.richness) return b.richness - a.richness;
      if (b.recency !== a.recency) return b.recency - a.recency;
      return a.index - b.index;
    });

    const ordered = enriched;

    const vinNormalized =
      normalizeVin(
        coalesceFromEntries(ordered, VIN_PATHS, normalizeVin) || vin || ""
      ) || "";
    const year = coalesceFromEntries(ordered, YEAR_PATHS, parseInteger);
    const make = coalesceFromEntries(ordered, MAKE_PATHS, (value) =>
      String(value).trim()
    );
    const model = coalesceFromEntries(ordered, MODEL_PATHS, (value) =>
      String(value).trim()
    );
    const trim = coalesceFromEntries(ordered, TRIM_PATHS, (value) =>
      String(value).trim()
    );
    const heading = coalesceFromEntries(ordered, HEADING_PATHS, (value) =>
      String(value).trim()
    );
    const milesRaw = coalesceFromEntries(ordered, MILEAGE_PATHS, parseInteger);
    const priceRaw = coalesceFromEntries(ordered, PRICE_PATHS, parseDecimal);
    const dealerName = coalesceFromEntries(
      ordered,
      DEALER_NAME_PATHS,
      (value) => String(value).trim()
    );
    const dealerStreet = coalesceFromEntries(
      ordered,
      DEALER_STREET_PATHS,
      (value) => String(value).trim()
    );
    const dealerCity = coalesceFromEntries(
      ordered,
      DEALER_CITY_PATHS,
      (value) => String(value).trim()
    );
    const dealerState = coalesceFromEntries(
      ordered,
      DEALER_STATE_PATHS,
      (value) => String(value).trim()
    );
    const dealerZip = coalesceFromEntries(ordered, DEALER_ZIP_PATHS, (value) =>
      String(value).trim()
    );
    const dealerPhone = coalesceFromEntries(
      ordered,
      DEALER_PHONE_PATHS,
      (value) => String(value).trim()
    );
    const dealerLat = coalesceFromEntries(
      ordered,
      DEALER_LAT_PATHS,
      parseFloatOrNull
    );
    const dealerLng = coalesceFromEntries(
      ordered,
      DEALER_LNG_PATHS,
      parseFloatOrNull
    );
    const dealerAddressDisplay = coalesceFromEntries(
      ordered,
      DEALER_ADDRESS_PATHS,
      (value) => String(value).trim()
    );
    const listingId = coalesceFromEntries(ordered, LISTING_ID_PATHS, (value) =>
      String(value).trim()
    );
    const listingUrl = coalesceFromEntries(
      ordered,
      LISTING_URL_PATHS,
      (value) => String(value).trim()
    );
    const listingSource = coalesceFromEntries(ordered, SOURCE_PATHS, (value) =>
      String(value).trim()
    );

    const askingPrice =
      priceRaw != null ? normalizeCurrencyNumber(priceRaw) : null;
    const mileage = milesRaw != null ? milesRaw : null;

    const normalizedDealerState = dealerState
      ? dealerState.slice(0, 2).toUpperCase()
      : "";
    const normalizedDealerCity = dealerCity ? toTitleCase(dealerCity) : "";
    const normalizedDealerStreet = dealerStreet
      ? toTitleCase(dealerStreet)
      : "";
    const normalizedDealerZip = dealerZip ? normalizePostalCode(dealerZip) : "";
    const normalizedDealerName = dealerName ? toTitleCase(dealerName) : "";

    const vehicleLabel =
      heading ||
      [year != null ? String(year) : null, make, model, trim]
        .filter(Boolean)
        .join(" ") ||
      null;

    return {
      vin: vinNormalized || null,
      vehicle: vehicleLabel,
      year: year ?? null,
      make: make ? toTitleCase(make) : null,
      model: model ? toTitleCase(model) : null,
      trim: trim ? String(trim).trim() : null,
      mileage,
      asking_price: askingPrice,
      dealer_name: normalizedDealerName || null,
      dealer_street: normalizedDealerStreet || null,
      dealer_city: normalizedDealerCity || null,
      dealer_state: normalizedDealerState || null,
      dealer_zip: normalizedDealerZip || null,
      dealer_phone: dealerPhone || null,
      dealer_lat: Number.isFinite(dealerLat) ? dealerLat : null,
      dealer_lng: Number.isFinite(dealerLng) ? dealerLng : null,
      dealer_address_display: dealerAddressDisplay || null,
      listing_id:
        listingId || (vinNormalized ? `vin-history:${vinNormalized}` : null),
      listing_source: listingSource || "marketcheck:vin-history",
      listing_url: listingUrl || null,
    };
  }

  async function fetchVinHistoryRecords(vin) {
    const normalizedVin = normalizeVin(vin);
    if (!normalizedVin) return [];
    if (vinHistoryCache.has(normalizedVin)) {
      return vinHistoryCache.get(normalizedVin) ?? [];
    }
    try {
      const result = await mcHistory(normalizedVin);
      const historyPayload =
        result?.history !== undefined ? result.history : result ?? [];
      const records = Array.isArray(historyPayload)
        ? historyPayload
        : Array.isArray(historyPayload?.history)
        ? historyPayload.history
        : Array.isArray(historyPayload?.records)
        ? historyPayload.records
        : Array.isArray(historyPayload?.data)
        ? historyPayload.data
        : Array.isArray(historyPayload?.results)
        ? historyPayload.results
        : [];
      vinHistoryCache.set(normalizedVin, records);
      return records;
    } catch (error) {
      vinHistoryCache.delete(normalizedVin);
      throw error;
    }
  }

  function applyVinPrefillToModal(prefill) {
    if (!modalFields || !prefill) return false;
    let updated = false;

    const applyTextField = (input, value, formatter) => {
      if (!(input instanceof HTMLInputElement)) return false;
      if (value == null || value === "") return false;
      const formatterFn =
        typeof formatter === "function" ? formatter : (candidate) => candidate;
      const formatted = formatterFn(value);
      if (formatted == null || formatted === "") return false;
      const current = input.value?.trim?.() ?? "";
      if (current) return false;
      setInputValue(input, formatted);
      return true;
    };

    updated =
      applyTextField(modalFields.vehicle, prefill.vehicle, (value) =>
        String(value)
      ) || updated;
    updated =
      applyTextField(modalFields.year, prefill.year, (value) =>
        value != null ? String(value) : ""
      ) || updated;
    updated =
      applyTextField(modalFields.make, prefill.make, (value) =>
        toTitleCase(value)
      ) || updated;
    updated =
      applyTextField(modalFields.model, prefill.model, (value) =>
        toTitleCase(value)
      ) || updated;
    updated =
      applyTextField(modalFields.trim, prefill.trim, (value) =>
        String(value).trim()
      ) || updated;

    if (
      modalFields.mileage instanceof HTMLInputElement &&
      prefill.mileage != null &&
      Number.isFinite(Number(prefill.mileage))
    ) {
      const currentMileage = parseInteger(modalFields.mileage.value);
      if (currentMileage == null) {
        const mileageValue = Math.round(Math.abs(Number(prefill.mileage)));
        setInputValue(modalFields.mileage, mileageValue);
        updated = true;
      }
    }

    if (
      modalFields.asking_price instanceof HTMLInputElement &&
      prefill.asking_price != null
    ) {
      const existingValue = evaluateCurrencyValue(
        modalFields.asking_price.value
      );
      if (existingValue == null || existingValue === 0) {
        modalFields.asking_price.value = formatCurrency(prefill.asking_price);
        modalFields.asking_price.dataset.numericValue = String(
          prefill.asking_price
        );
        formatInputEl(modalFields.asking_price);
        updated = true;
      }
    }

    const existingStreet =
      modalFields.dealer_street instanceof HTMLInputElement
        ? modalFields.dealer_street.value.trim()
        : "";
    const existingCity =
      modalFields.dealer_city instanceof HTMLInputElement
        ? modalFields.dealer_city.value.trim()
        : "";
    const existingState =
      modalFields.dealer_state instanceof HTMLInputElement
        ? modalFields.dealer_state.value.trim()
        : "";
    const existingZip =
      modalFields.dealer_zip instanceof HTMLInputElement
        ? modalFields.dealer_zip.value.trim()
        : "";
    const existingName =
      modalFields.dealer_name instanceof HTMLInputElement
        ? modalFields.dealer_name.value.trim()
        : "";
    const existingPhone =
      modalFields.dealer_phone instanceof HTMLInputElement
        ? modalFields.dealer_phone.value.trim()
        : "";
    const existingLat = parseFloatOrNull(modalFields.dealer_lat?.value ?? "");
    const existingLng = parseFloatOrNull(modalFields.dealer_lng?.value ?? "");

    const mergedStreet = existingStreet || prefill.dealer_street || "";
    const mergedCity = existingCity || prefill.dealer_city || "";
    const mergedState = existingState || prefill.dealer_state || "";
    const mergedZip = existingZip || prefill.dealer_zip || "";
    const mergedName = existingName || prefill.dealer_name || "";
    const mergedPhone = existingPhone || prefill.dealer_phone || "";
    const mergedLat =
      Number.isFinite(existingLat) && existingLat != null
        ? existingLat
        : prefill.dealer_lat;
    const mergedLng =
      Number.isFinite(existingLng) && existingLng != null
        ? existingLng
        : prefill.dealer_lng;

    const shouldUpdateDealer =
      (!existingStreet && prefill.dealer_street) ||
      (!existingCity && prefill.dealer_city) ||
      (!existingState && prefill.dealer_state) ||
      (!existingZip && prefill.dealer_zip) ||
      (!existingName && prefill.dealer_name) ||
      (!existingPhone && prefill.dealer_phone) ||
      (!Number.isFinite(existingLat) && Number.isFinite(prefill.dealer_lat)) ||
      (!Number.isFinite(existingLng) && Number.isFinite(prefill.dealer_lng));

    if (shouldUpdateDealer) {
      const formattedAddress =
        prefill.dealer_address_display ||
        buildDealerAddress({
          street: mergedStreet,
          city: mergedCity,
          state: mergedState,
          zip: mergedZip,
        });
      applyModalDealerLocation({
        street: mergedStreet,
        city: mergedCity,
        state: mergedState,
        zip: mergedZip,
        lat: Number.isFinite(mergedLat) ? mergedLat : null,
        lng: Number.isFinite(mergedLng) ? mergedLng : null,
        formattedAddress,
        name: mergedName,
        phone: mergedPhone,
      });
      const latLng =
        Number.isFinite(mergedLat) && Number.isFinite(mergedLng)
          ? { lat: mergedLat, lng: mergedLng }
          : null;
      setDealerLocation({
        address: formattedAddress,
        latLng,
        name: mergedName || (modalFields.vehicle?.value ?? ""),
        phone: mergedPhone || "",
        listingId: prefill.listing_id ?? "",
      });
      updated = true;
    }

    return updated;
  }

  async function populateModalFromVin(vin, { force = false } = {}) {
    const normalizedVin = normalizeVin(vin);
    if (!normalizedVin || normalizedVin.length !== 17) return;

    const vinInput =
      modalFields?.vin instanceof HTMLInputElement ? modalFields.vin : null;
    const recentLookup =
      vinEnrichmentState.vin === normalizedVin &&
      vinEnrichmentState.payload &&
      Date.now() - (vinEnrichmentState.fetchedAt ?? 0) < 5 * 60 * 1000;
    if (recentLookup && !force) {
      applyVinPrefillToModal(vinEnrichmentState.payload);
      return;
    }

    if (vinInput) {
      vinInput.dataset.lastLookupVin = normalizedVin;
    }

    const vehiclesCacheRef = { value: vehiclesCache };
    const targetVehicleId =
      modalMode === "update" || modalMode === "delete"
        ? currentVehicleId
        : null;

    const lookupPromise = (async () => {
      setModalStatus("Fetching vehicle from MarketCheck…", "info");
      try {
        const { populateVehicleFromVinSecure } = await loadVinPopulateModule();
        const { row, payload } = await populateVehicleFromVinSecure({
          vin: normalizedVin,
          userId: currentUserId,
          vehicleId: targetVehicleId,
          vehicleSelectEl: vehicleSelect,
          vehiclesCacheRef,
          modalFields,
          homeZip: homeLocationState.postalCode,
        });
        vehiclesCache = vehiclesCacheRef.value;
        if (row?.id != null) {
          currentVehicleId = String(row.id);
        }
        renderVehicleSelectOptions(vehiclesCache);
        const prefill = payload || row || null;
        if (prefill) {
          if (prefill.vehicle && modalFields?.vehicle) {
            setInputValue(modalFields.vehicle, prefill.vehicle);
          }
          applyVinPrefillToModal(prefill);
        }
        if (modalFields?.asking_price) {
          formatInputEl(modalFields.asking_price);
        }
        vinEnrichmentState = {
          vin: normalizedVin,
          payload: prefill,
          fetchedAt: Date.now(),
        };
        syncSalePriceWithSelection();
        setModalStatus("Vehicle details loaded from MarketCheck.", "success");
      } catch (error) {
        console.error("MarketCheck VIN lookup failed", error);
        const message =
          (error && typeof error === "object" && "message" in error
            ? String(error.message)
            : null) ?? "Unable to fetch vehicle details right now.";
        setModalStatus(message, "error");
        if (vinInput) {
          delete vinInput.dataset.lastLookupVin;
        }
      }
    })();

    vinLookupPromise = lookupPromise;
    await lookupPromise;
    if (vinLookupPromise === lookupPromise) {
      vinLookupPromise = null;
    }
  }

  if (vehicleSelect instanceof HTMLSelectElement) {
    const handleVehicleSelectIntent = async (event) => {
      if (!currentUserId) {
        event?.preventDefault?.();
        const hasUser = await requireUser(true);
        if (!hasUser) {
          vehicleSelect.blur();
          return;
        }
      }
      await ensureVehiclesLoaded({ preserveSelection: true });
    };

    vehicleSelect.addEventListener("pointerdown", (event) => {
      void handleVehicleSelectIntent(event);
    });

    vehicleSelect.addEventListener("focus", (event) => {
      void handleVehicleSelectIntent(event);
    });

    vehicleSelect.addEventListener("keydown", (event) => {
      if (
        !currentUserId &&
        ["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)
      ) {
        event.preventDefault();
        void handleVehicleSelectIntent(event);
      }
    });
  }

  vehicleSelect?.addEventListener("change", (event) => {
    const select = event.target;
    currentVehicleId =
      select && typeof select.value === "string" ? select.value : "";
    syncSalePriceWithSelection();
  });

  vehicleActionButtons.forEach((button) => {
    const action = button.getAttribute("data-vehicle-action");
    if (!action || action === "find") return;

    if (action === "update") {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        void (async () => {
          const hasUser = await requireUser(true);
          if (!hasUser) return;
          await ensureVehiclesLoaded({ preserveSelection: true });
          const modalVisible =
            vehicleModal?.getAttribute("aria-hidden") === "false";
          if (!modalVisible) {
            await openModal("update");
            return;
          }
          await updateSelectedVehicleFromModal({
            triggerButton: button,
          });
        })();
      });
      return;
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      void (async () => {
        const hasUser = await requireUser(true);
        if (!hasUser) return;
        await ensureVehiclesLoaded({ preserveSelection: true });
        await openModal(action);
      })();
    });
  });

  if (editFeeForm) {
    editFeeForm.addEventListener("submit", (event) => {
      void handleEditFeeSubmit(event);
    });
  }

  if (editFeeButton) {
    editFeeButton.addEventListener("click", (event) => {
      event.preventDefault();
      void (async () => {
        const hasUser = await requireUser(true);
        if (!hasUser) return;
        updateEditFeeNameList(editFeeTypeSelect?.value ?? "dealer");
        openEditFeeModal();
      })();
    });
  }

  const editFeeDismissButtons = [editFeeCloseBtn, editFeeCancelBtn];
  editFeeDismissButtons.forEach((button) => {
    button?.addEventListener("click", (event) => {
      event.preventDefault();
      closeEditFeeModal();
    });
  });

  editFeeTypeSelect?.addEventListener("change", (event) => {
    const { value } = event.target ?? {};
    updateEditFeeNameList(value === "gov" ? "gov" : "dealer");
  });

  editFeeModal?.addEventListener("click", (event) => {
    if (event.target === editFeeModal) {
      closeEditFeeModal();
    }
  });

  document.addEventListener("click", (event) => {
    const btn =
      event.target instanceof Element
        ? event.target.closest("[data-vehicle-action='populate-from-vin']")
        : null;
    if (!btn) return;
    event.preventDefault();
    if (!(modalFields?.vin instanceof HTMLInputElement)) return;
    const vinInput = modalFields.vin;
    const normalizedVin = normalizeVin(vinInput.value);
    if (!normalizedVin) {
      setModalStatus("Enter a VIN to populate.", "error");
      vinInput.focus();
      return;
    }
    vinInput.value = normalizedVin;
    const vehiclesCacheRef = { value: vehiclesCache };
    const originalText = btn.textContent ?? "Populate from VIN";
    btn.disabled = true;
    btn.textContent = "Populating…";
    setModalStatus("Fetching vehicle from MarketCheck…");
    (async () => {
      try {
        const hasUser = await requireUser(true);
        if (!hasUser) {
          setModalStatus("Sign in to populate a vehicle.", "error");
          return;
        }
        const { populateVehicleFromVinSecure } = await loadVinPopulateModule();
        const { row, payload } = await populateVehicleFromVinSecure({
          vin: normalizedVin,
          userId: currentUserId,
          vehicleId: currentVehicleId,
          vehicleSelectEl: vehicleSelect,
          vehiclesCacheRef,
          modalFields,
          homeZip: homeLocationState.postalCode,
        });
        const data = row;
        vehiclesCache = vehiclesCacheRef.value;
        if (data?.id != null) {
          currentVehicleId = String(data.id);
        }
        renderVehicleSelectOptions(vehiclesCache);
        if (modalFields?.vin instanceof HTMLInputElement) {
          modalFields.vin.dataset.lastLookupVin = normalizeVin(
            data?.vin ?? normalizedVin
          );
        }
        if (payload?.vehicle && modalFields?.vehicle) {
          setInputValue(modalFields.vehicle, payload.vehicle);
        }
        const prefill = payload || data || null;
        if (prefill) {
          applyVinPrefillToModal(prefill);
        }
        if (modalFields?.asking_price) {
          formatInputEl(modalFields.asking_price);
        }
        vinEnrichmentState = {
          vin: normalizedVin,
          payload: payload || data || null,
          fetchedAt: Date.now(),
        };
        syncSalePriceWithSelection();
        setModalStatus("Populated via MarketCheck.", "success");
      } catch (error) {
        console.error("VIN populate failed", error);
        const message =
          (error && typeof error === "object" && "message" in error
            ? String(error.message)
            : null) ?? "Unable to populate vehicle.";
        setModalStatus(message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    })();
  });

  const clearButton = document.querySelector(
    ".flexSpace.vehicleButtons button"
  );
  if (clearButton instanceof HTMLButtonElement) {
    clearButton.type = "button";
    clearButton.addEventListener("click", (event) => {
      event.preventDefault();
      clearCalculator();
    });
  }

  modalSecondaryBtn?.addEventListener("click", closeModal);
  modalCloseBtn?.addEventListener("click", closeModal);
  modalPrimaryBtn?.addEventListener("click", () => {
    if (!vehicleModalForm) return;
    if (typeof vehicleModalForm.requestSubmit === "function") {
      vehicleModalForm.requestSubmit();
    } else {
      vehicleModalForm.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    }
  });

  vehicleModal?.addEventListener("click", (event) => {
    if (event.target === vehicleModal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (vehicleModal?.getAttribute("aria-hidden") === "false") {
      if (
        event.key === "Enter" &&
        modalFields?.vin instanceof HTMLInputElement &&
        document.activeElement === modalFields.vin
      ) {
        event.preventDefault();
        void (async () => {
          const hasUser = await requireUser(true);
          if (!hasUser) return;
          await populateModalFromVin(modalFields.vin.value, { force: true });
        })();
        return;
      }
      if (event.key === "Escape") {
        closeModal();
      }
    }
  });

  if (modalFields?.vin instanceof HTMLInputElement) {
    modalFields.vin.addEventListener("input", handleVinInput);
    modalFields.vin.addEventListener("change", handleVinLookup);
    modalFields.vin.addEventListener("blur", handleVinLookup);
  }

  loginLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const attr = link.getAttribute("data-auth-link") || "";
      const desiredMode = attr.toLowerCase() === "signup" ? "signup" : "signin";
      void openAuthModal(desiredMode);
    });
  });

  authModeToggleBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    const nextMode = authMode === "signup" ? "signin" : "signup";
    setAuthMode(nextMode, { resetStatus: true, clearPassword: true });
    setAuthModalInputsDisabled(false);
    if (authEmailInput instanceof HTMLInputElement) {
      authEmailInput.focus();
      authEmailInput.select?.();
    }
  });

  authModalCloseBtn?.addEventListener("click", () => closeAuthModal(false));
  authModalSecondaryBtn?.addEventListener("click", () => closeAuthModal(false));

  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(authEmailInput instanceof HTMLInputElement)) return;
    if (!(authPasswordInput instanceof HTMLInputElement)) return;

    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;
    if (!email || !password) {
      setAuthModalStatus("Email and password are required.", "error");
      return;
    }

    const copy = AUTH_MODE_COPY[authMode] ?? AUTH_MODE_COPY.signin;
    setAuthModalInputsDisabled(true);
    setAuthModalStatus(copy.pending);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data?.session) {
          applySession(data.session);
          closeAuthModal(true);
          return;
        }
        setAuthModalInputsDisabled(false);
        setAuthModalStatus(AUTH_MODE_COPY.signup.success, "success");
        setAuthMode("signin", { resetStatus: false, clearPassword: true });
        if (authEmailInput instanceof HTMLInputElement) {
          authEmailInput.value = email;
          requestAnimationFrame(() => {
            authEmailInput.focus();
            authEmailInput.select?.();
          });
        }
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (data?.session) {
        applySession(data.session);
      } else {
        await hydrateSession();
      }
      if (!currentUserId) {
        setAuthModalInputsDisabled(false);
        setAuthModalStatus("Login failed. Please try again.", "error");
        return;
      }
      closeAuthModal(true);
    } catch (error) {
      console.error("Supabase auth failed", error);
      const message =
        (error && typeof error === "object" && "message" in error
          ? String(error.message)
          : null) ?? "Unable to process request. Please try again.";
      setAuthModalStatus(message, "error");
      setAuthModalInputsDisabled(false);
    }
  });

  async function handleModalSubmit(event) {
    event.preventDefault();
    if (!modalFields) return;

    if (modalMode === "delete") {
      const hasUser = await requireUser(true);
      if (!hasUser) return;
      if (!currentVehicleId) {
        setModalStatus("Select a vehicle to delete.", "error");
        return;
      }
      setModalInputsDisabled(true);
      modalPrimaryBtn?.setAttribute("disabled", "true");
      setModalStatus("Deleting vehicle…", "info");
      try {
        const { error } = await supabase
          .from(VEHICLES_TABLE)
          .delete()
          .eq("id", currentVehicleId)
          .eq("user_id", currentUserId);
        if (error) throw error;
        vehiclesCache = vehiclesCache.filter(
          (item) => String(item.id) !== String(currentVehicleId)
        );
        currentVehicleId = "";
        renderVehicleSelectOptions(vehiclesCache);
        syncSalePriceWithSelection();
        closeModal();
      } catch (error) {
        console.error("Vehicle delete failed", error);
        const message =
          (error && typeof error === "object" && "message" in error
            ? String(error.message)
            : null) ?? "Unable to delete vehicle.";
        setModalStatus(message, "error");
      } finally {
        setModalInputsDisabled(false);
        modalPrimaryBtn?.removeAttribute("disabled");
      }
      return;
    }

    if (modalMode === "update") {
      await updateSelectedVehicleFromModal();
      return;
    }

    const hasUser = await requireUser(true);
    if (!hasUser) return;

    const { vin, payload } = collectVehicleModalPayload();
    if (vin && vin.length !== 17) {
      setModalStatus("Enter a valid 17-character VIN.", "error");
      modalFields.vin?.focus();
      return;
    }

    const record = pickDefined({
      ...payload,
      user_id: currentUserId,
    });
    record.vin = vin;

    setModalInputsDisabled(true);
    modalPrimaryBtn?.setAttribute("disabled", "true");
    setModalStatus("Saving vehicle…", "info");

    try {
      const insertRecord = async () => {
        const { data, error } = await supabase
          .from(VEHICLES_TABLE)
          .insert(record)
          .select(VEHICLE_SELECT_COLUMNS)
          .single();
        if (error) throw error;
        return data;
      };

      const mapRowToVehicle = (data) =>
        data
          ? {
              ...data,
              id:
                typeof data.id === "number" || typeof data.id === "bigint"
                  ? String(data.id)
                  : data.id ?? "",
            }
          : null;

      let normalized = null;
      let duplicateHandled = false;

      try {
        const data = await insertRecord();
        normalized = mapRowToVehicle(data);
      } catch (error) {
        if (DUPLICATE_VEHICLE_REGEX.test(error?.message || "")) {
          if (!vin) {
            setModalStatus(
              "Duplicate vehicle detected. Enter a VIN to replace the existing record.",
              "error"
            );
            return;
          }
          try {
            setModalStatus(
              "Duplicate vehicle found. Replacing previous save…",
              "info"
            );
            const deleteQuery = supabase
              .from(VEHICLES_TABLE)
              .delete()
              .eq("user_id", currentUserId)
              .eq("vin", vin);
            const { error: deleteError } = await deleteQuery;
            if (deleteError) throw deleteError;
            vehiclesCache = vehiclesCache.filter((vehicle) => {
              const vehicleVin = normalizeVin(vehicle?.vin ?? "");
              return vehicleVin !== vin;
            });
            renderVehicleSelectOptions(vehiclesCache);
            const replacement = await insertRecord();
            normalized = mapRowToVehicle(replacement);
            duplicateHandled = true;
          } catch (replacementError) {
            console.error(
              "Vehicle save duplicate replacement failed",
              replacementError
            );
            const message =
              replacementError &&
              typeof replacementError === "object" &&
              "message" in replacementError
                ? String(replacementError.message)
                : "Unable to replace existing vehicle.";
            setModalStatus(message, "error");
            return;
          }
        } else {
          console.error("Vehicle save failed", error);
          const rlsRegex = /row-level security/i;
          const message = rlsRegex.test(error?.message || "")
            ? "Supabase blocked the save because row-level security is still enforced. Update the public.vehicles policies to allow this operation or sign in."
            : error && typeof error === "object" && "message" in error
            ? String(error.message)
            : "Unable to save vehicle.";
          setModalStatus(message, "error");
          return;
        }
      }

      if (!normalized) {
        setModalStatus("Vehicle save failed. Please try again.", "error");
        return;
      }

      if (normalized?.id != null) {
        currentVehicleId = normalized.id;
      }
      if (normalized) {
        upsertVehicleInCache(normalized);
        renderVehicleSelectOptions(vehiclesCache);
        setSalePriceFromVehicle(normalized);
        await Promise.resolve(setDealerLocationFromVehicle?.(normalized));
        fillModalFields(normalized);
      } else {
        renderVehicleSelectOptions(vehiclesCache);
      }

      modalMode = "update";
      if (modalTitle) {
        modalTitle.textContent = "Update Vehicle";
      }
      if (modalPrimaryBtn) {
        modalPrimaryBtn.textContent = "Update";
      }

      const successMessage = duplicateHandled
        ? "Vehicle replaced with latest details."
        : "Vehicle saved.";
      setModalStatus(successMessage, "success");
      await loadVehicles(currentVehicleId);
    } finally {
      setModalInputsDisabled(false);
      modalPrimaryBtn?.removeAttribute("disabled");
    }
  }

  window.addEventListener("unhandledrejection", (event) => {
    if (
      event?.reason &&
      typeof event.reason === "object" &&
      "message" in event.reason &&
      typeof event.reason.message === "string" &&
      event.reason.message.includes("row-level security")
    ) {
      event.preventDefault();
      setModalStatus(String(event.reason.message), "error");
    }
  });

  vehicleModalForm?.addEventListener("submit", handleModalSubmit);

  async function initializeApp() {
    attachCalculatorEventListeners();
    await initAuthAndVehicles();
    await ensureVehiclesLoaded({ preserveSelection: true });
    await Promise.all([loadDealerFeeSuggestions(), loadGovFeeSuggestions()]);
    updateEditFeeNameList(editFeeTypeSelect?.value ?? "dealer");
    if (stateTaxInput) {
      if (!stateTaxInput.value || !stateTaxInput.value.trim()) {
        stateTaxInput.value = "6.0%";
      }
      formatInputEl(stateTaxInput);
    }
    if (countyTaxInput) {
      if (!countyTaxInput.value || !countyTaxInput.value.trim()) {
        countyTaxInput.value = "1.0%";
      }
      formatInputEl(countyTaxInput);
    }
    if (dealerFeeAmountInput) {
      formatInputEl(dealerFeeAmountInput);
    }
    if (govFeeAmountInput) {
      formatInputEl(govFeeAmountInput);
    }
    formatInputEl(tradeOfferInput);
    formatInputEl(tradePayoffInput);
    formatInputEl(salePriceInput);
    formatInputEl(affordabilityPaymentInput);
    formatInputEl(affordabilityAprInput);
    formatInputEl(editFeeAmountInput);
    if (creditScoreInput instanceof HTMLInputElement) {
      if (!creditScoreInput.value || !creditScoreInput.value.trim()) {
        creditScoreInput.value = "750";
      }
    }
    normalizePercentInput(financeAprInput);
    normalizePercentInput(affordabilityAprInput);
    affordAprUserOverride = false;
    syncAffordAprWithFinance({ force: true });
    syncAffordTermWithFinance();
    loadGooglePlacesScript();
    if (floatingAprOutput) {
      const aprDisplay = getPercentInputValue(financeAprInput, DEFAULT_APR);
      floatingAprOutput.textContent = formatPercent(aprDisplay ?? DEFAULT_APR);
    }
    if (floatingTermOutput) {
      const termDisplay =
        parseInteger(financeTermInput?.value) ?? DEFAULT_TERM_MONTHS;
      floatingTermOutput.textContent = `${termDisplay} mo`;
    }
    if (floatingMaxFinancedOutput) {
      setCurrencyOutput(floatingMaxFinancedOutput, 0, { forceZero: true });
    }
    const initialSource = rateSourceSelect?.value;
    if (initialSource && initialSource !== RATE_SOURCE_USER_DEFINED) {
      try {
        await applyCurrentRate({ silent: false });
      } catch (error) {
        console.error("Initial rate sync failed", error);
        recomputeDeal();
      }
    } else {
      recomputeDeal();
    }
    void updateDirectionsMap();
  }

  void initializeApp();

  // 5) Minimal debug to verify the hook is active
  console.debug(
    "[usdFormat] handlers attached:",
    document.querySelectorAll(USD_SELECTOR).length
  );

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const swUrl = new URL(
        "service-worker.js",
        window.location.href
      ).toString();
      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.debug("Service worker registered", registration.scope);
          return registration;
        })
        .catch((error) => {
          console.error("Service worker registration failed", error);
        });
    });
  }
});

/* ---- Affordability wiring: live updates + initial render ---- */
(function ensureAffordabilityWiring() {
  const q = (s) => document.querySelector(s);

  const pmts = [
    window.affordabilityPaymentInput,
    q("#affordability"),
    q("#desiredMonthlyPmt"),
    q('[data-role="affordability-payment"]'),
  ].filter(Boolean);

  const aprs = [
    window.affordabilityAprInput,
    q("#affordApr"),
    q('[data-role="affordability-apr"]'),
    window.financeAprInput,
  ].filter(Boolean);

  const terms = [
    window.affordabilityTermInput,
    q("#affordTerm"),
    q('[data-role="affordability-term"]'),
    window.financeTermInput,
  ].filter(Boolean);

  const hook = (el) => {
    if (!el) return;
    ["input", "change", "keyup"].forEach((evt) => {
      el.addEventListener(evt, () => {
        try {
          recomputeAffordability({
            totalFeesAndTaxes: window.totalFeesAndTaxes ?? 0,
            financeTaxesFees: !!window.financeTaxesFees,
            negEquityFinanced: window.negEquityFinanced ?? 0,
            cashOutAmount: window.cashOutAmount ?? 0,
          });
        } catch (_e) {}
      });
    });
  };

  pmts.forEach(hook);
  aprs.forEach(hook);
  terms.forEach(hook);

  const kick = () => {
    try {
      recomputeAffordability({
        totalFeesAndTaxes: window.totalFeesAndTaxes ?? 0,
        financeTaxesFees: !!window.financeTaxesFees,
        negEquityFinanced: window.negEquityFinanced ?? 0,
        cashOutAmount: window.cashOutAmount ?? 0,
      });
    } catch (_e) {}
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", kick, { once: true });
  } else {
    kick();
  }
})();
