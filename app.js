import { createClient } from "@supabase/supabase-js";
import creditTiers from "./config/credit-tiers.json";
import lendersConfig from "./config/lenders.json";
import { createRatesEngine } from "./rates/provider-engine.mjs";

const SUPABASE_URL = "https://txndueuqljeujlccngbj.supabase.co";
const SUPABASE_KEY = "sb_publishable_iq_fkrkjHODeoaBOa3vvEA_p9Y3Yz8X";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ratesEngine = createRatesEngine({ supabase });
const VEHICLES_TABLE = "vehicles";

// Format inputs to accounting-style USD on Enter and on blur.
// Works for any input with class="usdFormat".
document.addEventListener("DOMContentLoaded", () => {
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
  const GOOGLE_MAPS_API_KEY = "AIzaSyC5LXJ43CBBfA5d-zAl03NBXwMVML2FMA8";
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
  const calculatorForm = document.querySelector("#calculatorCard form.grid");
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
  const calculatorCard = document.getElementById("calculatorCard");
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
  const rateSourceStatusOutput = document.getElementById("rateSourceStatus");
  const financeTFNoteOutput = document.getElementById("financeTFNote");
  const financeNegEquityNoteOutput = document.getElementById(
    "financeNegEquityNote"
  );
  const cashOutEquityNoteOutput = document.getElementById("cashOutEquityNote");
  const affordabilityPaymentInput = document.getElementById("affordability");
  const affordabilityAprInput = document.getElementById("affordApr");
  const affordabilityTermInput = document.getElementById("affordTerm");
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
  const modalTitle = document.getElementById("vehicleModalTitle");
  const modalStatusEl = vehicleModalForm?.querySelector(".modalStatus") ?? null;
  const modalPrimaryBtn =
    vehicleModalForm?.querySelector(".modalPrimary") ?? null;
  const modalSecondaryBtn =
    vehicleModalForm?.querySelector(".modalSecondary") ?? null;
  const modalCloseBtn = vehicleModal?.querySelector(".modalClose") ?? null;
  const authModalStatusEl = authForm?.querySelector(".modalStatus") ?? null;
  const authModalPrimaryBtn = authForm?.querySelector(".modalPrimary") ?? null;
  const authModalSecondaryBtn =
    authForm?.querySelector(".modalSecondary") ?? null;
  const authModalCloseBtn = authModal?.querySelector(".modalClose") ?? null;
  const vehicleActionButtons = Array.from(
    document.querySelectorAll("[data-vehicle-action]")
  );

  const modalFields = vehicleModalForm
    ? {
        vehicle: document.getElementById("modalVehicleName"),
        year: document.getElementById("modalYear"),
        make: document.getElementById("modalMake"),
        model: document.getElementById("modalModel"),
        trim: document.getElementById("modalTrim"),
        mileage: document.getElementById("modalMileage"),
        asking_price: document.getElementById("modalAskingPrice"),
      }
    : null;

  let vehiclesCache = [];
  let currentVehicleId = vehicleSelect?.value ?? "";
  let modalMode = "add";
  let currentAskingPrice = null;
  let currentUserId = null;
  let authModalResolve = null;
  let authModalPromise = null;
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
      savingsNote.textContent = `You are saving ${formatCurrency(diff)}`;
      savingsNote.dataset.value = String(diff);
      return;
    }

    savingsNote.textContent = `Paying ${formatCurrency(
      Math.abs(diff)
    )} above asking`;
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
    const winnerLongName =
      winner.provider?.longName ||
      winner.provider?.shortName ||
      winner.provider?.source ||
      "Provider";
    const winnerShortName =
      winner.provider?.shortName ||
      winner.provider?.source ||
      winnerLongName;

    if (financeAprInput instanceof HTMLInputElement) {
      const aprDecimal = Math.max(winner.apr, MIN_APR);
      financeAprInput.value = formatPercent(aprDecimal);
      financeAprInput.dataset.numericValue = String(aprDecimal);
    }

    lowestAprProviderName = `Lowest Price by APR — ${winnerLongName}`;
    syncRateSourceName();
    const winnerDisplay =
      winnerShortName === winnerLongName
        ? winnerLongName
        : `${winnerShortName} (${winnerLongName})`;
    const statusNote =
      winner.note ||
      `Best available rate: ${winnerDisplay} at ${formatPercent(winner.apr)}`;
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
    if (document.getElementById("google-maps-script")) {
      if (typeof window !== "undefined" && window.google?.maps?.places) {
        initLocationAutocomplete();
      }
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=initLocationAutocomplete&loading=async&v=beta`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
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
        fields: ["address_components", "formatted_address"],
        types: ["(regions)"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const components = place?.address_components ?? [];
        let stateCode = "";
        let countyName = "";
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
        });
        applyLocale({ stateCode, countyName });
      });
      return;
    }

    const extractStateCountyFromComponents = (components) => {
      let stateCode = "";
      let countyName = "";
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
      }
      return { stateCode, countyName };
    };

    const geocodeCountyByLocation = (loc) =>
      new Promise((resolve) => {
        try {
          const geocoder = new maps.Geocoder();
          geocoder.geocode(
            {
              location: loc,
              result_type: ["administrative_area_level_2"],
            },
            (results, status) => {
              if (status === "OK" && Array.isArray(results) && results[0]) {
                const comps = results[0].address_components || [];
                for (const component of comps) {
                  if (
                    Array.isArray(component.types) &&
                    component.types.includes("administrative_area_level_2")
                  ) {
                    const raw = component.long_name || component.short_name || "";
                    resolve(raw.replace(/\s*County$/i, "").trim());
                    return;
                  }
                }
              }
              resolve("");
            }
          );
        } catch (error) {
          console.warn("[places] county reverse geocode failed", error);
          resolve("");
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

    pac.addEventListener("gmp-select", async (event) => {
      try {
        const prediction = event?.placePrediction;
        if (!prediction || typeof prediction.toPlace !== "function") return;
        const place = prediction.toPlace();
        await place.fetchFields({
          fields: ["addressComponents", "formattedAddress", "location"],
        });

        let { stateCode, countyName } = extractStateCountyFromComponents(
          place.addressComponents
        );

        if ((!countyName || countyName === "") && place.location) {
          const resolvedCounty = await geocodeCountyByLocation(place.location);
          if (resolvedCounty) {
            countyName = resolvedCounty;
          }
        }

        applyLocale({ stateCode, countyName });
      } catch (error) {
        console.error("[places] selection handling failed", error);
      }
    });
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

  function applySession(session) {
    const userId = session?.user?.id ?? null;
    currentUserId = userId ?? null;
    return Boolean(currentUserId);
  }

  async function hydrateSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Failed to fetch auth session", error);
        return false;
      }
      return applySession(data?.session ?? null);
    } catch (error) {
      console.error("Unexpected auth session error", error);
      return false;
    }
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
    if (authEmailInput instanceof HTMLInputElement) {
      authEmailInput.disabled = disabled;
    }
    if (authPasswordInput instanceof HTMLInputElement) {
      authPasswordInput.disabled = disabled;
    }
    if (disabled) {
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
    setAuthModalInputsDisabled(false);
    setAuthModalStatus();
    authForm?.reset();
    const resolve = authModalResolve;
    authModalResolve = null;
    authModalPromise = null;
    resolve?.(success);
  }

  function openAuthModal() {
    if (!authModal) return Promise.resolve(false);
    if (authModalResolve) {
      return authModalPromise ?? Promise.resolve(false);
    }
    authForm?.reset();
    setAuthModalInputsDisabled(false);
    setAuthModalStatus();
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
      await loadVehicles(currentVehicleId);
    }
    return Boolean(result);
  }

  async function requireUser(interactive = true) {
    if (currentUserId) return true;
    const hasSession = await hydrateSession();
    if (hasSession) return true;
    if (!interactive) return false;

    if (typeof window === "undefined") {
      console.error("No browser window available for Supabase login prompt.");
      return false;
    }

    await promptForLogin();
    return Boolean(currentUserId);
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

  async function fetchVehicleById(id) {
    if (!id || !currentUserId) return null;
    const { data, error } = await supabase
      .from(VEHICLES_TABLE)
      .select("*")
      .eq("id", id)
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (error) {
      console.error("Failed to fetch vehicle", error);
      return null;
    }
    if (data) {
      upsertVehicleInCache(data);
    }
    return data ?? null;
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
      const hasUser = await requireUser(true);
      if (!hasUser) {
        setEditFeeStatus("Sign in is required to edit fees.", "error");
        return;
      }

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
      if (input instanceof HTMLInputElement) {
        input.disabled = disabled;
      }
    });
  }

  function fillModalFields(vehicle) {
    if (!modalFields) return;
    const v = vehicle ?? {};
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
  }

  function buildVehicleLabel(vehicle) {
    if (!vehicle) return "Unnamed Vehicle";
    const year = vehicle.year != null ? String(vehicle.year) : "";
    const make = vehicle.make ? String(vehicle.make) : "";
    const model = vehicle.model ? String(vehicle.model) : "";
    const pricePart =
      vehicle.asking_price != null
        ? formatToUSDString(vehicle.asking_price)
        : "";

    const primary = [year, make, model].filter(Boolean).join(" ");

    const trim = vehicle.trim ? String(vehicle.trim) : "";
    const mileagePart =
      vehicle.mileage != null
        ? `${Number(vehicle.mileage).toLocaleString()} mi`
        : "";
    const fallback = vehicle.vehicle ? String(vehicle.vehicle) : "Vehicle";
    const mainLabel = primary || fallback;

    const labelParts = [mainLabel, trim, mileagePart, pricePart].filter(
      Boolean
    );
    return labelParts.join(" • ") || fallback;
  }

  let lastActiveElement = null;

  function toggleModal(show) {
    if (!vehicleModal) return;
    vehicleModal.setAttribute("aria-hidden", show ? "false" : "true");
    if (show) {
      document.body.style.overflow = "hidden";
    } else if (authModal?.getAttribute("aria-hidden") === "false") {
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
    modalPrimaryBtn?.classList.remove("danger");
    modalPrimaryBtn?.removeAttribute("disabled");
    setModalStatus();
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
    lastActiveElement = null;
  }

  async function openModal(mode) {
    if (!vehicleModalForm || !modalPrimaryBtn) return;

    const hasUser = await requireUser(true);
    if (!hasUser) {
      return;
    }

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

  async function loadVehicles(preserveId) {
    if (!vehicleSelect) return;
    if (!currentUserId) {
      vehiclesCache = [];
      vehicleSelect.innerHTML = "";
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Sign in to view your saved vehicles";
      vehicleSelect.append(defaultOption);
      currentVehicleId = "";
      syncSalePriceWithSelection();
      recomputeDeal();
      return;
    }
    const { data, error } = await supabase
      .from(VEHICLES_TABLE)
      .select("*")
      .eq("user_id", currentUserId)
      .order("inserted_at", { ascending: false });
    if (error) {
      console.error("Failed to load vehicles", error);
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
      option.value =
        typeof vehicle.id === "number" ? String(vehicle.id) : vehicle.id;
      option.textContent = buildVehicleLabel(vehicle);
      const vehicleIdString =
        typeof vehicle.id === "number" ? String(vehicle.id) : vehicle.id;
      if (vehicleIdString === targetId) {
        option.selected = true;
        currentVehicleId = vehicleIdString;
      }
      vehicleSelect.append(option);
    });

    if (
      !vehiclesCache.some((item) => {
        const itemId =
          typeof item?.id === "number" ? String(item.id) : item?.id;
        return itemId === currentVehicleId;
      })
    ) {
      currentVehicleId = "";
      vehicleSelect.value = "";
    }

    syncSalePriceWithSelection();
    recomputeDeal();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    applySession(session ?? null);
    if (event === "SIGNED_IN" && authModalResolve) {
      closeAuthModal(true);
    }
    if (event === "SIGNED_OUT") {
      currentVehicleId = "";
    }
    void loadVehicles(currentVehicleId);
  });

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

    setAuthModalInputsDisabled(true);
    setAuthModalStatus("Signing in...");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw error;
      }
      if (data?.session) {
        applySession(data.session);
      } else {
        await hydrateSession();
      }
      if (!currentUserId) {
        setAuthModalStatus("Login failed. Please try again.", "error");
        setAuthModalInputsDisabled(false);
        return;
      }
      closeAuthModal(true);
    } catch (error) {
      console.error("Supabase login failed", error);
      const message =
        (error && typeof error === "object" && "message" in error
          ? String(error.message)
          : null) ?? "Unable to sign in. Please try again.";
      setAuthModalStatus(message, "error");
      setAuthModalInputsDisabled(false);
    }
  });

  authModalSecondaryBtn?.addEventListener("click", () => {
    closeAuthModal(false);
  });

  authModalCloseBtn?.addEventListener("click", () => {
    closeAuthModal(false);
  });

  authModal?.addEventListener("click", (event) => {
    if (event.target === authModal) {
      closeAuthModal(false);
    }
  });

  async function handleModalSubmit(event) {
    event.preventDefault();
    if (!modalFields || !modalPrimaryBtn) return;

    const hasUser = await requireUser(true);
    if (!hasUser) {
      setModalStatus("Sign in is required to save vehicle data.", "error");
      return;
    }

    modalPrimaryBtn.setAttribute("disabled", "true");
    setModalStatus("Working...");

    const payload = {
      vehicle: modalFields.vehicle?.value.trim() || null,
      year: parseInteger(modalFields.year?.value),
      make: modalFields.make?.value.trim() || null,
      model: modalFields.model?.value.trim() || null,
      trim: modalFields.trim?.value.trim() || null,
      mileage: parseInteger(modalFields.mileage?.value),
      asking_price: parseDecimal(modalFields.asking_price?.value),
      user_id: currentUserId,
    };

    let shouldCloseModal = false;

    try {
      if (modalMode === "add") {
        const { data, error } = await supabase
          .from(VEHICLES_TABLE)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          upsertVehicleInCache(data);
          currentVehicleId = data.id ?? currentVehicleId;
        }
        await loadVehicles(data?.id ?? null);
        shouldCloseModal = true;
      } else if (modalMode === "update") {
        if (!currentVehicleId) throw new Error("Missing vehicle id");
        const { data, error, count } = await supabase
          .from(VEHICLES_TABLE)
          .update(payload, { count: "exact" })
          .eq("id", currentVehicleId)
          .eq("user_id", currentUserId)
          .select("*");
        if (error) throw error;
        if (!count) {
          setModalStatus(
            "Update blocked. Confirm this vehicle belongs to your account (user_id mismatch).",
            "error"
          );
          modalPrimaryBtn.removeAttribute("disabled");
          return;
        }
        const updatedRows = Array.isArray(data) ? data : data ? [data] : [];
        let updatedVehicle = updatedRows[0] ?? null;
        if (!updatedVehicle) {
          updatedVehicle = await fetchVehicleById(currentVehicleId);
        }
        if (updatedVehicle) {
          upsertVehicleInCache(updatedVehicle);
          fillModalFields(updatedVehicle);
          setSalePriceFromVehicle(updatedVehicle);
        }
        setModalStatus("Vehicle updated.", "info");
        await loadVehicles(currentVehicleId);
      } else if (modalMode === "delete") {
        if (!currentVehicleId) throw new Error("Missing vehicle id");
        const { error, count } = await supabase
          .from(VEHICLES_TABLE)
          .delete({ count: "exact" })
          .eq("id", currentVehicleId)
          .eq("user_id", currentUserId);
        if (error?.code === "42501") {
          setModalStatus(
            "Delete blocked by Supabase policies. Please adjust permissions.",
            "error"
          );
          modalPrimaryBtn.removeAttribute("disabled");
          return;
        }
        if (error) throw error;
        if (!count) {
          setModalStatus(
            "Delete blocked. Confirm this vehicle belongs to your account (user_id mismatch).",
            "error"
          );
          modalPrimaryBtn.removeAttribute("disabled");
          return;
        }
        await loadVehicles("");
        shouldCloseModal = true;
      }
    } catch (error) {
      console.error(error);
      setModalStatus(
        error?.message ?? "Something went wrong while saving.",
        "error"
      );
      shouldCloseModal = false;
    }

    modalPrimaryBtn.removeAttribute("disabled");

    if (shouldCloseModal) {
      closeModal();
    }
  }

  // 1) Enter-to-format (event delegation so it also works for future inputs)
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    const type = String(t.type ?? "").toLowerCase();
    if (["button", "submit", "reset"].includes(type)) return;

    ev.preventDefault();
    ev.stopPropagation();

    if (
      t.matches(USD_SELECTOR) ||
      t.classList.contains("inputTax") ||
      t.matches(PERCENT_SELECTOR)
    ) {
      formatInputEl(t);
      recomputeDeal();
    }

    focusNextField(t);
  });

  // 2) Format on blur (capture to catch blur bubbling)
  document.addEventListener(
    "blur",
    (ev) => {
      const t = ev.target;
      if (
        t instanceof HTMLInputElement &&
        (t.matches(USD_SELECTOR) ||
          t.classList.contains("inputTax") ||
          t.matches(PERCENT_SELECTOR))
      ) {
        formatInputEl(t);
        recomputeDeal();
      }
    },
    true
  );

  // 3) Format all USD inputs on form submit (leave submit default intact)
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", () => {
      form.querySelectorAll(USD_SELECTOR).forEach(formatInputEl);
      form.querySelectorAll(PERCENT_SELECTOR).forEach(formatInputEl);
      // If you're developing and don't want the page to reload yet,
      // uncomment the next line:
      // event.preventDefault();
    });
  });

  // 4) Initial formatting for any pre-filled inputs
  document.querySelectorAll(USD_SELECTOR).forEach((el) => {
    if (el.value && el.value.trim() !== "") {
      formatInputEl(el);
    }
  });

  document.querySelectorAll(PERCENT_SELECTOR).forEach((el) => {
    if (el instanceof HTMLInputElement && el.value && el.value.trim() !== "") {
      normalizePercentInput(el);
    }
  });

  if (salePriceInput instanceof HTMLInputElement) {
    salePriceInput.addEventListener("input", () => {
      delete salePriceInput.dataset.calculatedSalePrice;
    });
    formatInputEl(salePriceInput);
  }

  rateSourceSelect?.addEventListener("change", () => {
    syncAprInputReadOnly();
    syncRateSourceName();
    void applyCurrentRate({ silent: false });
  });

  vehicleConditionSelect?.addEventListener("change", () => {
    void applyCurrentRate({ silent: false });
  });

  creditScoreInput?.addEventListener("input", () => {
    void applyCurrentRate({ silent: true });
  });

  creditScoreInput?.addEventListener("blur", () => {
    void applyCurrentRate({ silent: false });
  });

  affordabilityAprInput?.addEventListener("blur", () => {
    if (!affordabilityAprInput) return;
    if (!affordabilityAprInput.value || !affordabilityAprInput.value.trim()) {
      affordAprUserOverride = false;
      syncAffordAprWithFinance({ force: true });
    }
  });

  financeTermInput?.addEventListener("input", () => {
    void applyCurrentRate({ silent: true });
  });

  financeTermInput?.addEventListener("change", () => {
    syncAffordTermWithFinance();
    recomputeDeal();
    void applyCurrentRate({ silent: false });
  });

  [
    salePriceInput,
    tradeOfferInput,
    tradePayoffInput,
    dealerFeeAmountInput,
    govFeeAmountInput,
    stateTaxInput,
    countyTaxInput,
    cashDownInput,
    financeAprInput,
    financeTermInput,
    affordabilityPaymentInput,
    affordabilityAprInput,
    affordabilityTermInput,
  ].forEach((input) => {
    input?.addEventListener("input", () => {
      if (
        input instanceof HTMLInputElement &&
        input.matches(PERCENT_SELECTOR)
      ) {
        delete input.dataset.numericValue;
        if (input === affordabilityAprInput) {
          affordAprUserOverride = true;
        }
        if (input === financeAprInput) {
          ensureUserDefinedAprForCustomEntry(
            "APR source switched to User Defined for custom entry."
          );
        }
      }
      recomputeDeal();
    });
  });

  financeAprInput?.addEventListener("focus", () => {
    if (
      financeAprInput instanceof HTMLInputElement &&
      financeAprInput.readOnly
    ) {
      ensureUserDefinedAprForCustomEntry(
        "APR source switched to User Defined so you can edit the rate."
      );
    }
  });

  [financeTFCheckbox, financeNegEquityCheckbox, cashOutEquityCheckbox].forEach(
    (checkbox) => {
      checkbox?.addEventListener("change", () => {
        if (
          checkbox === financeNegEquityCheckbox &&
          financeNegEquityCheckbox instanceof HTMLInputElement
        ) {
          financeNegEquityCheckbox.dataset.userToggled =
            financeNegEquityCheckbox.checked ? "checked" : "unchecked";
        }
        recomputeDeal();
      });
    }
  );

  editFeeButton?.addEventListener("click", () => {
    openEditFeeModal();
  });

  syncAprInputReadOnly();
  setRateSourceStatus("");

  editFeeTypeSelect?.addEventListener("change", () => {
    updateEditFeeNameList(editFeeTypeSelect.value);
  });

  editFeeCancelBtn?.addEventListener("click", () => {
    closeEditFeeModal();
  });

  editFeeCloseBtn?.addEventListener("click", () => {
    closeEditFeeModal();
  });

  editFeeModal?.addEventListener("click", (event) => {
    if (event.target === editFeeModal) {
      closeEditFeeModal();
    }
  });

  editFeeForm?.addEventListener("submit", handleEditFeeSubmit);

  vehicleSelect?.addEventListener("mousedown", async (event) => {
    if (currentUserId) return;
    event.preventDefault();
    event.stopPropagation();
    const loggedIn = await promptForLogin();
    if (loggedIn) {
      requestAnimationFrame(() => {
        vehicleSelect.focus();
      });
    }
  });

  vehicleSelect?.addEventListener("focus", async (event) => {
    if (currentUserId || authModalResolve) return;
    if (event.target instanceof HTMLElement) {
      event.target.blur();
    }
    await promptForLogin();
  });

  vehicleSelect?.addEventListener("change", (event) => {
    const select = event.target;
    currentVehicleId =
      select && typeof select.value === "string" ? select.value : "";
    syncSalePriceWithSelection();
  });

  vehicleActionButtons.forEach((button) => {
    const action = button.getAttribute("data-vehicle-action");
    if (!action) return;
    button.addEventListener("click", () => {
      void openModal(action);
    });
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

  vehicleModal?.addEventListener("click", (event) => {
    if (event.target === vehicleModal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (authModal?.getAttribute("aria-hidden") === "false") {
      closeAuthModal(false);
      return;
    }
    if (vehicleModal?.getAttribute("aria-hidden") === "false") {
      closeModal();
    }
  });

  vehicleModalForm?.addEventListener("submit", handleModalSubmit);

  async function initializeApp() {
    await hydrateSession();
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
    await loadVehicles();
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
