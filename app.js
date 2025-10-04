import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://txndueuqljeujlccngbj.supabase.co";
const SUPABASE_KEY = "sb_publishable_iq_fkrkjHODeoaBOa3vvEA_p9Y3Yz8X";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const VEHICLES_TABLE = "vehicles";

// Format inputs to accounting-style USD on Enter and on blur.
// Works for any input with class="usdFormat".
  document.addEventListener("DOMContentLoaded", () => {
  const USD_SELECTOR = ".usdFormat";
  const DEFAULT_APR = 0.0599;
  const DEFAULT_TERM_MONTHS = 72;
  const MIN_APR = 0;
  const MAX_FINANCE_APR = 0.15;
  const MAX_AFFORD_APR = 0.25;
  const MIN_TERM_MONTHS = 0;
  const MAX_TERM_MONTHS = 96;

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
  const cashDownInput = document.getElementById("cashDown");
  const cashToBuyerOutput = document.getElementById("cash2Buyer");
  const cashDueOutput = document.getElementById("cashDue");
  const amountFinancedOutput = document.getElementById("amountFinanced");
  const financeAprInput = document.getElementById("financeApr");
  const financeTermInput = document.getElementById("financeTerm");
  const monthlyPaymentOutput = document.getElementById("monthlyPmt");
  const affordabilityPaymentInput = document.getElementById("affordability");
  const affordabilityAprInput = document.getElementById("affordApr");
  const affordabilityTermInput = document.getElementById("affordTerm");
  const maxAmountFinancedOutput = document.getElementById("maxAmountFinanced");
  const maxPriceNoteOutput = document.getElementById("maxPrice");
  const affordabilityStatusOutput = document.getElementById("reqAPR_TERM");
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
    const vehicle =
      vehiclesCache.find((item) => item.id === currentVehicleId) ?? null;
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

    setCurrencyOutput(equityOutput, equityValue);
    updateEquityColor(equityValue);

    let effectiveSalePrice = salePrice;
    if (salePrice == null) {
      effectiveSalePrice = 0;
      setCurrencyOutput(cashDifferenceOutput, null);
    } else {
      const cashDifference = salePrice - (equityValue ?? 0);
      setCurrencyOutput(cashDifferenceOutput, cashDifference);
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
    if (!(input instanceof HTMLInputElement)) return defaultValue;
    const datasetValue = input.dataset.numericValue;
    if (datasetValue != null && datasetValue !== "") {
      const numeric = Number(datasetValue);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
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
    const termValue = financeTermInput
      ? parseInteger(financeTermInput.value)
      : null;
    const termMonths =
      termValue != null && termValue > 0 ? termValue : DEFAULT_TERM_MONTHS;

    const financeTF = financeTFCheckbox?.checked ?? false;
    const financeNegEquity = financeNegEquityCheckbox?.checked ?? false;
    const cashOutEquity = cashOutEquityCheckbox?.checked ?? false;

    const posEquity = equity > 0 ? equity : 0;
    const negEquity = equity < 0 ? -equity : 0;

    let amountFinanced = sale - tradeOfferValue + tradePayoffValue;

    if (!financeNegEquity && negEquity > 0) {
      amountFinanced -= negEquity;
    }

    if (cashOutEquity && posEquity > 0) {
      amountFinanced += posEquity;
    }

    if (financeTF) {
      amountFinanced += totalFeesAndTaxes;
    }

    amountFinanced -= cashDown;
    amountFinanced = Math.max(amountFinanced, 0);

    setCurrencyOutput(amountFinancedOutput, amountFinanced, {
      forceZero: true,
    });

    const dueFeesTaxes = financeTF ? 0 : totalFeesAndTaxes;
    const dueNegEquity = financeNegEquity ? 0 : negEquity;
    const equityApplied = cashOutEquity ? 0 : posEquity;

    const cashDueBeforeDown = Math.max(
      dueFeesTaxes + dueNegEquity - equityApplied,
      0
    );
    const cashDue = cashDown + cashDueBeforeDown;

    setCurrencyOutput(cashDueOutput, cashDue, { forceZero: true });
    setCurrencyOutput(cashToBuyerOutput, cashOutEquity ? posEquity : 0, {
      forceZero: true,
    });

    let monthlyPayment = 0;
    if (amountFinanced > 0 && termMonths > 0) {
      const monthlyRate = aprRate / 12;
      if (Math.abs(monthlyRate) < 1e-9) {
        monthlyPayment = amountFinanced / termMonths;
      } else {
        const factor = Math.pow(1 + monthlyRate, termMonths);
        const denominator = factor - 1;
        if (Math.abs(denominator) > 1e-9) {
          monthlyPayment =
            amountFinanced * ((monthlyRate * factor) / denominator);
        }
      }
    }

    setCurrencyOutput(monthlyPaymentOutput, monthlyPayment, {
      forceZero: amountFinanced > 0 || termMonths > 0,
    });

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
    if (
      !affordabilityPaymentInput ||
      !maxAmountFinancedOutput ||
      !maxPriceNoteOutput ||
      !affordabilityStatusOutput
    ) {
      return;
    }

    const desiredPayment =
      getCurrencyInputValue(affordabilityPaymentInput) ?? null;
    const payment =
      desiredPayment != null && desiredPayment > 0 ? desiredPayment : 0;

    const rawApr = getPercentInputValue(affordabilityAprInput, DEFAULT_APR);
    const clampedApr = Math.min(
      Math.max(rawApr ?? DEFAULT_APR, MIN_APR),
      MAX_AFFORD_APR
    );
    if (affordabilityAprInput instanceof HTMLInputElement) {
      affordabilityAprInput.dataset.numericValue = String(clampedApr);
      const isFocused = document.activeElement === affordabilityAprInput;
      const outOfBounds =
        rawApr != null && (rawApr < MIN_APR || rawApr > MAX_AFFORD_APR);
      if (!isFocused || outOfBounds) {
        affordabilityAprInput.value = formatPercent(clampedApr);
      }
    }

    const rawTerm = parseInteger(affordabilityTermInput?.value);
    let termMonths = rawTerm != null ? rawTerm : DEFAULT_TERM_MONTHS;
    termMonths = Math.min(
      Math.max(termMonths, MIN_TERM_MONTHS),
      MAX_TERM_MONTHS
    );
    if (affordabilityTermInput instanceof HTMLInputElement) {
      affordabilityTermInput.value = String(termMonths);
    }

    const statusMessages = [];
    if (payment <= 0) {
      statusMessages.push("Enter a monthly payment to estimate affordability.");
    }
    if (termMonths <= 0) {
      statusMessages.push("Term must be greater than 0.");
    } else if (
      rawTerm != null &&
      (rawTerm < MIN_TERM_MONTHS || rawTerm > MAX_TERM_MONTHS)
    ) {
      statusMessages.push("Term capped between 0 and 96 months.");
    }
    if (rawApr != null && (rawApr < MIN_APR || rawApr > MAX_AFFORD_APR)) {
      statusMessages.push("APR capped between 0% and 25%.");
    }

    let loanLimit = 0;
    if (payment > 0 && termMonths > 0) {
      const monthlyRate = clampedApr / 12;
      if (Math.abs(monthlyRate) < 1e-9) {
        loanLimit = payment * termMonths;
      } else {
        const factor = Math.pow(1 + monthlyRate, termMonths);
        const denominator = monthlyRate;
        loanLimit = payment * ((factor - 1) / (denominator * factor));
      }
    }

    const extrasFinanced =
      (financeTaxesFees ? totalFeesAndTaxes : 0) +
      Math.max(negEquityFinanced, 0) +
      Math.max(cashOutAmount, 0);
    const availableForVehicle = Math.max(loanLimit - extrasFinanced, 0);

    const vehicleBudget = availableForVehicle;
    if (loanLimit > 0) {
      setCurrencyOutput(maxAmountFinancedOutput, vehicleBudget, {
        forceZero: true,
      });
    } else {
      setCurrencyOutput(maxAmountFinancedOutput, null);
    }

    if (maxPriceNoteOutput) {
      if (loanLimit > 0) {
        const label = financeTaxesFees
          ? "Available for vehicle after taxes & fees:"
          : "Available for vehicle (taxes & fees paid separately):";
        const message = `${label} ${formatCurrency(availableForVehicle)}`;
        maxPriceNoteOutput.textContent = message;
        maxPriceNoteOutput.value = message;
      } else {
        maxPriceNoteOutput.textContent = "";
        maxPriceNoteOutput.value = "";
      }
    }

    if (loanLimit > 0 && loanLimit <= extrasFinanced) {
      statusMessages.push(
        "Monthly payment only covers taxes, fees, and adjustments. Increase payment or term."
      );
    }

    if (affordabilityStatusOutput) {
      const message = statusMessages.join(" ");
      affordabilityStatusOutput.textContent = message;
      affordabilityStatusOutput.value = message;
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
    if (financeTermInput instanceof HTMLInputElement) {
      financeTermInput.value = String(DEFAULT_TERM_MONTHS);
    }

    if (affordabilityPaymentInput instanceof HTMLInputElement) {
      affordabilityPaymentInput.value = "";
      delete affordabilityPaymentInput.dataset.numericValue;
    }
    if (affordabilityAprInput instanceof HTMLInputElement) {
      affordabilityAprInput.value = `${(DEFAULT_APR * 100).toFixed(2)}%`;
      formatInputEl(affordabilityAprInput);
    }
    if (affordabilityTermInput instanceof HTMLInputElement) {
      affordabilityTermInput.value = String(DEFAULT_TERM_MONTHS);
    }
    if (maxAmountFinancedOutput) {
      setCurrencyOutput(maxAmountFinancedOutput, null);
    }
    if (maxPriceNoteOutput) {
      maxPriceNoteOutput.textContent = "";
      maxPriceNoteOutput.value = "";
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
    setCurrencyOutput(monthlyPaymentOutput, 0, { forceZero: true });
    formatInputEl(tradeOfferInput);
    formatInputEl(tradePayoffInput);
    syncSalePriceWithSelection();
    formatInputEl(salePriceInput);

    recomputeDeal();
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

    vehiclesCache = Array.isArray(data) ? data : [];
    const targetId = preserveId ?? currentVehicleId ?? "";
    vehicleSelect.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "--Select a Saved Vehicle--";
    vehicleSelect.append(defaultOption);

    vehiclesCache.forEach((vehicle) => {
      const option = document.createElement("option");
      option.value = vehicle.id;
      option.textContent = buildVehicleLabel(vehicle);
      if (vehicle.id === targetId) {
        option.selected = true;
        currentVehicleId = vehicle.id;
      }
      vehicleSelect.append(option);
    });

    if (!vehiclesCache.some((item) => item.id === currentVehicleId)) {
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

    if (t.matches(USD_SELECTOR) || t.classList.contains("inputTax")) {
      formatInputEl(t);
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
        (t.matches(USD_SELECTOR) || t.classList.contains("inputTax"))
      ) {
        formatInputEl(t);
      }
    },
    true
  );

  // 3) Format all USD inputs on form submit (leave submit default intact)
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", () => {
      form.querySelectorAll(USD_SELECTOR).forEach(formatInputEl);
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

  if (salePriceInput instanceof HTMLInputElement) {
    salePriceInput.addEventListener("input", () => {
      delete salePriceInput.dataset.calculatedSalePrice;
    });
  }

  if (financeAprInput instanceof HTMLInputElement) {
    financeAprInput.addEventListener("input", () => {
      delete financeAprInput.dataset.numericValue;
    });
  }

  if (affordabilityAprInput instanceof HTMLInputElement) {
    affordabilityAprInput.addEventListener("input", () => {
      delete affordabilityAprInput.dataset.numericValue;
    });
  }

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
      recomputeDeal();
    });
  });

  [financeTFCheckbox, financeNegEquityCheckbox, cashOutEquityCheckbox].forEach(
    (checkbox) => {
      checkbox?.addEventListener("change", () => {
        recomputeDeal();
      });
    }
  );

  editFeeButton?.addEventListener("click", () => {
    openEditFeeModal();
  });

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
    await loadVehicles();
    recomputeDeal();
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
        import.meta.env.BASE_URL || "/"
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
