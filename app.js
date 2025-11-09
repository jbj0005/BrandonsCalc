// ============================================
// TYPESCRIPT MODULE IMPORTS (Phase 1)
// ============================================
import { AuthManager } from './src/features/auth/auth-manager';
import { SMSSender } from './src/features/offers/sms-sender';
import { useAuthStore, useCalculatorStore, useGarageStore, useOfferStore } from './src/core/state';
import {
  supabase as supabaseClient,
  createCustomerOffer,
  getGarageVehicles,
  getRateSheets
} from './src/lib/supabase';

function calculateSliderMax(baseValue, multiplier = 1.5, minimum = 150000) {
  return Math.max(minimum, baseValue * multiplier);
}

function calculateDownPaymentSliderMax(baseValue) {
  let calculatedMax = 0;
  if (baseValue <= 10000) {
    calculatedMax = Math.max(5000, baseValue * 3);
  } else if (baseValue <= 30000) {
    calculatedMax = baseValue * 2.5;
  } else {
    calculatedMax = baseValue * 2;
  }
  return Math.min(calculatedMax, 100000);
}

/**
 * EXPRESS MODE WIZARD - WITH SUPABASE & GOOGLE PLACES
 * Integrated with real saved vehicles and location services
 */

let currentStep = 1;
const totalSteps = 4;

// Wizard data
const wizardData = {
  vehicle: {},
  financing: {},
  tradein: {},
  customer: {},
  location: {},
};

let latestReviewData = null;

const TAX_RATE_CONFIG = {
  FL: {
    stateRate: 0.06,
    counties: {
      HAMILTON: 0.02,
      BREVARD: 0.01,
    },
  },
};

const FEE_CATEGORY_CONFIG = {
  dealer: {
    containerId: "dealer-fee-rows",
    totalId: "dealer-fee-total",
    datalistId: "dealer-fee-suggestions",
    label: "Dealer Fees",
  },
  customer: {
    containerId: "customer-fee-rows",
    totalId: "customer-fee-total",
    datalistId: "customer-fee-suggestions",
    label: "Customer Add-ons",
  },
  gov: {
    containerId: "gov-fee-rows",
    totalId: "gov-fee-total",
    datalistId: "gov-fee-suggestions",
    label: "Gov't Fees",
  },
};

const feeSetState = {
  dealer: { id: null, items: [] },
  customer: { id: null, items: [] },
  gov: { id: null, items: [] },
};

const feeModalState = {
  categories: {},
  initialized: false,
};

const editFeeModalState = {
  activeCategory: "dealer",
};

const feeDebug =
  (typeof window !== "undefined" && window.feeDebug) ||
  (() => {
    const api = {
      enabled: false,
      enable(flag = true) {
        api.enabled = Boolean(flag);
        // eslint-disable-next-line no-console
        console.info(`[fee-debug] ${api.enabled ? "enabled" : "disabled"}`);
      },
      log(label, payload) {
        if (!api.enabled) return;
        if (typeof payload === "undefined") {
          // eslint-disable-next-line no-console
          console.log("[fee-debug]", label);
          return;
        }
        // eslint-disable-next-line no-console
        console.log("[fee-debug]", label, payload);
      },
      table(label, rows) {
        if (!api.enabled) return;
        try {
          // eslint-disable-next-line no-console
          console.groupCollapsed(`[fee-debug] ${label}`);
          // eslint-disable-next-line no-console
          console.table(rows);
          // eslint-disable-next-line no-console
          console.groupEnd();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.log("[fee-debug]", label, rows);
        }
      },
    };
    if (typeof window !== "undefined") {
      window.feeDebug = api;
    }
    return api;
  })();
if (typeof window !== "undefined") {
  try {
    if (window.sessionStorage?.getItem("feeDebugEnabled") === "true") {
      feeDebug.enable(true);
    }
  } catch (storageError) {
    // eslint-disable-next-line no-console
  }
  window.enableFeeDebugging = function enableFeeDebugging() {
    try {
      window.sessionStorage?.setItem("feeDebugEnabled", "true");
    } catch (storageError) {
      // eslint-disable-next-line no-console
    }
    feeDebug.enable(true);
  };
  window.disableFeeDebugging = function disableFeeDebugging() {
    try {
      window.sessionStorage?.removeItem("feeDebugEnabled");
    } catch (storageError) {
      // eslint-disable-next-line no-console
    }
    feeDebug.enable(false);
  };
}

// Supabase client
let supabase = null;
let currentUserId = null;

// Saved vehicles cache
let savedVehicles = [];
let selectedVehicle = null;
let quickEntryInitialized = false;
let similarVehicles = [];
let emailHandshakeUI = null;
const isDevEnvironment =
  window.location.hostname.includes("localhost") ||
  window.location.hostname.startsWith("127.") ||
  window.location.hostname === "0.0.0.0" ||
  new URLSearchParams(window.location.search).has("devsend");
let devSendPreference = null; // "dev" | "prod"
let sendModeModalUI = null;

// Google Places
let placesAutocomplete = null;
let quickLocationAutocomplete = null;
let googleMapsLoaded = false;
let quickLocationManualHandlerAttached = false;

// Google Maps - Dealer Map
let dealerMap = null;
let directionsService = null;
let directionsRenderer = null;

// API Configuration
const API_BASE = window.location.origin;

// ===================================
// FORMATTING UTILITIES
// ===================================

/**
 * Format currency with commas and dollar sign
 * @param {number|string} value - The value to format
 * @param {boolean} showNegative - Whether to show negative values in accounting style
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, showNegative = true, options = {}) {
  const num =
    typeof value === "string"
      ? parseFloat(value.replace(/[^0-9.-]/g, ""))
      : value;
  if (isNaN(num)) return "";

  const absValue = Math.abs(num);

  // PRECISION SUPPORT: Show cents when value has fractional part
  // or when explicitly requested via options.showCents
  const hasCents = Math.abs(absValue - Math.round(absValue)) > 0.001;
  const showCents = options.showCents !== undefined ? options.showCents : hasCents;

  const formatted = absValue.toLocaleString("en-US", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });

  if (num < 0 && showNegative) {
    return `($${formatted})`; // Accounting style for negative
  }
  return `$${formatted}`;
}

/**
 * Safely parse currency-like input into a number
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
function parseCurrencyToNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return 0;
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeCurrencyNumber(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function formatPhoneNumber(phone) {
  if (!phone) return "";
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  // Format as (XXX) XXX-XXXX
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // Return original if not 10 digits
  return phone;
}

function toTitleCase(str) {
  return String(str)
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ")
    .trim();
}

function safeParseJSON(raw) {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeFeeItems(records) {
  const items = Array.isArray(records) ? records : [];
  const dedup = new Map();
  for (const item of items) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    let amount = null;
    if (typeof item?.amount === "number" && Number.isFinite(item.amount)) {
      amount = item.amount;
    } else if (typeof item?.amount === "string") {
      const parsed = Number(item.amount);
      if (Number.isFinite(parsed)) {
        amount = parsed;
      }
    }
    if (!dedup.has(key) || amount != null) {
      dedup.set(key, { name: toTitleCase(name), amount });
    }
  }
  return Array.from(dedup.values());
}

function createSuggestionStore(datalistId) {
  const datalist = document.getElementById(datalistId);
  const store = {
    datalist,
    items: [],
    setItems(items) {
      this.items = Array.isArray(items) ? items : [];
      if (!this.datalist) return;
      this.datalist.innerHTML = "";
      const fragment = document.createDocumentFragment();
      this.items.forEach((item) => {
        if (!item?.name) return;
        const option = document.createElement("option");
        option.value = item.name;
        fragment.appendChild(option);
      });
      this.datalist.appendChild(fragment);
    },
    getAmount(name) {
      if (!name) return null;
      const normalized = String(name).trim().toLowerCase();
      const found = this.items.find(
        (item) => item?.name?.toLowerCase?.() === normalized
      );
      return Number.isFinite(found?.amount) ? found.amount : null;
    },
  };
  return store;
}

function getFeeSuggestionStore(type) {
  const category =
    type === "gov" ? "gov" : type === "customer" ? "customer" : "dealer";
  return feeModalState.categories?.[category]?.suggestionStore ?? null;
}

function getFeeSetState(type) {
  return type === "gov"
    ? feeSetState.gov
    : type === "customer"
    ? feeSetState.customer
    : feeSetState.dealer;
}

async function fetchFeeItemsFromSet(tableName) {
  if (!supabase) return { setId: null, rawItems: [], normalizedItems: [] };
  const { data, error } = await supabase
    .from(tableName)
    .select("id, label, items")
    .eq("active", true);
  if (error) throw error;
  const records = Array.isArray(data) ? data : [];
  const primary = records[0] ?? null;
  const setId = primary?.id ?? null;
  const rawItems = records.flatMap((record) => {
    if (Array.isArray(record?.items)) return record.items;
    if (typeof record?.items === "string") return safeParseJSON(record.items);
    return [];
  });
  return {
    setId,
    rawItems,
    normalizedItems: normalizeFeeItems(rawItems),
  };
}

async function fetchFeeItemsFromView(viewName) {
  if (!supabase) return { rawItems: [], normalizedItems: [] };
  const { data, error } = await supabase
    .from(viewName)
    .select("name, amount, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const records = Array.isArray(data) ? data : [];
  const normalizedItems = normalizeFeeItems(records);
  const rawItems = records.map((item) => ({
    name: typeof item?.name === "string" ? item.name : "",
    amount:
      typeof item?.amount === "number"
        ? item.amount
        : Number(item?.amount) || 0,
  }));
  return { rawItems, normalizedItems };
}

function setSuggestionItems(store, items, context) {
  if (!store) return;
  if (!Array.isArray(items) || items.length === 0) {
    store.setItems([]);
    return;
  }
  if (feeDebug.enabled) {
    feeDebug.table(
      `suggestion items updated (${context})`,
      items.map((item) => ({
        name: item?.name ?? "",
        amount: item?.amount ?? null,
      }))
    );
  }
  store.setItems(items);
}

async function loadDealerFeeSuggestions() {
  try {
    const store = getFeeSuggestionStore("dealer");
    if (!store) return;
    let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet(
      "dealer_fee_sets"
    );
    feeSetState.dealer.id = setId;
    feeSetState.dealer.items = rawItems;
    let items = normalizedItems;
    let source = "dealer_fee_sets";
    if (!items.length) {
      const fallback = await fetchFeeItemsFromView("dealer_fee_items_v");
      items = fallback.normalizedItems;
      feeSetState.dealer.items = fallback.rawItems;
      source = "dealer_fee_items_v";
    }
    setSuggestionItems(store, items, source);
  } catch (error) {
    console.error("[fees] Failed to load dealer fee suggestions", error);
    const store = getFeeSuggestionStore("dealer");
    store?.setItems([]);
  }
}

async function loadCustomerAddonSuggestions() {
  try {
    const store = getFeeSuggestionStore("customer");
    if (!store) return;
    let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet(
      "customer_addon_sets"
    );
    feeSetState.customer.id = setId;
    feeSetState.customer.items = rawItems;
    let items = normalizedItems;
    let source = "customer_addon_sets";
    if (!items.length) {
      const fallback = await fetchFeeItemsFromView("customer_addon_items_v");
      items = fallback.normalizedItems;
      feeSetState.customer.items = fallback.rawItems;
      source = "customer_addon_items_v";
    }
    setSuggestionItems(store, items, source);
  } catch (error) {
    console.error("[fees] Failed to load customer addon suggestions", error);
    const store = getFeeSuggestionStore("customer");
    store?.setItems([]);
  }
}

async function loadGovFeeSuggestions() {
  try {
    const store = getFeeSuggestionStore("gov");
    if (!store) return;
    let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet(
      "gov_fee_sets"
    );
    feeSetState.gov.id = setId;
    feeSetState.gov.items = rawItems;
    let items = normalizedItems;
    let source = "gov_fee_sets";
    if (!items.length) {
      const fallback = await fetchFeeItemsFromView("gov_fee_items_v");
      items = fallback.normalizedItems;
      feeSetState.gov.items = fallback.rawItems;
      source = "gov_fee_items_v";
    }
    setSuggestionItems(store, items, source);
  } catch (error) {
    console.error("[fees] Failed to load gov fee suggestions", error);
    const store = getFeeSuggestionStore("gov");
    store?.setItems([]);
  }
}

async function loadFeeSuggestionData() {
  await Promise.all([
    loadDealerFeeSuggestions(),
    loadCustomerAddonSuggestions(),
    loadGovFeeSuggestions(),
  ]);
}

/**
 * Format number input as currency in real-time
 * @param {HTMLInputElement} input - The input element
 */
function setupCurrencyInput(input) {
  input.addEventListener("input", (e) => {
    const cursorPosition = e.target.selectionStart;
    const oldLength = e.target.value.length;

    // Remove non-numeric characters except minus
    let value = e.target.value.replace(/[^0-9-]/g, "");

    // Handle negative sign
    const isNegative = value.startsWith("-");
    value = value.replace(/-/g, "");

    if (value === "") {
      e.target.value = "";
      return;
    }

    const numValue = parseInt(value);
    e.target.value = formatCurrency(isNegative ? -numValue : numValue);

    // Restore cursor position
    const newLength = e.target.value.length;
    const diff = newLength - oldLength;
    e.target.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
  });

  input.addEventListener("blur", (e) => {
    if (
      e.target.value &&
      !e.target.value.startsWith("$") &&
      !e.target.value.startsWith("(")
    ) {
      const num = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
      if (!isNaN(num)) {
        e.target.value = formatCurrency(num);
      }
    }
  });
}

/**
 * Format mileage with commas
 * @param {number|string} value - The mileage value
 * @returns {string} Formatted mileage string
 */
function formatMileage(value) {
  const num =
    typeof value === "string" ? parseInt(value.replace(/[^0-9]/g, "")) : value;
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("en-US");
}

/**
 * Escape HTML entities from dynamic text content
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format mileage input in real-time
 * @param {HTMLInputElement} input - The input element
 */
function setupMileageInput(input) {
  input.addEventListener("input", (e) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    if (value === "") {
      e.target.value = "";
      return;
    }
    e.target.value = formatMileage(value);
  });
}

/**
 * Capitalize first letter of each word
 * @param {string} text - The text to capitalize
 * @returns {string} Capitalized text
 */
function capitalizeWords(text) {
  if (!text) return "";
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Format VIN for display (uppercase, monospace)
 * @param {string} vin - The VIN to format
 * @returns {string} Formatted VIN
 */
function formatVIN(vin) {
  if (!vin) return "";
  const upper = String(vin).toUpperCase();
  // Wrap in standardized class so CSS can enforce monospace + spacing
  return `<span class="vin-display">${upper}</span>`;
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  await initializeSupabase();

  // Sync Supabase Auth session with customer profile
  // This must run before auto-populate functions
  await syncAuthWithProfile();

  await loadGoogleMaps();

  // Initialize year dropdown as disabled until location is set
  const yearSelect = document.getElementById("year-input");
  if (yearSelect) {
    yearSelect.innerHTML = '<option value="">Enter location first</option>';
    yearSelect.disabled = true;
  }

  setupVINInput();
  setupCascadingDropdowns();
  setupLocationInput();
  setupFormValidation();
  setupEnterKeyNavigation();
  setupInputFormatting();
  setupVehiclePriceFormulas();
  ensureWizardFeeDefaults();
  initializeFeeModal();
  await loadFeeSuggestionData();
  updateTaxInputs();
  emailHandshakeUI = {
    modal: document.getElementById("email-handshake-modal"),
    icon: document.getElementById("emailHandshakeIcon"),
    title: document.getElementById("emailHandshakeTitle"),
    message: document.getElementById("emailHandshakeMessage"),
    progress: document.getElementById("emailHandshakeProgress"),
    actions: document.getElementById("emailHandshakeActions"),
  };
  // Note: loadSavedVehicles() will be called automatically when profile-loaded event fires
  await loadLenders(); // Load lenders for rate comparison

  // Setup phone number auto-formatting for customer phone input
  const customerPhoneInput = document.getElementById("submitCustomerPhone");
  if (customerPhoneInput) {
    customerPhoneInput.addEventListener("input", function(e) {
      // Get raw input value
      let value = e.target.value.replace(/\D/g, ""); // Remove all non-digits

      // Limit to 10 digits
      if (value.length > 10) {
        value = value.slice(0, 10);
      }

      // Format as (XXX) XXX-XXXX
      let formatted = "";
      if (value.length > 0) {
        formatted = "(" + value.substring(0, 3);
        if (value.length >= 4) {
          formatted += ") " + value.substring(3, 6);
          if (value.length >= 7) {
            formatted += "-" + value.substring(6, 10);
          }
        }
      }

      // Update input value with formatted version
      e.target.value = formatted;
    });
  }

  // ============================================
  // PHASE 1: Initialize TypeScript Modules
  // ============================================

  // Initialize base slider defaults even when no vehicle is selected
  const sliderDefaults = [
    { id: 'quickSliderSalePrice', max: 150000, step: 100 },
    { id: 'quickSliderCashDown', max: 150000, step: 100 },
    { id: 'quickSliderTradeAllowance', max: 150000, step: 100 },
    { id: 'quickSliderTradePayoff', max: 150000, step: 100 },
    { id: 'quickSliderDealerFees', max: 10000, step: 10 },
    { id: 'quickSliderCustomerAddons', max: 10000, step: 10 },
  ];

  sliderDefaults.forEach(({ id, max, step }) => {
    const slider = document.getElementById(id);
    if (!slider) return;

    slider.min = 0;
    slider.max = max;
    slider.value = 0;
    slider.step = step;

    if (!slider.dataset.defaultMin) slider.dataset.defaultMin = slider.min;
    if (!slider.dataset.defaultMax) slider.dataset.defaultMax = slider.max;
    if (!slider.dataset.defaultStep) slider.dataset.defaultStep = slider.step;
  });

  // Listen for profile loaded event (MUST be set up BEFORE AuthManager initializes)
  window.addEventListener('profile-loaded', async (e) => {
    const { profile } = e.detail;

    // Update currentUserId for legacy code
    const authStore = useAuthStore.getState();
    if (authStore.user) {
      currentUserId = authStore.user.id;
    }

    // Auto-populate wizardData with user profile
    if (profile.full_name) wizardData.customer.name = profile.full_name;
    if (profile.email) wizardData.customer.email = profile.email;
    if (profile.phone) wizardData.customer.phone = profile.phone;

    if (profile.preferred_down_payment && wizardData.vehicle?.vin) {
      wizardData.financing.cashDown = profile.preferred_down_payment;
      const cashDownInput = document.getElementById('quickSliderCashDown');
      if (cashDownInput) cashDownInput.value = profile.preferred_down_payment;
    }

    // Trade-in preferences removed from profile; handled via My Garage

    // Set financing preferences with defaults
    wizardData.financing.term = profile.preferred_term || 72;
    wizardData.financing.creditScoreRange = profile.preferred_credit_score || profile.credit_score_range || 'excellent';

    // Load user's garage vehicles
    loadUserGarageVehicles();

    // Load saved vehicles for the dropdown
    await loadSavedVehicles();
  });

  // Listen for slider changes
  window.addEventListener('slider-changed', (e) => {
    const { id, value, delta, percentage } = e.detail;

    // Update wizardData based on slider ID
    switch(id) {
      case 'quickSliderSalePrice':
        wizardData.financing.salePrice = value;
        break;
      case 'quickSliderCashDown':
        wizardData.financing.cashDown = value;
        break;
      case 'quickSliderTradeAllowance':
        wizardData.tradein.tradeValue = value;
        break;
      case 'quickSliderTradePayoff':
        wizardData.tradein.tradePayoff = value;
        break;
    }

    // Recalculate payment
    refreshReview();
  });

  // Export modal functions to window (must be before AuthManager.initialize)
  window.openCustomerProfileModal = openCustomerProfileModal;
  window.closeCustomerProfileModal = closeCustomerProfileModal;
  window.saveCustomerProfile = saveCustomerProfile;
  window.openMyGarageModal = openMyGarageModal;
  window.openMyOffersModal = openMyOffersModal;

  // Initialize Authentication Manager (after event listeners are set up)
  await AuthManager.initialize();

  // Helper function to load user's garage vehicles
  async function loadUserGarageVehicles() {
    const authStore = useAuthStore.getState();
    if (!authStore.user) {
      return;
    }

    const vehicles = await getGarageVehicles(authStore.user.id);
    useGarageStore.getState().setVehicles(vehicles);


    // Update vehicle selector dropdown if it exists
    updateVehicleSelectorDropdown();
  }

  // Setup vehicle selector dropdown for VIN field
  function setupVehicleSelector() {
    const vinInput = document.getElementById('quick-vin');
    if (!vinInput) return;

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.id = 'vehicle-selector-dropdown';
    dropdown.className = 'vehicle-selector-dropdown';
    dropdown.style.display = 'none';
    vinInput.parentElement.appendChild(dropdown);

    // Show dropdown on focus
    vinInput.addEventListener('focus', () => {
      const garageStore = useGarageStore.getState();
      if (garageStore.vehicles && garageStore.vehicles.length > 0) {
        updateVehicleSelectorDropdown();
        dropdown.style.display = 'block';
      }
    });

    // Hide dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!vinInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  // Update vehicle selector dropdown with current garage vehicles and saved vehicles
  function updateVehicleSelectorDropdown() {
    const dropdown = document.getElementById('vehicle-selector-dropdown');
    if (!dropdown) return;

    const garageStore = useGarageStore.getState();
    const garageVehicles = garageStore.vehicles || [];
    const savedVehiclesData = savedVehicles || [];

    if (garageVehicles.length === 0 && savedVehiclesData.length === 0) {
      dropdown.innerHTML = `
        <div class="vehicle-selector-empty">
          <p>No vehicles</p>
          <small>Click "My Garage" to add vehicles or search for vehicles to save</small>
        </div>
      `;
      return;
    }

    let html = '';

    // Render "In My Garage" section if there are garage vehicles
    if (garageVehicles.length > 0) {
      html += `
        <div class="vehicle-section-header">In My Garage</div>
        ${garageVehicles.map(vehicle => `
          <div class="vehicle-selector-item garage-vehicle" data-vehicle-id="${vehicle.id}" data-source="garage">
            ${buildVehicleSummaryMarkup(vehicle)}
          </div>
        `).join('')}
      `;
    }

    // Render "Saved Vehicles" section if there are saved vehicles
    if (savedVehiclesData.length > 0) {
      html += `
        <div class="vehicle-section-header ${garageVehicles.length > 0 ? 'with-top-margin' : ''}">Saved Vehicles</div>
        ${savedVehiclesData.map(vehicle => `
          <div class="vehicle-selector-item saved-vehicle-row" data-vehicle-id="${vehicle.id}" data-source="saved">
            <div class="vehicle-info" data-vehicle-id="${vehicle.id}">
              ${buildVehicleSummaryMarkup(vehicle)}
            </div>
            <button
              class="btn-add-to-garage"
              onclick="event.stopPropagation(); addSavedVehicleToGarage('${vehicle.id}')">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              <span>Add to My Garage</span>
            </button>
          </div>
        `).join('')}
      `;
    }

    dropdown.innerHTML = html;

    // Add click handlers for garage vehicles
    dropdown.querySelectorAll('.garage-vehicle').forEach(item => {
      item.addEventListener('click', async () => {
        const vehicleId = item.dataset.vehicleId;
        const vehicle = garageVehicles.find(v => v.id === vehicleId);
        if (vehicle) {
          await selectGarageVehicle(vehicle);
          dropdown.style.display = 'none';
        }
      });
    });

    // Add click handlers for saved vehicles (click on info area)
    dropdown.querySelectorAll('.saved-vehicle-row .vehicle-info').forEach(infoArea => {
      infoArea.addEventListener('click', () => {
        const vehicleId = infoArea.dataset.vehicleId;
        const vehicle = savedVehiclesData.find(v => v.id === vehicleId);
        if (vehicle) {
          selectQuickSavedVehicle(vehicle);
          dropdown.style.display = 'none';
        }
      });
    });
  }

  // Make updateVehicleSelectorDropdown globally accessible
  window.updateVehicleSelectorDropdown = updateVehicleSelectorDropdown;

  // Handle vehicle selection from garage
  async function selectGarageVehicle(vehicle) {

    // Populate VIN field
    const vinInput = document.getElementById('quick-vin');
    if (vinInput && vehicle.vin) {
      vinInput.value = vehicle.vin;
      vinInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Reset financing controls to defaults when switching vehicles
    const termDropdown = document.getElementById('quick-loan-term');
    if (termDropdown) {
      termDropdown.value = '72'; // Reset to default 72 months
    }

    // Reset custom APR override
    customAprOverride = null;

    // Determine sale price from available fields
    const salePrice = vehicle.asking_price || vehicle.price || vehicle.estimated_value || vehicle.msrp;

    // Update wizardData
    if (wizardData) {
      wizardData.vehicle = {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim || '',
        vin: vehicle.vin || '',
        // Distinguish condition grade (garage) vs sale condition (buying)
        conditionGrade: (vehicle.condition || 'good'),
        saleCondition: deriveSaleCondition({ year: vehicle.year, condition: vehicle.saleCondition || vehicle.condition }),
        mileage: vehicle.mileage || 0
      };

      // Reset financing term to default
      if (wizardData.financing) {
        wizardData.financing.term = 72;
      }

      // Set sale price

      if (salePrice) {
        // Update the hidden input that autoCalculateQuick reads from
        const quickVehiclePrice = document.getElementById('quick-vehicle-price');
        if (quickVehiclePrice) {
          quickVehiclePrice.value = salePrice;
        }

        // Update the slider (but don't dispatch event yet - will happen after centered sliders init)
        const salePriceSlider = document.getElementById('quickSliderSalePrice');
        if (salePriceSlider) {

          // Ensure max is high enough to accommodate the price
          const minMax = calculateSliderMax(salePrice);
          salePriceSlider.max = minMax.toString();

          salePriceSlider.value = salePrice;
        }

        // Set wizardData AFTER updating slider to avoid race condition
        wizardData.financing.salePrice = Number(salePrice);

      } else {
      }

      // Set trade-in values if available - ONLY from actual trade-in fields
      if (vehicle.estimated_value) {
        wizardData.tradein.tradeValue = vehicle.estimated_value;
        const tradeValueSlider = document.getElementById('quickSliderTradeAllowance');
        if (tradeValueSlider) {
          // Ensure max is high enough
          const minMax = calculateSliderMax(vehicle.estimated_value);
          tradeValueSlider.max = minMax.toString();
          tradeValueSlider.value = vehicle.estimated_value;
        }
      }

      if (vehicle.payoff_amount) {
        wizardData.tradein.tradePayoff = vehicle.payoff_amount;
        const payoffSlider = document.getElementById('quickSliderTradePayoff');
        if (payoffSlider) {
          payoffSlider.value = vehicle.payoff_amount;
        }
      }
    } else {
      console.error('❌ wizardData is not defined!');
    }

    // Trigger VIN decode if the VIN input has a handler
    if (vinInput && vehicle.vin) {
    }

      // Initialize centered sliders if we have a sale price
      if (salePrice) {
        // Apply preferred down payment once a vehicle is active
        await setPreferredDownPayment();
        initializeCenteredSliders();
      }

    // Log wizardData state before calculation

    // Trigger payment calculation
    refreshReview();

    // FIX: Also trigger autoCalculateQuick to update the quick-entry payment display
    // This is needed because refreshReview() only updates the review section,
    // but autoCalculateQuick() is required to update the monthly payment hero
    await autoCalculateQuick();


    // Background VIN verification (non-blocking)
    if (vehicle.vin) {
      verifyVehicleVin(vehicle.vin, vehicle, 'garage').catch(err => {
        console.error('[vin-sync] Background verification failed:', err);
      });
    }
  }


  // Initialize Quick Entry mode (now the default and only mode)
  await initializeQuickEntry();

  // Setup vehicle selector dropdown
  setupVehicleSelector();

  // Set up customer profile button
  const profileBtn = document.getElementById("openCustomerProfileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", openCustomerProfileModal);
  }

  // NOTE: Profile dropdown removed in Phase 1 - now using separate Garage/Profile buttons
  // The header now has two buttons: openMyGarageBtn and openCustomerProfileBtn
  // Old dropdown code commented out to prevent console errors

  // Set up profile dropdown
  // const profileDropdownBtn = document.getElementById("profileDropdownBtn");
  // if (profileDropdownBtn) {
  //   profileDropdownBtn.addEventListener("click", (e) => {
  //     e.stopPropagation();
  //     e.preventDefault();
  //     toggleProfileDropdown();
  //   });
  // }

  // Close dropdown when clicking outside
  // document.addEventListener("click", (e) => {
  //   const dropdown = document.querySelector(".profile-dropdown");
  //   if (dropdown && !dropdown.contains(e.target)) {
  //     closeProfileDropdown();
  //   }
  // });

  // Auto-populate location and calculator fields from customer profile
  await autoPopulateLocationFromProfile();
  await autoPopulateCalculatorFromProfile();

  // Update profile dropdown label with user's first name
  await updateProfileDropdownLabel();
});

/**
 * Initialize Supabase client
 */
async function initializeSupabase() {
  try {
    // Get Supabase credentials from meta tags (like main calculator does)
    const supabaseUrl =
      document.querySelector('meta[name="supabase-url"]')?.content ||
      "https://txndueuqljeujlccngbj.supabase.co"; // Fallback from main app
    const supabaseKey =
      document.querySelector('meta[name="supabase-anon-key"]')?.content ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bmR1ZXVxbGpldWpsY2NuZ2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMzI3OTMsImV4cCI6MjA3MjYwODc5M30.ozHVMxQ0qL4mzZ2q2cRkYPduBk927_a7ffd3tOI6Pdc";

    if (!supabaseUrl || !supabaseKey) {
      return;
    }

    // Get createClient from the global Supabase library (loaded from CDN)
    const { createClient } = window.supabase;
    const authOptions = {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: "excelcalc-auth"
      }
    };
    supabase = createClient(supabaseUrl, supabaseKey, authOptions);

    // Get current session
    const { data, error } = await supabase.auth.getSession();

    currentUserId = data?.session?.user?.id ?? null;
    if (currentUserId) {
      await loadSavedVehicles();
    }

    // Listen for auth state changes
    supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      if (newUserId !== currentUserId) {
        currentUserId = newUserId;
        loadSavedVehicles();
        updateLoginButton();
      }
    });

    // Update login button state
    updateLoginButton();

    // If no session, check if user needs to sign in
    if (!currentUserId) {
    }
  } catch (error) {
    console.error("Error initializing Supabase:", error);
  }
}

/**
 * Update login button based on auth state
 */
function updateLoginButton() {
  const loginBtn = document.getElementById("hero-login-btn");
  if (!loginBtn) return;

  if (currentUserId) {
    // Hide the button when logged in - sign out is now in profile dropdown
    loginBtn.style.display = "none";
  } else {
    loginBtn.textContent = "Sign In";
    loginBtn.style.display = "block";
  }
}

/**
 * Handle auth button click
 */
async function handleAuthClick() {
  if (!supabase) {
    alert("Authentication not available. Please check your configuration.");
    return;
  }

  if (currentUserId) {
    // Sign out
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error:", error);
      alert("Error signing out. Please try again.");
    }
  } else {
    // Redirect to sign in - use magic link or redirect to auth page
    const redirectUrl = window.location.origin + window.location.pathname;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error("Sign in error:", error);
      alert("Error signing in. Please try again.");
    }
  }
}
window.handleAuthClick = handleAuthClick;
window.showToast = showToast;

/**
 * Load Google Maps API with Places library
 */
async function loadGoogleMaps() {
  try {
    // Try to get API key from server endpoint (like main app does)
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) throw new Error("Failed to get config");

    const data = await response.json();
    const apiKey = data.googleMaps?.apiKey;

    if (!apiKey) {
      return;
    }

    // Load Google Maps script
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places",
      callback: "initGooglePlaces",
      loading: "async",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    // Set global callback
    window.initGooglePlaces = () => {
      googleMapsLoaded = true;
      setupPlacesAutocomplete();
      setupQuickLocationAutocomplete();
    };
  } catch (error) {
    console.error("Error loading Google Maps:", error);
  }
}

/**
 * Setup Google Places autocomplete on location input
 */
function setupPlacesAutocomplete() {
  const locationInput = document.getElementById("user-location");
  const g = typeof window !== "undefined" ? window.google : undefined;
  if (!locationInput || !g || !g.maps || !g.maps.places) return;

  try {
    placesAutocomplete = new g.maps.places.Autocomplete(locationInput, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });

    placesAutocomplete.addListener("place_changed", async () => {
      const place = placesAutocomplete.getPlace();
      if (!place.geometry) return;

      // Extract location data
      const location = {
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        zip: extractZipFromPlace(place),
      };

      const locale = extractLocaleFromComponents(
        place.address_components ?? []
      );
      location.stateCode = locale.stateCode;
      location.countyName = locale.countyName;

      wizardData.location = location;

      applyLocaleToFees(locale);

      // Update hint to show selected location
      const hint = locationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using: ${location.zip || "your location"}`;
        hint.style.color = "var(--success)";
      }

      // Populate year dropdown now that location is set
      await populateYearDropdowns();

      // Show vehicle selection section now that location is set
      const vehicleSelectionSection = document.getElementById(
        "vehicle-selection-section"
      );
      if (vehicleSelectionSection) {
        vehicleSelectionSection.style.display = "block";
      }
    });
  } catch (error) {
    console.error("Error setting up Places autocomplete:", error);
  }
}

/**
 * Extract ZIP code from Google Place result
 */
function extractZipFromPlace(place) {
  if (!place.address_components) return null;

  for (const component of place.address_components) {
    if (component.types.includes("postal_code")) {
      return component.long_name;
    }
  }
  return null;
}

function extractLocaleFromComponents(components = []) {
  let stateCode = "";
  let countyName = "";
  components.forEach((component) => {
    const types = component?.types ?? [];
    if (types.includes("administrative_area_level_1")) {
      stateCode =
        component.short_name ?? component.long_name ?? stateCode ?? "";
    }
    if (types.includes("administrative_area_level_2")) {
      countyName = (component.long_name ?? component.short_name ?? "")
        .replace(/ County$/i, "")
        .trim();
    }
  });
  return { stateCode, countyName };
}

function applyLocaleToFees({ stateCode, countyName }) {
  ensureWizardFeeDefaults();
  const upperState = stateCode ? stateCode.toUpperCase() : "";
  const upperCounty = countyName ? countyName.toUpperCase() : "";
  wizardData.location = {
    ...wizardData.location,
    stateCode: upperState,
    countyName: countyName ?? "",
  };

  const config = TAX_RATE_CONFIG[upperState] ?? null;
  const hasUserOverride = Boolean(wizardData.fees?.userTaxOverride);

  if (config && !hasUserOverride) {
    const statePercent = Math.round((config.stateRate ?? 0) * 10000) / 100;
    const countyPercent =
      Math.round((config.counties?.[upperCounty] ?? 0) * 10000) / 100;
    wizardData.fees.stateTaxRate = statePercent;
    wizardData.fees.countyTaxRate = countyPercent;
    updateTaxInputs();
    if (currentStep === 4) {
      refreshReview().catch((error) => {
        console.error(
          "[fees] Unable to refresh review after applying locale",
          error
        );
      });
    }
  } else if (!config || hasUserOverride) {
    updateTaxInputs();
  }

  // Update tax labels in quick entry itemization
  updateTaxLabels();
}

/**
 * Setup location input (manual ZIP entry if Google Maps not available)
 */
function setupLocationInput() {
  const locationInput = document.getElementById("user-location");

  // Skip if element doesn't exist (e.g., in express mode without wizard)
  if (!locationInput) {
    return;
  }

  // Also allow manual ZIP entry
  locationInput.addEventListener("input", async (e) => {
    const value = e.target.value.trim();

    // If it looks like a ZIP code (5 digits)
    if (/^\d{5}$/.test(value)) {
      wizardData.location = {
        zip: value,
        address: value,
      };

      const hint = locationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using ZIP: ${value}`;
        hint.style.color = "var(--success)";
      }

      if (google?.maps?.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: value }, (results, status) => {
          if (status === "OK" && results?.length) {
            const components = results[0].address_components ?? [];
            const { stateCode, countyName } =
              extractLocaleFromComponents(components);
            applyLocaleToFees({ stateCode, countyName });
          }
        });
      }

      // Populate year dropdown now that location is set
      await populateYearDropdowns();

      // Show vehicle selection section now that location is set
      const vehicleSelectionSection = document.getElementById(
        "vehicle-selection-section"
      );
      if (vehicleSelectionSection) {
        vehicleSelectionSection.style.display = "block";
      }
    }
  });
}

/**
 * Load saved vehicles from Supabase
 */
async function loadSavedVehicles() {
  try {

    if (!supabase) {
      return;
    }

    if (!currentUserId) {
      savedVehicles = [];
      return;
    }

    // Query vehicles table with specific columns (using inserted_at like main app)
    const { data, error } = await supabase
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
      .eq("user_id", currentUserId)
      .order("inserted_at", { ascending: false });

    if (error) {
      console.error("[vehicles] Error loading saved vehicles:", error);
      savedVehicles = [];
      return;
    }

    savedVehicles = (data || []).map((vehicle) => {
      const parsedLat =
        typeof vehicle.dealer_lat === "number"
          ? vehicle.dealer_lat
          : vehicle.dealer_lat != null
          ? Number.parseFloat(vehicle.dealer_lat)
          : null;
      const parsedLng =
        typeof vehicle.dealer_lng === "number"
          ? vehicle.dealer_lng
          : vehicle.dealer_lng != null
          ? Number.parseFloat(vehicle.dealer_lng)
          : null;

      // Normalize saleCondition: auto-detect based on year if missing or incorrect
      const currentYear = new Date().getFullYear();
      let saleCondition = vehicle.condition ? String(vehicle.condition).toLowerCase() : "";
      if (
        !saleCondition ||
        !(
          saleCondition === "new" ||
          saleCondition === "used" ||
          saleCondition === "cpo" ||
          saleCondition.startsWith("certified")
        )
      ) {
        saleCondition = parseInt(vehicle.year) >= currentYear ? "new" : "used";
      } else if (saleCondition.startsWith("certified") || saleCondition === "cpo") {
        saleCondition = "cpo";
      }

      return {
        ...vehicle,
        dealer_lat: Number.isFinite(parsedLat) ? parsedLat : null,
        dealer_lng: Number.isFinite(parsedLng) ? parsedLng : null,
        condition: saleCondition, // Back-compat: legacy field
        saleCondition: saleCondition,
      };
    });


    // Update the vehicle selector dropdown with saved vehicles
    // Check if updateVehicleSelectorDropdown is available (it's defined in event listener setup)
    if (typeof updateVehicleSelectorDropdown === 'function') {
      updateVehicleSelectorDropdown();
    }

    // Note: Dropdown will be populated when user focuses on VIN field
    // via setupQuickSavedVehicles() event listeners - don't show it automatically
  } catch (error) {
    console.error("[vehicles] Error loading saved vehicles:", error);
    savedVehicles = [];
  }
}

/**
 * Setup VIN input with autocomplete and search
 */
function setupVINInput() {
  const vinInput = document.getElementById("vin-input");
  const dropdown = document.getElementById("saved-vehicles-dropdown");

  if (!vinInput || !dropdown) {
    return;
  }

  vinInput.addEventListener("focus", () => {
    if (savedVehicles.length > 0) {
      showSavedVehiclesDropdown();
    }
  });

  vinInput.addEventListener("input", (e) => {
    const value = e.target.value.toUpperCase().trim();

    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
      vinInput.style.borderColor = "var(--success)";
    } else {
      vinInput.style.borderColor = "";
    }

    if (value.length > 0) {
      filterSavedVehicles(value);
    } else {
      showSavedVehiclesDropdown();
    }
  });

  vinInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const vin = vinInput.value.trim();
      if (vin.length === 17) {
        await searchVehicleByVIN(vin);
      }
    } else if (e.key === "Escape") {
      dropdown.style.display = "none";
    }
  });

  document.addEventListener("click", (e) => {
    if (!vinInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
}

/**
 * Setup cascading dropdowns for manual vehicle entry
 */
function setupCascadingDropdowns() {
  const yearInput = document.getElementById("year-input");
  const makeInput = document.getElementById("make-input");
  const modelInput = document.getElementById("model-input");
  const trimInput = document.getElementById("trim-input");

  const makeGroup = document.getElementById("make-group");
  const modelGroup = document.getElementById("model-group");
  const trimGroup = document.getElementById("trim-group");

  // Skip if elements don't exist (e.g., in express mode without wizard)
  if (!yearInput || !makeInput || !modelInput || !trimInput) {
    return;
  }

  // Populate makes when year is selected
  yearInput.addEventListener("change", async () => {
    const year = yearInput.value;

    if (!year) {
      // Hide all subsequent dropdowns
      makeGroup.style.display = "none";
      modelGroup.style.display = "none";
      trimGroup.style.display = "none";
      return;
    }

    // Show make dropdown and populate it
    makeGroup.style.display = "block";
    await populateMakes(year);

    // Hide subsequent dropdowns until make is selected
    modelGroup.style.display = "none";
    trimGroup.style.display = "none";

    checkAndShowPreview();
  });

  // Populate models when make is selected
  makeInput.addEventListener("change", async () => {
    const year = yearInput.value;
    const make = makeInput.value;

    if (!year || !make) {
      modelGroup.style.display = "none";
      trimGroup.style.display = "none";
      return;
    }

    // Show model dropdown and populate it
    modelGroup.style.display = "block";
    await populateModels(year, make);

    // Hide trim dropdown until model is selected
    trimGroup.style.display = "none";

    checkAndShowPreview();
  });

  // Populate trims when model is selected
  modelInput.addEventListener("change", async () => {
    const year = yearInput.value;
    const make = makeInput.value;
    const model = modelInput.value;

    if (!year || !make || !model) {
      trimGroup.style.display = "none";
      return;
    }

    // Show trim dropdown and populate it
    trimGroup.style.display = "block";
    await populateTrims(year, make, model);

    checkAndShowPreview();
  });

  // Check for preview when trim changes
  trimInput.addEventListener("change", () => {
    checkAndShowPreview();
  });
}

/**
 * Check if manual selection is complete and show preview
 */
async function checkAndShowPreview() {
  const yearInput = document.getElementById("year-input");
  const makeInput = document.getElementById("make-input");
  const modelInput = document.getElementById("model-input");
  const trimInput = document.getElementById("trim-input");

  const year = yearInput.value;
  const make = makeInput.value;
  const model = modelInput.value;
  const trim = trimInput.value || "";

  // Hide preview if required fields aren't filled
  if (!year || !make || !model) {
    document.getElementById("manual-vehicle-preview").style.display = "none";
    return;
  }

  try {
    // Search for matching vehicle with the user's exact selection
    const zip = wizardData.location?.zip || "";
    const trimParam = trim ? `&trim=${encodeURIComponent(trim)}` : "";

    const response = await fetch(
      `${API_BASE}/api/mc/search?year=${year}&make=${encodeURIComponent(
        make
      )}&model=${encodeURIComponent(
        model
      )}${trimParam}&zip=${zip}&radius=100&rows=1`
    );

    if (!response.ok) {
      throw new Error("Failed to search for vehicle");
    }

    const data = await response.json();

    if (data.listings && data.listings.length > 0) {
      const vehicle = data.listings[0];
      // Auto-detect condition based on year
      const currentYear = new Date().getFullYear();
      vehicle.condition = parseInt(year) >= currentYear ? "new" : "used";
      displayManualVehiclePreview(vehicle);
    } else {
      // No listings found - show informative message
      displayNoListingsMessage(year, make, model, trim);
    }
  } catch (error) {
    console.error("[manual-preview] Error:", error);
    displayNoListingsMessage(year, make, model, trim);
  }
}

/**
 * Display message when no listings are found
 */
function displayNoListingsMessage(year, make, model, trim) {
  const previewSection = document.getElementById("manual-vehicle-preview");
  const previewCard = document.getElementById("manual-vehicle-preview-card");

  const trimText = trim ? ` - ${capitalizeWords(trim)}` : "";
  const vehicleText = `${year} ${capitalizeWords(make)} ${capitalizeWords(
    model
  )}${trimText}`;

  previewCard.innerHTML = `
    <div class="no-listings-message">
      <div class="no-listings-message__icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      </div>
      <div class="no-listings-message__content">
        <div class="no-listings-message__title">No Active Listings Found</div>
        <div class="no-listings-message__text">
          We couldn't find any active listings for <strong>${vehicleText}</strong> in your area.
          <br><br>
          This might mean:
          <ul>
            <li>This specific trim/configuration is rare in your local market</li>
            <li>Try selecting a different trim or broadening your search</li>
            <li>Or proceed anyway to get financing estimates based on your manual entry</li>
          </ul>
        </div>
        <button onclick="document.getElementById('manual-vehicle-preview').style.display='none'; document.getElementById('trim-input').value=''; document.getElementById('trim-input').focus();" class="no-listings-message__button">
          Try Different Trim
        </button>
      </div>
    </div>
  `;

  previewSection.style.display = "block";
}

/**
 * Display manual vehicle selection preview card
 */
function displayManualVehiclePreview(vehicle) {
  const previewSection = document.getElementById("manual-vehicle-preview");
  const previewCard = document.getElementById("manual-vehicle-preview-card");

  // Clean model name
  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);

  // Make card clickable if listing URL exists
  const cardClickHandler = vehicle.listing_url
    ? `onclick="window.open('${vehicle.listing_url}', '_blank')" style="cursor: pointer;"`
    : "";

  const imageHtml = vehicle.photo_url
    ? `<img src="${vehicle.photo_url}" alt="${vehicle.year} ${vehicle.make} ${cleanedModel}" class="manual-preview__image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="manual-preview__image-placeholder" style="display: none;">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
         </svg>
       </div>`
    : `<div class="manual-preview__image-placeholder">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
         </svg>
       </div>`;

  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(
    vehicle.make || ""
  )} ${capitalizeWords(cleanedModel || "")}${
    vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ""
  }`;

  previewCard.innerHTML = `
    <div class="manual-preview__badge">
      <svg fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
      </svg>
      Preview Your Selection
    </div>

    <div class="manual-preview__content" ${cardClickHandler}>
      <div class="manual-preview__title">
        ${vehicleDetailsText}
      </div>

      <div class="manual-preview__image-container">
        ${imageHtml}
      </div>

      <div class="manual-preview__details">
        ${
          (deriveSaleCondition(vehicle) || "")
            ? `
          <div class=\"manual-preview__info\">
            <span class=\"label\">Sale Condition:</span>
            <span class=\"value\">${getVehicleSaleConditionText(deriveSaleCondition(vehicle))}</span>
          </div>
        `
            : ""
        }
        ${
          vehicle.mileage
            ? `
          <div class="manual-preview__info">
            <span class="label">Mileage:</span>
            <span class="value">${formatMileage(vehicle.mileage)} mi</span>
          </div>
        `
            : ""
        }
        ${
          vehicle.asking_price
            ? `
          <div class="manual-preview__info">
            <span class="label">Asking Price:</span>
            <span class="value">${formatCurrency(vehicle.asking_price)}</span>
          </div>
        `
            : ""
        }
        ${
          vehicle.vin
            ? `
          <div class="manual-preview__info">
            <span class="label">VIN:</span>
            <span class="value vin-value">${formatVIN(vehicle.vin)}</span>
          </div>
        `
            : ""
        }
        ${
          vehicle.listing_url
            ? `
          <a href="${vehicle.listing_url}" target="_blank" class="manual-preview__link-button">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
            View Full Listing & Photos on Dealer Website
          </a>
        `
            : ""
        }
    </div>
  `;

  previewSection.style.display = "block";

  // Store the selection for use in next step
  selectedVehicle = {
    ...vehicle,
    condition: vehicle.condition || "Used", // back-compat
    saleCondition: (vehicle.condition || "Used"),
  };
}

/**
 * Populate makes for selected year
 */
async function populateMakes(year) {
  const makeSelect = document.getElementById("make-input");

  try {
    makeSelect.innerHTML = '<option value="">Loading...</option>';
    makeSelect.disabled = true;

    // Get user's zip if available for more relevant results
    const zip = wizardData.location?.zip || "";
    const zipParam = zip ? `&zip=${zip}` : "";

    // Try to query MarketCheck for makes by year
    const response = await fetch(
      `${API_BASE}/api/mc/makes?year=${year}${zipParam}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch makes");
    }

    const data = await response.json();
    let makes = data.makes || [];

    // If MarketCheck returns no makes, fall back to Supabase saved vehicles
    if (makes.length === 0) {
      const makesSet = new Set();
      savedVehicles
        .filter((v) => parseInt(v.year) === parseInt(year))
        .forEach((v) => {
          if (v.make) makesSet.add(v.make);
        });
      makes = Array.from(makesSet);

      if (makes.length > 0) {
      }
    }

    // Sort makes alphabetically
    makes.sort((a, b) => a.localeCompare(b));

    // Populate dropdown
    makeSelect.innerHTML = '<option value="">Select Make</option>';
    makes.forEach((make) => {
      const option = document.createElement("option");
      option.value = make;
      option.textContent = capitalizeWords(make);
      makeSelect.appendChild(option);
    });

    makeSelect.disabled = false;
  } catch (error) {
    console.error(
      "[cascading-dropdowns] Error fetching makes from MarketCheck:",
      error
    );

    // Fall back to Supabase saved vehicles
    const makesSet = new Set();
    savedVehicles
      .filter((v) => parseInt(v.year) === parseInt(year))
      .forEach((v) => {
        if (v.make) makesSet.add(v.make);
      });
    const makes = Array.from(makesSet).sort((a, b) => a.localeCompare(b));

    makeSelect.innerHTML = '<option value="">Select Make</option>';
    makes.forEach((make) => {
      const option = document.createElement("option");
      option.value = make;
      option.textContent = capitalizeWords(make);
      makeSelect.appendChild(option);
    });

    makeSelect.disabled = false;

    if (makes.length > 0) {
    } else {
      makeSelect.innerHTML = '<option value="">No makes available</option>';
    }
  }
}

/**
 * Populate models for selected year and make
 */
async function populateModels(year, make) {
  const modelSelect = document.getElementById("model-input");

  try {
    modelSelect.innerHTML = '<option value="">Loading...</option>';
    modelSelect.disabled = true;

    // Get user's zip if available for more relevant results
    const zip = wizardData.location?.zip || "";
    const zipParam = zip ? `&zip=${zip}` : "";

    // Try to query MarketCheck for models
    const response = await fetch(
      `${API_BASE}/api/mc/models?year=${year}&make=${encodeURIComponent(
        make
      )}${zipParam}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch models");
    }

    const data = await response.json();
    let models = data.models || [];

    // If MarketCheck returns no models, fall back to Supabase saved vehicles
    if (models.length === 0) {
      const modelsSet = new Set();
      savedVehicles
        .filter((v) => parseInt(v.year) === parseInt(year) && v.make === make)
        .forEach((v) => {
          if (v.model) modelsSet.add(v.model);
        });
      models = Array.from(modelsSet);

      if (models.length > 0) {
      }
    }

    // Sort models alphabetically
    models.sort((a, b) => a.localeCompare(b));

    // Populate dropdown
    modelSelect.innerHTML = '<option value="">Select Model</option>';
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = capitalizeWords(model);
      modelSelect.appendChild(option);
    });

    modelSelect.disabled = false;
  } catch (error) {
    console.error(
      "[cascading-dropdowns] Error fetching models from MarketCheck:",
      error
    );

    // Fall back to Supabase saved vehicles
    const modelsSet = new Set();
    savedVehicles
      .filter((v) => parseInt(v.year) === parseInt(year) && v.make === make)
      .forEach((v) => {
        if (v.model) modelsSet.add(v.model);
      });
    const models = Array.from(modelsSet).sort((a, b) => a.localeCompare(b));

    modelSelect.innerHTML = '<option value="">Select Model</option>';
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = capitalizeWords(model);
      modelSelect.appendChild(option);
    });

    modelSelect.disabled = false;

    if (models.length > 0) {
    } else {
      modelSelect.innerHTML = '<option value="">No models available</option>';
    }
  }
}

/**
 * Populate trims for selected year, make, and model
 */
async function populateTrims(year, make, model) {
  const trimSelect = document.getElementById("trim-input");

  try {
    trimSelect.innerHTML = '<option value="">Loading...</option>';
    trimSelect.disabled = true;

    // Get user's zip if available for more relevant results
    const zip = wizardData.location?.zip || "";
    const zipParam = zip ? `&zip=${zip}` : "";

    // Try to query MarketCheck for trims
    const response = await fetch(
      `${API_BASE}/api/mc/trims?year=${year}&make=${encodeURIComponent(
        make
      )}&model=${encodeURIComponent(model)}${zipParam}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch trims");
    }

    const data = await response.json();
    let trims = data.trims || [];

    if (trims.length === 0) {
      // Fall back to Supabase saved vehicles
      const trimsSet = new Set();
      savedVehicles
        .filter(
          (v) =>
            parseInt(v.year) === parseInt(year) &&
            v.make === make &&
            v.model === model
        )
        .forEach((v) => {
          if (v.trim) trimsSet.add(v.trim);
        });
      trims = Array.from(trimsSet).sort((a, b) => a.localeCompare(b));

      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      trims.forEach((trim) => {
        const option = document.createElement("option");
        option.value = trim;
        option.textContent = capitalizeWords(trim);
        trimSelect.appendChild(option);
      });
      trimSelect.disabled = false;

      return;
    }

    // Sort trims alphabetically
    trims.sort((a, b) => a.localeCompare(b));

    // Validate each trim by checking if it actually has listings (only if MarketCheck is working)
    const validTrims = [];

    // We'll validate trims in batches for better performance
    for (const trim of trims) {
      try {
        const searchResponse = await fetch(
          `${API_BASE}/api/mc/search?year=${year}&make=${encodeURIComponent(
            make
          )}&model=${encodeURIComponent(model)}&trim=${encodeURIComponent(
            trim
          )}&zip=${zip}&radius=100&rows=1`
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.listings && searchData.listings.length > 0) {
            // Verify the trim actually matches (case-insensitive)
            const listing = searchData.listings[0];
            const listingTrim = listing.trim || listing.build?.trim || "";
            if (listingTrim.toLowerCase() === trim.toLowerCase()) {
              validTrims.push(trim);
            } else {
            }
          } else {
          }
        }
      } catch (err) {
        // If validation fails due to API quota, skip validation and use all trims
        if (err.message.includes("429")) {
          validTrims.push(...trims.filter((t) => !validTrims.includes(t)));
          break;
        }
      }
    }

    // Populate dropdown with only validated trims
    trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';

    if (validTrims.length > 0) {
      validTrims.forEach((trim) => {
        const option = document.createElement("option");
        option.value = trim;
        option.textContent = capitalizeWords(trim);
        trimSelect.appendChild(option);
      });
    } else {
      // No valid trims, but don't disable - user can still search without trim
    }

    trimSelect.disabled = false;
  } catch (error) {
    console.error(
      "[cascading-dropdowns] Error fetching trims from MarketCheck:",
      error
    );

    // Fall back to Supabase saved vehicles
    const trimsSet = new Set();
    savedVehicles
      .filter(
        (v) =>
          parseInt(v.year) === parseInt(year) &&
          v.make === make &&
          v.model === model
      )
      .forEach((v) => {
        if (v.trim) trimsSet.add(v.trim);
      });
    const trims = Array.from(trimsSet).sort((a, b) => a.localeCompare(b));

    trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
    trims.forEach((trim) => {
      const option = document.createElement("option");
      option.value = trim;
      option.textContent = capitalizeWords(trim);
      trimSelect.appendChild(option);
    });
    trimSelect.disabled = false;
  }
}

/**
 * Show saved vehicles dropdown
 */
function showSavedVehiclesDropdown() {
  const dropdown = document.getElementById("saved-vehicles-dropdown");
  dropdown.innerHTML = "";

  if (savedVehicles.length === 0) {
    dropdown.innerHTML =
      '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No saved vehicles</div>';
    dropdown.style.display = "block";
    return;
  }

  savedVehicles.forEach((vehicle, index) => {
    const item = document.createElement("div");
    item.className = "saved-vehicle-item";
    item.innerHTML = `
      <div class="saved-vehicle-item__title">${
        vehicle.year || ""
      } ${capitalizeWords(vehicle.make || "")} ${capitalizeWords(
      vehicle.model || ""
    )}</div>
      <div class="saved-vehicle-item__details">${capitalizeWords(
        vehicle.trim || ""
      )} • ${formatMileage(vehicle.mileage || 0)} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${formatVIN(
        vehicle.vin || "N/A"
      )}</div>
    `;
    item.addEventListener("click", () => selectSavedVehicle(vehicle));
    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

/**
 * Filter saved vehicles by search term
 */
function filterSavedVehicles(searchTerm) {
  const dropdown = document.getElementById("saved-vehicles-dropdown");
  const filtered = savedVehicles.filter(
    (v) =>
      (v.vin && v.vin.includes(searchTerm)) ||
      (v.make && v.make.toUpperCase().includes(searchTerm)) ||
      (v.model && v.model.toUpperCase().includes(searchTerm)) ||
      (v.year && String(v.year).includes(searchTerm))
  );

  dropdown.innerHTML = "";

  if (filtered.length === 0) {
    dropdown.innerHTML =
      '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No matches found</div>';
    dropdown.style.display = "block";
    return;
  }

  filtered.forEach((vehicle) => {
    const item = document.createElement("div");
    item.className = "saved-vehicle-item";
    item.innerHTML = `
      <div class="saved-vehicle-item__title">${vehicle.year || ""} ${
      vehicle.make || ""
    } ${vehicle.model || ""}</div>
      <div class="saved-vehicle-item__details">${vehicle.trim || ""} • ${
      vehicle.mileage?.toLocaleString() || "N/A"
    } miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${formatVIN(vehicle.vin || "N/A")}</div>
    `;
    item.addEventListener("click", () => selectSavedVehicle(vehicle));
    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

/**
 * Select a saved vehicle
 */
function selectSavedVehicle(vehicle) {
  document.getElementById("vin-input").value = vehicle.vin || "";
  document.getElementById("saved-vehicles-dropdown").style.display = "none";
  if (vehicle.vin) {
    searchVehicleByVIN(vehicle.vin, vehicle);
  }
}

// Variable to store unavailable vehicle info for deletion
let unavailableVehicleData = null;

/**
 * Show unavailable vehicle modal
 */
function showUnavailableVehicleModal(vehicle) {
  unavailableVehicleData = vehicle;

  const modal = document.getElementById("unavailable-vehicle-modal");
  const detailsDiv = document.getElementById("unavailable-vehicle-details");

  // Populate vehicle details
  detailsDiv.innerHTML = `
    <strong>Vehicle Information:</strong>
    <div class="vehicle-info">${vehicle.year || "N/A"} ${capitalizeWords(
    vehicle.make || ""
  )} ${capitalizeWords(vehicle.model || "")}</div>
    ${
      vehicle.trim
        ? `<div class="vehicle-info">Trim: ${capitalizeWords(
            vehicle.trim
          )}</div>`
        : ""
    }
    ${
      vehicle.mileage
        ? `<div class="vehicle-info">Mileage: ${formatMileage(
            vehicle.mileage
          )} miles</div>`
        : ""
    }
    <div class="vehicle-info">VIN: ${formatVIN(vehicle.vin || "N/A")}</div>
  `;

  modal.classList.add("active");
  modal.style.display = "flex";
}

/**
 * Close unavailable vehicle modal
 */
function closeUnavailableVehicleModal() {
  const modal = document.getElementById("unavailable-vehicle-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
  unavailableVehicleData = null;

  // Clear VIN input
  document.getElementById("vin-input").value = "";
}
window.closeUnavailableVehicleModal = closeUnavailableVehicleModal;

/**
 * Remove unavailable vehicle from database
 */
async function removeUnavailableVehicle() {
  if (!unavailableVehicleData || !unavailableVehicleData.vin) {
    console.error("[remove-vehicle] No vehicle data to remove");
    return;
  }

  if (!supabase || !currentUserId) {
    alert("Unable to remove vehicle: Not signed in");
    return;
  }

  try {
    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("user_id", currentUserId)
      .eq("vin", unavailableVehicleData.vin);

    if (error) {
      console.error("[remove-vehicle] Error removing vehicle:", error);
      alert("Failed to remove vehicle from database");
      return;
    }

    // Reload saved vehicles to update the dropdown
    await loadSavedVehicles();

    // Close modal
    closeUnavailableVehicleModal();

    // Show success message
    alert("Vehicle removed from your saved vehicles");
  } catch (error) {
    console.error("[remove-vehicle] Error:", error);
    alert("Failed to remove vehicle");
  }
}
window.removeUnavailableVehicle = removeUnavailableVehicle;

/**
 * Check vehicle listing status from MarketCheck response and show appropriate toast
 * @param {object} vinData - MarketCheck API response
 * @param {object} savedVehicle - The saved vehicle being validated
 * @returns {object} { shouldContinue: boolean, useData: object|null }
 */
function checkVehicleListingStatus(vinData, savedVehicle) {
  if (!savedVehicle) {
    // Not a saved vehicle selection, skip validation
    return { shouldContinue: true, useData: vinData?.payload || null };
  }

  const searchSource = vinData?.extras?.search_source || "";
  const isActive =
    searchSource.includes("active listings") ||
    searchSource.includes("private seller");
  const isHistorical = searchSource.includes("historical");
  const notFound = !vinData?.found || !vinData?.payload;

  // SUCCESS: Vehicle found in active listings
  if (isActive && vinData?.payload) {
    const sourceLabel = searchSource.includes("zip-aware")
      ? "nearby dealer listings"
      : searchSource.includes("nationwide")
      ? "dealer listings nationwide"
      : searchSource.includes("private seller")
      ? "private seller listings"
      : "active listings";

    showToast(
      `✓ Listing verified - Vehicle is still active\nFound in: ${sourceLabel}`,
      "success"
    );
    return { shouldContinue: true, useData: vinData.payload };
  }

  // WARNING: Vehicle only found in historical listings (inactive)
  if (isHistorical && vinData?.payload) {
    showToastWithActions(
      `⚠ Listing inactive - This vehicle is no longer available in active listings.\n\nYou can still use the saved data, but the listing may have been sold or removed.`,
      "warning",
      [
        {
          label: "Keep Anyway",
          callback: () => {
          },
        },
        {
          label: "Remove from Saved",
          callback: async () => {
            await removeSavedVehicleByVin(savedVehicle.vin);
          },
        },
      ],
      12000 // 12 seconds to read and decide
    );
    // Allow continuing with historical data
    return { shouldContinue: true, useData: vinData.payload };
  }

  // ERROR: Vehicle not found at all
  if (notFound) {
    showToastWithActions(
      `❌ Listing not found - Vehicle could not be found in MarketCheck.\n\nThe listing may have been removed. You can still use your saved data or remove it.`,
      "error",
      [
        {
          label: "Use Saved Data",
          callback: () => {
          },
        },
        {
          label: "Remove from Saved",
          callback: async () => {
            await removeSavedVehicleByVin(savedVehicle.vin);
          },
        },
      ],
      0 // Don't auto-dismiss error toasts
    );
    // Continue with saved vehicle data as fallback
    return { shouldContinue: true, useData: savedVehicle };
  }

  // Default: continue with whatever data we have
  return { shouldContinue: true, useData: vinData?.payload || savedVehicle };
}

/**
 * Remove a saved vehicle by VIN (used in toast action callbacks)
 * @param {string} vin - The VIN of the vehicle to remove
 */
async function removeSavedVehicleByVin(vin) {
  if (!supabase || !currentUserId) {
    showToast("Unable to remove vehicle: Not signed in", "error");
    return;
  }

  try {
    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("user_id", currentUserId)
      .eq("vin", vin);

    if (error) {
      console.error("[remove-vehicle] Error removing vehicle:", error);
      showToast("Failed to remove vehicle from database", "error");
      return;
    }

    // Reload saved vehicles to update the dropdown
    await loadSavedVehicles();

    // Clear VIN input
    const vinInput = document.getElementById("vin-input");
    if (vinInput) vinInput.value = "";

    showToast("Vehicle removed from your saved vehicles", "success");
  } catch (error) {
    console.error("[remove-vehicle] Error:", error);
    showToast("Failed to remove vehicle", "error");
  }
}

/**
 * Search for vehicle by VIN and show similar vehicles
 * @param {string} vin - The VIN to search
 * @param {object} savedVehicle - Optional saved vehicle data (if loading from saved vehicles)
 */
async function searchVehicleByVIN(vin, savedVehicle = null) {
  const vinInput = document.getElementById("vin-input");
  const loading = document.getElementById("vin-loading");
  const similarSection = document.getElementById("similar-vehicles-section");
  const similarGrid = document.getElementById("similar-vehicles-grid");

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    alert("Please enter a valid 17-character VIN");
    return;
  }

  // Check if user has entered location (required for distance calculations and Smart Offer)
  const userZip = wizardData.location?.zip;
  if (!userZip) {
    alert(
      "Please enter your location first.\n\nYour location is needed to:\n• Calculate distance from dealer\n• Find similar vehicles nearby\n• Generate Smart Offer pricing"
    );
    document.getElementById("user-location").focus();
    return;
  }

  loading.style.display = "block";
  vinInput.disabled = true;
  similarSection.style.display = "none";

  try {
    let vehicleDetails = null;
    let allSimilarVehicles = [];

    // 1. Try to get vehicle details by VIN from MarketCheck
    let vinData = null;
    try {
      const vinResponse = await fetch(
        `${API_BASE}/api/mc/by-vin/${vin}?zip=${userZip}&radius=100`
      );

      if (vinResponse.ok) {
        vinData = await vinResponse.json();

        // Check listing status and show appropriate toast (only for saved vehicles)
        const validationResult = checkVehicleListingStatus(vinData, savedVehicle);

        if (validationResult.shouldContinue && validationResult.useData) {
          vehicleDetails = validationResult.useData;
        }
      }
    } catch (mcError) {
      console.error("[search-vehicle] MarketCheck error:", mcError);
    }

    // 2. If MarketCheck failed and we have saved vehicle data, use it
    if (!vehicleDetails && savedVehicle) {
      // Show toast that we're using saved data due to API failure
      showToast(
        "⚠ Using saved vehicle data - MarketCheck API unavailable",
        "warning",
        6000
      );
      vehicleDetails = savedVehicle;
    }

    // If we still don't have vehicle details, throw error
    if (!vehicleDetails) {
      throw new Error("VIN not found");
    }

    // 3. Try to search for similar vehicles from MarketCheck
    try {
      const searchParams = new URLSearchParams({
        year: vehicleDetails.year,
        make: vehicleDetails.make,
        model: vehicleDetails.model,
        zip: userZip,
        radius: 100,
        rows: 50,
      });

      const searchResponse = await fetch(
        `${API_BASE}/api/mc/search?${searchParams}`
      );
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        allSimilarVehicles = searchData.listings || [];
      }
    } catch (mcError) {
      // Continue with empty similar vehicles array
    }

    // 4. Calculate Smart Offer for display in "Your Vehicle" card
    // This will use saved vehicles even if MarketCheck is unavailable
    const smartOfferData = calculateQuickSmartOffer(
      allSimilarVehicles,
      vehicleDetails
    );

    // 5. Display the user's vehicle with Smart Offer
    displayYourVehicle(vehicleDetails, smartOfferData);

    // 6. Prioritize vehicles by trim match quality
    similarVehicles = prioritizeVehiclesByTrim(
      allSimilarVehicles,
      vehicleDetails
    );

    // 7. Auto-select the vehicle (whether or not similar vehicles are found)
    selectedVehicle = {
      ...vehicleDetails,
      condition:
        vehicleDetails.condition ||
        (parseInt(vehicleDetails.year) >= new Date().getFullYear()
          ? "new"
          : "used"),
    };
    hideManualEntry();

    // Populate vehicle price field with asking price or Smart Offer
    const vehiclePriceInput = document.getElementById("vehicle-price");
    if (vehiclePriceInput) {
      const priceToUse = smartOfferData?.offer || vehicleDetails.asking_price;
      if (priceToUse) {
        vehiclePriceInput.value = formatCurrency(priceToUse);
        vehiclePriceInput.dataset.basePrice = priceToUse; // Store base price for formula calculations
        wizardData.financing.salePrice = priceToUse;
      }
    }

    // 8. Display similar vehicles if found (as alternatives)
    if (similarVehicles.length > 0) {
      displaySimilarVehicles(similarVehicles, vehicleDetails);
      similarSection.style.display = "block";
    }
  } catch (error) {
    console.error("[search-vehicle] Error:", error);

    // For manual VIN entry (not saved vehicle), show error message
    if (!savedVehicle) {
      showToast(
        `❌ Could not find vehicle: ${error.message}\n\nPlease check the VIN and try again.`,
        "error"
      );
    }
    // For saved vehicles, the validation toast has already been shown by checkVehicleListingStatus()
  } finally {
    loading.style.display = "none";
    vinInput.disabled = false;
  }
}

/**
 * Calculate a quick Smart Offer from similar vehicles data
 * CRITICAL: Smart Offer logic based on market position:
 * - If vehicle is already cheapest or near-cheapest: minimal discount ($500)
 * - If vehicle is below average: small discount (3-5%)
 * - If vehicle is above average: reasonable discount (8-12%)
 * - INCLUDES saved vehicles from database in comparison
 */
function calculateQuickSmartOffer(similarVehicles, vehicle) {
  // Must have an asking price on the user's vehicle
  if (!vehicle.asking_price || vehicle.asking_price <= 0) {
    return null;
  }

  // IMPORTANT: Include saved vehicles in the comparison
  // Filter saved vehicles that match year/make/model
  const matchingSavedVehicles = savedVehicles.filter(
    (sv) =>
      sv.year === vehicle.year &&
      sv.make?.toLowerCase() === vehicle.make?.toLowerCase() &&
      sv.model?.toLowerCase() === vehicle.model?.toLowerCase() &&
      sv.asking_price &&
      sv.asking_price > 0 &&
      sv.vin !== vehicle.vin // Don't compare vehicle to itself
  );

  // Combine MarketCheck results with saved vehicles
  const allVehicles = [...similarVehicles, ...matchingSavedVehicles];
  const vehiclesWithPrices = allVehicles.filter(
    (v) => v.asking_price && v.asking_price > 0
  );

  if (vehiclesWithPrices.length < 3) {
    return null; // Not enough data
  }

  // Try exact trim match first
  let filteredVehicles = [];
  if (vehicle.trim) {
    const vehicleTrim = vehicle.trim.toLowerCase();
    filteredVehicles = vehiclesWithPrices.filter(
      (v) => v.trim && v.trim.toLowerCase() === vehicleTrim
    );
  }

  // Fall back to all vehicles if not enough exact matches
  if (filteredVehicles.length < 3) {
    filteredVehicles = vehiclesWithPrices;
  }

  // Check for significantly cheaper saved vehicles (same trim, $5k+ cheaper)
  let cheaperSavedVehicle = null;
  if (vehicle.trim) {
    const sameTrimSaved = matchingSavedVehicles.filter(
      (sv) =>
        sv.trim?.toLowerCase() === vehicle.trim.toLowerCase() &&
        sv.asking_price < vehicle.asking_price - 5000 // At least $5k cheaper
    );

    if (sameTrimSaved.length > 0) {
      // Find the cheapest one
      cheaperSavedVehicle = sameTrimSaved.reduce((cheapest, current) =>
        current.asking_price < cheapest.asking_price ? current : cheapest
      );
    }
  }

  // Calculate market statistics
  const prices = filteredVehicles
    .map((v) => v.asking_price)
    .sort((a, b) => a - b);
  const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const lowestPrice = prices[0];
  const highestPrice = prices[prices.length - 1];
  const priceRange = highestPrice - lowestPrice;

  // Determine vehicle's market position
  const percentileInMarket =
    priceRange > 0 ? (vehicle.asking_price - lowestPrice) / priceRange : 0.5;
  const vsAverage = vehicle.asking_price / average;

  let smartOffer;
  let message = "";
  let pricePosition = "";

  // CASE 1: Vehicle is already the cheapest or within 5% of lowest price
  if (vehicle.asking_price <= lowestPrice * 1.05) {
    smartOffer = vehicle.asking_price - 500; // Only $500 discount
    message = "Already at a great price!";
    pricePosition = "lowest";
  }
  // CASE 2: Vehicle is below market average (good deal already)
  else if (vsAverage < 0.95) {
    // 3-5% discount for below-average prices
    const discountPercent = 0.04;
    smartOffer =
      Math.round((vehicle.asking_price * (1 - discountPercent)) / 500) * 500;
    message = "Priced below market average";
    pricePosition = "below-average";
  }
  // CASE 3: Vehicle is near market average (±5%)
  else if (vsAverage >= 0.95 && vsAverage <= 1.05) {
    // 8% discount for average-priced vehicles
    const discountPercent = 0.08;
    smartOffer =
      Math.round((vehicle.asking_price * (1 - discountPercent)) / 500) * 500;
    message = "Priced at market average";
    pricePosition = "average";
  }
  // CASE 4: Vehicle is above market average (room for negotiation)
  else {
    // 10-12% discount for above-average prices
    const discountPercent = vsAverage > 1.15 ? 0.12 : 0.1;
    smartOffer =
      Math.round((vehicle.asking_price * (1 - discountPercent)) / 500) * 500;
    message = "Priced above market average";
    pricePosition = "above-average";
  }

  // CRITICAL: Override market position if cheaper saved vehicle exists
  let priceDiff = 0;
  if (cheaperSavedVehicle) {
    priceDiff = vehicle.asking_price - cheaperSavedVehicle.asking_price;
    message = `Appears ${formatCurrency(
      priceDiff
    )} higher than similar vehicle`;
    pricePosition = "overpriced-vs-saved";
  }

  // Safety check: Smart Offer must be at least $500 below asking
  const minimumOffer = vehicle.asking_price - 500;
  smartOffer = Math.min(smartOffer, minimumOffer);

  return {
    offer: smartOffer,
    average: Math.round(average),
    count: filteredVehicles.length,
    message,
    pricePosition,
    lowestPrice,
    highestPrice,
    cheaperSavedVehicle: cheaperSavedVehicle
      ? {
          vin: cheaperSavedVehicle.vin,
          year: cheaperSavedVehicle.year,
          make: cheaperSavedVehicle.make,
          model: cheaperSavedVehicle.model,
          trim: cheaperSavedVehicle.trim,
          asking_price: cheaperSavedVehicle.asking_price,
          mileage: cheaperSavedVehicle.mileage,
          photo_url: cheaperSavedVehicle.photo_url,
          priceDifference: priceDiff,
        }
      : null,
  };
}

/**
 * Remove duplicate make from model name
 * e.g., "Ram Ram 1500" becomes "Ram 1500"
 */
function cleanModelName(make, model) {
  if (!make || !model) return model;
  const makeLower = make.toLowerCase();
  const modelLower = model.toLowerCase();

  // Check if model starts with the make name
  if (modelLower.startsWith(makeLower + " ")) {
    return model.substring(make.length + 1);
  }

  return model;
}

/**
 * Display the user's vehicle in a prominent card with badge
 */
function displayYourVehicle(vehicle, smartOfferData = null) {
  const section = document.getElementById("your-vehicle-section");
  const card = document.getElementById("your-vehicle-card");

  // Clean model name to avoid duplicates
  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);

  // Make card clickable if listing URL exists
  const cardClickHandler = vehicle.listing_url
    ? `onclick="window.open('${vehicle.listing_url}', '_blank')" style="cursor: pointer;"`
    : "";

  const imageHtml = vehicle.photo_url
    ? `<img src="${vehicle.photo_url}" alt="${vehicle.year} ${vehicle.make} ${cleanedModel}" class="your-vehicle-card__image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="your-vehicle-card__image-placeholder" style="display: none;">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
         </svg>
       </div>`
    : `<div class="your-vehicle-card__image-placeholder">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
         </svg>
       </div>`;

  // Build compact vehicle details line: "Year Make Model - Trim"
  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(
    vehicle.make || ""
  )} ${capitalizeWords(cleanedModel || "")}${
    vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ""
  }`;

  // Warning about cheaper saved vehicle
  const cheaperVehicleWarning = smartOfferData?.cheaperSavedVehicle
    ? `
    <div class="cheaper-vehicle-warning">
      <div class="cheaper-vehicle-warning__icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
      </div>
      <div class="cheaper-vehicle-warning__content">
        <div class="cheaper-vehicle-warning__title">Similar Vehicle Found for Less</div>
        <div class="cheaper-vehicle-warning__details">
          You previously viewed a ${
            smartOfferData.cheaperSavedVehicle.year
          } ${capitalizeWords(
        smartOfferData.cheaperSavedVehicle.make
      )} ${capitalizeWords(smartOfferData.cheaperSavedVehicle.model)} ${
        smartOfferData.cheaperSavedVehicle.trim
          ? "- " + capitalizeWords(smartOfferData.cheaperSavedVehicle.trim)
          : ""
      } for <strong>${formatCurrency(
        smartOfferData.cheaperSavedVehicle.asking_price
      )}</strong>
          (${formatCurrency(
            smartOfferData.cheaperSavedVehicle.priceDifference
          )} less).
          <a href="#" class="cheaper-vehicle-link" onclick="event.preventDefault(); document.getElementById('vin-input').value='${
            smartOfferData.cheaperSavedVehicle.vin
          }'; searchVehicleByVIN('${smartOfferData.cheaperSavedVehicle.vin}');">
            View that vehicle
          </a>
        </div>
      </div>
    </div>
  `
    : "";

  const smartOfferHtml = smartOfferData
    ? `
    <div class="your-vehicle-card__smart-offer">
      <div class="your-vehicle-card__smart-offer-badge">
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"></path>
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"></path>
        </svg>
        <span>Smart Offer</span>
      </div>
      <div class="your-vehicle-card__smart-offer-value">${formatCurrency(
        smartOfferData.offer
      )}</div>
      <div class="your-vehicle-card__smart-offer-text">${
        smartOfferData.message ||
        "Based on " + smartOfferData.count + " similar vehicles"
      }</div>
      ${cheaperVehicleWarning}
    </div>
  `
    : "";

  card.innerHTML = `
    <div class="your-vehicle-card__badge">
      <svg fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      Your Vehicle
    </div>

    <div class="your-vehicle-card__content" ${cardClickHandler}>
      <div class="your-vehicle-card__title">
        ${vehicleDetailsText}
      </div>

      <div class="your-vehicle-card__image-container">
        ${imageHtml}
      </div>

      <div class="your-vehicle-card__details">
        <div class="your-vehicle-card__info-row">
          ${
            vehicle.mileage
              ? `
            <div class="your-vehicle-card__info-inline">
              <span class="label">Mileage:</span>
              <span class="value">${formatMileage(vehicle.mileage)} mi</span>
            </div>
          `
              : ""
          }
          ${
            vehicle.asking_price
              ? `
            <div class="your-vehicle-card__info-inline">
              <span class="label">Asking Price:</span>
              <span class="value">${formatCurrency(vehicle.asking_price)}</span>
            </div>
          `
              : ""
          }
        </div>

        ${smartOfferHtml}

        <div class="your-vehicle-card__vin">
          <span class="label">VIN:</span> ${formatVIN(vehicle.vin)}
        </div>
      </div>
    </div>
  `;

  section.style.display = "block";
}

/**
 * Prioritize vehicles by trim match quality
 * Exact trim matches first, then similar, then others
 */
function prioritizeVehiclesByTrim(vehicles, originalVehicle) {
  if (!originalVehicle.trim || vehicles.length === 0) {
    // No trim to match, return first 12
    return vehicles.slice(0, 12);
  }

  const originalTrim = originalVehicle.trim.toLowerCase();
  const trimKeywords = originalTrim.split(/\s+/).filter((w) => w.length > 2);

  // Categorize vehicles by match quality
  const exactMatches = [];
  const similarMatches = [];
  const otherVehicles = [];

  vehicles.forEach((vehicle) => {
    if (!vehicle.trim) {
      otherVehicles.push(vehicle);
      return;
    }

    const vehicleTrim = vehicle.trim.toLowerCase();

    // Exact match
    if (vehicleTrim === originalTrim) {
      exactMatches.push(vehicle);
    }
    // Similar match (contains key words)
    else if (trimKeywords.some((keyword) => vehicleTrim.includes(keyword))) {
      similarMatches.push(vehicle);
    }
    // Other trims
    else {
      otherVehicles.push(vehicle);
    }
  });

  // Combine in priority order, limit to 12 total
  const prioritized = [
    ...exactMatches,
    ...similarMatches,
    ...otherVehicles,
  ].slice(0, 12);

  return prioritized;
}

/**
 * Display similar vehicles in horizontal scrollable grid
 */
function displaySimilarVehicles(vehicles, originalVehicle) {
  const grid = document.getElementById("similar-vehicles-grid");
  grid.innerHTML = "";

  vehicles.forEach((vehicle, index) => {
    const card = document.createElement("div");
    card.className = "vehicle-card";
    card.dataset.index = index;

    const isOriginal = vehicle.vin === originalVehicle.vin;

    // Determine trim match badge
    let trimMatchBadge = "";
    if (originalVehicle.trim && vehicle.trim && !isOriginal) {
      const originalTrim = originalVehicle.trim.toLowerCase();
      const vehicleTrim = vehicle.trim.toLowerCase();
      const trimKeywords = originalTrim
        .split(/\s+/)
        .filter((w) => w.length > 2);

      if (vehicleTrim === originalTrim) {
        trimMatchBadge =
          '<div class="vehicle-card__trim-badge exact">Exact Match</div>';
      } else if (
        trimKeywords.some((keyword) => vehicleTrim.includes(keyword))
      ) {
        trimMatchBadge =
          '<div class="vehicle-card__trim-badge similar">Similar Trim</div>';
      }
    }

    card.innerHTML = `
      ${
        isOriginal
          ? '<div class="vehicle-card__badge">Your VIN</div>'
          : trimMatchBadge
      }
      ${
        vehicle.photo_url
          ? `<img src="${vehicle.photo_url}" alt="${vehicle.heading}" class="vehicle-card__image" onerror="this.style.display='none'">`
          : '<div class="vehicle-card__image"></div>'
      }
      <div class="vehicle-card__title">${vehicle.year} ${capitalizeWords(
      vehicle.make || ""
    )} ${capitalizeWords(vehicle.model || "")}</div>
      <div class="vehicle-card__details">
        ${
          vehicle.trim
            ? `<div class="vehicle-card__detail"><span>${capitalizeWords(
                vehicle.trim
              )}</span></div>`
            : ""
        }
        ${
          vehicle.mileage
            ? `
          <div class="vehicle-card__detail">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
            </svg>
            ${formatMileage(vehicle.mileage)} mi
          </div>
        `
            : ""
        }
      </div>
      ${
        vehicle.asking_price
          ? `<div class="vehicle-card__price">${formatCurrency(
              vehicle.asking_price
            )}</div>`
          : '<div class="vehicle-card__price">Price Not Available</div>'
      }
      ${
        vehicle.dealer_city && vehicle.dealer_state
          ? `<div class="vehicle-card__location">${capitalizeWords(
              vehicle.dealer_city || ""
            )}, ${vehicle.dealer_state}</div>`
          : ""
      }
      <div class="vehicle-card__vin">VIN: ${formatVIN(vehicle.vin)}</div>
    `;

    card.addEventListener("click", () => selectVehicleCard(index));
    grid.appendChild(card);
  });
}

/**
 * Select a vehicle from the similar vehicles grid
 */
async function selectVehicleCard(index) {
  const vehicle = similarVehicles[index];

  document.querySelectorAll(".vehicle-card").forEach((card) => {
    card.classList.remove("selected");
  });

  document
    .querySelector(`.vehicle-card[data-index="${index}"]`)
    .classList.add("selected");

  await selectVehicleFromSearch(vehicle);
}

/**
 * Select vehicle from VIN lookup
 */
function selectVehicleFromVIN(vehicleDetails) {
  selectedVehicle = {
    vin: vehicleDetails.vin,
    year: vehicleDetails.year,
    make: vehicleDetails.make,
    model: vehicleDetails.model,
    trim: vehicleDetails.trim,
    mileage: vehicleDetails.mileage,
  };

  showSelectedVehicle();
  hideManualEntry();
  // Attempt to apply preferred down payment after vehicle selection
  try { setPreferredDownPayment(); } catch {}
}

/**
 * Select vehicle from search results
 */
/**
 * Select vehicle from search and save to Supabase
 */
async function selectVehicleFromSearch(vehicle) {
  try {
    // Store full vehicle data
    selectedVehicle = {
      vin: vehicle.vin,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || "",
      mileage: vehicle.mileage || 0,
      condition: vehicle.condition || "Used", // back-compat
      saleCondition: vehicle.saleCondition || vehicle.condition || "Used",
      heading:
        vehicle.heading || `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      asking_price: vehicle.asking_price || null,
      dealer_name: vehicle.dealer_name || null,
      dealer_street: vehicle.dealer_street || null,
      dealer_city: vehicle.dealer_city || null,
      dealer_state: vehicle.dealer_state || null,
      dealer_zip: vehicle.dealer_zip || null,
      dealer_phone: vehicle.dealer_phone || null,
      dealer_lat: vehicle.dealer_lat || null,
      dealer_lng: vehicle.dealer_lng || null,
      listing_id: vehicle.listing_id || null,
      listing_source: "marketcheck",
      listing_url: vehicle.listing_url || null,
      photo_url: vehicle.photo_url || null,
    };

    // Save to Supabase if user is signed in
    if (supabase && currentUserId) {
      // Check if vehicle already exists
      const { data: existingVehicles } = await supabase
        .from("vehicles")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("vin", selectedVehicle.vin)
        .limit(1);

      if (!existingVehicles || existingVehicles.length === 0) {
        // Insert new vehicle
        const { data, error } = await supabase
          .from("vehicles")
          .insert([
            {
              user_id: currentUserId,
              ...selectedVehicle,
            },
          ])
          .select();

        if (error) {
          console.error("[vehicle-select] Error saving vehicle:", error);
        } else {
          // Reload saved vehicles to update the dropdown
          await loadSavedVehicles();
        }
      } else {
      }
    }

    // Auto-populate Vehicle Price field
    if (selectedVehicle.asking_price) {
      const vehiclePriceInput = document.getElementById("vehicle-price");
      if (vehiclePriceInput) {
        vehiclePriceInput.value = formatCurrency(selectedVehicle.asking_price);
        vehiclePriceInput.dataset.basePrice = selectedVehicle.asking_price; // Store base price for formula calculations
        wizardData.financing.salePrice = selectedVehicle.asking_price;
      }
    }

    // Apply preferred down payment once a vehicle is selected
    await setPreferredDownPayment();

    // Reset custom APR override when vehicle changes
    customAprOverride = null;
    // Reset tooltip original values
    if (window.resetAprTooltipOriginal) window.resetAprTooltipOriginal();
    if (window.resetTermTooltipOriginal) window.resetTermTooltipOriginal();
    if (window.resetMonthlyFCTooltipOriginal)
      window.resetMonthlyFCTooltipOriginal();
    if (window.resetTilBaselines) window.resetTilBaselines();

    showSelectedVehicle();
    hideManualEntry();

    // Calculate and display Smart Offer
    await calculateSmartOffer(selectedVehicle);
  } catch (error) {
    console.error("[vehicle-select] Error selecting vehicle:", error);
    // Still show the vehicle even if save failed
    showSelectedVehicle();
    hideManualEntry();
  }
}

/**
 * Clear selected vehicle
 */
function clearSelectedVehicle() {
  selectedVehicle = null;
  // Hide your-vehicle-section instead of deprecated selected-vehicle-display
  document.getElementById("your-vehicle-section").style.display = "none";
  document.getElementById("smart-offer-display").style.display = "none";
  document.getElementById("similar-vehicles-section").style.display = "none";
  document.getElementById("manual-entry-fields").style.display = "block";
  document.getElementById("vin-input").value = "";
  document.getElementById("vin-input").focus();
}

/**
 * Calculate Smart Offer based on market data
 */
async function calculateSmartOffer(vehicle) {
  try {
    const userZip = wizardData.location?.zip;
    if (!userZip) {
      return;
    }

    // Query Marketcheck for similar vehicles (broader search first)
    const searchParams = new URLSearchParams({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      zip: userZip,
      radius: 100,
      rows: 100, // Get more results to enable trim filtering
    });

    // Add trim to search if available (API may support it)
    if (vehicle.trim) {
      searchParams.append("trim", vehicle.trim);
    }

    const response = await fetch(`${API_BASE}/api/mc/search?${searchParams}`);
    if (!response.ok) {
      throw new Error("Failed to fetch similar vehicles");
    }

    const data = await response.json();
    const allVehicles = data.listings || [];

    // Filter out vehicles without asking prices
    const vehiclesWithPrices = allVehicles.filter(
      (v) => v.asking_price && v.asking_price > 0
    );

    // Tiered trim filtering for statistical significance
    const MIN_EXACT_MATCHES = 5; // Ideal: exact trim matches
    const MIN_SIMILAR_MATCHES = 3; // Acceptable: similar trim matches
    const MIN_BROAD_MATCHES = 3; // Minimum: any trim (with warning)

    let filteredVehicles = [];
    let matchQuality = "none";
    let trimMatchInfo = "";

    if (vehicle.trim) {
      const vehicleTrim = vehicle.trim.toLowerCase();

      // Level 1: Try exact trim match
      const exactMatches = vehiclesWithPrices.filter(
        (v) => v.trim && v.trim.toLowerCase() === vehicleTrim
      );

      if (exactMatches.length >= MIN_EXACT_MATCHES) {
        filteredVehicles = exactMatches;
        matchQuality = "exact";
        trimMatchInfo = `exact "${capitalizeWords(vehicle.trim)}" trim`;
      } else {
        // Level 2: Try similar trim (contains key words)
        const trimKeywords = vehicleTrim
          .split(/\s+/)
          .filter((w) => w.length > 2);
        const similarMatches = vehiclesWithPrices.filter((v) => {
          if (!v.trim) return false;
          const vTrim = v.trim.toLowerCase();
          return trimKeywords.some((keyword) => vTrim.includes(keyword));
        });

        if (similarMatches.length >= MIN_SIMILAR_MATCHES) {
          filteredVehicles = similarMatches;
          matchQuality = "similar";
          trimMatchInfo = `similar to "${capitalizeWords(vehicle.trim)}" trim`;
        } else if (vehiclesWithPrices.length >= MIN_BROAD_MATCHES) {
          // Level 3: Use broader search with warning
          filteredVehicles = vehiclesWithPrices;
          matchQuality = "broad";
          trimMatchInfo = "all trims (limited trim-specific data)";
        }
      }
    } else {
      // No trim specified - use all vehicles
      if (vehiclesWithPrices.length >= MIN_BROAD_MATCHES) {
        filteredVehicles = vehiclesWithPrices;
        matchQuality = "no-trim";
        trimMatchInfo = "all trims";
      }
    }

    // Check if we have statistically significant data
    if (filteredVehicles.length < MIN_BROAD_MATCHES) {
      displayInsufficientDataWarning(vehicle, filteredVehicles.length);
      return;
    }

    // Extract and sort prices
    const prices = filteredVehicles
      .map((v) => v.asking_price)
      .sort((a, b) => a - b);

    // Calculate statistics
    const count = prices.length;
    const average = prices.reduce((sum, price) => sum + price, 0) / count;
    const median = prices[Math.floor(count / 2)];
    const min = prices[0];
    const max = prices[prices.length - 1];

    // Calculate standard deviation
    const variance =
      prices.reduce((sum, price) => sum + Math.pow(price - average, 2), 0) /
      count;
    const stdDev = Math.sqrt(variance);

    // ============================================================================
    // MILEAGE DEPRECIATION ANALYSIS
    // ============================================================================
    // Calculate how mileage affects pricing by analyzing exact trim matches
    // This allows us to adjust the Smart Offer based on the user's actual mileage
    // vs. the market average, providing more accurate pricing.
    //
    // Algorithm:
    // 1. Filter vehicles with valid mileage data
    // 2. Calculate depreciation per 1,000 miles using linear regression
    // 3. Determine user's mileage position vs. market average
    // 4. Adjust base offer price accordingly
    // ============================================================================

    const mileageAnalysis = calculateMileageDepreciation(
      filteredVehicles,
      vehicle,
      matchQuality
    );

    // Smart Offer Algorithm:
    // - Start with median (more robust than average for outliers)
    // - Adjust discount based on match quality
    // - Apply mileage-based adjustment (if calculated)
    // - Ensure it's not below minimum (would be unrealistic)
    // - Round to nearest $500 for psychological appeal
    const discountPercent =
      matchQuality === "exact"
        ? 0.06
        : matchQuality === "similar"
        ? 0.05
        : 0.04; // More conservative for broad matches

    const basePrice =
      matchQuality === "exact" ? median : (median + average) / 2; // Average median and mean for less certain data

    let recommendedOffer =
      Math.round((basePrice * (1 - discountPercent)) / 500) * 500;

    // Apply mileage adjustment if analysis is reliable
    if (mileageAnalysis.hasReliableData && mileageAnalysis.adjustment !== 0) {
      recommendedOffer += mileageAnalysis.adjustment;

      // Round to nearest $500 after adjustment
      recommendedOffer = Math.round(recommendedOffer / 500) * 500;
    }

    // Ensure offer is reasonable (not below min)
    const finalOffer = Math.max(recommendedOffer, min + 500);

    // Calculate how good the deal is
    const savingsFromAverage = average - finalOffer;
    const savingsPercent = ((savingsFromAverage / average) * 100).toFixed(1);

    // Calculate confidence score
    const confidenceScore = calculateConfidenceScore(
      count,
      matchQuality,
      stdDev,
      average
    );

    // Display the Smart Offer
    displaySmartOffer({
      offer: finalOffer,
      count,
      average,
      median,
      min,
      max,
      savings: savingsFromAverage,
      savingsPercent,
      vehicle,
      matchQuality,
      trimMatchInfo,
      confidence: confidenceScore,
      stdDev,
      mileageAnalysis, // Add mileage impact data for display
    });
  } catch (error) {
    console.error("[smart-offer] Error calculating Smart Offer:", error);
    document.getElementById("smart-offer-display").style.display = "none";
  }
}

/**
 * ============================================================================
 * MILEAGE DEPRECIATION CALCULATION
 * ============================================================================
 * Analyzes the relationship between mileage and price to calculate
 * depreciation per 1,000 miles. Uses linear regression for robust results.
 *
 * ALGORITHM DOCUMENTATION:
 * ------------------------
 * Purpose: Determine how much value a vehicle loses per 1,000 miles driven
 *
 * Methodology:
 * 1. Filter vehicles with valid mileage and price data
 * 2. Require minimum 5 exact trim matches for statistical significance
 * 3. Calculate linear regression: price = intercept + (slope * mileage)
 * 4. Slope represents depreciation rate ($/mile)
 * 5. Calculate R² to measure correlation strength
 * 6. Compare user's mileage to market average
 * 7. Calculate price adjustment based on mileage difference
 *
 * Statistical Requirements:
 * - Minimum 5 vehicles for calculation
 * - R² > 0.3 for "reliable" correlation
 * - R² > 0.6 for "strong" correlation
 * - Only exact trim matches used (no mixed trim data)
 *
 * Example:
 * - Market has 10 exact trim matches
 * - Avg mileage: 30,000 miles
 * - Depreciation: $300 per 1,000 miles
 * - User's vehicle: 20,000 miles (10k below average)
 * - Adjustment: +$3,000 (vehicle is worth MORE due to lower mileage)
 *
 * @param {Array} vehicles - Filtered vehicles with price data
 * @param {Object} userVehicle - User's selected vehicle
 * @param {string} matchQuality - Quality of trim match ('exact', 'similar', etc)
 * @returns {Object} Mileage analysis data
 */
function calculateMileageDepreciation(vehicles, userVehicle, matchQuality) {
  // Initialize return object with default values
  const analysis = {
    hasReliableData: false,
    depreciationPer1kMiles: 0,
    userMileage: userVehicle.mileage || 0,
    averageMileage: 0,
    mileageDifference: 0,
    adjustment: 0,
    rSquared: 0,
    correlation: "none", // 'none', 'weak', 'moderate', 'strong'
    vehicleCount: 0,
  };

  // Only calculate for vehicles with mileage data
  const vehiclesWithMileage = vehicles.filter(
    (v) => v.mileage && v.mileage > 0 && v.asking_price && v.asking_price > 0
  );

  analysis.vehicleCount = vehiclesWithMileage.length;

  // Require minimum sample size and exact trim matches for accuracy
  const MIN_VEHICLES_FOR_MILEAGE_ANALYSIS = 5;
  if (vehiclesWithMileage.length < MIN_VEHICLES_FOR_MILEAGE_ANALYSIS) {
    return analysis;
  }

  // Only use mileage analysis for exact trim matches
  // Mixed trims have too much price variance from trim differences
  if (matchQuality !== "exact") {
    return analysis;
  }

  // Require user vehicle to have mileage
  if (!userVehicle.mileage || userVehicle.mileage <= 0) {
    return analysis;
  }

  // ============================================================================
  // LINEAR REGRESSION: Calculate depreciation per mile
  // ============================================================================
  // Using least squares method to find best-fit line: price = a + b*mileage
  // Where b (slope) represents the depreciation rate per mile

  const n = vehiclesWithMileage.length;

  // Calculate sums needed for regression
  let sumX = 0; // sum of mileage
  let sumY = 0; // sum of prices
  let sumXY = 0; // sum of (mileage * price)
  let sumX2 = 0; // sum of (mileage²)
  let sumY2 = 0; // sum of (price²)

  vehiclesWithMileage.forEach((v) => {
    const x = v.mileage;
    const y = v.asking_price;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  });

  // Calculate averages
  const meanX = sumX / n;
  const meanY = sumY / n;

  analysis.averageMileage = Math.round(meanX);

  // Calculate slope (depreciation rate) and intercept
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = meanY - slope * meanX;

  // Calculate R² (coefficient of determination)
  // R² measures how well mileage predicts price (0 = no correlation, 1 = perfect correlation)
  const ssTotal = sumY2 - (sumY * sumY) / n; // Total sum of squares
  const ssResidual = sumY2 - intercept * sumY - slope * sumXY; // Residual sum of squares
  const rSquared = 1 - ssResidual / ssTotal;

  analysis.rSquared = Math.max(0, Math.min(1, rSquared)); // Clamp between 0 and 1
  analysis.depreciationPer1kMiles = Math.round(slope * 1000); // Convert to per 1,000 miles

  // ============================================================================
  // CORRELATION STRENGTH CLASSIFICATION
  // ============================================================================
  // R² interpretation:
  // < 0.3: Weak - mileage doesn't strongly predict price (other factors dominate)
  // 0.3-0.6: Moderate - mileage has noticeable impact on price
  // > 0.6: Strong - mileage is a primary price determinant

  if (analysis.rSquared < 0.3) {
    analysis.correlation = "weak";
    analysis.hasReliableData = false; // Don't adjust price for weak correlations
  } else if (analysis.rSquared < 0.6) {
    analysis.correlation = "moderate";
    analysis.hasReliableData = true;
  } else {
    analysis.correlation = "strong";
    analysis.hasReliableData = true;
  }

  // ============================================================================
  // PRICE ADJUSTMENT CALCULATION
  // ============================================================================
  // Calculate how much the user's mileage differs from market average
  // and adjust the offer price accordingly

  if (analysis.hasReliableData) {
    analysis.mileageDifference = userVehicle.mileage - analysis.averageMileage;

    // Calculate adjustment: (mileage difference / 1000) * depreciation per 1k miles
    // Negative mileage difference (below average) = POSITIVE adjustment (worth more)
    // Positive mileage difference (above average) = NEGATIVE adjustment (worth less)
    analysis.adjustment = Math.round(
      -1 * (analysis.mileageDifference / 1000) * analysis.depreciationPer1kMiles
    );

    // Cap adjustment at ±20% of average price to prevent extreme values
    const maxAdjustment = meanY * 0.2;
    analysis.adjustment = Math.max(
      -maxAdjustment,
      Math.min(maxAdjustment, analysis.adjustment)
    );
  }

  return analysis;
}

/**
 * Calculate confidence score for Smart Offer
 * @returns {string} - 'high', 'medium', or 'low'
 */
function calculateConfidenceScore(count, matchQuality, stdDev, average) {
  const coefficientOfVariation = stdDev / average; // Normalized measure of dispersion

  // High confidence: exact trim, good sample size, low variance
  if (
    matchQuality === "exact" &&
    count >= 10 &&
    coefficientOfVariation < 0.15
  ) {
    return "high";
  }

  // Medium confidence: similar trim or decent sample
  if (
    (matchQuality === "similar" && count >= 5) ||
    (matchQuality === "exact" && count >= 5) ||
    (count >= 15 && coefficientOfVariation < 0.2)
  ) {
    return "medium";
  }

  // Low confidence: broad match or small sample
  return "low";
}

/**
 * Display warning when insufficient data is available
 */
function displayInsufficientDataWarning(vehicle, count) {
  const display = document.getElementById("smart-offer-display");
  const content = display.querySelector(".smart-offer-content");

  content.innerHTML = `
    <div class="smart-offer-warning">
      <div class="smart-offer-warning-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 48px; height: 48px;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
      </div>
      <div class="smart-offer-warning-title">Limited Market Data</div>
      <div class="smart-offer-warning-text">
        We found only ${count} similar ${vehicle.year} ${capitalizeWords(
    vehicle.make
  )} ${capitalizeWords(vehicle.model)}
        ${
          vehicle.trim
            ? `<strong>${capitalizeWords(vehicle.trim)}</strong>`
            : ""
        } vehicles in your area.
        <br><br>
        This ${
          vehicle.trim ? "trim may be rare" : "vehicle"
        } or in limited supply.
        We need at least 3 comparable vehicles to provide a reliable Smart Offer.
        <br><br>
        <strong>Recommendation:</strong> Expand your search radius or consult with a dealer for pricing guidance on this specific vehicle.
      </div>
    </div>
  `;

  display.style.display = "block";
}

/**
 * Display Smart Offer recommendation
 */
function displaySmartOffer(data) {
  const display = document.getElementById("smart-offer-display");
  const content = document.getElementById("smart-offer-content");

  // Determine confidence badge styling
  const confidenceBadgeClass =
    data.confidence === "high"
      ? "confidence-high"
      : data.confidence === "medium"
      ? "confidence-medium"
      : "confidence-low";
  const confidenceLabel =
    data.confidence === "high"
      ? "High Confidence"
      : data.confidence === "medium"
      ? "Medium Confidence"
      : "Low Confidence";
  const confidenceIcon =
    data.confidence === "high" ? "✓" : data.confidence === "medium" ? "•" : "⚠";

  // Determine trim match badge styling
  const trimBadgeClass =
    data.matchQuality === "exact"
      ? "trim-exact"
      : data.matchQuality === "similar"
      ? "trim-similar"
      : "trim-broad";

  // Confidence explanation text
  const confidenceText =
    data.confidence === "high"
      ? "Strong statistical significance with exact trim matches and consistent pricing."
      : data.confidence === "medium"
      ? "Good data quality with sufficient comparable vehicles."
      : "Limited comparable data. Use this as a starting point but verify with additional research.";

  // Warning for broad trim matches
  const trimWarning =
    data.matchQuality === "broad" || data.matchQuality === "no-trim"
      ? `
    <div class="smart-offer-trim-warning">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 20px; height: 20px; flex-shrink: 0;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
      <div>
        <strong>Mixed Trim Data:</strong> Limited ${
          data.vehicle.trim ? "exact trim" : "trim"
        } matches found.
        This analysis includes ${
          data.matchQuality === "broad"
            ? "multiple trims"
            : "all available trims"
        }.
        Pricing may vary significantly based on specific trim packages and options.
      </div>
    </div>
  `
      : "";

  // ============================================================================
  // MILEAGE IMPACT VISUALIZATION
  // ============================================================================
  // Show how mileage affects pricing when we have reliable data
  let mileageImpact = "";
  if (data.mileageAnalysis && data.mileageAnalysis.hasReliableData) {
    const mil = data.mileageAnalysis;
    const mileagePosition =
      mil.userMileage < mil.averageMileage
        ? "below"
        : mil.userMileage > mil.averageMileage
        ? "above"
        : "at";
    const mileageColor =
      mil.adjustment > 0
        ? "var(--success)"
        : mil.adjustment < 0
        ? "#ef4444"
        : "#64748b";
    const mileageIcon =
      mil.adjustment > 0 ? "↑" : mil.adjustment < 0 ? "↓" : "→";

    const correlationBadge =
      mil.correlation === "strong"
        ? '<span class="mileage-correlation strong">Strong Correlation</span>'
        : '<span class="mileage-correlation moderate">Moderate Correlation</span>';

    mileageImpact = `
      <div class="mileage-impact-section">
        <div class="mileage-impact-header">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 24px; height: 24px; color: var(--primary-start);">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          <div>
            <div class="mileage-impact-title">Mileage Impact Analysis</div>
            <div class="mileage-impact-subtitle">How mileage affects this ${
              data.vehicle.year
            } ${capitalizeWords(data.vehicle.make)} ${capitalizeWords(
      data.vehicle.model
    )}</div>
          </div>
        </div>

        <div class="mileage-impact-stats">
          <div class="mileage-impact-stat">
            <div class="mileage-impact-stat-label">Your Mileage</div>
            <div class="mileage-impact-stat-value" style="color: ${mileageColor};">
              ${formatMileage(mil.userMileage)} miles
            </div>
          </div>
          <div class="mileage-impact-stat">
            <div class="mileage-impact-stat-label">Market Average</div>
            <div class="mileage-impact-stat-value">${formatMileage(
              mil.averageMileage
            )} miles</div>
          </div>
          <div class="mileage-impact-stat">
            <div class="mileage-impact-stat-label">Depreciation Rate</div>
            <div class="mileage-impact-stat-value">${formatCurrency(
              Math.abs(mil.depreciationPer1kMiles)
            )}/1k mi</div>
          </div>
          <div class="mileage-impact-stat highlight">
            <div class="mileage-impact-stat-label">Mileage Adjustment</div>
            <div class="mileage-impact-stat-value" style="color: ${mileageColor};">
              ${mileageIcon} ${formatCurrency(Math.abs(mil.adjustment))}
            </div>
          </div>
        </div>

        <div class="mileage-impact-explanation">
          ${correlationBadge}
          <div class="mileage-impact-text">
            Your vehicle has <strong>${formatMileage(
              Math.abs(mil.mileageDifference)
            )} ${
      mileagePosition === "below" ? "fewer" : "more"
    } miles</strong> than the market average.
            ${
              mil.adjustment > 0
                ? `This means your vehicle is worth approximately <strong style="color: var(--success);">${formatCurrency(
                    mil.adjustment
                  )} more</strong> than average due to lower mileage.`
                : mil.adjustment < 0
                ? `This means your vehicle is worth approximately <strong style="color: #ef4444;">${formatCurrency(
                    Math.abs(mil.adjustment)
                  )} less</strong> than average due to higher mileage.`
                : "Your mileage is right at the market average."
            }
          </div>
        </div>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="smart-offer-badges">
      <div class="confidence-badge ${confidenceBadgeClass}">
        <span class="badge-icon">${confidenceIcon}</span>
        ${confidenceLabel}
      </div>
      <div class="trim-badge ${trimBadgeClass}">
        ${data.trimMatchInfo}
      </div>
    </div>

    ${trimWarning}

    <div class="smart-offer-recommendation">
      <div class="smart-offer-label">Recommended Offer Price</div>
      <div class="smart-offer-price">${formatCurrency(data.offer)}</div>
      <div class="smart-offer-description">
        Based on <strong>${data.count}</strong> ${
    data.matchQuality === "exact" ? "exact match" : "comparable"
  } ${data.vehicle.year} ${capitalizeWords(
    data.vehicle.make || ""
  )} ${capitalizeWords(data.vehicle.model || "")} vehicles within 100 miles
      </div>
    </div>

    <div class="smart-offer-stats">
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Average Price</div>
        <div class="smart-offer-stat-value">${formatCurrency(
          Math.round(data.average)
        )}</div>
      </div>
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Median Price</div>
        <div class="smart-offer-stat-value">${formatCurrency(
          Math.round(data.median)
        )}</div>
      </div>
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Price Range</div>
        <div class="smart-offer-stat-value">${formatCurrency(
          Math.round(data.min)
        )} - ${formatCurrency(Math.round(data.max))}</div>
      </div>
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Your Savings</div>
        <div class="smart-offer-stat-value" style="color: var(--success);">${formatCurrency(
          Math.round(data.savings)
        )}</div>
      </div>
    </div>

    ${mileageImpact}

    <div class="smart-offer-confidence">
      <strong>${data.savingsPercent}% below average market price.</strong>
      ${confidenceText}
      ${
        data.confidence === "high"
          ? "Dealers are more likely to negotiate when your offer is backed by strong local market data."
          : ""
      }
    </div>
  `;

  display.style.display = "block";

  // Also update the Sale Price field with the Smart Offer
  const salePriceInput = document.getElementById("sale-price");
  if (salePriceInput && data.offer) {
    salePriceInput.value = formatCurrency(data.offer);
    wizardData.financing.salePrice = data.offer;
  }
}

/**
 * Hide manual entry fields
 */
function hideManualEntry() {
  document.getElementById("manual-entry-fields").style.display = "none";
}

/**
 * Populate year dropdowns based on user's location
 */
async function populateYearDropdowns() {
  const yearSelect = document.getElementById("year-input");
  if (!yearSelect) return;

  try {
    // Get user's zip code
    const zip = wizardData.location?.zip || "";

    if (!zip) {
      yearSelect.innerHTML = '<option value="">Enter location first</option>';
      yearSelect.disabled = true;
      return;
    }

    yearSelect.innerHTML = '<option value="">Loading years...</option>';
    yearSelect.disabled = true;

    // Try to fetch available years from MarketCheck API
    const response = await fetch(`${API_BASE}/api/mc/years?zip=${zip}`);

    if (!response.ok) {
      throw new Error("Failed to fetch years");
    }

    const data = await response.json();
    let years = data.years || [];

    // If MarketCheck returns no years or failed, fall back to Supabase saved vehicles
    if (years.length === 0) {
      const yearsSet = new Set();
      savedVehicles.forEach((vehicle) => {
        if (vehicle.year) {
          yearsSet.add(parseInt(vehicle.year));
        }
      });
      years = Array.from(yearsSet).sort((a, b) => b - a);

      if (years.length > 0) {
      }
    }

    // Populate dropdown with available years
    yearSelect.innerHTML = '<option value="">Select Year</option>';
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });

    yearSelect.disabled = false;
  } catch (error) {
    console.error(
      "[year-dropdown] Error fetching years from MarketCheck:",
      error
    );

    // Fall back to Supabase saved vehicles
    const yearsSet = new Set();
    savedVehicles.forEach((vehicle) => {
      if (vehicle.year) {
        yearsSet.add(parseInt(vehicle.year));
      }
    });
    const years = Array.from(yearsSet).sort((a, b) => b - a);

    yearSelect.innerHTML = '<option value="">Select Year</option>';
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });

    yearSelect.disabled = false;

    if (years.length > 0) {
    } else {
      yearSelect.innerHTML = '<option value="">No vehicles available</option>';
    }
  }

}

/**
 * Setup form validation
 */
function setupFormValidation() {
  // Add real-time validation as needed
}

/**
 * Focus next field in tab order (from app.js)
 */
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

  // Select text in next input field
  if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
    next.select?.();
  }
}

/**
 * Setup Enter key to move to next field (like app.js)
 */
function setupEnterKeyNavigation() {
  // Get all form fields
  const allFields = document.querySelectorAll("input, select, textarea");

  allFields.forEach((field) => {
    field.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;

      // Don't handle Enter on buttons or textareas (let users add newlines)
      if (field.tagName === "BUTTON" || field.tagName === "TEXTAREA") return;

      e.preventDefault();

      // Move to next field
      focusNextField(field);
    });
  });
}

/**
 * Setup input formatting for currency and mileage fields
 */
function setupInputFormatting() {
  // Currency fields (vehicle-price handled separately for formula support)
  const currencyFields = ["down-payment"];

  currencyFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      setupCurrencyInput(field);
    }
  });

  // Mileage fields (only trade-in mileage remains)
  // No standalone mileage fields remain (trade-in handled via My Garage)
}

/**
 * Setup formula calculation for vehicle price field
 * Allows users to enter formulas like "-6%" or "-$500" to calculate discounts
 */
function setupVehiclePriceFormulas() {
  const vehiclePriceInput = document.getElementById("vehicle-price");
  if (!vehiclePriceInput) return;

  vehiclePriceInput.addEventListener("blur", function () {
    const value = this.value.trim();
    if (!value) return;

    // Get base price (asking price stored when vehicle was selected)
    const basePrice = parseFloat(this.dataset.basePrice) || 0;

    let calculatedPrice = null;
    let isFormula = false;

    // Handle percentage discount: -6% or 6%
    const percentMatch = value.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
    if (percentMatch && basePrice > 0) {
      const percent = parseFloat(percentMatch[1]);
      calculatedPrice = basePrice * (1 + percent / 100);
      isFormula = true;
    }

    // Handle dollar discount: -$500 or -500
    const dollarMatch = value.match(/^-\$?(\d+(?:,\d{3})*(?:\.\d{2})?)$/);
    if (dollarMatch && basePrice > 0) {
      const discount = parseFloat(dollarMatch[1].replace(/,/g, ""));
      calculatedPrice = basePrice - discount;
      isFormula = true;
    }

    // Handle dollar addition: +$500 or +500
    const addMatch = value.match(/^\+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)$/);
    if (addMatch && basePrice > 0) {
      const addition = parseFloat(addMatch[1].replace(/,/g, ""));
      calculatedPrice = basePrice + addition;
      isFormula = true;
    }

    // If formula was calculated, apply the result
    if (calculatedPrice !== null && calculatedPrice > 0) {
      const finalPrice = Math.round(calculatedPrice);
      this.value = formatCurrency(finalPrice);
      wizardData.financing.salePrice = finalPrice;

      // Show a subtle hint about what was calculated
      const hint = this.nextElementSibling;
      if (hint && hint.classList.contains("form-hint")) {
        hint.textContent = `Calculated from asking price: ${formatCurrency(
          basePrice
        )}`;
        hint.style.color = "var(--success)";
        setTimeout(() => {
          hint.textContent =
            "Enter price or formula: -6% for discount, +$500 for addition";
          hint.style.color = "";
        }, 3000);
      }
    }
    // Not a formula - format as currency
    else if (!isFormula) {
      const numValue = parseFloat(value.replace(/[^0-9.-]/g, ""));
      if (!isNaN(numValue) && numValue > 0) {
        this.value = formatCurrency(numValue);
        wizardData.financing.salePrice = numValue;
      }
    }
  });

  // Handle input to strip non-numeric characters (except formula symbols)
  vehiclePriceInput.addEventListener("input", function () {
    const value = this.value;

    // Allow formulas (%, +, -, $) and numbers
    const cleaned = value.replace(/[^0-9.%+\-$,]/g, "");
    if (cleaned !== value) {
      const cursorPos = this.selectionStart;
      this.value = cleaned;
      this.setSelectionRange(cursorPos, cursorPos);
    }

    // If it's a plain number, update wizardData
    const numValue = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (!isNaN(numValue) && numValue > 0 && !/[%+\-]/.test(value)) {
      wizardData.financing.salePrice = numValue;
    }
  });
}

/**
 * Navigate to next step
 */
function wizardNext() {
  if (!validateStep(currentStep)) {
    return;
  }

  saveStepData(currentStep);

  if (currentStep < totalSteps) {
    currentStep++;
    updateWizardUI();
  }
}

/**
 * Navigate to previous step
 */
function wizardPrev() {
  if (currentStep > 1) {
    currentStep--;
    updateWizardUI();
  }
}

/**
 * Update wizard UI for current step
 */
function updateWizardUI() {
  document.querySelectorAll(".progress-step").forEach((step, index) => {
    const stepNumber = index + 1;
    step.classList.remove("active", "completed");

    if (stepNumber < currentStep) {
      step.classList.add("completed");
    } else if (stepNumber === currentStep) {
      step.classList.add("active");
    }
  });

  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
  document.querySelector(
    ".progress-bar__line-fill"
  ).style.width = `${progressPercent}%`;

  document.querySelectorAll(".wizard-step").forEach((step) => {
    step.classList.remove("active");
  });

  const activeStep = document.querySelector(
    `.wizard-step[data-step="${currentStep}"]`
  );
  if (activeStep) {
    activeStep.classList.add("active");
  }

  if (currentStep === 4) {
    // Open fees modal on first entry to step 4, or if fees haven't been customized
    if (!wizardData.fees || !wizardData.fees.userCustomized) {
      openFeesModal();
      if (!wizardData.fees) {
        wizardData.fees = { userCustomized: false };
      }
    }

    refreshReview().catch((error) => {
      console.error("[review] Unable to populate review section:", error);
    });
  }

  document.querySelector(".wizard-card").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

/**
 * Validate current step
 */
function validateStep(step) {
  let isValid = true;
  let errorMessage = "";

  switch (step) {
    case 1: // Vehicle
      if (!selectedVehicle) {
        const year = document.getElementById("year-input").value;
        const make = document.getElementById("make-input").value;
        const model = document.getElementById("model-input").value;

        if (!year || !make || !model) {
          isValid = false;
          errorMessage =
            "Please select a vehicle or enter year, make, and model manually";
        }
      }

      // Check location (required for distance calculations and Smart Offer)
      if (!wizardData.location?.zip) {
        isValid = false;
        errorMessage =
          "Please enter your location to calculate distance from dealer";
      }
      break;

    case 2: // Financing
      const price = document.getElementById("vehicle-price").value;
      const term = document.getElementById("loan-term").value;
      const creditScore = document.getElementById("credit-score").value;

      if (!price || !term || !creditScore) {
        isValid = false;
        errorMessage = "Please fill in all financing details";
      }
      break;

    case 3: // Trade-in (optional)
      isValid = true;
      break;

    case 4: // Review
      const name = document.getElementById("customer-name").value;
      const email = document.getElementById("customer-email").value;
      const phone = document.getElementById("customer-phone").value;
      const zip = document.getElementById("customer-zip").value;

      if (!name || !email || !phone || !zip) {
        isValid = false;
        errorMessage = "Please fill in all contact information";
      }
      break;
  }

  if (!isValid) {
    alert(errorMessage);
  }

  return isValid;
}

/**
 * Save data from current step
 */
function saveStepData(step) {
  switch (step) {
    case 1: // Vehicle
      if (selectedVehicle) {
        wizardData.vehicle = selectedVehicle;
      } else {
        wizardData.vehicle = {
          year: document.getElementById("year-input").value,
          make: document.getElementById("make-input").value,
          model: document.getElementById("model-input").value,
          trim: document.getElementById("trim-input").value || null,
          // Treat form "condition" as sale condition (New/Used/CPO)
          saleCondition: document.getElementById("condition-input").value || "Used",
        };
      }
      break;

    case 2: // Financing
      // Parse currency values properly
      const vehiclePriceRaw = document.getElementById("vehicle-price").value;
      const downPaymentRaw = document.getElementById("down-payment").value;

      wizardData.financing = {
        salePrice: parseFloat(vehiclePriceRaw.replace(/[^0-9.-]/g, "")) || 0,
        downPayment: parseFloat(downPaymentRaw.replace(/[^0-9.-]/g, "")) || 0,
        loanTerm: document.getElementById("loan-term").value,
        creditScore: document.getElementById("credit-score").value,
      };

      break;

    case 3: // Trade-in
      if (!wizardData.tradein?.hasTradeIn) {
        wizardData.tradein = { hasTradeIn: false };
      }
      if (!wizardData.trade || !wizardData.trade.hasTradeIn) {
        wizardData.trade = {
          hasTradeIn: false,
          value: 0,
          payoff: 0,
          vehicles: []
        };
      }
      break;

    case 4: // Customer info
      wizardData.customer = {
        name: document.getElementById("customer-name").value,
        email: document.getElementById("customer-email").value,
        phone: document.getElementById("customer-phone").value,
        zip: document.getElementById("customer-zip").value,
      };
      break;
  }
}

/**
 * Toggle trade-in fields visibility
 */
/**
 * Compute review data shared between summary and detail views
 */
async function computeReviewData() {
  const financing = wizardData.financing || {};
  const tradein = wizardData.tradein || {};

  const salePrice = parseCurrencyToNumber(financing.salePrice);
  const cashDown = Math.max(
    parseCurrencyToNumber(financing.cashDown || financing.downPayment),
    0
  );
  const term = parseInt(financing.term || financing.loanTerm, 10) || 72;

  const hasTrade = !!tradein.hasTradeIn;
  const tradeOffer = hasTrade
    ? parseCurrencyToNumber(tradein.tradeValue || tradein.value)
    : 0;
  const tradePayoff = hasTrade
    ? parseCurrencyToNumber(tradein.tradePayoff || tradein.payoff)
    : 0;
  const netTrade = tradeOffer - tradePayoff;
  const positiveEquity = Math.max(netTrade, 0);
  const negativeEquity = Math.max(tradePayoff - tradeOffer, 0);

  if (!wizardData.fees) {
    wizardData.fees = {
      dealerFees: 0,
      customerAddons: 0,
      govtFees: 150,
      stateTaxRate: 6.0,
      countyTaxRate: 1.0,
    };
  }

  const fees = wizardData.fees;
  const totalDealerFees = parseCurrencyToNumber(fees.dealerFees);
  const totalCustomerAddons = parseCurrencyToNumber(fees.customerAddons);
  const totalGovtFees = parseCurrencyToNumber(fees.govtFees);
  const stateTaxRate = Number.isFinite(fees.stateTaxRate)
    ? fees.stateTaxRate
    : parseFloat(fees.stateTaxRate) || 0;
  const countyTaxRate = Number.isFinite(fees.countyTaxRate)
    ? fees.countyTaxRate
    : parseFloat(fees.countyTaxRate) || 0;

  const totalFees = totalDealerFees + totalCustomerAddons + totalGovtFees;

  const taxTotals = recomputeTaxes({
    salePrice,
    dealerFees: totalDealerFees,
    customerAddons: totalCustomerAddons,
    tradeOffer,
    stateTaxRate,
    countyTaxRate,
  });

  const stateTaxTotal = taxTotals.stateTaxAmount;
  const countyTaxTotal = taxTotals.countyTaxAmount;
  const totalTaxes = taxTotals.totalTaxes;

  // For display: "Other Charges" shows only fees (not taxes, since Sale Tax is now a separate header row)
  const sumOtherCharges = totalFees;

  // For calculation: Amount Financed includes fees + taxes
  const cashPrice = salePrice;
  const unpaidBalance = cashPrice - cashDown - netTrade;
  const amountFinanced = Math.max(unpaidBalance + totalFees + totalTaxes, 0);

  try {
    await ensureAprOptions();
  } catch (error) {
  }

  const activeLoanCondition = getEffectiveLoanCondition();
  let selectedApr = null;
  try {
    if (selectedLenderId === "lowest") {
      selectedApr =
        getCachedAprInfo(activeLoanCondition) ||
        (await calculateLowestApr(activeLoanCondition));
    } else {
      const cacheKey = getRateCacheKey(selectedLenderId, activeLoanCondition);
      let rateInfo = currentRates.get(cacheKey);
      if (!rateInfo) {
        await calculateLowestApr(activeLoanCondition);
        rateInfo = currentRates.get(cacheKey);
      }

      if (rateInfo) {
        const lender = lendersConfig.find((l) => l.id === selectedLenderId);
        selectedApr = {
          lenderId: selectedLenderId,
          lenderName: lender?.longName || lender?.shortName || selectedLenderId,
          apr: rateInfo.aprDecimal,
          note: rateInfo.note,
          effectiveDate: rateInfo.effectiveDate,
          condition: activeLoanCondition,
        };
      }
    }
  } catch (error) {
  }

  if (!selectedApr || !Number.isFinite(selectedApr.apr)) {
    const defaultAprInfo =
      getCachedAprInfo("new") || getCachedAprInfo("used") || null;
    if (defaultAprInfo) {
      selectedApr = { ...defaultAprInfo };
    }
  }
  if (!selectedApr || !Number.isFinite(selectedApr.apr)) {
    throw new Error("Unable to determine lender APR. Please verify lender data.");
  }
  if (!selectedApr.condition) {
    selectedApr.condition = activeLoanCondition;
  }

  // Check for custom APR override (user manually adjusted APR in TIL section)
  let apr;
  if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
    apr = customAprOverride;
  } else {
    apr = selectedApr.apr;
  }
  const monthlyPayment = calculateMonthlyPayment(amountFinanced, apr, term);
  const totalPayments = monthlyPayment * term;
  const financeCharge = totalPayments - amountFinanced;
  const totalSalePrice = totalPayments + cashDown + netTrade;
  const cashDue = Math.max(cashDown, 0);
  const cashToBuyer = 0;

  return {
    salePrice,
    cashPrice,
    cashDown,
    tradeOffer,
    tradePayoff,
    netTrade,
    positiveEquity,
    negativeEquity,
    unpaidBalance,
    sumOtherCharges,
    totalDealerFees,
    totalCustomerAddons,
    totalGovtFees,
    stateTaxTotal,
    countyTaxTotal,
    totalTaxes,
    amountFinanced,
    monthlyPayment,
    term,
    apr,
    financeCharge,
    totalPayments,
    totalSalePrice,
    cashDue,
    cashToBuyer,
    lenderId: selectedApr.lenderId || "default",
    lenderName: selectedApr.lenderName || "Standard Rate",
    lenderNote: selectedApr.note || "",
    lenderEffectiveDate: selectedApr.effectiveDate || null,
  };
}

/* ==========================================================================
   Lender & Rate Provider Logic
   ========================================================================== */

// Store lenders and rates
let lendersConfig = [];
let currentRates = new Map(); // Map<cacheKey, {apr, note, condition}>
let selectedLenderId = "lowest";
let customAprOverride = null; // Store custom APR when user manually adjusts it (decimal form, e.g., 0.0549 for 5.49%)

function normalizeLoanCondition(value) {
  if (!value) return "";
  const v = String(value).toLowerCase();
  if (v === "cpo" || v.startsWith("certified")) return "used";
  if (v === "new" || v === "used") return v;
  return v;
}

function getRateCacheKey(lenderId, condition) {
  const normalized = normalizeLoanCondition(condition) || "new";
  return `${lenderId || "default"}::${normalized}`;
}

function getEffectiveLoanCondition(conditionOverride) {
  const explicit = normalizeLoanCondition(conditionOverride);
  if (explicit) return explicit;
  const override =
    normalizeLoanCondition(wizardData.financing?.loanConditionOverride) || "";
  if (override) return override;
  return "new";
}

function getCachedAprInfo(condition = "new") {
  const info = wizardData.availableAprs?.[condition];
  return Number.isFinite(info?.apr) ? info : null;
}

/**
 * Load lenders from config
 */
async function loadLenders() {
  try {
    const response = await fetch("/config/lenders.json");
    const lenders = await response.json();
    lendersConfig = lenders.filter((l) => l.enabled !== false);

    populateLenderDropdown();
  } catch (error) {
    console.error("[lenders] Error loading lenders:", error);
    lendersConfig = [];
  }
}

async function ensureAprOptions(force = false) {
  wizardData.availableAprs = wizardData.availableAprs || {};
  const targets = [];
  if (force || !wizardData.availableAprs.new) targets.push("new");
  if (force || !wizardData.availableAprs.used) targets.push("used");

  for (const condition of targets) {
    try {
      const aprInfo = await calculateLowestApr(condition);
      if (aprInfo) {
        wizardData.availableAprs[condition] = aprInfo;
      }
    } catch (error) {
    }
  }

  if (selectedLenderId === "lowest") {
    const effective = getEffectiveLoanCondition();
    const preferred =
      getCachedAprInfo(effective) ||
      getCachedAprInfo("new") ||
      getCachedAprInfo("used") ||
      null;
    if (preferred) {
      wizardData.selectedApr = { ...preferred };
    }
  }

  return wizardData.availableAprs;
}

/**
 * Populate lender dropdown
 */
function populateLenderDropdown() {
  const select = document.getElementById("lender-select");
  if (!select) return;

  // Keep "Lowest APR" option
  select.innerHTML = '<option value="lowest">Lowest APR (Recommended)</option>';

  // Add enabled lenders
  lendersConfig.forEach((lender) => {
    const option = document.createElement("option");
    option.value = lender.id;
    option.textContent = lender.longName || lender.shortName;
    select.appendChild(option);
  });

  // Listen for changes
  select.addEventListener("change", (e) => {
    selectedLenderId = e.target.value;
    // Reset custom APR override when lender changes
    customAprOverride = null;
    // Reset tooltip original values
    if (window.resetAprTooltipOriginal) window.resetAprTooltipOriginal();
    if (window.resetTermTooltipOriginal) window.resetTermTooltipOriginal();
    if (window.resetMonthlyFCTooltipOriginal)
      window.resetMonthlyFCTooltipOriginal();
    if (window.resetTilBaselines) window.resetTilBaselines();
    // Use autoCalculateQuick for quick entry mode
    autoCalculateQuick().catch((error) => {
      console.error("[rates] Unable to refresh after lender change:", error);
    });
  });
}

/**
 * Show toast notification
 */
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("toast--show");
  });

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.classList.remove("toast--show");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Enhanced toast with action buttons
 * @param {string} message - The message to display
 * @param {string} type - Toast type (info, success, warning, error)
 * @param {Array} actions - Array of {label, callback} objects for action buttons
 * @param {number} duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
 */
function showToastWithActions(message, type = "info", actions = [], duration = 0) {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type} toast--with-actions`;

  const messageEl = document.createElement("div");
  messageEl.className = "toast__message";
  messageEl.textContent = message;
  toast.appendChild(messageEl);

  if (actions.length > 0) {
    const actionsEl = document.createElement("div");
    actionsEl.className = "toast__actions";

    actions.forEach(action => {
      const btn = document.createElement("button");
      btn.className = "toast__action-btn";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        action.callback();
        toast.classList.remove("toast--show");
        setTimeout(() => toast.remove(), 300);
      });
      actionsEl.appendChild(btn);
    });

    toast.appendChild(actionsEl);
  }

  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("toast--show");
  });

  // Auto-dismiss if duration > 0
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove("toast--show");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

// ============================================================================
// VIN VERIFICATION SYSTEM
// ============================================================================

// Debug flag for VIN sync - set window.debugVinSync = true to enable verbose logging
window.debugVinSync = window.debugVinSync || false;

// Track ongoing VIN verification requests to prevent overlaps
const activeVinVerifications = new Map();

/**
 * Vehicle schema mapping for garage_vehicles table
 * Maps MarketCheck API fields to our database schema
 */
const GARAGE_VEHICLE_SCHEMA = {
  year: { type: 'integer', apiField: 'year' },
  make: { type: 'text', apiField: 'make' },
  model: { type: 'text', apiField: 'model' },
  trim: { type: 'text', apiField: 'trim' },
  vin: { type: 'text', apiField: 'vin' },
  mileage: { type: 'integer', apiField: 'miles' },
  condition: { type: 'text', apiField: null }, // Derived from year
  estimated_value: { type: 'numeric', apiField: 'price' },
  payoff_amount: { type: 'numeric', apiField: null }, // User-specific, not from API
  photo_url: { type: 'text', apiField: 'media.photo_links[0]' },
  nickname: { type: 'text', apiField: null }, // User-specific
  notes: { type: 'text', apiField: null } // User-specific
};

/**
 * Fetch VIN details from MarketCheck API
 * @param {string} vin - Vehicle Identification Number
 * @returns {Promise<Object|null>} - Normalized vehicle data or null
 */
async function fetchVinDetails(vin) {
  if (!vin || typeof vin !== 'string') {
    return null;
  }

  const cleanVin = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(cleanVin)) {
    return null;
  }

  try {

    const response = await fetch(`${API_BASE}/api/mc/by-vin/${cleanVin}`);

    if (!response.ok) {
      if (window.debugVinSync) {
      }
      return null;
    }

    const data = await response.json();

    if (window.debugVinSync) {
    }

    return normalizeMarketCheckResponse(data);
  } catch (error) {
    console.error('[vin-sync] Fetch error:', error);
    showToast(`VIN verification failed: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Normalize MarketCheck API response to match our vehicle schema
 * @param {Object} apiData - Raw API response
 * @returns {Object} - Normalized vehicle object
 */
function normalizeMarketCheckResponse(apiData) {
  if (!apiData || typeof apiData !== 'object') {
    return {};
  }

  // MarketCheck returns a listing object
  const listing = apiData.listing || apiData;

  // Determine condition based on year
  const currentYear = new Date().getFullYear();
  const vehicleYear = parseInt(listing.year);
  const condition = vehicleYear >= currentYear ? 'new' : 'used';

  // Extract photo URL from media
  let photoUrl = null;
  if (listing.media?.photo_links && Array.isArray(listing.media.photo_links)) {
    photoUrl = listing.media.photo_links[0] || null;
  }

  // Build normalized vehicle object
  const normalized = {
    year: vehicleYear || null,
    make: listing.make || null,
    model: listing.model || null,
    trim: listing.trim || null,
    vin: listing.vin || null,
    mileage: parseInt(listing.miles) || null,
    condition: condition,
    estimated_value: parseFloat(listing.price) || null,
    photo_url: photoUrl
  };

  // Include any extra fields that don't exist in our schema
  const extraFields = {};
  const knownFields = new Set(Object.keys(GARAGE_VEHICLE_SCHEMA));

  Object.keys(listing).forEach(key => {
    if (!knownFields.has(key) && listing[key] != null) {
      extraFields[key] = listing[key];
    }
  });

  if (Object.keys(extraFields).length > 0) {
    normalized._extraFields = extraFields;
  }

  if (window.debugVinSync) {
    if (normalized._extraFields) {
    }
  }

  return normalized;
}

/**
 * Compare stored vehicle with fresh MarketCheck data
 * @param {Object} stored - Current vehicle data from database
 * @param {Object} fresh - Fresh data from MarketCheck
 * @returns {Object} - { changed: boolean, differences: Array, missingFields: Array }
 */
function diffVehicleAttributes(stored, fresh) {
  const differences = [];
  const missingFields = [];

  // Compare known schema fields
  Object.keys(GARAGE_VEHICLE_SCHEMA).forEach(field => {
    const schema = GARAGE_VEHICLE_SCHEMA[field];

    // Skip user-specific fields that shouldn't be auto-updated
    if (['payoff_amount', 'nickname', 'notes'].includes(field)) {
      return;
    }

    const storedValue = stored[field];
    const freshValue = fresh[field];

    // Only compare if fresh value exists
    if (freshValue != null && storedValue !== freshValue) {
      // Normalize for comparison
      const storedNorm = normalizeValueForComparison(storedValue, schema.type);
      const freshNorm = normalizeValueForComparison(freshValue, schema.type);

      if (storedNorm !== freshNorm) {
        differences.push({
          field,
          oldValue: storedValue,
          newValue: freshValue,
          displayName: fieldToDisplayName(field)
        });
      }
    }
  });

  // Check for extra fields from MarketCheck that don't exist in our schema
  if (fresh._extraFields) {
    Object.keys(fresh._extraFields).forEach(field => {
      if (!GARAGE_VEHICLE_SCHEMA[field]) {
        missingFields.push({
          field,
          value: fresh._extraFields[field],
          suggestedType: inferSqlType(fresh._extraFields[field])
        });
      }
    });
  }

  if (window.debugVinSync) {
  }

  return {
    changed: differences.length > 0 || missingFields.length > 0,
    differences,
    missingFields
  };
}

/**
 * Normalize values for comparison
 */
function normalizeValueForComparison(value, type) {
  if (value == null) return null;

  switch (type) {
    case 'integer':
      return parseInt(value);
    case 'numeric':
      return parseFloat(value);
    case 'text':
      return String(value).trim().toLowerCase();
    default:
      return value;
  }
}

/**
 * Convert field name to display name
 */
function fieldToDisplayName(field) {
  const displayNames = {
    year: 'Year',
    make: 'Make',
    model: 'Model',
    trim: 'Trim',
    vin: 'VIN',
    mileage: 'Mileage',
    condition: 'Condition',
    estimated_value: 'Estimated Value',
    photo_url: 'Photo',
    payoff_amount: 'Payoff Amount',
    nickname: 'Nickname',
    notes: 'Notes'
  };
  return displayNames[field] || field;
}

/**
 * Infer SQL type from JavaScript value
 */
function inferSqlType(value) {
  if (value == null) return 'TEXT';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'INTEGER' : 'NUMERIC(10,2)';
  }
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (Array.isArray(value)) return 'JSONB';
  if (typeof value === 'object') return 'JSONB';
  return 'TEXT';
}

/**
 * Generate SQL to add missing columns to schema
 * @param {Array} missingFields - Array of {field, value, suggestedType}
 * @param {string} tableName - Table name (garage_vehicles or saved_offers)
 * @returns {string} - SQL ALTER TABLE statement
 */
function generateSchemaSql(missingFields, tableName = 'garage_vehicles') {
  if (!missingFields || missingFields.length === 0) {
    return '';
  }

  const statements = missingFields.map(({ field, suggestedType }) => {
    return `ALTER TABLE ${tableName}\nADD COLUMN ${field} ${suggestedType};`;
  });

  return `-- Add missing columns from MarketCheck API\n-- Generated: ${new Date().toISOString()}\n\n${statements.join('\n\n')}`;
}

/**
 * Update vehicle record in Supabase
 * @param {string} vehicleId - Vehicle UUID
 * @param {Object} updates - Fields to update
 * @param {string} source - 'garage' or 'saved'
 * @returns {Promise<boolean>} - Success status
 */
async function updateVehicleRecord(vehicleId, updates, source = 'garage') {
  try {
    const tableName = source === 'garage' ? 'garage_vehicles' : 'saved_offers';

    if (window.debugVinSync) {
    }

    const { data, error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', vehicleId)
      .select();

    if (error) {
      console.error('[vin-sync] Update error:', error);
      showToast(`Failed to update vehicle: ${error.message}`, 'error');
      return false;
    }

    if (window.debugVinSync) {
    }

    return true;
  } catch (error) {
    console.error('[vin-sync] Update exception:', error);
    showToast(`Failed to update vehicle: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Main VIN verification orchestration
 * Silently verifies VIN against MarketCheck and notifies only if discrepancies exist
 * @param {string} vin - Vehicle Identification Number
 * @param {Object} storedVehicle - Current vehicle data from database
 * @param {string} source - 'garage' or 'saved'
 */
async function verifyVehicleVin(vin, storedVehicle, source = 'garage') {
  if (!vin) {
    return;
  }

  const cleanVin = vin.trim().toUpperCase();

  // Check if verification is already in progress for this VIN
  if (activeVinVerifications.has(cleanVin)) {
    if (window.debugVinSync) {
    }
    return;
  }

  // Mark verification as in progress
  activeVinVerifications.set(cleanVin, Date.now());

  try {
    if (window.debugVinSync) {
    }

    // Fetch fresh data from MarketCheck (non-blocking)
    const freshData = await fetchVinDetails(cleanVin);

    // Check if this verification is still relevant (user might have selected another vehicle)
    if (!activeVinVerifications.has(cleanVin)) {
      if (window.debugVinSync) {
      }
      return;
    }

    if (!freshData) {
      if (window.debugVinSync) {
      }
      return;
    }

    // Compare stored vs fresh data
    const diff = diffVehicleAttributes(storedVehicle, freshData);

    if (!diff.changed) {
      if (window.debugVinSync) {
      }
      return;
    }

    // Build summary message
    const changes = diff.differences.map(d =>
      `${d.displayName}: ${formatDiffValue(d.oldValue)} → ${formatDiffValue(d.newValue)}`
    );

    let message = `Found ${diff.differences.length} update${diff.differences.length > 1 ? 's' : ''} for ${storedVehicle.year} ${storedVehicle.make} ${storedVehicle.model}:\n${changes.join(', ')}`;

    if (diff.missingFields.length > 0) {
      message += `\n\nPlus ${diff.missingFields.length} new field${diff.missingFields.length > 1 ? 's' : ''} available from MarketCheck.`;
    }

    // Prepare actions
    const actions = [
      {
        label: 'Update Record',
        callback: async () => {
          // Build update object from differences
          const updates = {};
          diff.differences.forEach(d => {
            updates[d.field] = d.newValue;
          });

          const success = await updateVehicleRecord(storedVehicle.id, updates, source);

          if (success) {
            showToast('Vehicle record updated successfully', 'success');

            // Refresh the appropriate data
            if (source === 'garage') {
              await loadGarageVehicles();
              await setupVehicleSelector(); // Refresh dropdown
            }
          }
        }
      },
      {
        label: 'Dismiss',
        callback: () => {
          if (window.debugVinSync) {
          }
        }
      }
    ];

    // Add SQL view action if there are missing fields
    if (diff.missingFields.length > 0) {
      actions.splice(1, 0, {
        label: 'View SQL',
        callback: () => {
          const sql = generateSchemaSql(diff.missingFields, source === 'garage' ? 'garage_vehicles' : 'saved_offers');

          // Create a modal to show the SQL
          const modal = document.createElement('div');
          modal.className = 'modal';
          modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content" style="max-width: 700px;">
              <div class="modal-header">
                <h3 class="modal-title">Missing Schema Fields</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
              </div>
              <div class="modal-body">
                <p>MarketCheck provides the following fields that don't exist in your database schema:</p>
                <ul>
                  ${diff.missingFields.map(f => `<li><strong>${f.field}</strong>: ${f.suggestedType}</li>`).join('')}
                </ul>
                <p>Run this SQL to add them:</p>
                <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; max-height: 300px;">${sql}</pre>
                <button class="btn btn--secondary" onclick="navigator.clipboard.writeText(\`${sql.replace(/`/g, '\\`')}\`).then(() => showToast('SQL copied to clipboard', 'success'))">
                  Copy SQL
                </button>
              </div>
            </div>
          `;
          document.body.appendChild(modal);
          modal.style.display = 'flex';
        }
      });
    }

    // Show toast with actions
    showToastWithActions(message, 'info', actions);

  } catch (error) {
    console.error('[vin-sync] Verification error:', error);
    // Silent failure - don't interrupt user flow
  } finally {
    // Remove from active verifications
    activeVinVerifications.delete(cleanVin);
  }
}

/**
 * Format diff value for display
 */
function formatDiffValue(value) {
  if (value == null) return 'none';
  if (typeof value === 'number') {
    // Check if it looks like a price
    if (value > 1000) {
      return formatCurrency(value);
    }
    return value.toLocaleString();
  }
  return String(value);
}

/**
 * Rate cache for performance (avoids re-fetching during slider interactions)
 */
const rateCache = new Map();
const RATE_CACHE_TTL = 30000; // 30 seconds

/**
 * Fetch rates for a lender from Supabase (NO STUB FALLBACK)
 * Includes in-memory caching to improve performance during slider interactions
 */
async function fetchLenderRates(lenderId) {
  const cacheKey = lenderId.toUpperCase();
  const now = Date.now();

  // Check cache first
  if (rateCache.has(cacheKey)) {
    const cached = rateCache.get(cacheKey);
    if (now - cached.timestamp < RATE_CACHE_TTL) {
      return cached.data;
    }
  }

  try {
    const response = await fetch(`${API_BASE}/api/rates?source=${cacheKey}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const lenderName = errorData.lenderName || lenderId;
      console.error(
        `[rates] No rates available for ${lenderId}:`,
        errorData.message
      );
      showToast(
        `No rates available for ${lenderName}. Please check Supabase.`,
        "error"
      );
      return null;
    }

    const data = await response.json();
    const rates = Array.isArray(data) ? data : data.rates || [];

    // Store in cache
    rateCache.set(cacheKey, {
      data: rates,
      timestamp: now,
    });

    return rates;
  } catch (error) {
    console.error(`[rates] Error fetching rates for ${lenderId}:`, error);
    showToast(
      `Failed to fetch rates for ${lenderId}: ${error.message}`,
      "error"
    );
    return null;
  }
}

/**
 * Match rate based on criteria
 */
function matchRate(rates, criteria) {
  const { term, condition, creditScore } = criteria;

  // Filter by condition and term range
  let eligible = rates.filter((rate) => {
    const vehicleCondition = rate.vehicle_condition || rate.vehicleCondition;
    const termMin = rate.term_min || rate.termMin;
    const termMax = rate.term_max || rate.termMax;

    // Case-insensitive condition comparison
    if (
      condition &&
      vehicleCondition &&
      vehicleCondition.toLowerCase() !== condition.toLowerCase()
    )
      return false;
    if (term < termMin || term > termMax) return false;

    return true;
  });

  // Filter by credit score if banded
  if (creditScore) {
    const scoreBanded = eligible.filter((rate) => {
      const scoreMin = rate.credit_score_min || rate.creditScoreMin || 300;
      const scoreMax = rate.credit_score_max || rate.creditScoreMax || 850;
      return creditScore >= scoreMin && creditScore <= scoreMax;
    });

    if (scoreBanded.length > 0) {
      eligible = scoreBanded;
    }
  }

  // Select rate with lowest APR
  if (eligible.length === 0) return null;

  const best = eligible.reduce((bestRate, rate) => {
    const aprPercent =
      rate.base_apr || rate.baseApr || rate.apr_percent || rate.aprPercent;
    const bestApr =
      bestRate.base_apr ||
      bestRate.baseApr ||
      bestRate.apr_percent ||
      bestRate.aprPercent;
    return aprPercent < bestApr ? rate : bestRate;
  });

  return {
    aprDecimal:
      (best.base_apr || best.baseApr || best.apr_percent || best.aprPercent) /
      100,
    aprPercent:
      best.base_apr || best.baseApr || best.apr_percent || best.aprPercent,
    note: best.note || "",
    effectiveDate: best.effective_date || best.effectiveDate || null,
  };
}

/**
 * Get APR for all lenders and find lowest
 */
async function calculateLowestApr(conditionOverride) {
  const term = parseInt(wizardData.financing.loanTerm, 10) || 72;
  const condition = getEffectiveLoanCondition(conditionOverride);
  const creditScore = mapCreditScoreRange(wizardData.financing.creditScore);

  const candidates = [];

  // Try each lender
  for (const lender of lendersConfig) {
    try {
      // Fetch rates from Supabase API (no stub fallback)
      const rates = await fetchLenderRates(lender.id);

      if (!rates || rates.length === 0) {
        continue;
      }

      // Match rate for this lender
      const match = matchRate(rates, { term, condition, creditScore });

      if (match) {
        const candidate = {
          lenderId: lender.id,
          lenderName: lender.longName || lender.shortName,
          apr: match.aprDecimal,
          note: match.note,
          effectiveDate: match.effectiveDate,
          condition,
        };

        candidates.push(candidate);

        // Store in rates map
        currentRates.set(getRateCacheKey(lender.id, condition), match);
      }
    } catch (error) {
      // Silently skip lender on error
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const winner = candidates.reduce((best, candidate) =>
    candidate.apr < best.apr ? candidate : best
  );

  return winner;
}

/**
 * Map credit score range to numeric value
 */
function mapCreditScoreRange(creditScoreRange) {
  const map = {
    excellent: 780,
    good: 725,
    fair: 675,
    poor: 600,
  };
  return map[creditScoreRange] || 700;
}

/**
 * Calculate monthly payment using loan formula
 */
function calculateMonthlyPayment(principal, apr, term) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(term) || term <= 0) return 0;

  const monthlyRate = apr / 12;
  if (!Number.isFinite(monthlyRate) || Math.abs(monthlyRate) < 1e-9) {
    return Math.round((principal / term) * 100) / 100;
  }

  const payment =
    principal *
    ((monthlyRate * Math.pow(1 + monthlyRate, term)) /
      (Math.pow(1 + monthlyRate, term) - 1));

  return Math.round(payment * 100) / 100;
}

/**
 * Calculate taxes using app.js logic
 */
function recomputeTaxes({
  salePrice,
  dealerFees,
  customerAddons,
  tradeOffer,
  stateTaxRate = 6.0,
  countyTaxRate = 1.0,
}) {
  const result = {
    taxableBase: 0,
    stateTaxAmount: 0,
    countyTaxAmount: 0,
    totalTaxes: 0,
  };

  const sale = Number.isFinite(salePrice) ? salePrice : 0;
  const dealer = Number.isFinite(dealerFees) ? dealerFees : 0;
  const addons = Number.isFinite(customerAddons) ? customerAddons : 0;
  const tradeCredit = Number.isFinite(tradeOffer) ? tradeOffer : 0;

  // Taxable base = (sale - trade credit) + dealer fees + customer addons
  const taxableBase = Math.max(sale - tradeCredit, 0) + dealer + addons;
  result.taxableBase = taxableBase;

  // Convert percentage rates to decimals (e.g., 6.0 -> 0.06)
  const stateRate = stateTaxRate / 100;
  const countyRate = countyTaxRate / 100;

  // State tax = taxable base * state rate
  const stateTaxAmount = taxableBase * stateRate;

  // County tax = min(sale price, $5000) * county rate
  const countyBaseSource = sale > 0 ? sale : taxableBase;
  const countyTaxableBase = Math.min(Math.max(countyBaseSource, 0), 5000);
  const countyTaxAmount = countyTaxableBase * countyRate;

  result.stateTaxAmount = stateTaxAmount;
  result.countyTaxAmount = countyTaxAmount;
  result.totalTaxes = stateTaxAmount + countyTaxAmount;

  return result;
}

/**
 * Populate review summary
 */
function populateReviewSummary(reviewData) {
  const data = reviewData || latestReviewData;
  if (!data) return;

  // PRECISION: Always show cents for critical financial displays
  setText("summaryMonthlyPayment", formatCurrency(data.monthlyPayment, true, { showCents: true }));
  setText("summaryTerm", `${data.term} months`);
  setText("summaryAPR", formatPercent(data.apr));
  setText("summaryAmountFinanced", formatCurrency(data.amountFinanced));
  setText("summaryTotalPayments", formatCurrency(data.totalPayments));
  setText("summaryFinanceCharge", formatCurrency(data.financeCharge, true, { showCents: true }));
  setText("summaryTotalSalePrice", formatCurrency(data.totalSalePrice));
  setText("summaryOtherCharges", formatCurrency(data.sumOtherCharges));
  setText("summaryCashDue", formatCurrency(data.cashDue));

  const summaryCashToBuyer = document.getElementById("summaryCashToBuyer");
  if (summaryCashToBuyer) {
    if (data.cashToBuyer > 0) {
      summaryCashToBuyer.textContent = `Cash to buyer: ${formatCurrency(
        data.cashToBuyer
      )}`;
      summaryCashToBuyer.style.display = "";
    } else {
      summaryCashToBuyer.textContent = "";
      summaryCashToBuyer.style.display = "none";
    }
  }
}

/**
 * Refresh both summary and detailed review views
 */
async function refreshReview() {
  const reviewData = await computeReviewData();
  latestReviewData = reviewData;
  populateReviewSummary(reviewData);
  populateReviewSection(reviewData);
}

/**
 * Populate review section with all calculated values
 * Math follows app.js contract modal exactly (lines 9787-9989)
 */
function populateReviewSection(reviewData) {
  const data = reviewData || latestReviewData;
  if (!data) return;

  const {
    cashPrice,
    cashDown,
    tradeOffer,
    tradePayoff,
    netTrade,
    unpaidBalance,
    sumOtherCharges,
    totalDealerFees,
    totalCustomerAddons,
    totalGovtFees,
    stateTaxTotal,
    countyTaxTotal,
    amountFinanced,
    monthlyPayment,
    term,
    apr,
    financeCharge,
    totalPayments,
    totalSalePrice,
    cashDue,
    cashToBuyer,
    lenderName,
  } = data;

  setText("reviewHeroYear", wizardData.vehicle.year);
  setText("reviewHeroMake", wizardData.vehicle.make);
  setText("reviewHeroModel", wizardData.vehicle.model);
  setText("reviewHeroTrim", wizardData.vehicle.trim);
  setText(
    "reviewHeroVin",
    wizardData.vehicle.vin ? `VIN: ${wizardData.vehicle.vin}` : ""
  );
  setText("reviewHeroPrice", formatCurrency(cashPrice));

  const lenderNameEl = document.getElementById("reviewLenderName");
  if (lenderNameEl) {
    lenderNameEl.textContent = lenderName;
    lenderNameEl.title = data.lenderNote || "";
  }

  setText("reviewAPR", formatPercent(apr));
  // PRECISION: Always show cents for critical financial displays
  setText("reviewFinanceCharge", formatCurrency(financeCharge, true, { showCents: true }));
  setText("reviewAmountFinanced", formatCurrency(amountFinanced));
  setText("reviewTotalPayments", formatCurrency(totalPayments));
  setText("reviewTotalSalePrice", formatCurrency(totalSalePrice));

  setText("reviewMonthlyPayment", formatCurrency(monthlyPayment, true, { showCents: true }));
  setText("reviewNumPayments", term);

  setText("reviewSalePrice", formatCurrency(cashPrice));
  setText("reviewCashDown", formatCurrency(cashDown));
  setText("reviewNetTrade", formatCurrencyAccounting(netTrade));
  setText("reviewTradeAllowance", formatCurrency(tradeOffer));
  setText("reviewTradePayoff", formatCurrency(tradePayoff));
  setText("reviewUnpaidBalance", formatCurrency(unpaidBalance));
  setText("reviewOtherCharges", formatCurrency(sumOtherCharges));
  setText("reviewDealerFees", formatCurrency(totalDealerFees));
  setText("reviewCustomerAddons", formatCurrency(totalCustomerAddons));
  setText("reviewGovtFees", formatCurrency(totalGovtFees));
  setText("reviewStateTax", formatCurrency(stateTaxTotal));
  setText("reviewCountyTax", formatCurrency(countyTaxTotal));
  setText("reviewAmountFinanced2", formatCurrency(amountFinanced));

  setText("reviewCashDue", formatCurrency(cashDue));
  setText("reviewCashToBuyer", formatCurrency(cashToBuyer));

  const cashToBuyerRow = document.getElementById("reviewCashToBuyerRow");
  if (cashToBuyerRow) {
    cashToBuyerRow.style.display = cashToBuyer > 0 ? "flex" : "none";
  }

  const netNote = document.getElementById("reviewNetNote");
  const netAmountEl = document.getElementById("reviewNetAmount");
  const netExplanationEl = document.getElementById("reviewNetExplanation");
  if (netNote && netAmountEl && netExplanationEl) {
    if (cashToBuyer > 0 && cashDue > 0) {
      const netAmount = cashToBuyer - cashDue;
      netNote.style.display = "block";

      if (netAmount > 0) {
        netAmountEl.textContent = formatCurrency(netAmount);
        netAmountEl.style.color = "var(--success, #22c55e)";
        netExplanationEl.textContent =
          "You will receive this amount at signing after equity is applied to amounts due.";
      } else if (netAmount < 0) {
        netAmountEl.textContent = formatCurrency(Math.abs(netAmount));
        netAmountEl.style.color = "var(--danger, #ef4444)";
        netExplanationEl.textContent =
          "You need to bring this amount at signing after equity is applied to amounts due.";
      } else {
        netAmountEl.textContent = formatCurrency(0);
        netAmountEl.style.color = "var(--text-secondary, #64748b)";
        netExplanationEl.textContent =
          "Equity exactly covers all amounts due at signing.";
      }
    } else {
      netNote.style.display = "none";
      netAmountEl.textContent = "";
      netExplanationEl.textContent = "";
    }
  }

  // Populate collapsible header values
  // PRECISION: Always show cents for monthly payment
  setText("collapsibleMonthlyPayment", formatCurrency(monthlyPayment, true, { showCents: true }));
  setText("collapsibleLenderName", lenderName);
  setText("collapsibleCashDue", formatCurrency(cashDue));

  // Populate review vehicle card (Step 1 style)
  populateReviewVehicleCard(data);
}

/**
 * Toggle collapsible review section
 */
function toggleReviewSection(sectionId) {
  const content = document.getElementById(`${sectionId}-content`);
  const header = content?.previousElementSibling;

  if (!content || !header) return;

  const isActive = content.classList.contains("active");

  if (isActive) {
    content.classList.remove("active");
    header.classList.remove("active");
    content.style.display = "none";
  } else {
    content.classList.add("active");
    header.classList.add("active");
    content.style.display = "block";
  }
}

/**
 * Populate review vehicle card with Step 1 styling
 */
function populateReviewVehicleCard(reviewData) {
  const card = document.getElementById("review-vehicle-card");
  if (!card) return;

  const vehicle = wizardData.vehicle;
  const { monthlyPayment, term, apr } = reviewData;

  // Clean model name
  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);

  // Build vehicle details text
  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(
    vehicle.make || ""
  )} ${capitalizeWords(cleanedModel || "")}${
    vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ""
  }`;

  // Image HTML
  const imageHtml = vehicle.photo_url
    ? `<img src="${vehicle.photo_url}" alt="${vehicleDetailsText}" class="your-vehicle-card__image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="your-vehicle-card__image-placeholder" style="display: none;">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
         </svg>
       </div>`
    : `<div class="your-vehicle-card__image-placeholder">
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
         </svg>
       </div>`;

  card.innerHTML = `
    ${imageHtml}
    <div class="your-vehicle-card__content">
      <div class="your-vehicle-card__badge">YOUR VEHICLE</div>
      <div class="your-vehicle-card__title">${vehicleDetailsText}</div>
      ${
        vehicle.vin
          ? `<div class="your-vehicle-card__meta">VIN: ${formatVIN(
              vehicle.vin
            )}</div>`
          : ""
      }
      ${
        vehicle.mileage
          ? `<div class="your-vehicle-card__meta">${formatMileage(
              vehicle.mileage
            )} miles</div>`
          : ""
      }
      <div class="your-vehicle-card__price">
        <div class="your-vehicle-card__price-label">Est. Monthly Payment</div>
        <div class="your-vehicle-card__price-value">${formatCurrency(
          monthlyPayment
        )}</div>
        <div class="your-vehicle-card__price-meta">${term} months • ${formatPercent(
    apr
  )} APR</div>
      </div>
    </div>
  `;

  // Initialize sliders after populating the card
  initializeReviewSliders(reviewData);
}

/**
 * Initialize and sync review sliders with their inputs
 */

function initializeReviewSliders(reviewData) {
  // Ensure down payment slider has a reasonable ceiling based on sale price
  try {
    const salePrice = Number(wizardData?.financing?.salePrice) || Number(reviewData?.salePrice) || 0;
    const dpMax = calculateDownPaymentSliderMax(salePrice);
    if (Number.isFinite(dpMax) && dpMax > 0) {
      sliderPolarityMap.cashDown.maxCeil = dpMax;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
  }
  const sliderConfigs = [
    {
      sliderId: "reviewSalePriceSlider",
      inputId: "reviewSalePriceInput",
      getValue: () => wizardData.financing.salePrice || 0,
      setValue: (val) => {
        wizardData.financing.salePrice = val;
        const vehiclePriceInput = document.getElementById("vehicle-price");
        if (vehiclePriceInput) {
          vehiclePriceInput.value = formatCurrency(val);
          vehiclePriceInput.dataset.basePrice = val;
        }
      },
      step: 100,
    },
    {
      sliderId: "reviewCashDownSlider",
      inputId: "reviewCashDownInput",
      getValue: () => wizardData.financing.cashDown || 0,
      setValue: (val) => {
        wizardData.financing.cashDown = val;
        const downPaymentInput = document.getElementById("down-payment");
        if (downPaymentInput) {
          downPaymentInput.value = formatCurrency(val);
        }
      },
      step: 100,
    },
    {
      sliderId: "reviewTradeAllowanceSlider",
      inputId: "reviewTradeAllowanceInput",
      getValue: () => wizardData.tradein?.tradeValue || 0,
      setValue: (val) => {
        if (!wizardData.tradein) wizardData.tradein = {};
        wizardData.tradein.tradeValue = val;
        wizardData.tradein.hasTradeIn = val > 0 || (wizardData.tradein.tradePayoff || 0) > 0;

        if (!wizardData.trade) {
          wizardData.trade = {
            hasTradeIn: wizardData.tradein.hasTradeIn,
            value: val,
            payoff: wizardData.tradein?.tradePayoff || 0,
            vehicles: wizardData.trade?.vehicles || [],
          };
        } else {
          wizardData.trade.value = val;
          wizardData.trade.hasTradeIn = wizardData.tradein.hasTradeIn;
        }
      },
      step: 100,
    },
    {
      sliderId: "reviewDealerFeesSlider",
      inputId: "reviewDealerFeesInput",
      getValue: () => {
        ensureWizardFeeDefaults();
        const fees = wizardData.fees.dealerFees || [];
        return fees.reduce(
          (sum, fee) => sum + (parseFloat(fee.amount) || 0),
          0
        );
      },
      setValue: (val) => {
        ensureWizardFeeDefaults();
        const fees = wizardData.fees.dealerFees || [];
        if (fees.length === 0) {
          fees.push({ name: "Dealer Fee", amount: val });
          wizardData.fees.dealerFees = fees;
        } else {
          const currentTotal = fees.reduce(
            (sum, fee) => sum + (parseFloat(fee.amount) || 0),
            0
          );
          if (currentTotal > 0) {
            fees.forEach((fee) => {
              const proportion = (parseFloat(fee.amount) || 0) / currentTotal;
              fee.amount = val * proportion;
            });
          } else {
            const perFee = val / fees.length;
            fees.forEach((fee) => (fee.amount = perFee));
          }
        }
        wizardData.fees.userCustomized = true;
      },
      step: 100,
    },
  ];

  const fieldMap = {
    reviewSalePriceSlider: "salePrice",
    reviewCashDownSlider: "cashDown",
    reviewTradeAllowanceSlider: "tradeAllowance",
    reviewDealerFeesSlider: "dealerFees",
  };

  sliderConfigs.forEach((config) => {
    const slider = document.getElementById(config.sliderId);
    const input = document.getElementById(config.inputId);

    if (!slider || !input) return;

    const wrapper = slider.parentElement;
    if (wrapper && !wrapper.classList.contains("slider-row")) {
      wrapper.classList.add("slider-row");
    }

    const field = fieldMap[config.sliderId];
    const baseMeta = sliderPolarityMap[field] || {
      positiveDirection: "left",
      colorPositive: SLIDER_GRADIENT_POSITIVE,
      colorNegative: SLIDER_GRADIENT_NEGATIVE,
      format: "currency",
    };

    const meta = {
      ...baseMeta,
      step: config.step,
      snapZone: baseMeta.snapZone ?? config.step,
    };

    let origin = config.getValue();
    if (!Number.isFinite(origin)) {
      origin = 0;
    }

    slider.dataset.field = field || config.sliderId;
    slider.dataset.origin = origin;
    slider.dataset.snapZone = meta.snapZone ?? meta.step;
    slider.dataset.stepSize = step;
    window.sliderOriginalValues = window.sliderOriginalValues || {};
    window.sliderOriginalValues[config.sliderId] = origin;

    const step = getSliderStep(meta);
    const visualOrigin = Math.round(origin / step) * step;
    setSliderVisualOrigin(slider, visualOrigin);
    configureSliderRange(slider, origin, meta, visualOrigin);
    slider.value = visualOrigin;
    input.value = formatSliderInputValue(origin, meta);
    updateSliderVisual(slider, visualOrigin, origin, meta);

    const applyVisualValue = (rawVisual) => {
      const baseline = Number(slider.dataset.origin) || 0;
      const visualBase = getSliderVisualOrigin(slider);
      let visualValue = Number(rawVisual);
      if (!Number.isFinite(visualValue)) visualValue = visualBase;

      visualValue = clampSliderValueToRange(visualValue, slider);

      const delta = visualValue - visualBase;
      const snapped = Math.round(delta / step) * step;
      visualValue = clampSliderValueToRange(visualBase + snapped, slider);

      const actualValue = convertVisualToActual(slider, visualValue);
      slider.value = visualValue;
      input.value = formatSliderInputValue(actualValue, meta);
      updateSliderVisual(slider, visualValue, baseline, meta);
      config.setValue(actualValue);
      return actualValue;
    };

    const applyActualValue = (actualRaw) => {
      const baseline = Number(slider.dataset.origin) || 0;
      const actualValue = Number.isFinite(actualRaw) ? actualRaw : baseline;
      const visualValue = convertActualToVisual(slider, actualValue);
      return applyVisualValue(visualValue);
    };

    slider.addEventListener("input", () => {
      applyVisualValue(slider.value);
      refreshReviewDebounced();
    });

    slider.addEventListener("change", () => {
      applyVisualValue(slider.value);
      refreshReviewDebounced();
    });

    input.addEventListener("blur", (event) => {
      const parsed = parseSliderInputValue(event.target.value, meta);
      applyActualValue(parsed);
      refreshReviewDebounced();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });
}



/**
 * Update slider visual using polarity metadata (legacy bridge for non-refactored contexts)
 */
function updateSliderProgress(slider) {
  if (!slider) return;

  const field =
    slider.dataset.field ||
    sliderIdLookup[slider.id] ||
    Object.entries(sliderPolarityMap).find(
      ([, meta]) => meta.sliderId === slider.id
    )?.[0];

  if (!field) return;

  const meta = sliderPolarityMap[field];
  if (!meta) return;

  const value = Number(slider.value);
  const origin =
    Number(slider.dataset.origin) ||
    window.sliderOriginalValues?.[slider.id] ||
    value ||
    0;

  updateSliderVisual(
    slider,
    Number.isFinite(value) ? value : origin,
    origin,
    meta
  );
}

/**
 * Debounced refresh to avoid too many calculations during slider drag
 */
let refreshTimeout;
async function refreshReviewDebounced() {
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(async () => {
    await refreshReview();
  }, 150); // 150ms debounce
}

/**
 * Format currency with accounting style (negative in parentheses)
 */
function formatCurrencyAccounting(value, options = {}) {
  const abs = Math.abs(value);
  const formatted = formatCurrency(abs, false, options);
  return value < 0 ? `(${formatted})` : formatted;
}

/**
 * Format percentage
 */
function formatPercent(decimal) {
  return (decimal * 100).toFixed(2) + "%";
}

/**
 * Set text content helper
 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Open fees modal with default or saved values
 */
function ensureWizardFeeDefaults() {
  if (!wizardData.fees) {
    wizardData.fees = {
      dealerFees: 0,
      customerAddons: 0,
      govtFees: 0,
      stateTaxRate: 6.0,
      countyTaxRate: 1.0,
      userTaxOverride: false,
      items: {
        dealer: [],
        customer: [],
        gov: [],
      },
    };
  } else if (!wizardData.fees.items) {
    wizardData.fees.items = {
      dealer: [],
      customer: [],
      gov: [],
    };
  }
}

function initializeFeeModal() {
  if (feeModalState.initialized) return;
  feeModalState.initialized = true;
  ensureWizardFeeDefaults();

  Object.entries(FEE_CATEGORY_CONFIG).forEach(([key, config]) => {
    const container = document.getElementById(config.containerId);
    const totalEl = document.getElementById(config.totalId);
    const suggestionStore = createSuggestionStore(config.datalistId);
    feeModalState.categories[key] = {
      key,
      container,
      totalEl,
      suggestionStore,
      rows: [],
    };
  });

  const editFeeForm = document.getElementById("edit-fee-form");
  if (editFeeForm) {
    editFeeForm.addEventListener("submit", handleEditFeeSubmit);
  }

  const typeSelect = document.getElementById("edit-fee-type");
  if (typeSelect) {
    typeSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      updateEditFeeNameList(value);
      editFeeModalState.activeCategory = value;
    });
  }

  const nameInput = document.getElementById("edit-fee-name");
  const amountInput = document.getElementById("edit-fee-amount");
  if (nameInput && amountInput) {
    nameInput.addEventListener("input", () => {
      const currentType =
        typeSelect?.value === "gov"
          ? "gov"
          : typeSelect?.value === "customer"
          ? "customer"
          : "dealer";
      const store = getFeeSuggestionStore(currentType);
      const amount = store?.getAmount(nameInput.value) ?? null;
      if (amount != null) {
        amountInput.value = formatCurrency(amount);
      }
    });
  }

  const manageBtn = document.getElementById("modal-edit-fee-button");
  manageBtn?.addEventListener("click", () => {
    openEditFeeModal(editFeeModalState.activeCategory || "dealer");
  });

  const stateTaxInput = document.getElementById("modal-state-tax");
  const countyTaxInput = document.getElementById("modal-county-tax");
  [stateTaxInput, countyTaxInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("change", handleManualTaxRateInput);
    input.addEventListener("blur", handleManualTaxRateInput);
  });
}

function openFeesModal() {
  initializeFeeModal();
  const modal = document.getElementById("fees-modal");
  if (!modal) return;

  ensureWizardFeeDefaults();

  // Update tax labels to show current state/county from location
  updateTaxLabels();

  renderFeeModalFromWizardData();
  modal.classList.add("active");
  modal.style.display = "flex";

  // ESC key to close
  if (!window.__feesModalEscHandler) {
    window.__feesModalEscHandler = (e) => {
      const key = e.key || e.code;
      if (key === "Escape" || key === "Esc") {
        e.preventDefault();
        closeFeesModal();
      }
    };
    document.addEventListener("keydown", window.__feesModalEscHandler);
  }
}
window.openFeesModal = openFeesModal;

function closeFeesModal() {
  const modal = document.getElementById("fees-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}
window.closeFeesModal = closeFeesModal;

/**
 * Open the Review Contract modal and populate with current data
 */
async function openReviewContractModal() {
  try {
    await ensureAprOptions();
  } catch (error) {
  }
  window._aprConfirmationForPreview = false;

  if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
    showAprConfirmationModal();
    return;
  }

  await proceedToReviewModal();
}

function showAprConfirmationModal() {
  const modal = document.getElementById("apr-confirmation-modal");
  if (!modal) return;

  const aprOptions = wizardData.availableAprs || {};
  const baseCondition = getEffectiveLoanCondition();
  const baseAprInfo =
    wizardData.selectedApr ||
    aprOptions[baseCondition] ||
    aprOptions.new ||
    aprOptions.used ||
    null;

  const lenderRateInfo =
    baseAprInfo || aprOptions.new || aprOptions.used || null;
  if (!lenderRateInfo || !Number.isFinite(lenderRateInfo.apr)) {
    return;
  }

  const lenderRateEl = document.getElementById("aprConfirmLenderRate");
  const lenderLabelEl = document.getElementById("aprConfirmLenderLabel");
  const customRateEl = document.getElementById("aprConfirmCustomRate");
  const newRateEl = document.getElementById("aprResetNewValue");
  const usedRateEl = document.getElementById("aprResetUsedValue");
  const diffRow = document.getElementById("aprConfirmDiffRow");
  const diffEl = document.getElementById("aprConfirmDiff");

  if (lenderRateEl) {
    lenderRateEl.textContent = formatPercent(lenderRateInfo.apr);
  }
  if (lenderLabelEl) {
    lenderLabelEl.textContent = `Lender Rate (${capitalizeWords(
      lenderRateInfo.condition || baseCondition
    )})`;
  }
  if (customRateEl && Number.isFinite(customAprOverride)) {
    customRateEl.textContent = formatPercent(customAprOverride);
  }
  if (newRateEl) {
    newRateEl.textContent = aprOptions.new
      ? formatPercent(aprOptions.new.apr)
      : "--%";
  }
  if (usedRateEl) {
    usedRateEl.textContent = aprOptions.used
      ? formatPercent(aprOptions.used.apr)
      : "--%";
  }

  if (diffRow && diffEl) {
    if (
      Number.isFinite(customAprOverride) &&
      Number.isFinite(lenderRateInfo.apr)
    ) {
      diffRow.style.display = "flex";
      const diffPoints = (lenderRateInfo.apr - customAprOverride) * 100;
      if (Math.abs(diffPoints) < 0.005) {
        diffEl.textContent = "No change";
        diffEl.className = "apr-detail-value apr-detail-diff neutral";
      } else {
        const sign = diffPoints > 0 ? "+" : "-";
        const formatted = Math.abs(diffPoints).toFixed(2);
        diffEl.textContent = `${sign}${formatted} pts`;
        diffEl.className = `apr-detail-value apr-detail-diff ${
          diffPoints > 0 ? "positive" : "negative"
        }`;
      }
    } else {
      diffRow.style.display = "none";
      diffEl.textContent = "--";
      diffEl.className = "apr-detail-value apr-detail-diff";
    }
  }

  modal.classList.add("active");
  modal.style.display = "flex";
}

async function confirmAprChoice(choice) {
  const modal = document.getElementById("apr-confirmation-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }

  if (choice === "reset-new" || choice === "reset-used") {
    await resetAprToCondition(choice === "reset-used" ? "used" : "new");
  } else if (choice === "reset") {
    wizardData.financing = wizardData.financing || {};
    wizardData.financing.loanConditionOverride = null;
    customAprOverride = null;
    await autoCalculateQuick();
  }

  const isPreviewFlow = window._aprConfirmationForPreview === true;
  window._aprConfirmationForPreview = false;

  if (isPreviewFlow) {
    await openSubmitOfferModal();
  } else {
    await proceedToReviewModal();
  }
}
window.confirmAprChoice = confirmAprChoice;

/**
 * Actually open the review contract modal (called after APR confirmation or directly)
 */
async function proceedToReviewModal() {
  const modal = document.getElementById("review-contract-modal");
  if (!modal) return;

  try {
    // Get current review data
    const reviewData = await computeReviewData();

    // Populate TIL disclosures
    setText("contractAPR", formatPercent(reviewData.apr));
    setText("contractTerm", reviewData.term || "--");
    setText("contractFinanceCharge", formatCurrency(reviewData.financeCharge));
    setText(
      "contractAmountFinanced",
      formatCurrency(reviewData.amountFinanced)
    );
    setText("contractTotalPayments", formatCurrency(reviewData.totalPayments));

    // Calculate monthly finance charge (interest portion per month)
    const monthlyFinanceCharge =
      reviewData.financeCharge && reviewData.term
        ? reviewData.financeCharge / reviewData.term
        : 0;
    setText(
      "contractMonthlyFinanceCharge",
      formatCurrency(monthlyFinanceCharge)
    );

    // Populate payment schedule
    setText("contractNumPayments", reviewData.term);
    setText(
      "contractMonthlyPayment",
      formatCurrency(reviewData.monthlyPayment)
    );

    // Populate vehicle information
    const vehicle = wizardData.vehicle;
    if (vehicle) {
      const vehicleText =
        `${vehicle.year || ""} ${vehicle.make || ""} ${
          vehicle.model || ""
        }`.trim() || "Not specified";
      setText("contractVehicle", vehicleText);
      {
        const vinEl = document.getElementById("contractVIN");
        if (vinEl) {
          vinEl.innerHTML = vehicle.vin ? formatVIN(vehicle.vin) : "Not specified";
        }
      }
      setText(
        "contractMileage",
        vehicle.mileage
          ? `${formatMileage(vehicle.mileage)} miles`
          : "Not specified"
      );
      setText("contractCondition", getVehicleSaleConditionText(deriveSaleCondition(vehicle)) || "Not specified");
    } else {
      setText("contractVehicle", "Not specified");
      setText("contractVIN", "Not specified");
      setText("contractMileage", "Not specified");
      setText("contractCondition", "Not specified");
    }

    // Populate trade-in details
    const tradeInSection = document.getElementById("contractTradeInSection");
    const tradeInDetails = document.getElementById("contractTradeInDetails");
    const trade = wizardData.trade;

    if (trade && trade.vehicles && trade.vehicles.length > 0) {
      // Show trade-in section
      if (tradeInSection) tradeInSection.style.display = "block";

      // Build trade-in cards HTML
      let tradeInHTML = "";
      trade.vehicles.forEach((vehicle, index) => {
        const vehicleText = `${vehicle.year || ""} ${vehicle.make || ""} ${
          vehicle.model || ""
        }${vehicle.trim ? " " + vehicle.trim : ""}`.trim();
        const netValue =
          (vehicle.estimated_value || 0) - (vehicle.payoff_amount || 0);

        tradeInHTML += `
          <div class="contract-tradein-card">
            <div class="contract-tradein-header">
              <h4 class="contract-tradein-title">Trade-In Vehicle ${
                trade.vehicles.length > 1 ? "#" + (index + 1) : ""
              }</h4>
              ${
                vehicle.nickname
                  ? `<span class="contract-tradein-nickname">"${vehicle.nickname}"</span>`
                  : ""
              }
            </div>
            <div class="contract-vehicle-grid">
              <div class="contract-row">
                <span class="contract-label">Year Make Model:</span>
                <span class="contract-value">${
                  vehicleText || "Not specified"
                }</span>
              </div>
              <div class="contract-row">
                <span class="contract-label">VIN:</span>
                <span class="contract-value contract-vin">${
                  vehicle.vin ? formatVIN(vehicle.vin) : "Not specified"
                }</span>
              </div>
              <div class="contract-row">
                <span class="contract-label">Mileage:</span>
                <span class="contract-value">${
                  vehicle.mileage
                    ? formatMileage(vehicle.mileage) + " miles"
                    : "Not specified"
                }</span>
              </div>
              <div class="contract-row">
                <span class="contract-label">Condition:</span>
                <span class="contract-value">${
                  getVehicleGradeText(deriveVehicleGrade(vehicle)) || "Not specified"
                }</span>
              </div>
              <div class="contract-row">
                <span class="contract-label">Your Trade Allowance:</span>
                <span class="contract-value">${formatCurrency(
                  vehicle.estimated_value || 0
                )}</span>
              </div>
              <div class="contract-row">
                <span class="contract-label">Your Payoff Amount:</span>
                <span class="contract-value">${formatCurrency(
                  vehicle.payoff_amount || 0
                )}</span>
              </div>
              <div class="contract-row contract-highlight">
                <span class="contract-label">Net Trade Value:</span>
                <span class="contract-value">${formatCurrencyAccounting(
                  netValue
                )}</span>
              </div>
            </div>
          </div>
        `;
      });

      if (tradeInDetails) tradeInDetails.innerHTML = tradeInHTML;
    } else {
      // Hide trade-in section if no vehicles
      if (tradeInSection) tradeInSection.style.display = "none";
    }

    // Populate itemization
    setText("contractSalePrice", formatCurrency(reviewData.salePrice));
    setText("contractDownPayment", formatCurrency(reviewData.cashDown));
    setText("contractNetTrade", formatCurrencyAccounting(reviewData.netTrade));
    setText("contractTradeAllowance", formatCurrency(reviewData.tradeOffer));
    setText("contractTradePayoff", formatCurrency(reviewData.tradePayoff));
    setText("contractUnpaidBalance", formatCurrency(reviewData.unpaidBalance));
    setText("contractOtherCharges", formatCurrency(reviewData.sumOtherCharges));
    setText("contractDealerFees", formatCurrency(reviewData.totalDealerFees));
    setText(
      "contractCustomerAddons",
      formatCurrency(reviewData.totalCustomerAddons)
    );
    setText("contractGovtFees", formatCurrency(reviewData.totalGovtFees));
    setText(
      "contractSaleTaxTotal",
      formatCurrency(reviewData.stateTaxTotal + reviewData.countyTaxTotal)
    );
    setText("contractStateTax", formatCurrency(reviewData.stateTaxTotal));
    setText("contractCountyTax", formatCurrency(reviewData.countyTaxTotal));
    setText("contractCashDue", formatCurrency(reviewData.cashDue));
    setText(
      "contractAmountFinancedTotal",
      formatCurrency(reviewData.amountFinanced)
    );

    // Update tax labels with state/county info
    const stateCode = wizardData.location?.stateCode || "";
    const countyName = wizardData.location?.countyName || "";
    const stateTaxRate = wizardData.fees?.stateTaxRate || 6.0;
    const countyTaxRate = wizardData.fees?.countyTaxRate || 1.0;

    const contractStateTaxLabel = document.getElementById(
      "contractStateTaxLabel"
    );
    const contractCountyTaxLabel = document.getElementById(
      "contractCountyTaxLabel"
    );

    if (contractStateTaxLabel) {
      contractStateTaxLabel.textContent = stateCode
        ? `${stateCode} State Tax (${stateTaxRate.toFixed(2)}%)`
        : `State Tax (${stateTaxRate.toFixed(2)}%)`;
    }

    if (contractCountyTaxLabel) {
      contractCountyTaxLabel.textContent = countyName
        ? `${countyName} County Tax (${countyTaxRate.toFixed(2)}%)`
        : `County Tax (${countyTaxRate.toFixed(2)}%)`;
    }

    // Show the modal
    modal.classList.add("active");
    modal.style.display = "flex";
  } catch (error) {
    console.error("[review-contract] Error opening modal:", error);
    alert("Error loading contract data. Please try again.");
  }
}
window.openReviewContractModal = openReviewContractModal;

/**
 * Close the Review Contract modal
 */
function closeReviewContractModal() {
  const modal = document.getElementById("review-contract-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}
window.closeReviewContractModal = closeReviewContractModal;

/**
 * Print the contract document
 */
function printContract() {
  window.print();
}
window.printContract = printContract;

/* ============================================================================
   Customer Profile Functions
   ============================================================================ */

/**
 * Open the Customer Profile modal and load existing profile
 */
async function openCustomerProfileModal() {
  const modal = document.getElementById("customer-profile-modal");
  if (!modal) {
    console.error("❌ [My Profile] Modal element not found!");
    return;
  }

  // Load existing profile
  await loadCustomerProfileData();

  // Set up Google Places autocomplete for address field
  setupProfileAddressAutocomplete();

  modal.classList.add("active");
  modal.style.display = "flex";
  try {
    document.body.style.overflow = "hidden"; // prevent background scroll
  } catch {}
  // Bind ESC-to-close while open
  try {
    if (!window.__customerProfileEscHandler) {
      window.__customerProfileEscHandler = (e) => {
        const key = e.key || e.code;
        if (key === "Escape" || key === "Esc") {
          e.preventDefault();
          closeCustomerProfileModal();
        }
      };
      document.addEventListener("keydown", window.__customerProfileEscHandler);
    }
  } catch {}
}

/**
 * Close the Customer Profile modal
 */
function closeCustomerProfileModal() {
  const modal = document.getElementById("customer-profile-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
  try {
    document.body.style.overflow = "";
  } catch {}
  // Unbind ESC handler once closed
  try {
    if (window.__customerProfileEscHandler) {
      document.removeEventListener("keydown", window.__customerProfileEscHandler);
      window.__customerProfileEscHandler = null;
    }
  } catch {}
}

// Ensure modal close works via overlay background and explicit close button
function bindCustomerProfileModalClosers() {
  const modal = document.getElementById("customer-profile-modal");
  if (!modal) return;
  // Close when clicking overlay or empty modal area
  modal.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.classList.contains("modal") || target.classList.contains("modal-overlay")) {
      closeCustomerProfileModal();
    }
  });
  // Close button
  const closeBtn = modal.querySelector('[aria-label="Close"]');
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeCustomerProfileModal();
    });
    closeBtn.dataset.bound = "true";
  }
}

// Hook profile dropdown item to open modal (redundant safety; AuthManager also handles this)
function attachProfileMenuHook() {
  const profileMenu = document.getElementById("profile-menu");
  if (!profileMenu || profileMenu.dataset.profileHooked === "true") {
    return;
  }
  profileMenu.dataset.profileHooked = "true";
  profileMenu.addEventListener("click", (event) => {
    const link = event.target?.closest?.('[data-action="profile"]');
    if (!link) return;
    event.preventDefault();
    // Defer to allow AuthManager's handler first; only open if still closed
    setTimeout(() => {
      const modal = document.getElementById("customer-profile-modal");
      if (!modal || modal.classList.contains("active")) return;
      openCustomerProfileModal();
    }, 0);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindCustomerProfileModalClosers();
  attachProfileMenuHook();
});

// Re-attach if dropdown is injected later
let profileMenuObserver = null;
try {
  profileMenuObserver = new MutationObserver(() => attachProfileMenuHook());
  if (typeof document !== "undefined" && document.body) {
    profileMenuObserver.observe(document.body, { childList: true, subtree: true });
  }
} catch {}

/**
 * Load customer profile from Supabase
 */
async function loadCustomerProfileData() {
  try {
    const authStore = useAuthStore.getState();
    if (!authStore.user) {
      return null;
    }

    const { data: profile, error } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("user_id", authStore.user.id)
      .single();

    if (error) {
      console.error("Error loading customer profile:", error);
      return null;
    }

    if (profile) {
      // Populate form fields if modal is open
      const profileFullName = document.getElementById("profileFullName");
      if (profileFullName) {
        profileFullName.value = profile.full_name || "";
        document.getElementById("profileEmail").value = profile.email || "";
        document.getElementById("profilePhone").value = profile.phone || "";
        document.getElementById("profileAddress").value =
          profile.street_address || "";
        document.getElementById("profileCity").value = profile.city || "";
        document.getElementById("profileState").value =
          profile.state_code || "";
        document.getElementById("profileZip").value = profile.zip_code || "";
        document.getElementById("profileCreditScore").value =
          profile.credit_score_range || "";

        // Populate preference fields
        document.getElementById("profileDownPayment").value =
          profile.preferred_down_payment
            ? formatCurrency(profile.preferred_down_payment)
            : "";
        // Trade-in preferences removed - now managed through My Garage
      }

      // Update header label with user's first name
      const firstName = profile.full_name
        ? profile.full_name.split(" ")[0]
        : "Profile";
      const profileLabel = document.getElementById("customerProfileLabel");
      if (profileLabel) {
        profileLabel.textContent = firstName;
      }

      return profile;
    }

    return null;
  } catch (error) {
    console.error("Error loading customer profile:", error);
    return null;
  }
}

/**
 * Set Cash Down slider/input from user's preferred_down_payment when a vehicle is selected
 * Preserves $0 defaults when no vehicle is active.
 */
async function setPreferredDownPayment() {
  try {
    const vehicleSelected =
      Boolean(selectedVehicle?.vin) ||
      Boolean(wizardData?.vehicle?.vin);
    if (!vehicleSelected) return; // Keep $0 defaults until a vehicle exists

    if (!supabase) return;

    // Resolve user id
    let userId = null;
    try {
      const authStore = useAuthStore.getState();
      userId = authStore?.user?.id || null;
      if (!userId) {
        const { data } = await supabase.auth.getUser();
        userId = data?.user?.id || null;
      }
    } catch {}
    if (!userId) return;

    const { data: profile, error } = await supabase
      .from('customer_profiles')
      .select('preferred_down_payment')
      .eq('user_id', userId)
      .single();

    if (error) return;
    if (!profile || profile.preferred_down_payment == null) return;

    const raw = profile.preferred_down_payment;
    const preferredDown = typeof raw === 'string'
      ? parseFloat(raw.replace(/[^0-9.]/g, ''))
      : Number(raw);

    if (!Number.isFinite(preferredDown)) return;

    const slider = document.getElementById('quickSliderCashDown');
    const input = document.getElementById('quickInputCashDown');
    if (!slider || !input) return;

    // Apply to UI
    slider.value = String(preferredDown);
    input.value = formatCurrency(preferredDown);

    // Update state and notify listeners
    wizardData.financing = wizardData.financing || {};
    wizardData.financing.cashDown = preferredDown;
    try {
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {}

    // Optional hint for downstream consumers
    window.cashDownBaseline = preferredDown;
  } catch (e) {
    // eslint-disable-next-line no-console
  }
}

/**
 * Setup Google Places autocomplete for profile address field
 */
function setupProfileAddressAutocomplete() {
  const addressInput = document.getElementById("profileAddress");
  const g = typeof window !== "undefined" ? window.google : undefined;
  if (!addressInput || !g || !g.maps || !g.maps.places) return;

  // Create autocomplete instance
  const autocomplete = new g.maps.places.Autocomplete(addressInput, {
    types: ["address"],
    componentRestrictions: { country: "us" },
    fields: ["address_components", "formatted_address", "place_id"],
  });

  // Listen for place selection
  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) return;

    // Extract address components
    let streetNumber = "";
    let route = "";
    let city = "";
    let state = "";
    let stateCode = "";
    let zip = "";
    let county = "";

    place.address_components.forEach((component) => {
      const types = component.types;

      if (types.includes("street_number")) {
        streetNumber = component.long_name;
      }
      if (types.includes("route")) {
        route = component.long_name;
      }
      if (types.includes("locality")) {
        city = component.long_name;
      }
      if (types.includes("administrative_area_level_1")) {
        state = component.long_name;
        stateCode = component.short_name;
      }
      if (types.includes("postal_code")) {
        zip = component.long_name;
      }
      if (types.includes("administrative_area_level_2")) {
        county = component.long_name.replace(" County", "");
      }
    });

    // Populate fields
    const streetAddress = `${streetNumber} ${route}`.trim();
    document.getElementById("profileAddress").value = streetAddress;
    document.getElementById("profileCity").value = city;
    document.getElementById("profileState").value = stateCode;
    document.getElementById("profileZip").value = zip;

    // Store county for later use when saving
    addressInput.dataset.county = county;
    addressInput.dataset.countyName = county;
    addressInput.dataset.placeId = place.place_id;

    // Apply locale to update tax rates in fees modal
    if (stateCode) {
      applyLocaleToFees({
        stateCode: stateCode,
        countyName: county,
      });
    }
  });
}

/**
 * Auto-populate main location from customer profile on page load
 */
async function autoPopulateLocationFromProfile() {
  try {
    const profile = await loadCustomerProfileData();
    if (!profile) return;

    // If profile has address information, populate the main location field
    if (profile.city && profile.state_code) {
      const quickLocation = document.getElementById("quick-location");
      if (quickLocation && !quickLocation.value) {
        // Format location string with FULL street address for Google Maps distance calculations
        const locationString = profile.street_address
          ? `${profile.street_address}, ${profile.city}, ${profile.state_code}${
              profile.zip_code ? " " + profile.zip_code : ""
            }`
          : `${profile.city}, ${profile.state_code}${
              profile.zip_code ? " " + profile.zip_code : ""
            }`;

        quickLocation.value = locationString;

        // Geocode the address to get lat/lng coordinates for distance calculations
        if (google?.maps?.Geocoder) {
          const geocoder = new google.maps.Geocoder();

          try {
            const results = await new Promise((resolve, reject) => {
              geocoder.geocode(
                { address: locationString },
                (results, status) => {
                  if (status === "OK" && results?.length) {
                    resolve(results);
                  } else {
                    reject(new Error(`Geocoding failed: ${status}`));
                  }
                }
              );
            });

            if (results && results[0]) {
              const place = results[0];
              const locale = extractLocaleFromComponents(
                place.address_components ?? []
              );
              const zip = extractZipFromPlace(place) || profile.zip_code || "";

              const lat =
                typeof place.geometry.location?.lat === "function"
                  ? place.geometry.location.lat()
                  : place.geometry.location?.lat ?? null;
              const lng =
                typeof place.geometry.location?.lng === "function"
                  ? place.geometry.location.lng()
                  : place.geometry.location?.lng ?? null;

              // Update wizardData with geocoded location data (including lat/lng for distance calculations)
              wizardData.location = {
                ...wizardData.location,
                formatted_address: place.formatted_address ?? locationString,
                address: place.formatted_address ?? locationString,
                city: profile.city,
                zip: zip,
                lat: lat,
                lng: lng,
                stateCode: profile.state_code,
                state: profile.state,
                county: profile.county,
                countyName: locale.countyName || profile.county_name,
              };

              // Update user-location field in wizard
              const wizardLocationInput =
                document.getElementById("user-location");
              if (wizardLocationInput) {
                wizardLocationInput.value =
                  place.formatted_address ?? locationString;
                const hint = wizardLocationInput.nextElementSibling;
                if (hint) {
                  hint.textContent = `✓ Using: ${zip || "your location"}`;
                  hint.style.color = "var(--success)";
                }
              }

              // Apply locale-based fees and taxes
              applyLocaleToFees(locale);

              // Refresh year dropdowns
              try {
                await populateYearDropdowns();
              } catch (error) {
                console.error(
                  "[auto-populate] Unable to refresh year dropdowns after location population",
                  error
                );
              }

              // If a vehicle is already selected, refresh the card to show map with distance
              if (selectedVehicle) {
                displayQuickVehicleCard(selectedVehicle);
              }

              // Trigger auto-calculation
              autoCalculateQuick().catch((error) => {
                console.error(
                  "[auto-populate] Unable to recalculate after location population",
                  error
                );
              });
            }
          } catch (geocodeError) {
            console.error("Geocoding error:", geocodeError);

            // Fallback: Update wizardData without coordinates
            wizardData.location = {
              ...wizardData.location,
              formatted_address: locationString,
              address: locationString,
              city: profile.city,
              zip: profile.zip_code,
              stateCode: profile.state_code,
              state: profile.state,
              county: profile.county,
              countyName: profile.county_name,
            };

            // Apply locale-based fees even without geocoding
            applyLocaleToFees({
              stateCode: profile.state_code,
              countyName: profile.county_name,
            });
          }
        } else {
          // Google Maps not available - update basic location data
          wizardData.location = {
            ...wizardData.location,
            formatted_address: locationString,
            address: locationString,
            city: profile.city,
            zip: profile.zip_code,
            stateCode: profile.state_code,
            state: profile.state,
            county: profile.county,
            countyName: profile.county_name,
          };
        }
      }
    }
  } catch (error) {
    console.error("Error auto-populating location:", error);
  }
}

/**
 * Auto-populate calculator fields from customer profile preferences
 */
async function autoPopulateCalculatorFromProfile() {
  try {
    const profile = await loadCustomerProfileData();
    if (!profile) return;

    // Trade-in auto-populate removed - now managed through My Garage
  } catch (error) {
    console.error("Error auto-populating calculator from profile:", error);
  }
}

/**
 * Auto-populate trade-in from most recently used garage vehicle
 */
async function autoPopulateFromGarage() {
  try {
    const authStore = useAuthStore.getState();
    if (!authStore.user) {
      return;
    }

    // Check if trade-in already has values (don't override user's work)
    if (wizardData.trade && wizardData.trade.value > 0) {
      return;
    }

    // Load most recently used vehicle from garage (owned vehicles)
    const { data: vehicles, error } = await supabase
      .from("garage_vehicles")
      .select("*")
      .eq("user_id", authStore.user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error(
        "[auto-populate-garage] Error loading garage vehicles:",
        error
      );
      return;
    }

    if (!vehicles || vehicles.length === 0) {
      return;
    }

    const vehicle = vehicles[0];

    // Auto-select this vehicle for trade-in
    selectedTradeIns = [vehicle.id];

    // Update calculations with this vehicle
    await updateTradeInCalculations();
  } catch (error) {
    console.error("[auto-populate-garage] Error:", error);
  }
}

/**
 * Save customer profile to Supabase
 */
async function saveCustomerProfile() {
  try {
    // Get form values
    const fullName = document.getElementById("profileFullName").value.trim();
    const email = document.getElementById("profileEmail").value.trim();
    const phone = document.getElementById("profilePhone").value.trim();
    const address = document.getElementById("profileAddress").value.trim();
    const city = document.getElementById("profileCity").value.trim();
    const state = document
      .getElementById("profileState")
      .value.trim()
      .toUpperCase();
    const zip = document.getElementById("profileZip").value.trim();
    const creditScore = document.getElementById("profileCreditScore").value;

    // Get preference values
    const downPayment =
      parseCurrency(document.getElementById("profileDownPayment").value) ||
      null;
    // Trade-in preferences removed - now managed through My Garage

    // Validate required fields
    if (!fullName || !email || !phone) {
      alert("Please fill in all required fields: Full Name, Email, and Phone");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address");
      return;
    }

    // Get county data from Google Places if available
    const addressInput = document.getElementById("profileAddress");
    const county = addressInput?.dataset?.county || null;
    const countyName = addressInput?.dataset?.countyName || null;
    const googlePlaceId = addressInput?.dataset?.placeId || null;

    // Prepare profile data
    const profileData = {
      full_name: fullName,
      email: email,
      phone: phone,
      street_address: address || null,
      city: city || null,
      state: state || null,
      state_code: state || null,
      zip_code: zip || null,
      county: county,
      county_name: countyName,
      google_place_id: googlePlaceId,
      credit_score_range: creditScore || null,
      preferred_down_payment: downPayment,
      // Trade-in preferences removed - now managed through My Garage
      updated_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    };

    // Upsert profile (insert or update)
    const { data: profile, error } = await supabase
      .from("customer_profiles")
      .upsert(profileData, {
        onConflict: "email",
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving customer profile:", error);
      alert("Error saving profile. Please try again.");
      return;
    }

    // Save profile ID to localStorage
    localStorage.setItem("customerProfileId", profile.id);

    // Update profile dropdown label with user's first name
    await updateProfileDropdownLabel();

    // Close modal
    closeCustomerProfileModal();

    // Show success message

    // Auto-populate main location from saved profile
    await autoPopulateLocationFromProfile();

    // Auto-populate calculator fields from saved profile
    await autoPopulateCalculatorFromProfile();

    // TODO: Show toast notification
    alert(
      "Profile saved successfully! Your location and preferences have been auto-populated."
    );
  } catch (error) {
    console.error("Error saving customer profile:", error);
    alert("Error saving profile. Please try again.");
  }
}

/* ============================================================================
   Profile Dropdown Functions
   ============================================================================ */

/**
 * Toggle the profile dropdown menu
 */
function toggleProfileDropdown() {
  const menu = document.getElementById("profileDropdownMenu");
  const trigger = document.getElementById("profileDropdownBtn");

  if (!menu || !trigger) {
    console.error("Menu or trigger not found!", { menu, trigger });
    return;
  }

  const currentDisplay = menu.style.display;

  if (currentDisplay === "none" || !currentDisplay) {
    menu.style.display = "block";
    trigger.classList.add("active");
  } else {
    menu.style.display = "none";
    trigger.classList.remove("active");
  }
}

/**
 * Close the profile dropdown menu
 */
function closeProfileDropdown() {
  const menu = document.getElementById("profileDropdownMenu");
  const trigger = document.getElementById("profileDropdownBtn");

  if (menu) menu.style.display = "none";
  if (trigger) trigger.classList.remove("active");
}

/**
 * Handle user sign out
 */
function handleSignOut() {
  if (confirm("Are you sure you want to sign out?")) {
    // Clear customer profile ID
    localStorage.removeItem("customerProfileId");

    // Show message
    alert("You have been signed out successfully.");

    // Reload page to reset state
    window.location.reload();
  }
}

/**
 * Update auth UI - show Sign In button or Profile dropdown
 * NOTE: This is legacy code. Auth UI is now handled by auth-manager.ts
 */
async function updateAuthUI() {
  const authStore = useAuthStore.getState();
  const signInBtn = document.getElementById("signInBtn");
  const profileDropdownContainer = document.getElementById(
    "profileDropdownContainer"
  );
  const labelElement = document.getElementById("profileDropdownLabel");

  // Check if user is logged in
  if (!authStore.user) {
    // Not logged in - show Sign In button
    if (signInBtn) signInBtn.style.display = "flex";
    if (profileDropdownContainer)
      profileDropdownContainer.style.display = "none";
    return;
  }

  // Logged in - show profile dropdown
  if (signInBtn) signInBtn.style.display = "none";
  if (profileDropdownContainer)
    profileDropdownContainer.style.display = "block";

  // Update label with user's first name
  if (!labelElement) return;

  try {
    const { data: profile, error } = await supabase
      .from("customer_profiles")
      .select("full_name")
      .eq("user_id", authStore.user.id)
      .single();

    if (error) throw error;

    if (profile && profile.full_name) {
      const firstName = profile.full_name.split(' ')[0];
      labelElement.textContent = firstName;
    } else {
      labelElement.textContent = "Profile";
    }
  } catch (error) {
    console.error("Error fetching profile name:", error);
    labelElement.textContent = "Profile";
  }
}

// Keep the old function name for backward compatibility
async function updateProfileDropdownLabel() {
  await updateAuthUI();
}

/**
 * Sync Supabase Auth session with customer profile
 * If user is logged in via Supabase Auth, fetch or create their customer profile
 */
/**
 * Sync auth with profile
 * NOTE: This is legacy code. Auth is now handled by auth-manager.ts
 */
async function syncAuthWithProfile() {
  try {
    // Get current Supabase Auth session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("[auth-sync] Error getting session:", sessionError);
      return;
    }

    if (!session || !session.user) {
      // No active session - user is not logged in
      return;
    }

    // Auth is now handled by auth-manager.ts and Zustand store
    // This function is kept for backward compatibility but does minimal work
  } catch (error) {
    console.error("[auth-sync] Unexpected error:", error);
  }
}

// Make functions globally available
window.toggleProfileDropdown = toggleProfileDropdown;
window.closeProfileDropdown = closeProfileDropdown;
window.handleSignOut = handleSignOut;
window.updateProfileDropdownLabel = updateProfileDropdownLabel;
window.syncAuthWithProfile = syncAuthWithProfile;

/* ============================================================================
   My Garage Functions
   ============================================================================ */

// Track selected trade-in vehicles (unlimited)
let selectedTradeIns = [];
let tradeDataSyncErrorToast = null;

function showTradeDataErrorToast() {
  if (tradeDataSyncErrorToast) return;
  tradeDataSyncErrorToast = showToastWithActions(
    "We couldn't load the selected trade-in details. Please reopen My Garage and reselect your trade vehicle.",
    "error",
    [
      {
        label: "Dismiss",
        callback: () => {
          tradeDataSyncErrorToast = null;
        },
      },
    ],
    0
  );
}

function deriveVehiclePriceValue(vehicle) {
  const candidates = [
    vehicle.price,
    vehicle.asking_price,
    vehicle.list_price,
    vehicle.sale_price,
    vehicle.vehicle_price,
    vehicle.estimated_value,
    vehicle.msrp,
    vehicle.base_price
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

function getVehiclePriceText(vehicle) {
  const priceValue = deriveVehiclePriceValue(vehicle);
  if (priceValue == null) {
    return "Not Listed";
  }
  return `$${Math.round(priceValue).toLocaleString()}`;
}

const VEHICLE_GRADE_VALUES = new Set(["excellent", "good", "fair", "poor"]);
const VEHICLE_SALE_VALUES = new Set(["new", "used", "cpo", "certified", "certified pre-owned", "certified preowned", "certified_pre_owned"]);

function titleCase(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getVehicleGradeText(grade) {
  if (!grade) return "";
  const g = String(grade).toLowerCase();
  if (!VEHICLE_GRADE_VALUES.has(g)) return "";
  if (g === "poor") return "Poor";
  if (g === "fair") return "Fair";
  if (g === "good") return "Good";
  if (g === "excellent") return "Excellent";
  return titleCase(g);
}

function getVehicleSaleConditionText(sc) {
  if (!sc) return "";
  const v = String(sc).toLowerCase();
  if (v === "cpo" || v.startsWith("certified")) return "Certified Pre-Owned";
  if (v === "new") return "New";
  if (v === "used") return "Used";
  return titleCase(v);
}

function deriveVehicleGrade(vehicle) {
  if (!vehicle) return "";
  const fromField = vehicle.conditionGrade || vehicle.condition_grade;
  if (fromField && VEHICLE_GRADE_VALUES.has(String(fromField).toLowerCase())) {
    return String(fromField).toLowerCase();
  }
  const legacy = vehicle.condition;
  if (legacy && VEHICLE_GRADE_VALUES.has(String(legacy).toLowerCase())) {
    return String(legacy).toLowerCase();
  }
  return "";
}

function deriveSaleCondition(vehicle) {
  if (!vehicle) return "";
  const fromField = vehicle.saleCondition || vehicle.sale_condition;
  if (fromField && VEHICLE_SALE_VALUES.has(String(fromField).toLowerCase())) {
    const v = String(fromField).toLowerCase();
    if (v.startsWith("certified") || v === "cpo") return "cpo";
    return v;
  }
  const legacy = vehicle.condition;
  if (legacy && VEHICLE_SALE_VALUES.has(String(legacy).toLowerCase())) {
    const v = String(legacy).toLowerCase();
    if (v.startsWith("certified") || v === "cpo") return "cpo";
    return v;
  }
  // Fallback: infer from year
  const currentYear = new Date().getFullYear();
  const yearNum = parseInt(vehicle.year, 10);
  if (Number.isFinite(yearNum)) {
    return yearNum >= currentYear ? "new" : "used";
  }
  return "";
}

function buildVehicleSummaryMarkup(vehicle) {
  const priceText = getVehiclePriceText(vehicle);
  const gradeText = getVehicleGradeText(deriveVehicleGrade(vehicle));
  const saleText = gradeText || getVehicleSaleConditionText(deriveSaleCondition(vehicle));
  const trimSegment = vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : "";
  const mileageText = Number.isFinite(Number(vehicle.mileage))
    ? `${formatMileage(Number(vehicle.mileage))} miles`
    : null;

  return `
    <div class="vehicle-card">
      <div class="vehicle-header">
        <div class="vehicle-title">
          ${vehicle.year || ""} ${capitalizeWords(vehicle.make || "")} ${capitalizeWords(vehicle.model || "")}${trimSegment}
        </div>
        <div class="vehicle-price">${priceText}</div>
      </div>
      <div class="vehicle-subinfo">
        ${mileageText ? `<span class="vehicle-miles">${mileageText}</span>` : ""}
        ${saleText ? `<span class="vehicle-condition">${saleText}</span>` : ""}
      </div>
      ${
        vehicle.vin
          ? `<div class="vehicle-vin">${formatVIN(vehicle.vin)}</div>`
          : ""
      }
    </div>
  `;
}

const SLIDER_GRADIENT_POSITIVE =
  "linear-gradient(135deg, var(--primary-start) 0%, #0052a3 100%)";
const SLIDER_GRADIENT_NEGATIVE =
  "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)";

const sliderPolarityMap = {
  salePrice: {
    sliderId: "quickSliderSalePrice",
    inputId: "quickInputSalePrice",
    diffId: "quickDiffSalePrice",
    resetId: "quickResetSalePrice",
    positiveDirection: "left",
    colorPositive: SLIDER_GRADIENT_POSITIVE,
    colorNegative: SLIDER_GRADIENT_NEGATIVE,
    format: "currency",
    step: 100,
    snapZone: 50,
    minFloor: 0,
    getBaseline: () => {
      const explicit = wizardData.financing?.salePrice;
      if (Number.isFinite(explicit)) return explicit;
      const hiddenInput = document.getElementById("quick-vehicle-price");
      if (hiddenInput) {
        const parsed = parseCurrency(hiddenInput.value);
        if (Number.isFinite(parsed)) return parsed;
      }
      const slider = document.getElementById("quickSliderSalePrice");
      return Number(slider?.value) || 0;
    },
    setValue: (val) => {
      wizardData.financing = wizardData.financing || {};
      wizardData.financing.salePrice = val;
      const hidden = document.getElementById("quick-vehicle-price");
      if (hidden) hidden.value = formatCurrency(val);
    },
  },
  cashDown: {
    sliderId: "quickSliderCashDown",
    inputId: "quickInputCashDown",
    diffId: "quickDiffCashDown",
    resetId: "quickResetCashDown",
    positiveDirection: "right",
    colorPositive: SLIDER_GRADIENT_POSITIVE,
    colorNegative: SLIDER_GRADIENT_NEGATIVE,
    format: "currency",
    step: 100,
    snapZone: 50,
    minFloor: 0,
    getBaseline: () => {
      const explicit = wizardData.financing?.cashDown;
      if (Number.isFinite(explicit)) return explicit;
      const hidden = document.getElementById("quick-down-payment");
      if (hidden) {
        const parsed = parseCurrency(hidden.value);
        if (Number.isFinite(parsed)) return parsed;
      }
      const slider = document.getElementById("quickSliderCashDown");
      return Number(slider?.value) || 0;
    },
    setValue: (val) => {
      wizardData.financing = wizardData.financing || {};
      wizardData.financing.cashDown = val;
      const hidden = document.getElementById("quick-down-payment");
      if (hidden) hidden.value = formatCurrency(val);
    },
  },
  dealerFees: {
    sliderId: "quickSliderDealerFees",
    inputId: "quickInputDealerFees",
    diffId: "quickDiffDealerFees",
    resetId: "quickResetDealerFees",
    positiveDirection: "left",
    colorPositive: SLIDER_GRADIENT_POSITIVE,
    colorNegative: SLIDER_GRADIENT_NEGATIVE,
    format: "currency",
    step: 10,
    snapZone: 5,
    minFloor: 0,
    getBaseline: () => {
      ensureWizardFeeDefaults();
      return wizardData.fees?.dealerFees ?? 0;
    },
    setValue: (val) => {
      ensureWizardFeeDefaults();
      wizardData.fees.dealerFees = val;
      wizardData.fees.userCustomized = true;
    },
  },
  tradeAllowance: {
    sliderId: "quickSliderTradeAllowance",
    inputId: "quickInputTradeAllowance",
    diffId: "quickDiffTradeAllowance",
    resetId: "quickResetTradeAllowance",
    positiveDirection: "right",
    colorPositive: SLIDER_GRADIENT_POSITIVE,
    colorNegative: SLIDER_GRADIENT_NEGATIVE,
    format: "currency",
    step: 100,
    snapZone: 50,
    minFloor: 0,
    getBaseline: () => wizardData.tradein?.tradeValue ?? 0,
    setValue: (val) => {
      wizardData.tradein = wizardData.tradein || {};
      wizardData.tradein.hasTradeIn = true;
      wizardData.tradein.tradeValue = val;

      wizardData.trade = wizardData.trade || {};
      wizardData.trade.hasTradeIn = true;
      wizardData.trade.value = val;
      wizardData.trade.payoff =
        wizardData.trade.payoff ?? wizardData.tradein?.tradePayoff ?? 0;
    },
  },
  tradePayoff: {
    sliderId: "quickSliderTradePayoff",
    inputId: "quickInputTradePayoff",
    diffId: "quickDiffTradePayoff",
    resetId: "quickResetTradePayoff",
    positiveDirection: "left",
    colorPositive: SLIDER_GRADIENT_POSITIVE,
    colorNegative: SLIDER_GRADIENT_NEGATIVE,
    format: "currency",
    step: 100,
    snapZone: 50,
    minFloor: 0,
    getBaseline: () => wizardData.tradein?.tradePayoff ?? 0,
    setValue: (val) => {
      wizardData.tradein = wizardData.tradein || {};
      wizardData.tradein.hasTradeIn = true;
      wizardData.tradein.tradePayoff = val;

      wizardData.trade = wizardData.trade || {};
      wizardData.trade.hasTradeIn = true;
      wizardData.trade.payoff = val;
      wizardData.trade.value =
        wizardData.trade.value ?? wizardData.tradein?.tradeValue ?? 0;
    },
  },
  addons: {
    sliderId: "quickSliderCustomerAddons",
    inputId: "quickInputCustomerAddons",
    diffId: "quickDiffCustomerAddons",
    resetId: "quickResetCustomerAddons",
    positiveDirection: "left",
    colorPositive: SLIDER_GRADIENT_POSITIVE,
    colorNegative: SLIDER_GRADIENT_NEGATIVE,
    format: "currency",
    step: 10,
    snapZone: 5,
    minFloor: 0,
    getBaseline: () => {
      ensureWizardFeeDefaults();
      return wizardData.fees?.customerAddons ?? 0;
    },
    setValue: (val) => {
      ensureWizardFeeDefaults();
      wizardData.fees.customerAddons = val;
      wizardData.fees.userCustomized = true;
    },
  },
};

const sliderIdLookup = Object.entries(sliderPolarityMap).reduce(
  (acc, [field, meta]) => {
    acc[meta.sliderId] = field;
    return acc;
  },
  {}
);

function getSliderStep(meta) {
  return Number(meta.step) || 1;
}

function getSliderVisualOrigin(slider) {
  const stored = Number(slider?.dataset?.visualOrigin);
  if (Number.isFinite(stored)) return stored;
  const origin = Number(slider?.dataset?.origin);
  return Number.isFinite(origin) ? origin : 0;
}

function setSliderVisualOrigin(slider, visualOrigin) {
  if (!slider) return;
  if (Number.isFinite(visualOrigin)) {
    slider.dataset.visualOrigin = String(visualOrigin);
  } else {
    delete slider.dataset.visualOrigin;
  }
}

function convertVisualToActual(slider, visualValue) {
  const origin = Number(slider?.dataset?.origin) || 0;
  const visualOrigin = getSliderVisualOrigin(slider);
  const delta = Number(visualValue) - visualOrigin;
  return origin + (Number.isFinite(delta) ? delta : 0);
}

function convertActualToVisual(slider, actualValue) {
  const origin = Number(slider?.dataset?.origin) || 0;
  const visualOrigin = getSliderVisualOrigin(slider);
  const delta = Number(actualValue) - origin;
  return visualOrigin + (Number.isFinite(delta) ? delta : 0);
}

function formatSliderValue(value, meta, { includeSign = false } = {}) {
  const numeric = Number(value) || 0;
  let base;
  if (meta.format === "currency") {
    base = formatCurrency(Math.abs(numeric));
  } else {
    base = Math.abs(numeric).toLocaleString();
  }

  if (!includeSign) {
    return numeric < 0 ? `-${base}` : base;
  }

  if (numeric > 0) return `+${base}`;
  if (numeric < 0) return `-${base}`;
  return base;
}

function computeBuyerPositive(meta, diff) {
  if (diff === 0) return null;
  const isRightPositive = meta.positiveDirection === "right";
  return isRightPositive ? diff > 0 : diff < 0;
}

function updateSliderVisual(slider, visualValue, originActual, meta) {
  if (!slider || !meta) return;

  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 0;
  const range = max - min || 1;

  const visualOrigin = convertActualToVisual(slider, originActual);
  const safeVisual = Number.isFinite(visualValue)
    ? visualValue
    : visualOrigin;

  const clampPercent = (value) =>
    Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  const pct = clampPercent(((safeVisual - min) / range) * 100);
  const originPct = clampPercent(((visualOrigin - min) / range) * 100);

  const actualValue = convertVisualToActual(slider, safeVisual);
  const diff = actualValue - originActual;
  const buyerPositiveRight = meta.positiveDirection === "right";
  const isBuyerPositive =
    Math.abs(diff) > 0.0001
      ? buyerPositiveRight
        ? diff > 0
        : diff < 0
      : false;
  const isBuyerNegative =
    Math.abs(diff) > 0.0001
      ? buyerPositiveRight
        ? diff < 0
        : diff > 0
      : false;

  const neutral = "var(--neutral, #e5e7eb)";
  const positiveStart = "var(--primary-start, #1e40af)";
  const positiveEnd = "var(--primary-end, #3b82f6)";
  const negativeStart = "var(--error, #ef4444)";
  const negativeEnd = "var(--error-dark, #b91c1c)";

  let gradient;

  if (!isBuyerPositive && !isBuyerNegative) {
    gradient = `linear-gradient(to right, ${neutral} 0%, ${neutral} 100%)`;
  } else {
    const start = clampPercent(Math.min(pct, originPct));
    const end = clampPercent(Math.max(pct, originPct));

    if (Math.abs(end - start) < 0.1) {
      gradient = `linear-gradient(to right, ${neutral} 0%, ${neutral} 100%)`;
    } else {
      const fillStart = isBuyerPositive ? positiveStart : negativeStart;
      const fillEnd = isBuyerPositive ? positiveEnd : negativeEnd;

      gradient = `linear-gradient(to right,
        ${neutral} 0%,
        ${neutral} ${start}%,
        ${fillStart} ${start}%,
        ${fillEnd} ${end}%,
        ${neutral} ${end}%,
        ${neutral} 100%)`;
    }
  }

  slider.style.background = gradient;
}

function updateDiffIndicatorState(diffIndicator, resetBtn, value, origin, meta) {
  if (!diffIndicator) return;
  const diff = value - origin;
  const buyerPositive = computeBuyerPositive(meta, diff);

  if (diff === 0) {
    diffIndicator.style.display = "none";
    if (resetBtn) resetBtn.style.display = "none";
    return;
  }

  diffIndicator.style.display = "flex";
  diffIndicator.className = `quick-diff-indicator ${
    buyerPositive ? "positive" : "negative"
  }`;

  let diffText = diffIndicator.querySelector(".diff-text");
  if (!diffText) {
    diffText = document.createElement("span");
    diffText.className = "diff-text";
    // Insert before reset button
    if (resetBtn) {
      diffIndicator.insertBefore(diffText, resetBtn);
    } else {
      diffIndicator.appendChild(diffText);
    }
  }

  diffText.textContent = `${formatSliderValue(diff, meta, {
    includeSign: true,
  })}`;

  if (resetBtn) {
    resetBtn.style.display = "inline-flex";
  }
}

function configureSliderRange(slider, origin, meta, visualOriginOverride) {
  if (!slider || !meta) return;
  const step = getSliderStep(meta);
  const originValue = Number(origin) || 0;
  const visualOrigin = Number.isFinite(visualOriginOverride)
    ? visualOriginOverride
    : getSliderVisualOrigin(slider);
  const paddingCandidate = Math.abs(visualOrigin) * 0.5;
  const fallbackPadding = step * 20;
  const padding = Math.max(paddingCandidate, fallbackPadding, 1000);
  const minFloor = Number.isFinite(meta.minFloor)
    ? Number(meta.minFloor)
    : -Infinity;
  const maxCeil = Number.isFinite(meta.maxCeil)
    ? Number(meta.maxCeil)
    : Infinity;

  let computedMin = Math.max(minFloor, visualOrigin - padding);
  let computedMax = Math.min(maxCeil, visualOrigin + padding);

  const defaultMin = Number(slider.dataset.defaultMin);
  if (Number.isFinite(defaultMin)) {
    computedMin = Math.min(computedMin, defaultMin);
    computedMin = Math.max(minFloor, computedMin);
  }

  const defaultMax = Number(slider.dataset.defaultMax);
  if (Number.isFinite(defaultMax)) {
    computedMax = Math.max(computedMax, defaultMax);
    computedMax = Math.min(maxCeil, computedMax);
  }

  slider.min = computedMin;
  slider.max = computedMax;
  slider.step = step;
}

function formatSliderInputValue(value, meta) {
  const numeric = Number(value) || 0;
  if (meta.format === "currency") {
    // PRECISION: Always show cents in input fields to indicate precision support
    return formatCurrency(numeric, true, { showCents: true });
  }
  if (meta.format === "percent") {
    return formatPercent(numeric);
  }
  return numeric.toLocaleString();
}

function parseSliderInputValue(rawValue, meta) {
  if (meta.format === "currency") {
    return parseCurrency(rawValue);
  }

  const normalized =
    typeof rawValue === "string"
      ? rawValue.replace(/[^0-9.-]/g, "")
      : String(rawValue ?? "");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampSliderValueToRange(value, slider) {
  const numeric = Number.isFinite(value) ? value : 0;
  const min = Number(slider.min);
  const max = Number(slider.max);
  let clamped = numeric;
  if (Number.isFinite(min)) {
    clamped = Math.max(min, clamped);
  }
  if (Number.isFinite(max)) {
    clamped = Math.min(max, clamped);
  }
  return clamped;
}

function gatherSliderBaselines() {
  return Object.entries(sliderPolarityMap).reduce((acc, [field, meta]) => {
    try {
      const baseline = meta.getBaseline ? meta.getBaseline() : 0;
      acc[field] = Number.isFinite(baseline) ? baseline : 0;
    } catch (error) {
      acc[field] = 0;
    }
    return acc;
  }, {});
}

function initSlidersFromBaseline(baselines) {
  Object.entries(sliderPolarityMap).forEach(([field, meta]) => {
    const slider = document.getElementById(meta.sliderId);
    if (!slider) return;

    const origin = Number(baselines[field]) || 0;
    slider.dataset.origin = origin;
    slider.dataset.field = field;
    const step = getSliderStep(meta);
    slider.dataset.snapZone = Number.isFinite(meta.snapZone)
      ? meta.snapZone
      : step;
    slider.dataset.stepSize = step;
    const visualOrigin = Math.round(origin / step) * step;
    setSliderVisualOrigin(slider, visualOrigin);
    configureSliderRange(slider, origin, meta, visualOrigin);
    slider.value = visualOrigin;

    updateSliderVisual(slider, visualOrigin, origin, meta);
  });
}

/**
 * Open My Garage modal and load vehicles
 */
async function openMyGarageModal() {
  const modal = document.getElementById("my-garage-modal");
  if (!modal) {
    console.error("❌ [My Garage] Modal element not found!");
    return;
  }
  modal.classList.add("active");
  modal.style.display = "flex";

  // ESC key to close
  if (!window.__myGarageEscHandler) {
    window.__myGarageEscHandler = (e) => {
      const key = e.key || e.code;
      if (key === "Escape" || key === "Esc") {
        e.preventDefault();
        closeMyGarageModal();
      }
    };
    document.addEventListener("keydown", window.__myGarageEscHandler);
  }

  const cachedVehicles = useGarageStore.getState().vehicles || [];
  if (cachedVehicles.length > 0) {
    renderGarageVehiclesList(cachedVehicles);
  } else {
    showGarageEmptyState();
  }

  loadGarageVehicles().catch((error) => {
    console.error("[My Garage] Unable to refresh vehicles:", error);
  });
}

/**
 * Close My Garage modal
 */
function closeMyGarageModal() {
  const modal = document.getElementById("my-garage-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
  hideGarageForm();
}

/**
 * Load garage vehicles from database
 */
async function loadGarageVehicles() {
  const authStore = useAuthStore.getState();

  if (!authStore.user) {
    showGarageEmptyState();
    return;
  }

  try {
    const { data: vehicles, error } = await supabase
      .from("garage_vehicles")
      .select("*")
      .eq("user_id", authStore.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    useGarageStore.getState().setVehicles(vehicles || []);
    renderGarageVehiclesList(vehicles || []);
  } catch (error) {
    console.error("Error loading garage vehicles:", error);
    showGarageEmptyState();
  }
}

function renderGarageVehiclesList(vehicles = []) {
  const vehicleList = document.getElementById("garage-vehicle-list");
  const emptyState = document.getElementById("garage-empty-state");

  if (!vehicles || vehicles.length === 0) {
    showGarageEmptyState();
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  if (vehicleList) {
    vehicleList.innerHTML = vehicles
      .map((vehicle) => renderGarageVehicleCard(vehicle))
      .join("");
  }

  selectedTradeIns.forEach((vehicleId) => {
    const checkbox = document.getElementById(`tradein-checkbox-${vehicleId}`);
    if (checkbox) checkbox.checked = true;
  });
}

/**
 * Show empty state
 */
function showGarageEmptyState() {
  const vehicleList = document.getElementById("garage-vehicle-list");
  const emptyState = document.getElementById("garage-empty-state");

  if (vehicleList) {
    // Remove all vehicle cards
    const cards = vehicleList.querySelectorAll(".garage-vehicle-card");
    cards.forEach((card) => card.remove());
  }

  if (emptyState) {
    emptyState.style.display = "block";
  }
}

/**
 * Render a single garage vehicle card with trade-in checkbox
 */
function renderGarageVehicleCard(vehicle) {
  const nickname =
    vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const trim = vehicle.trim ? ` ${vehicle.trim}` : "";
  const mileage = vehicle.mileage || 0;
  const value = vehicle.estimated_value || 0;
  const payoff = vehicle.payoff_amount || 0;
  const condition = vehicle.condition
    ? vehicle.condition.charAt(0).toUpperCase() + vehicle.condition.slice(1)
    : "";

  const vehicleSummaryMarkup = buildVehicleSummaryMarkup(vehicle);

  return `
    <div class="garage-vehicle-card" data-vehicle-id="${vehicle.id}">
      <div class="garage-vehicle-header">
        <div class="garage-vehicle-checkbox">
          <input
            type="checkbox"
            id="tradein-checkbox-${vehicle.id}"
            onchange="handleTradeInSelection('${vehicle.id}', this.checked)"
            ${selectedTradeIns.includes(vehicle.id) ? "checked" : ""}
          />
          <label for="tradein-checkbox-${vehicle.id}">Trade-In</label>
        </div>
        <div class="garage-vehicle-actions">
          <button type="button" class="garage-action-btn" onclick="openEditVehicleModal('${
            vehicle.id
          }')" title="Edit">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
          <button type="button" class="garage-action-btn garage-action-btn--danger" onclick="deleteGarageVehicle('${
            vehicle.id
          }')" title="Delete">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="garage-vehicle-info">
        ${vehicleSummaryMarkup}
        <div class="garage-vehicle-financial">
          <div class="garage-financial-item">
            <span class="garage-financial-label">Estimated Value</span>
            <span class="garage-financial-value">${formatCurrency(value)}</span>
          </div>
          <div class="garage-financial-item">
            <span class="garage-financial-label">Payoff</span>
            <span class="garage-financial-value">${formatCurrency(
              payoff
            )}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Handle trade-in checkbox selection (unlimited)
 */
function handleTradeInSelection(vehicleId, isChecked) {
  if (isChecked) {
    // Add to selected
    if (!selectedTradeIns.includes(vehicleId)) {
      selectedTradeIns.push(vehicleId);
    }
  } else {
    // Remove from selected
    selectedTradeIns = selectedTradeIns.filter((id) => id !== vehicleId);
  }

  // Update calculations with new trade-in values
  updateTradeInCalculations();
}

/**
 * Update calculations based on selected trade-ins
 */
async function updateTradeInCalculations() {
  if (selectedTradeIns.length === 0) {
    // No trade-ins selected - reset to 0
    wizardData.trade = null;

    // Clear trade-in sliders and inputs
    const tradeAllowanceSlider = document.getElementById(
      "quickSliderTradeAllowance"
    );
    const tradeAllowanceInput = document.getElementById(
      "quickInputTradeAllowance"
    );
    const tradePayoffSlider = document.getElementById("quickSliderTradePayoff");
    const tradePayoffInput = document.getElementById("quickInputTradePayoff");

    if (tradeAllowanceSlider) tradeAllowanceSlider.value = 0;
    if (tradeAllowanceInput) tradeAllowanceInput.value = formatCurrency(0);
    if (tradePayoffSlider) tradePayoffSlider.value = 0;
    if (tradePayoffInput) tradePayoffInput.value = formatCurrency(0);

    await autoCalculateQuick();
    return;
  }

  try {
    // Fetch selected vehicles from garage (owned vehicles)
    const { data: vehicles, error } = await supabase
      .from("garage_vehicles")
      .select("*")
      .in("id", selectedTradeIns);

    if (error) throw error;

    // Calculate totals
    let totalValue = 0;
    let totalPayoff = 0;

    vehicles.forEach((vehicle) => {
      totalValue += parseFloat(vehicle.estimated_value || 0);
      totalPayoff += parseFloat(vehicle.payoff_amount || 0);
    });

    // Update wizardData (use 'tradein' to match what sliders and computeReviewData use)
    wizardData.tradein = {
      hasTradeIn: true,
      tradeValue: totalValue,
      tradePayoff: totalPayoff,
      vehicles: vehicles,
    };

    // Also set the old 'trade' property for backwards compatibility
    wizardData.trade = {
      hasTradeIn: true,
      value: totalValue,
      payoff: totalPayoff,
      vehicles: vehicles,
    };

    // Update trade-in sliders and inputs
    const tradeAllowanceSlider = document.getElementById(
      "quickSliderTradeAllowance"
    );
    const tradeAllowanceInput = document.getElementById(
      "quickInputTradeAllowance"
    );
    const tradePayoffSlider = document.getElementById("quickSliderTradePayoff");
    const tradePayoffInput = document.getElementById("quickInputTradePayoff");

    if (tradeAllowanceSlider) {
      // Get the original value to maintain centering
      const originalValue =
        window.sliderOriginalValues?.["quickSliderTradeAllowance"] ||
        totalValue;

      // Calculate new centered range if value exceeds current bounds
      const currentMin = parseFloat(tradeAllowanceSlider.min);
      const currentMax = parseFloat(tradeAllowanceSlider.max);

      if (totalValue > currentMax || totalValue < currentMin) {
        // Recalculate centered range
        const range = Math.max(totalValue * 0.5, 15000); // At least $15k range
        tradeAllowanceSlider.min = Math.max(0, totalValue - range);
        tradeAllowanceSlider.max = totalValue + range;
      }

      tradeAllowanceSlider.value = totalValue;
      updateSliderProgress(tradeAllowanceSlider);

      // Dispatch input event to trigger all connected UI updates
      tradeAllowanceSlider.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      console.error(
        "[updateTradeInCalculations] Trade allowance slider not found!"
      );
    }

    if (tradeAllowanceInput) {
      tradeAllowanceInput.value = formatCurrency(totalValue);
    }

    if (tradePayoffSlider) {
      // Get the original value to maintain centering
      const originalValue =
        window.sliderOriginalValues?.["quickSliderTradePayoff"] || totalPayoff;

      // Calculate new centered range if value exceeds current bounds
      const currentMin = parseFloat(tradePayoffSlider.min);
      const currentMax = parseFloat(tradePayoffSlider.max);

      if (totalPayoff > currentMax || totalPayoff < currentMin) {
        // Recalculate centered range
        const range = Math.max(totalPayoff * 0.5, 15000); // At least $15k range
        tradePayoffSlider.min = Math.max(0, totalPayoff - range);
        tradePayoffSlider.max = totalPayoff + range;
      }

      tradePayoffSlider.value = totalPayoff;
      updateSliderProgress(tradePayoffSlider);

      // Dispatch input event to trigger all connected UI updates
      tradePayoffSlider.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      console.error(
        "[updateTradeInCalculations] Trade payoff slider not found!"
      );
    }

    if (tradePayoffInput) {
      tradePayoffInput.value = formatCurrency(totalPayoff);
    }

    // Update the original values so diff indicators don't show these as "changed"
    if (window.originalValues) {
      window.originalValues["quickSliderTradeAllowance"] = totalValue;
      window.originalValues["quickSliderTradePayoff"] = totalPayoff;
    }

    // Trigger recalculation
    await autoCalculateQuick();
  } catch (error) {
    console.error("Error updating trade-in calculations:", error);
  }
}

/**
 * Add a saved vehicle to My Garage (for trade-in purposes)
 */
async function addSavedVehicleToGarage(savedVehicleId) {
  try {

    if (!supabase || !currentUserId) {
      showToast('Please sign in to add vehicles to your garage', 'error');
      return;
    }

    // Show loading state
    showToast('Adding vehicle to garage...', 'info');

    // 1. Fetch the saved vehicle
    const { data: savedVehicle, error: fetchError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', savedVehicleId)
      .single();

    if (fetchError || !savedVehicle) {
      console.error('[addSavedVehicleToGarage] Error fetching saved vehicle:', fetchError);
      showToast('Unable to find saved vehicle', 'error');
      return;
    }

    // VIN is required
    if (!savedVehicle.vin) {
      showToast('Cannot add vehicle without VIN', 'error');
      return;
    }

    // Validate required fields
    const year = Number(savedVehicle.year);
    if (!year || !savedVehicle.make || !savedVehicle.model) {
      console.error('[addSavedVehicleToGarage] Missing required fields:', {
        year: savedVehicle.year,
        make: savedVehicle.make,
        model: savedVehicle.model
      });
      showToast('Vehicle is missing year/make/model; cannot add', 'error');
      return;
    }

    // 2. Check for duplicate by VIN
    const { data: existingVehicle, error: dupError } = await supabase
      .from('garage_vehicles')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('vin', savedVehicle.vin)
      .single();

    if (dupError && dupError.code !== 'PGRST116') {
      // PGRST116 = not found (which is what we want)
      console.error('[addSavedVehicleToGarage] Duplicate check error:', dupError);
      showToast(dupError.message || 'Error checking duplicates', 'error');
      return;
    }

    if (existingVehicle) {
      showToast('This vehicle is already in your garage', 'warning');
      return;
    }

    // 3. Normalize condition to what garage_vehicles allows
    // garage_vehicles: excellent/good/fair/poor
    // saved vehicles might have: new/used or other values
    let normalizedCondition = null;
    const allowedConditions = ['excellent', 'good', 'fair', 'poor'];
    if (savedVehicle.condition) {
      const lower = savedVehicle.condition.toLowerCase();
      if (allowedConditions.includes(lower)) {
        normalizedCondition = lower;
      } else if (lower === 'new') {
        normalizedCondition = 'excellent'; // Map 'new' to 'excellent'
      } else if (lower === 'used') {
        normalizedCondition = 'good'; // Map 'used' to 'good'
      }
    }

    // 4. Map saved vehicle to garage schema
    const garageVehicle = {
      user_id: currentUserId,
      nickname: savedVehicle.heading || null,
      year: year,
      make: savedVehicle.make,
      model: savedVehicle.model,
      trim: savedVehicle.trim || null,
      vin: savedVehicle.vin,
      mileage: savedVehicle.mileage || null,
      condition: normalizedCondition,
      // Use 85% of asking price as estimated trade-in value
      estimated_value: savedVehicle.asking_price
        ? Math.round(savedVehicle.asking_price * 0.85)
        : 0,
      payoff_amount: 0,
      photo_url: savedVehicle.photo_url || null,
      notes: 'Imported from saved vehicles'
    };


    // 4. Insert into garage_vehicles
    const { error: insertError } = await supabase
      .from('garage_vehicles')
      .insert([garageVehicle]);

    if (insertError) {
      console.error('[addSavedVehicleToGarage] Error inserting:', insertError);
      console.error('[addSavedVehicleToGarage] Error details:', insertError.message, insertError.details);
      showToast(insertError.message ?? 'Could not add to garage', 'error');
      return;
    }

    // 5. Remove from saved vehicles
    const { error: deleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', savedVehicleId)
      .eq('user_id', currentUserId);

    if (deleteError) {
      console.error('[addSavedVehicleToGarage] Error removing from saved vehicles:', deleteError);
      console.error('[addSavedVehicleToGarage] Delete error details:', deleteError.message, deleteError.details);
      // Don't fail the operation, just log it - vehicle was added to garage successfully
    } else {
    }

    // 6. Refresh both lists
    await loadSavedVehicles();
    await loadUserGarageVehicles();

    // 7. Refresh the unified vehicle selector dropdown if it's currently visible
    const vehicleDropdown = document.getElementById("vehicle-selector-dropdown");
    if (vehicleDropdown && vehicleDropdown.style.display !== "none") {
      if (typeof updateVehicleSelectorDropdown === 'function') {
        updateVehicleSelectorDropdown();
      }
    }

    // 8. Success toast!
    showToast(`${savedVehicle.year} ${savedVehicle.make} ${savedVehicle.model} added to My Garage`, 'success');


  } catch (error) {
    console.error('[addSavedVehicleToGarage] Unexpected error:', error);
    showToast('Error adding vehicle to garage', 'error');
  }
}

/**
 * Show garage form for adding/editing
 */
async function showGarageForm(vehicleId = null) {
  const form = document.getElementById("garage-vehicle-form");
  const title = document.getElementById("garage-form-title");

  if (form) {
    form.style.display = "block";
    title.textContent = vehicleId ? "Edit Vehicle" : "Add Vehicle";

    // Store the vehicle ID in the form for later use
    form.dataset.editingVehicleId = vehicleId || "";

    // If editing, load vehicle data into form
    if (vehicleId) {
      try {
        const { data: vehicle, error } = await supabase
          .from("garage_vehicles")
          .select("*")
          .eq("id", vehicleId)
          .single();

        if (error) throw error;

        if (vehicle) {
          // Populate form fields
          document.getElementById("garageNickname").value =
            vehicle.nickname || "";
          document.getElementById("garageYear").value = vehicle.year || "";
          document.getElementById("garageMake").value = vehicle.make || "";
          document.getElementById("garageModel").value = vehicle.model || "";
          document.getElementById("garageTrim").value = vehicle.trim || "";
          document.getElementById("garageMileage").value =
            vehicle.mileage || "";
          document.getElementById("garageVin").value = vehicle.vin || "";
          document.getElementById("garageCondition").value =
            vehicle.condition || "good";
          document.getElementById("garageEstimatedValue").value =
            vehicle.estimated_value
              ? formatCurrency(vehicle.estimated_value)
              : "";
          document.getElementById("garagePayoffAmount").value =
            vehicle.payoff_amount ? formatCurrency(vehicle.payoff_amount) : "";
          document.getElementById("garageNotes").value = vehicle.notes || "";
        }
      } catch (error) {
        console.error("Error loading vehicle for editing:", error);
        showToast("Error loading vehicle data", "error");
      }
    }
  }
}

/**
 * Hide garage form
 */
function hideGarageForm() {
  const form = document.getElementById("garage-vehicle-form");
  if (form) {
    form.style.display = "none";
    // Clear editing state
    form.dataset.editingVehicleId = "";
    // Clear form fields
    form.querySelectorAll("input, select, textarea").forEach((field) => {
      if (field.type === "checkbox") {
        field.checked = false;
      } else {
        field.value = "";
      }
    });
  }
}

/**
 * Open edit vehicle modal
 */
async function openEditVehicleModal(vehicleId) {
  const modal = document.getElementById("edit-vehicle-modal");

  if (!modal) {
    console.error('❌ [openEditVehicleModal] Modal element not found');
    return;
  }


  try {
    // Fetch vehicle data from garage
    const { data: vehicle, error } = await supabase
      .from("garage_vehicles")
      .select("*")
      .eq("id", vehicleId)
      .single();

    if (error) throw error;

    if (vehicle) {

      // Store the vehicle ID in the modal
      modal.dataset.editingVehicleId = vehicleId;

      // Populate form fields
      document.getElementById("editNickname").value = vehicle.nickname || "";
      document.getElementById("editYear").value = vehicle.year || "";
      document.getElementById("editMake").value = vehicle.make || "";
      document.getElementById("editModel").value = vehicle.model || "";
      document.getElementById("editTrim").value = vehicle.trim || "";
      document.getElementById("editMileage").value = vehicle.mileage || "";
      document.getElementById("editVin").value = vehicle.vin || "";
      document.getElementById("editCondition").value = vehicle.condition || "";
      document.getElementById("editEstimatedValue").value =
        vehicle.estimated_value ? formatCurrency(vehicle.estimated_value) : "";
      document.getElementById("editPayoffAmount").value = vehicle.payoff_amount
        ? formatCurrency(vehicle.payoff_amount)
        : "";
      document.getElementById("editNotes").value = vehicle.notes || "";

      // Show modal
      modal.classList.add("active");
      modal.style.display = "flex";
    }
  } catch (error) {
    console.error("❌ [openEditVehicleModal] Error loading vehicle:", error);
    showToast("Error loading vehicle data", "error");
  }
}
window.openEditVehicleModal = openEditVehicleModal;

/**
 * Close edit vehicle modal
 */
function closeEditVehicleModal() {
  const modal = document.getElementById("edit-vehicle-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
    modal.dataset.editingVehicleId = "";

    // Clear form fields
    document.getElementById("editNickname").value = "";
    document.getElementById("editYear").value = "";
    document.getElementById("editMake").value = "";
    document.getElementById("editModel").value = "";
    document.getElementById("editTrim").value = "";
    document.getElementById("editMileage").value = "";
    document.getElementById("editVin").value = "";
    document.getElementById("editCondition").value = "";
    document.getElementById("editEstimatedValue").value = "";
    document.getElementById("editPayoffAmount").value = "";
    document.getElementById("editNotes").value = "";
  }
}
window.closeEditVehicleModal = closeEditVehicleModal;

/**
 * Save edited vehicle
 */
async function saveEditedVehicle() {
  const modal = document.getElementById("edit-vehicle-modal");
  const vehicleId = modal?.dataset.editingVehicleId;

  if (!vehicleId) {
    console.error('❌ [saveEditedVehicle] Vehicle ID not found');
    showToast("Error: Vehicle ID not found", "error");
    return;
  }


  try {
    // Collect form values
    const nickname =
      document.getElementById("editNickname").value?.trim() || null;
    const year = parseInt(document.getElementById("editYear").value);
    const make = document.getElementById("editMake").value?.trim();
    const model = document.getElementById("editModel").value?.trim();
    const trim = document.getElementById("editTrim").value?.trim() || null;
    const mileage = parseInt(document.getElementById("editMileage").value) || 0;
    const condition = document.getElementById("editCondition").value || null;
    const estimatedValue =
      parseFloat(
        document
          .getElementById("editEstimatedValue")
          .value?.replace(/[$,]/g, "")
      ) || 0;
    const payoffAmount =
      parseFloat(
        document.getElementById("editPayoffAmount").value?.replace(/[$,]/g, "")
      ) || 0;
    const notes = document.getElementById("editNotes").value?.trim() || null;


    // Validate required fields
    if (!year || !make || !model) {
      console.error('❌ [saveEditedVehicle] Missing required fields');
      showToast("Please fill in all required fields", "error");
      return;
    }

    // Update in garage_vehicles database
    const { error } = await supabase
      .from("garage_vehicles")
      .update({
        nickname,
        year,
        make,
        model,
        trim,
        mileage,
        condition,
        estimated_value: estimatedValue,
        payoff_amount: payoffAmount,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vehicleId);

    if (error) {
      console.error('❌ [saveEditedVehicle] Database error:', error);
      throw error;
    }

    showToast("Vehicle updated successfully", "success");

    // Close modal
    closeEditVehicleModal();

    // Reload vehicles to reflect changes
    await loadGarageVehicles();

    // Update trade-in calculations if this vehicle is selected
    if (selectedTradeIns.includes(vehicleId)) {
      await updateTradeInCalculations();
    }
  } catch (error) {
    console.error("❌ [saveEditedVehicle] Error saving vehicle:", error);
    showToast("Error saving changes", "error");
  }
}
window.saveEditedVehicle = saveEditedVehicle;

/**
 * Edit garage vehicle (legacy function - now opens modal)
 */
function editGarageVehicle(vehicleId) {
  openEditVehicleModal(vehicleId);
}

/**
 * Delete garage vehicle
 */
async function deleteGarageVehicle(vehicleId) {
  if (!confirm("Are you sure you want to delete this vehicle?")) {
    return;
  }

  try {
    const { error } = await supabase
      .from("garage_vehicles")
      .delete()
      .eq("id", vehicleId);

    if (error) throw error;

    // Remove from selected trade-ins if present
    selectedTradeIns = selectedTradeIns.filter((id) => id !== vehicleId);

    // Reload vehicles
    await loadGarageVehicles();

    // Update calculations
    await updateTradeInCalculations();
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    alert("Error deleting vehicle. Please try again.");
  }
}

/**
 * Save garage vehicle with duplicate checking
 */
let pendingVehicleData = null;
let duplicateVehicleId = null;

async function saveGarageVehicle() {
  const authStore = useAuthStore.getState();

  if (!authStore.user) {
    showToast("Please sign in first", "error");
    return;
  }

  // Check if we're editing an existing vehicle
  const form = document.getElementById("garage-vehicle-form");
  const editingVehicleId = form?.dataset.editingVehicleId || null;
  const isEditing = !!editingVehicleId;

  // Get form values
  const nickname = document.getElementById("garageNickname").value.trim();
  const year = parseInt(document.getElementById("garageYear").value);
  const make = document.getElementById("garageMake").value.trim();
  const model = document.getElementById("garageModel").value.trim();
  const trim = document.getElementById("garageTrim").value.trim();
  const mileage =
    parseInt(document.getElementById("garageMileage").value) || null;
  const vin = document.getElementById("garageVin").value.trim().toUpperCase();
  const condition = document.getElementById("garageCondition").value;
  const estimatedValueStr = document.getElementById(
    "garageEstimatedValue"
  ).value;
  const payoffAmountStr = document.getElementById("garagePayoffAmount").value;
  const notes = document.getElementById("garageNotes").value.trim();

  // Validation
  if (!year || !make || !model) {
    showToast(
      "Please fill in all required fields (Year, Make, Model)",
      "error"
    );
    return;
  }

  if (!vin) {
    showToast("VIN is required to prevent duplicate vehicles", "error");
    return;
  }

  if (vin.length !== 17) {
    showToast("VIN must be exactly 17 characters", "error");
    return;
  }

  // Parse currency values
  const estimatedValue =
    parseFloat(estimatedValueStr.replace(/[$,]/g, "")) || null;
  const payoffAmount = parseFloat(payoffAmountStr.replace(/[$,]/g, "")) || null;

  // Prepare vehicle data
  const vehicleData = {
    user_id: authStore.user.id,
    nickname: nickname || null,
    year,
    make,
    model,
    trim: trim || null,
    mileage,
    vin,
    condition: condition || null,
    estimated_value: estimatedValue,
    payoff_amount: payoffAmount,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (isEditing) {
      // UPDATE existing vehicle in garage
      const { error: updateError } = await supabase
        .from("garage_vehicles")
        .update(vehicleData)
        .eq("id", editingVehicleId);

      if (updateError) throw updateError;

      showToast("Vehicle updated successfully", "success");
      hideGarageForm();
      await loadGarageVehicles();
    } else {
      // INSERT new vehicle to garage - check for duplicate VIN first
      const { data: existing, error: checkError } = await supabase
        .from("garage_vehicles")
        .select("*")
        .eq("user_id", authStore.user.id)
        .eq("vin", vin)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        // PGRST116 means no rows found, which is fine
        throw checkError;
      }

      if (existing) {
        // Duplicate found - show comparison modal
        pendingVehicleData = vehicleData;
        duplicateVehicleId = existing.id;
        showDuplicateVehicleModal(existing, vehicleData);
        return;
      }

      // No duplicate - proceed with insert to garage
      const { data: newVehicle, error: insertError } = await supabase
        .from("garage_vehicles")
        .insert([vehicleData])
        .select()
        .single();

      if (insertError) throw insertError;

      showToast("Vehicle added successfully", "success");
      hideGarageForm();
      await loadGarageVehicles();
    }
  } catch (error) {
    console.error("Error saving vehicle:", error);
    showToast("Error saving vehicle. Please try again.", "error");
  }
}

/**
 * Show duplicate vehicle comparison modal
 */
function showDuplicateVehicleModal(existingVehicle, newVehicle) {
  const modal = document.getElementById("duplicate-vehicle-modal");
  if (!modal) return;

  // Render comparison
  renderVehicleComparison(existingVehicle, newVehicle);

  // Show modal
  modal.style.display = "flex";
}

/**
 * Close duplicate vehicle modal
 */
function closeDuplicateVehicleModal() {
  const modal = document.getElementById("duplicate-vehicle-modal");
  if (modal) {
    modal.style.display = "none";
  }
  pendingVehicleData = null;
  duplicateVehicleId = null;
}

/**
 * Keep existing vehicle (discard changes)
 */
function keepExistingVehicle() {
  closeDuplicateVehicleModal();
  hideGarageForm();
  showToast("Kept existing vehicle", "success");
}

/**
 * Update existing vehicle with new changes
 */
async function updateExistingVehicle() {
  if (!pendingVehicleData || !duplicateVehicleId) {
    showToast("Error: No pending changes", "error");
    return;
  }

  try {
    const { error } = await supabase
      .from("garage_vehicles")
      .update(pendingVehicleData)
      .eq("id", duplicateVehicleId);

    if (error) throw error;

    showToast("Vehicle updated successfully", "success");
    closeDuplicateVehicleModal();
    hideGarageForm();
    await loadGarageVehicles();
  } catch (error) {
    console.error("Error updating vehicle:", error);
    showToast("Error updating vehicle. Please try again.", "error");
  }
}

/**
 * Render vehicle comparison side-by-side
 */
function renderVehicleComparison(existingVehicle, newVehicle) {
  const savedContainer = document.getElementById("duplicate-saved-vehicle");
  const newContainer = document.getElementById("duplicate-new-vehicle");

  if (!savedContainer || !newContainer) return;

  const fields = [
    { key: "nickname", label: "Nickname" },
    { key: "year", label: "Year" },
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "trim", label: "Trim" },
    { key: "mileage", label: "Mileage" },
    { key: "vin", label: "VIN" },
    { key: "condition", label: "Condition" },
    { key: "estimated_value", label: "Estimated Value", isCurrency: true },
    { key: "payoff_amount", label: "Payoff Amount", isCurrency: true },
    { key: "notes", label: "Notes" },
  ];

  savedContainer.innerHTML = fields
    .map((field) => {
      const value = existingVehicle[field.key];
      const displayValue =
        field.isCurrency && value ? formatCurrency(value) : value || "N/A";

      const isChanged = existingVehicle[field.key] !== newVehicle[field.key];

      return `
      <div class="duplicate-detail-row ${isChanged ? "changed" : ""}">
        <span class="duplicate-detail-label">${field.label}</span>
        <span class="duplicate-detail-value">${displayValue}</span>
      </div>
    `;
    })
    .join("");

  newContainer.innerHTML = fields
    .map((field) => {
      const value = newVehicle[field.key];
      const displayValue =
        field.isCurrency && value ? formatCurrency(value) : value || "N/A";

      const isChanged = existingVehicle[field.key] !== newVehicle[field.key];

      return `
      <div class="duplicate-detail-row ${isChanged ? "changed" : ""}">
        <span class="duplicate-detail-label">${field.label}</span>
        <span class="duplicate-detail-value">${displayValue}</span>
      </div>
    `;
    })
    .join("");
}

// Make functions globally available
window.closeMyGarageModal = closeMyGarageModal;
window.loadGarageVehicles = loadGarageVehicles;
window.handleTradeInSelection = handleTradeInSelection;
window.addSavedVehicleToGarage = addSavedVehicleToGarage;
window.showGarageForm = showGarageForm;
window.hideGarageForm = hideGarageForm;
window.editGarageVehicle = editGarageVehicle;
window.deleteGarageVehicle = deleteGarageVehicle;
window.saveGarageVehicle = saveGarageVehicle;
window.closeDuplicateVehicleModal = closeDuplicateVehicleModal;
window.keepExistingVehicle = keepExistingVehicle;
window.updateExistingVehicle = updateExistingVehicle;
window.openSavedOffersModal = openMyOffersModal;
window.closeSavedOffersModal = closeMyOffersModal;

/* ============================================================================
   My Offers Functions
   ============================================================================ */

let savedOffersMenuObserver = null;

/**
 * Open My Offers modal and load offers
 */
async function openMyOffersModal() {
  const modal = document.getElementById("my-offers-modal");
  if (!modal) {
    console.error("❌ [My Offers] Modal element not found!");
    return;
  }

  if (modal.classList.contains("active")) {
    return;
  }

  modal.classList.add("active");
  modal.style.display = "flex";

  // ESC key to close
  if (!window.__myOffersEscHandler) {
    window.__myOffersEscHandler = (e) => {
      const key = e.key || e.code;
      if (key === "Escape" || key === "Esc") {
        e.preventDefault();
        closeMyOffersModal();
      }
    };
    document.addEventListener("keydown", window.__myOffersEscHandler);
  }


  // Load and display offers
  await loadMyOffers();
}

/**
 * Close My Offers modal
 */
function closeMyOffersModal() {
  const modal = document.getElementById("my-offers-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}

/**
 * Ensure Saved Offers entry in the profile menu always opens the modal
 */
function attachSavedOffersMenuHook() {
  const profileMenu = document.getElementById("profile-menu");
  if (!profileMenu || profileMenu.dataset.offersHooked === "true") {
    return;
  }

  profileMenu.dataset.offersHooked = "true";
  if (savedOffersMenuObserver) {
    savedOffersMenuObserver.disconnect();
    savedOffersMenuObserver = null;
  }
  profileMenu.addEventListener("click", (event) => {
    const offersLink = event.target?.closest?.('[data-action="offers"]');
    if (!offersLink) return;

    // Allow AuthManager's handler to run before forcing the modal open
    setTimeout(() => {
      const modal = document.getElementById("my-offers-modal");
      if (!modal) return;
      if (!modal.classList.contains("active")) {
        openMyOffersModal();
      }
    }, 0);
  });
}

document.addEventListener("DOMContentLoaded", attachSavedOffersMenuHook);
savedOffersMenuObserver = new MutationObserver(() => attachSavedOffersMenuHook());
if (typeof document !== "undefined" && document.body) {
  savedOffersMenuObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Load user's offers from database
 */
async function loadMyOffers() {
  try {
    const authStore = useAuthStore.getState();
    if (!authStore.user) {
      return;
    }


    // Load all offers
    const { data: offers, error } = await supabase
      .from("customer_offers")
      .select("*")
      .eq("user_id", authStore.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[my-offers] Error loading offers:", error);
      showToast("Failed to load offers", "error");
      return;
    }

    // Separate active and closed offers
    const activeOffers = offers.filter((o) => o.status === "active");
    const closedOffers = offers.filter((o) => o.status === "closed");

    // Update badge counts
    document.getElementById("activeOffersCount").textContent =
      activeOffers.length;
    document.getElementById("closedOffersCount").textContent =
      closedOffers.length;

    // Display offers
    displayOffersList(activeOffers, "activeOffersList");
    displayOffersList(closedOffers, "closedOffersList");
  } catch (error) {
    console.error("[my-offers] Error:", error);
    showToast("Failed to load offers", "error");
  }
}

/**
 * Display list of offers in the specified container
 */
function displayOffersList(offers, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (offers.length === 0) {
    // Show empty state (already in HTML)
    const emptyState = container.querySelector(".offers-empty");
    if (emptyState) emptyState.style.display = "block";

    // Hide any existing cards
    const existingCards = container.querySelectorAll(".offer-card");
    existingCards.forEach((card) => card.remove());
    return;
  }

  // Hide empty state
  const emptyState = container.querySelector(".offers-empty");
  if (emptyState) emptyState.style.display = "none";

  // Build offer cards HTML
  const offersHTML = offers
    .map((offer) => {
      const vehicleInfo =
        `${offer.vehicle_year || ""} ${offer.vehicle_make || ""} ${
          offer.vehicle_model || ""
        }`.trim();
      const createdAtRaw =
        offer.created_at ||
        offer.submitted_at ||
        offer.inserted_at ||
        offer.createdAt;
      const submittedDate = createdAtRaw
        ? new Date(createdAtRaw).toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
          })
        : "Recently saved";
      const paymentLabel = formatCurrency(offer.monthly_payment || 0);
      const offerName =
        offer.offer_name ||
        [
          vehicleInfo || "Custom Offer",
          `${paymentLabel}/mo`,
          submittedDate,
        ]
          .filter(Boolean)
          .join(" – ");
      const isClosed = offer.status === "closed";

      return `
      <div class="offer-card ${isClosed ? "closed" : ""}" data-offer-id="${
        offer.id
      }">
        <div class="offer-card-header">
          <div>
            <h3 class="offer-card-title">${offerName}</h3>
            <p class="offer-card-subtitle">Saved ${submittedDate}</p>
          </div>
          <span class="offer-card-status ${offer.status}">${
        offer.status === "active" ? "Active" : "Closed"
      }</span>
        </div>

        <div class="offer-card-details">
          <div class="offer-card-detail">
            <span class="offer-card-detail-label">Offer Price</span>
            <span class="offer-card-detail-value">${formatCurrency(
              offer.offer_price || 0
            )}</span>
          </div>
          <div class="offer-card-detail">
            <span class="offer-card-detail-label">Monthly Payment</span>
            <span class="offer-card-detail-value">${formatCurrency(
              offer.monthly_payment || 0
            )}/mo</span>
          </div>
          <div class="offer-card-detail">
            <span class="offer-card-detail-label">APR</span>
            <span class="offer-card-detail-value">${(
              (offer.apr || 0) * 100
            ).toFixed(2)}%</span>
          </div>
          <div class="offer-card-detail">
            <span class="offer-card-detail-label">Term</span>
            <span class="offer-card-detail-value">${
              offer.term_months || 0
            } months</span>
          </div>
        </div>

        <div class="offer-card-actions">
          <button class="offer-card-btn" onclick="viewOfferDetails('${
            offer.id
          }')">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
            View Details
          </button>
          ${
            !isClosed
              ? `
            <button class="offer-card-btn danger" onclick="closeOffer('${offer.id}')">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
              Close Offer
            </button>
          `
              : `
            <button class="offer-card-btn danger" onclick="deleteOffer('${offer.id}')">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
              Delete
            </button>
          `
          }
        </div>
      </div>
    `;
    })
    .join("");

  // Replace content (keep empty state, add cards)
  container.innerHTML = `
    <div class="offers-empty" style="display: none;">
      ${container.querySelector(".offers-empty").innerHTML}
    </div>
    ${offersHTML}
  `;
}

/**
 * Switch between active and closed offers tabs
 */
function switchOffersTab(tabName) {
  // Update tab buttons
  const tabs = document.querySelectorAll(".offers-tab");
  tabs.forEach((tab) => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Update tab content
  const contents = document.querySelectorAll("[data-tab-content]");
  contents.forEach((content) => {
    if (content.dataset.tabContent === tabName) {
      content.style.display = "block";
    } else {
      content.style.display = "none";
    }
  });
}

/**
 * View offer details in a modal
 */
async function viewOfferDetails(offerId) {
  try {
    const { data: offer, error } = await supabase
      .from("customer_offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (error || !offer) {
      showToast("Failed to load offer details", "error");
      return;
    }

    // Show offer text in an alert/modal
    alert(offer.offer_text || "No offer details available");
  } catch (error) {
    console.error("[view-offer] Error:", error);
    showToast("Failed to view offer", "error");
  }
}

/**
 * Close an offer and email it to user
 */
async function closeOffer(offerId) {
  if (
    !confirm(
      "Close this offer? It will be emailed to you and then removed from your active offers."
    )
  ) {
    return;
  }

  try {
    // Get the offer
    const { data: offer, error: fetchError } = await supabase
      .from("customer_offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (fetchError || !offer) {
      showToast("Failed to close offer", "error");
      return;
    }

    // TODO: Send email with offer details
    // For now, we'll just update the status and delete after a delay

    // Update offer status to closed
    const { error: updateError } = await supabase
      .from("customer_offers")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("id", offerId);

    if (updateError) {
      showToast("Failed to close offer", "error");
      return;
    }

    showToast("Offer closed successfully", "success");

    // Delete the offer after a short delay (simulating email send)
    setTimeout(async () => {
      const { error: deleteError } = await supabase
        .from("customer_offers")
        .delete()
        .eq("id", offerId);

      if (!deleteError) {
      }
    }, 2000);

    // Reload offers to update UI
    await loadMyOffers();
  } catch (error) {
    console.error("[close-offer] Error:", error);
    showToast("Failed to close offer", "error");
  }
}

/**
 * Delete a closed offer permanently
 */
async function deleteOffer(offerId) {
  if (
    !confirm(
      "Delete this offer permanently? This action cannot be undone."
    )
  ) {
    return;
  }

  try {
    // Delete the offer from the database
    const { error: deleteError } = await supabase
      .from("customer_offers")
      .delete()
      .eq("id", offerId);

    if (deleteError) {
      console.error("[delete-offer] Error:", deleteError);
      showToast("Failed to delete offer", "error");
      return;
    }

    showToast("Offer deleted successfully", "success");

    // Reload offers to update UI
    await loadMyOffers();
  } catch (error) {
    console.error("[delete-offer] Error:", error);
    showToast("Failed to delete offer", "error");
  }
}

/**
 * Save a new offer to the database
 */
async function saveOffer(offerData) {
  try {
    const authStore = useAuthStore.getState();
    if (!authStore.user) {
      console.error("[save-offer] No user logged in");
      return null;
    }

    const reviewData = await computeReviewData();
    if (!reviewData) {
      console.error("[save-offer] No review data");
      return null;
    }

    const vehicle = wizardData.vehicle || {};
    const dealer = wizardData.dealer || {};
    const trade = wizardData.trade || {};

    // Generate offer name: [Year, Make, Model, Trim, Ext Color, Offer Price, APR, timestamp]
    const offerParts = [];

    if (vehicle.year) offerParts.push(vehicle.year);
    if (vehicle.make) offerParts.push(vehicle.make);
    if (vehicle.model) offerParts.push(vehicle.model);
    if (vehicle.trim) offerParts.push(vehicle.trim);

    const extColor = vehicle.exterior_color || vehicle.extColor || vehicle.ext_color;
    if (extColor) offerParts.push(extColor);

    const offerPrice = reviewData.salePrice || 0;
    if (offerPrice > 0) offerParts.push(formatCurrency(offerPrice, true, { showCents: false }));

    const aprValue = reviewData.apr || 0;
    if (aprValue > 0) offerParts.push(`${(aprValue * 100).toFixed(2)}%`);

    const timestamp = new Date().toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    offerParts.push(timestamp);

    const offerName = offerParts.length > 1 ? offerParts.join(" – ") : "Custom Offer";


    // Get or create customer profile
    let customerProfileId = localStorage.getItem("customerProfileId");

    if (!customerProfileId) {
      const { data: profile } = await supabase
        .from("customer_profiles")
        .select("id")
        .eq("user_id", authStore.user.id)
        .single();

      if (profile) {
        customerProfileId = profile.id;
        localStorage.setItem("customerProfileId", customerProfileId);
      } else {
        // Create a new customer profile
        const { data: newProfile, error: profileError } = await supabase
          .from("customer_profiles")
          .insert({
            user_id: authStore.user.id,
            email: authStore.user.email || offerData.customerEmail || "",
            full_name: offerData.customerName || null,
            phone: offerData.customerPhone || null,
          })
          .select()
          .single();

        if (profileError) {
          console.error("[save-offer] Error creating customer profile:", profileError);
          throw new Error("Failed to create customer profile: " + profileError.message);
        }

        customerProfileId = newProfile.id;
        localStorage.setItem("customerProfileId", customerProfileId);
      }
    }

    // Prepare offer data matching the ACTUAL schema (verified from DB)
    const offer = {
      // Required NOT NULL fields
      user_id: authStore.user.id,
      customer_profile_id: customerProfileId,
      offer_name: offerName,
      status: "active",

      // Vehicle fields (all nullable)
      vehicle_year: vehicle.year || null,
      vehicle_make: vehicle.make || null,
      vehicle_model: vehicle.model || null,
      vehicle_trim: vehicle.trim || null,
      vehicle_vin: vehicle.vin || null,
      vehicle_mileage: vehicle.mileage || null,
      vehicle_condition: deriveSaleCondition(vehicle) || null,
      vehicle_price: reviewData.salePrice || null,
      offer_price: reviewData.salePrice || null,

      // Financing fields (all nullable)
      apr: reviewData.apr || null,
      term_months: reviewData.term || null,
      monthly_payment: reviewData.monthlyPayment || null,
      down_payment: reviewData.cashDown || null,

      // Trade-in (nullable)
      trade_value: trade?.value || reviewData.tradeOffer || null,
      trade_payoff: trade?.payoff || reviewData.tradePayoff || null,

      // Fees (nullable)
      dealer_fees: reviewData.totalDealerFees || null,
      customer_addons: reviewData.totalCustomerAddons || null,

      // Customer contact (all nullable)
      customer_name: offerData.customerName || null,
      customer_email: offerData.customerEmail || null,
      customer_phone: offerData.customerPhone || null,
      customer_address: wizardData.location?.fullAddress || null,

      // Dealer details (all nullable)
      dealer_name: dealer.name || null,
      dealer_address: dealer.address || null,
      dealer_phone: dealer.phone || null,

      // Offer text (nullable)
      offer_text: offerData.offerText || null,
    };


    // Save to database with graceful fallback when the remote schema is behind
    const offerForInsert = { ...offer };
    const strippedColumns = [];

    const extractMissingColumn = (err) => {
      if (!err) return null;
      const sources = [err.message, err.details, err.hint].filter(Boolean);
      for (const source of sources) {
        const match = source.match(/'([^']+)' column/);
        if (match && match[1] && match[1] !== "customer_offers") {
          return match[1];
        }
      }
      return null;
    };

    let data = null;
    let error = null;
    let attempt = 0;

    while (true) {
      attempt += 1;
      const insertResult = await supabase
        .from("customer_offers")
        .insert(offerForInsert)
        .select();

      error = insertResult.error;
      data = insertResult.data ? insertResult.data[0] : null;

      if (!error) {
        if (strippedColumns.length) {
        }
        break;
      }

      const missingColumn =
        error.code === "PGRST204" ? extractMissingColumn(error) : null;

      if (missingColumn && missingColumn in offerForInsert) {
        strippedColumns.push(missingColumn);
        delete offerForInsert[missingColumn];
        continue;
      }

      console.error("[save-offer] ❌ Supabase error saving offer");
      console.error("  → Message:", error.message);
      console.error("  → Details:", error.details);
      console.error("  → Hint:", error.hint);
      console.error("  → Code:", error.code);
      console.error("  → Full error:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("[save-offer] Caught error:", {
      message: error.message,
      stack: error.stack,
      fullError: error
    });
    return null;
  }
}

// Make functions globally available
window.closeMyOffersModal = closeMyOffersModal;
window.switchOffersTab = switchOffersTab;
window.viewOfferDetails = viewOfferDetails;
window.closeOffer = closeOffer;
window.deleteOffer = deleteOffer;
window.saveOffer = saveOffer;

/* ============================================================================
   Submit Offer Functions
   ============================================================================ */

function buildOfferPreviewHtml(reviewData = {}) {
  ensureWizardFeeDefaults();

  const vehicle = wizardData.vehicle || {};
  const financing = wizardData.financing || {};
  const trade = wizardData.trade || wizardData.tradein || {};
  const feesSnapshot = reviewData.fees || {};

  const safeNumber = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;

  const salePriceValue = Number.isFinite(reviewData.salePrice)
    ? reviewData.salePrice
    : safeNumber(financing.salePrice);
  const monthlyPaymentValue = Number.isFinite(reviewData.monthlyPayment)
    ? reviewData.monthlyPayment
    : 0;
  const cashDownValue = Number.isFinite(reviewData.cashDown)
    ? reviewData.cashDown
    : safeNumber(financing.cashDown);
  const amountFinancedValue = Number.isFinite(reviewData.amountFinanced)
    ? reviewData.amountFinanced
    : 0;
  const cashDueValue = Number.isFinite(reviewData.cashDue)
    ? reviewData.cashDue
    : 0;
  const termValue = Number.isFinite(reviewData.term) && reviewData.term > 0
    ? reviewData.term
    : safeNumber(financing.term, 72);
  const aprDecimal =
    typeof reviewData.apr === "number"
      ? reviewData.apr
      : typeof financing.apr === "number"
      ? Number(financing.apr) / 100
      : 0;

  const dealerFeesValue = Number(
    reviewData.totalDealerFees ??
      feesSnapshot.totalDealerFees ??
      wizardData.fees?.dealerFees ??
      0
  );
  const customerAddonsValue = Number(
    reviewData.totalCustomerAddons ??
      feesSnapshot.totalCustomerAddons ??
      wizardData.fees?.customerAddons ??
      0
  );
  const govtFeesValue = Number(
    reviewData.totalGovtFees ??
      feesSnapshot.totalGovtFees ??
      wizardData.fees?.totalGovtFees ??
      0
  );

  const tradeAllowanceValue = Number(
    reviewData.tradeOffer ??
      trade?.value ??
      wizardData.tradein?.tradeValue ??
      0
  );
  const tradePayoffValue = Number(
    reviewData.tradePayoff ??
      trade?.payoff ??
      wizardData.tradein?.tradePayoff ??
      0
  );
  const netTradeValue = Number.isFinite(reviewData.netTrade)
    ? reviewData.netTrade
    : tradeAllowanceValue - tradePayoffValue;
  const tradeVehicles =
    (Array.isArray(trade?.vehicles) && trade.vehicles.length > 0
      ? trade.vehicles
      : Array.isArray(wizardData.tradein?.vehicles)
      ? wizardData.tradein.vehicles
      : []) || [];
  const hasGarageTradeSelection =
    Array.isArray(selectedTradeIns) && selectedTradeIns.length > 0;
  if (hasGarageTradeSelection && tradeVehicles.length === 0) {
    showTradeDataErrorToast();
    throw new Error("trade-data-missing");
  }

  // PRECISION: Show cents for critical financial values
  // Format APR and Term for hero subtitle (reuse existing termValue and aprDecimal)
  const financeLabel = aprDecimal > 0 && termValue > 0
    ? `${(aprDecimal * 100).toFixed(2)}% APR • ${termValue} months`
    : null;

  const conditionText =
    getVehicleSaleConditionText(deriveSaleCondition(vehicle)) || "—";
  const yearText = vehicle.year ? vehicle.year.toString() : "—";
  const makeText = vehicle.make ? capitalizeWords(vehicle.make) : "—";
  const modelText = vehicle.model ? capitalizeWords(vehicle.model) : "—";
  const trimText = vehicle.trim ? capitalizeWords(vehicle.trim) : "—";
  const exteriorColorRaw =
    vehicle.exterior_color ||
    vehicle.exteriorColor ||
    vehicle.extColor ||
    vehicle.color ||
    vehicle.exterior ||
    null;
  const exteriorColorText = exteriorColorRaw
    ? capitalizeWords(exteriorColorRaw)
    : "—";
  const mileageText = vehicle.mileage
    ? `${formatMileage(vehicle.mileage)} mi`
    : "—";
  const vinText = vehicle.vin ? String(vehicle.vin).toUpperCase() : "—";
  const stockNumberRaw =
    vehicle.stock_number ||
    vehicle.dealer_stock ||
    vehicle.stockNumber ||
    vehicle.dealerStock ||
    null;
  const stockNumberText = stockNumberRaw ? String(stockNumberRaw) : "";
  const askingPriceValue = vehicle.asking_price || vehicle.askingPrice || 0;

  // Get customer contact info from form fields
  const customerName = document.getElementById("submitCustomerName")?.value || "";
  const customerEmail = document.getElementById("submitCustomerEmail")?.value || "";
  const customerPhoneRaw = document.getElementById("submitCustomerPhone")?.value || "";
  const customerPhone = formatPhoneNumber(customerPhoneRaw);
  const additionalNotes = document.getElementById("submitOfferNotes")?.value || "";

  const gridItem = (label, value) => {
    const display =
      value === null || value === undefined || value === ""
        ? "—"
        : value;
    return `
      <div class="offer-preview-grid-item">
        <span class="offer-preview-grid-label">${escapeHtml(label)}</span>
        <span class="offer-preview-grid-value">${escapeHtml(display)}</span>
      </div>
    `;
  };

  const vehicleGrid = [
    gridItem("Condition", conditionText),
    gridItem("Year", yearText),
    gridItem("Make", makeText),
    gridItem("Model", modelText),
    gridItem("Trim", trimText),
    gridItem("Dealer Stock #", stockNumberText),
    gridItem("Exterior Color", exteriorColorText),
    gridItem("Mileage", mileageText),
    gridItem("VIN", vinText),
  ].join("");

  const dealGrid = [
    gridItem("Monthly Payment", monthlyPaymentValue > 0 ? `${formatCurrency(monthlyPaymentValue, true, { showCents: true })}/mo` : "—"),
    gridItem("APR", formatPercent(aprDecimal)),
    gridItem("Term", termValue ? `${termValue} mos` : "—"),
    gridItem("Cash Down", formatCurrency(cashDownValue, true, { showCents: true })),
    gridItem("Cash Due", formatCurrency(cashDueValue, true, { showCents: true })),
    gridItem("Amount Financed", formatCurrency(amountFinancedValue, true, { showCents: true })),
  ].join("");

  const feesGrid = []
    .concat(
      dealerFeesValue ? gridItem("Dealer Fees", formatCurrency(dealerFeesValue, true, { showCents: true })) : []
    )
    .concat(
      customerAddonsValue
        ? gridItem("Customer Add-ons", formatCurrency(customerAddonsValue, true, { showCents: true }))
        : []
    )
    .concat(
      govtFeesValue ? gridItem("Govt Fees", formatCurrency(govtFeesValue, true, { showCents: true })) : []
    )
    .join("");

  const tradeGrid = ""

  const formatTradeVehicleBlock = (vehicle, index, total) => {
    const vehicleText = `${vehicle.year || ""} ${vehicle.make || ""} ${
      vehicle.model || ""
    }${vehicle.trim ? " " + vehicle.trim : ""}`.trim() || "Not specified";
    const nicknameSuffix = vehicle.nickname ? ` (${vehicle.nickname})` : "";
    const mileageText = vehicle.mileage
      ? `${formatMileage(vehicle.mileage)} mi`
      : "Not specified";
    const conditionText =
      getVehicleGradeText(deriveVehicleGrade(vehicle)) ||
      getVehicleSaleConditionText(deriveSaleCondition(vehicle)) ||
      "Not specified";
    const exteriorColor =
      vehicle.exterior_color ||
      vehicle.exteriorColor ||
      vehicle.extColor ||
      vehicle.color ||
      null;
    const lines = [
      `${escapeHtml(vehicleText)}${escapeHtml(nicknameSuffix)}`,
      `VIN: ${escapeHtml(
        vehicle.vin ? String(vehicle.vin).toUpperCase() : "Not specified"
      )}`,
      `Mileage: ${escapeHtml(mileageText)}`,
      `Condition: ${escapeHtml(conditionText)}`,
    ];

    if (exteriorColor) {
      lines.push(
        `Ext Color: ${escapeHtml(capitalizeWords(exteriorColor.toString()))}`
      );
    }

    return lines.join("\n");
  };

  const tradeDetailsText = tradeVehicles.length
    ? tradeVehicles
        .map((vehicle, index) =>
          formatTradeVehicleBlock(vehicle, index, tradeVehicles.length)
        )
        .join("\n\n")
    : tradeAllowanceValue || tradePayoffValue
    ? `Net Trade: ${formatCurrencyAccounting(netTradeValue, {
        showCents: true,
      })}`
    : "No Trade-in";

  return `
    <div class="offer-preview-text">
      <div class="offer-preview-hero">
        <span class="offer-preview-hero-label">Customer Offer</span>
        <span class="offer-preview-hero-value">${escapeHtml(
          salePriceValue > 0
            ? formatCurrency(salePriceValue, true, { showCents: true })
            : "Custom Offer"
        )}</span>
        ${
          financeLabel
            ? `<span class="offer-preview-hero-subtitle">${escapeHtml(financeLabel)}</span>`
            : ""
        }
      </div>

      <div class="offer-preview-section">
        <div class="offer-preview-dealer-text">
          <div style="font-family: monospace; white-space: pre-wrap; font-size: 13px; line-height: 1.6; background: #f5f5f5; padding: 16px; border-radius: 8px; border: 1px solid #e0e0e0;">Hi - I am interested in your listing: ${escapeHtml(
            stockNumberText
              ? `Stock #${stockNumberText}, VIN ${vinText}`
              : `VIN ${vinText}`
          )}. Would you mind reaching out to finalize the details? I appreciate your consideration of my offer and I'm looking forward to speaking with you soon!

🚗 <strong>VEHICLE PURCHASE OFFER</strong>

💵 <strong>My Offer:</strong>
${escapeHtml(formatCurrency(salePriceValue, true, { showCents: true }))}${
            askingPriceValue > 0
              ? ` (List Price: ${escapeHtml(formatCurrency(askingPriceValue, true, { showCents: true }))})`
              : ""
          }

🚗 <strong>Vehicle Details</strong>
Condition: ${escapeHtml(conditionText)}
Year: ${escapeHtml(yearText)}
Make: ${escapeHtml(makeText)}
Model: ${escapeHtml(modelText)}
Trim: ${escapeHtml(trimText)}
Ext Color: ${escapeHtml(exteriorColorText)}
Mileage: ${escapeHtml(mileageText)}
VIN: ${escapeHtml(vinText)}

🔄 <strong>Trade-In</strong>
${tradeDetailsText}
${additionalNotes ? `

📝 <strong>Additional Notes</strong>
${escapeHtml(additionalNotes)}` : ""}

👤 <strong>Customer Contact</strong>
Name: ${escapeHtml(customerName || "(not provided)")}
Email: ${escapeHtml(customerEmail || "(not provided)")}
Phone: ${escapeHtml(customerPhone || "(not provided)")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<strong>Built By:</strong>
Brandon's Calculator Copyright 2026
https://github.com/jbj0005/BrandonsCalc</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Format offer data into fancy unicode text with emoji
 */
async function formatOfferText(customerNotes = "", reviewDataOverride = null) {
  const reviewData = reviewDataOverride || (await computeReviewData());
  if (!reviewData) {
    return "Error: Unable to generate offer. Please ensure all fields are filled.";
  }

  const vehicle = wizardData.vehicle || {};
  const financing = wizardData.financing || {};
  const location = wizardData.location || {};
  const dealer = wizardData.dealer || {};
  const trade = wizardData.trade || {};

  // Format currency helper
  const fmt = (num) => {
    if (typeof num !== "number" || !Number.isFinite(num)) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  // Format number helper
  const fmtNum = (num) => {
    if (typeof num !== "number" || !Number.isFinite(num)) return "0";
    return new Intl.NumberFormat("en-US").format(num);
  };

  // Build the formatted offer text
  let offerText = `
╔═════════════════════════════════════════╗
║      VEHICLE PURCHASE OFFER             ║
╚═════════════════════════════════════════╝

🚗 VEHICLE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}${
    vehicle.trim ? " " + vehicle.trim : ""
  }
Condition: ${
    getVehicleSaleConditionText(deriveSaleCondition(vehicle)) || "—"
  }  |  Mileage: ${fmtNum(vehicle.mileage || 0)} mi
${vehicle.vin ? "VIN: " + String(vehicle.vin).toUpperCase() : ""}

💵 CUSTOMER OFFER PRICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${fmt(financing.salePrice || reviewData.salePrice || 0)}`;

  // Add trade-in if present
  if (trade && trade.vehicles && trade.vehicles.length > 0) {
    offerText += `\n`;

    trade.vehicles.forEach((vehicle, index) => {
      const vehicleText = `${vehicle.year || ""} ${vehicle.make || ""} ${
        vehicle.model || ""
      }${vehicle.trim ? " " + vehicle.trim : ""}`.trim();

      offerText += `
Trade-In Vehicle ${trade.vehicles.length > 1 ? "#" + (index + 1) : ""}${
        vehicle.nickname ? " (" + vehicle.nickname + ")" : ""
      }:
  Vehicle:               ${vehicleText || "Not specified"}
  VIN:                   ${String(vehicle.vin || "Not specified").toUpperCase()}
  Mileage:               ${fmtNum(vehicle.mileage || 0)} mi
  Condition:             ${
    getVehicleGradeText(deriveVehicleGrade(vehicle)) || "Not specified"
  }
`;
    });
  }

  offerText += `

📊 FINANCING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APR: ${((reviewData.apr || 0) * 100).toFixed(2)}%
Term: ${reviewData.term || 0} months`;

  // Add fees breakdown if present
  const fees = reviewData.fees || {};
  if (
    fees.totalDealerFees > 0 ||
    fees.totalCustomerAddons > 0 ||
    fees.totalGovtFees > 0
  ) {
    offerText += `

💵 FEES & COSTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    if (fees.totalDealerFees > 0) {
      offerText += `
Dealer Fees:             ${fmt(fees.totalDealerFees)}`;
    }
    if (fees.totalCustomerAddons > 0) {
      offerText += `
Customer Add-ons:        ${fmt(fees.totalCustomerAddons)}`;
    }
    if (fees.totalGovtFees > 0) {
      offerText += `
Govt Fees:               ${fmt(fees.totalGovtFees)}`;
    }
  }

  // Add customer contact information
  const customerName =
    document.getElementById("submitCustomerName")?.value || "";
  const customerEmail =
    document.getElementById("submitCustomerEmail")?.value || "";
  const customerPhone =
    document.getElementById("submitCustomerPhone")?.value || "";
  const customerAddress = wizardData.location?.fullAddress || "";

  offerText += `

👤 CUSTOMER CONTACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  if (customerName) {
    offerText += `
Name: ${customerName}`;
  }
  if (customerAddress) {
    offerText += `
Address: ${customerAddress}`;
  }
  if (customerEmail) {
    offerText += `
Email: ${customerEmail}`;
  }
  if (customerPhone) {
    offerText += `
Phone: ${customerPhone}`;
  }

  // Add dealer information if available
  if (dealer && (dealer.name || dealer.address)) {
    offerText += `

🏢 DEALER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    if (dealer.name) {
      offerText += `
${dealer.name}`;
    }
    if (dealer.address) {
      offerText += `
${dealer.address}`;
    }
    if (dealer.phone) {
      offerText += `
Phone: ${dealer.phone}`;
    }
  }

  // Add customer notes if provided
  if (customerNotes && customerNotes.trim()) {
    offerText += `

📝 NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${customerNotes.trim()}`;
  }

  // Add footer
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  offerText += `

─────────────────────────────────────────
Generated on ${currentDate}
Powered by Brandon's Calculator
https://github.com/jbj0005/BrandonsCalc
`;

  return offerText.trim();
}

/**
 * Open Submit Offer modal
 */
async function openSubmitOfferModal() {
  // Close the review contract modal first if it's open
  const reviewModal = document.getElementById("review-contract-modal");
  if (reviewModal) {
    reviewModal.style.display = "none";
  }

  const modal = document.getElementById("submit-offer-modal");
  if (!modal) return;

  // Populate Customer Offer Price from sale price
  const customerOfferPriceEl = document.getElementById("customerOfferPrice");
  if (customerOfferPriceEl && wizardData.financing?.salePrice) {
    customerOfferPriceEl.textContent = formatCurrency(
      wizardData.financing.salePrice
    );
  }

  const reviewData = await computeReviewData();

  // Auto-populate customer information from profile FIRST (before building preview)
  await loadCustomerDataForSubmission();

  // Auto-populate dealer information from wizardData
  await loadDealerDataForSubmission();

  // Generate and display offer preview (now with populated form data)
  const previewElement = document.getElementById("offerPreviewText");
  if (previewElement) {
    try {
      previewElement.innerHTML = buildOfferPreviewHtml(reviewData);
    } catch (error) {
      console.error("[submit-offer] Unable to render preview:", error);
      previewElement.innerHTML = `
        <div class="offer-preview-error">
          <p>We couldn't load the selected trade-in details. Please open My Garage, reselect your trade vehicle, and try again.</p>
          <button type="button" class="btn btn-secondary" onclick="openMyGarageModal()">Open My Garage</button>
        </div>
      `;
    }
  }

  modal.classList.add("active");
  modal.style.display = "flex";
}
async function openPreviewFlow() {
  try {
    await ensureAprOptions();
  } catch (error) {
  }

  if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
    window._aprConfirmationForPreview = true;
    showAprConfirmationModal();
    return;
  }

  window._aprConfirmationForPreview = false;
  await openSubmitOfferModal();
}
window.openPreviewFlow = openPreviewFlow;

/**
 * Close Submit Offer modal
 */
function closeSubmitOfferModal() {
  const modal = document.getElementById("submit-offer-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}

/**
 * Load customer data for submission (auto-populate from profile)
 */
async function loadCustomerDataForSubmission() {
  try {
    const authStore = useAuthStore.getState();
    if (!authStore.user) return;

    const { data: profile, error } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("user_id", authStore.user.id)
      .single();

    if (error || !profile) return;

    // Populate customer fields
    document.getElementById("submitCustomerName").value =
      profile.full_name || "";
    document.getElementById("submitCustomerEmail").value = profile.email || "";
    document.getElementById("submitCustomerPhone").value = profile.phone || "";
  } catch (error) {
    console.error("Error loading customer data:", error);
  }
}

/**
 * Load dealer data for submission (auto-populate from wizardData)
 */
async function loadDealerDataForSubmission() {
  const vehicle = wizardData.vehicle || {};

  const dealerName = vehicle.dealer_name || "";
  const dealerPhone = vehicle.dealer_phone || "";
  const dealerEmail = ""; // Not provided by vehicle data
  const listingUrl = vehicle.listing_url || "";

  // Build dealer address from components
  const addressParts = [];
  if (vehicle.dealer_street) addressParts.push(vehicle.dealer_street);
  if (vehicle.dealer_city) addressParts.push(vehicle.dealer_city);
  if (vehicle.dealer_state) addressParts.push(vehicle.dealer_state);
  if (vehicle.dealer_zip) addressParts.push(vehicle.dealer_zip);
  const dealerAddress = addressParts.join(", ");

  // Populate input fields (edit mode)
  document.getElementById("submitDealershipName").value = dealerName;
  document.getElementById("submitDealerPhone").value = dealerPhone;
  document.getElementById("submitDealerEmail").value = dealerEmail;
  document.getElementById("submitDealerAddress").value = dealerAddress;
  document.getElementById("submitVehicleUrl").value = listingUrl;

  // Populate display elements (view mode)
  document.getElementById("dealerNameDisplay").textContent = dealerName || "—";
  document.getElementById("dealerAddressDisplay").textContent = dealerAddress || "—";

  const phoneDisplay = document.getElementById("dealerPhoneDisplay");
  if (dealerPhone) {
    const formattedPhone = formatPhoneNumber(dealerPhone);
    phoneDisplay.textContent = formattedPhone;
    phoneDisplay.href = `tel:${dealerPhone.replace(/\D/g, "")}`;
  } else {
    phoneDisplay.textContent = "—";
    phoneDisplay.href = "#";
  }

  const emailDisplay = document.getElementById("dealerEmailDisplay");
  if (dealerEmail) {
    emailDisplay.textContent = dealerEmail;
    emailDisplay.href = `mailto:${dealerEmail}`;
  } else {
    emailDisplay.textContent = "—";
    emailDisplay.href = "#";
  }

  const urlDisplay = document.getElementById("dealerUrlDisplay");
  if (listingUrl) {
    urlDisplay.textContent = listingUrl.length > 50 ? listingUrl.substring(0, 50) + "..." : listingUrl;
    urlDisplay.href = listingUrl;
  } else {
    urlDisplay.textContent = "—";
    urlDisplay.href = "#";
  }
}

/**
 * Toggle between view and edit modes for dealer contact info
 */
function toggleDealerEditMode() {
  const viewMode = document.getElementById("dealerViewMode");
  const editMode = document.getElementById("dealerEditMode");
  const toggleBtn = document.getElementById("toggleDealerEdit");

  if (editMode.style.display === "none") {
    // Switch to edit mode
    viewMode.style.display = "none";
    editMode.style.display = "block";
    toggleBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
  } else {
    // Switch to view mode and sync values
    const dealerName = document.getElementById("submitDealershipName").value;
    const dealerPhone = document.getElementById("submitDealerPhone").value;
    const dealerEmail = document.getElementById("submitDealerEmail").value;
    const dealerAddress = document.getElementById("submitDealerAddress").value;
    const dealerUrl = document.getElementById("submitVehicleUrl").value;

    // Update display elements
    document.getElementById("dealerNameDisplay").textContent = dealerName || "—";
    document.getElementById("dealerAddressDisplay").textContent = dealerAddress || "—";

    // Update phone display and link
    const phoneDisplay = document.getElementById("dealerPhoneDisplay");
    if (dealerPhone) {
      const formattedPhone = formatPhoneNumber(dealerPhone);
      phoneDisplay.textContent = formattedPhone;
      phoneDisplay.href = `tel:${dealerPhone.replace(/\D/g, "")}`;
    } else {
      phoneDisplay.textContent = "—";
      phoneDisplay.href = "#";
    }

    // Update email display and link
    const emailDisplay = document.getElementById("dealerEmailDisplay");
    if (dealerEmail) {
      emailDisplay.textContent = dealerEmail;
      emailDisplay.href = `mailto:${dealerEmail}`;
    } else {
      emailDisplay.textContent = "—";
      emailDisplay.href = "#";
    }

    // Update URL display and link
    const urlDisplay = document.getElementById("dealerUrlDisplay");
    if (dealerUrl) {
      urlDisplay.textContent = dealerUrl.length > 50 ? dealerUrl.substring(0, 50) + "..." : dealerUrl;
      urlDisplay.href = dealerUrl;
    } else {
      urlDisplay.textContent = "—";
      urlDisplay.href = "#";
    }

    // Switch back to view mode
    editMode.style.display = "none";
    viewMode.style.display = "block";
    toggleBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>';
  }
}

// Salesperson auto-complete removed - dealer info now auto-populated from vehicle data

/* ============================================================================
   Email Handshake Helpers
   ============================================================================ */

const EMAIL_HANDSHAKE_STAGES = {
  saving: {
    title: "Saving your offer...",
    message: "We’re preparing your offer details before sending the email.",
    progress: 35,
    iconClass: "handshake-icon--spinner",
  },
  sending: {
    title: "Sending email...",
    message: "Delivering your offer via Twilio SendGrid.",
    progress: 75,
    iconClass: "handshake-icon--spinner",
  },
  success: {
    title: "Email sent!",
    message:
      "A dealer will review your offer and typically responds within the hour.",
    progress: 100,
    iconClass: "handshake-icon--success",
    iconSymbol: "✓",
  },
  error: {
    title: "Unable to send email",
    message: "Something prevented us from emailing your offer.",
    progress: 100,
    iconClass: "handshake-icon--error",
    iconSymbol: "!",
  },
};

function openEmailHandshakeModal() {
  if (!emailHandshakeUI?.modal) return false;
  emailHandshakeUI.modal.style.display = "flex";
  emailHandshakeUI.modal.classList.add("active");
  return true;
}

function closeEmailHandshakeModal(delayMs = 0) {
  const performClose = () => {
    if (!emailHandshakeUI?.modal) return;
    emailHandshakeUI.modal.classList.remove("active");
    emailHandshakeUI.modal.style.display = "none";
    if (emailHandshakeUI.progress) {
      emailHandshakeUI.progress.style.width = "0%";
    }
    if (emailHandshakeUI.actions) {
      emailHandshakeUI.actions.innerHTML = "";
    }
  };
  if (delayMs > 0) {
    setTimeout(performClose, delayMs);
  } else {
    performClose();
  }
}

function setEmailHandshakeStage(stage, options = {}) {
  if (!emailHandshakeUI?.modal) return;
  if (!openEmailHandshakeModal()) return;
  const config = EMAIL_HANDSHAKE_STAGES[stage];
  if (!config) return;

  const iconEl = emailHandshakeUI.icon;
  if (iconEl) {
    iconEl.className = `handshake-icon ${config.iconClass || ""}`;
    iconEl.textContent = config.iconSymbol || "";
  }

  if (emailHandshakeUI.title) {
    emailHandshakeUI.title.textContent = options.title || config.title;
  }

  if (emailHandshakeUI.message) {
    const baseMessage = options.message || config.message || "";
    const detailMessage = options.detail
      ? `${baseMessage}\n${options.detail}`
      : baseMessage;
    emailHandshakeUI.message.textContent = detailMessage;
  }

  if (emailHandshakeUI.progress) {
    const width = options.progress ?? config.progress ?? 0;
    emailHandshakeUI.progress.style.width = `${width}%`;
  }

  if (emailHandshakeUI.actions) {
    emailHandshakeUI.actions.innerHTML = "";
    const actions = options.actions || config.actions || [];
    actions.forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = action.variant || "btn btn-primary";
      btn.textContent = action.label;
      btn.addEventListener("click", action.onClick);
      emailHandshakeUI.actions.appendChild(btn);
    });
  }
}

function getDevSendPreference() {
  if (!isDevEnvironment) return "prod";
  if (devSendPreference === "dev" || devSendPreference === "prod") {
    return devSendPreference;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.has("devsend")) {
    const val = params.get("devsend");
    if (val === "dev" || val === "prod") {
      return val;
    }
  }
  return null;
}

window.__setSendModePreference = function setSendModePreference(mode) {
  if (!isDevEnvironment) {
    showToast("Send mode preference only applies in dev environment.", "warning");
    return;
  }
  if (mode === "prod" || mode === "dev") {
    devSendPreference = mode;
    showToast(
      `Send mode locked to ${mode === "dev" ? "Dev Simulation" : "Production"}.`,
      "info"
    );
  } else {
    devSendPreference = null;
    showToast("Send mode prompt restored.", "info");
  }
};

function promptSendMode(channel) {
  if (!isDevEnvironment) {
    return Promise.resolve("prod");
  }

  const preset = getDevSendPreference();
  if (preset) {
    return Promise.resolve(preset);
  }

  if (!sendModeModalUI?.modal) {
    return Promise.resolve("prod");
  }

  return new Promise((resolve) => {
    const { modal, message, devBtn, prodBtn, remember } = sendModeModalUI;
    const channelLabel = channel === "email" ? "email" : "SMS";
    if (message) {
      message.textContent = `Dev environment detected. Send this ${channelLabel} as a simulation or via Twilio?`;
    }
    modal.style.display = "flex";
    modal.classList.add("active");
    const cleanup = () => {
      modal.classList.remove("active");
      modal.style.display = "none";
      if (devBtn) devBtn.onclick = null;
      if (prodBtn) prodBtn.onclick = null;
      if (remember) remember.checked = false;
    };
    const handleChoice = (mode) => {
      if (remember?.checked) {
        devSendPreference = mode;
      }
      cleanup();
      resolve(mode);
    };
    if (devBtn) devBtn.onclick = () => handleChoice("dev");
    if (prodBtn) prodBtn.onclick = () => handleChoice("prod");
  });
}

function buildEmailOfferSummary(reviewData = {}) {
  const vehicle = wizardData.vehicle || {};
  const vehicleLine = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ")
    .trim();

  const lines = [];
  if (vehicleLine) lines.push(vehicleLine);
  lines.push(
    `Offer: ${formatCurrency(reviewData.salePrice, true, { showCents: true })}`
  );
  lines.push(
    `Cash Down: ${formatCurrency(reviewData.cashDown, true, { showCents: true })}`
  );
  lines.push(
    `Payment: ${formatCurrency(reviewData.monthlyPayment, true, {
      showCents: true,
    })}/mo @ ${(reviewData.apr * 100).toFixed(2)}% for ${reviewData.term} mos`
  );
  lines.push(
    `Amount Financed: ${formatCurrency(reviewData.amountFinanced, true, {
      showCents: true,
    })}`
  );
  return lines.join("\n");
}

/* ============================================================================
   Submission Methods
   ============================================================================ */

/**
 * Handle Share button (Web Share API)
 */
async function handleShareOffer() {
  try {
    // Validate customer information
    if (!validateSubmissionForm()) return;

    // Get formatted offer text with notes
    const notes = document.getElementById("submitOfferNotes").value.trim();
    const reviewData = await computeReviewData();
    const offerText = await formatOfferText(notes, reviewData);

    // Check if Web Share API is available
    if (!navigator.share) {
      alert(
        "Share feature is not supported on this device. Please use Copy or Email instead."
      );
      return;
    }

    // Get customer info for saving
    const customerName = document
      .getElementById("submitCustomerName")
      .value.trim();
    const customerEmail = document
      .getElementById("submitCustomerEmail")
      .value.trim();
    const customerPhone = document
      .getElementById("submitCustomerPhone")
      .value.trim();

    // Save offer to customer_offers table
    showToast("Saving offer...", "info");
    const savedOffer = await saveOffer({
      offerText,
      customerName,
      customerEmail,
      customerPhone,
    });

    if (!savedOffer || !savedOffer.id) {
      throw new Error("Failed to save offer");
    }

    // Close modals and open My Offers modal immediately
    closeSubmitOfferModal();
    closeReviewContractModal();
    await openMyOffersModal();
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Use Web Share API
    await navigator.share({
      title: "Vehicle Purchase Offer",
      text: offerText,
    });

    showToast("Offer shared successfully!", "success");
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Error sharing offer:", error);
      alert("Error sharing offer. Please try again.");
    }
  }
}

/**
 * Handle Email button - send via Twilio SendGrid
 */
async function handleEmailOffer() {
  if (!validateSubmissionForm()) return;

  const dealerEmail = document.getElementById("submitDealerEmail")?.value.trim();
  if (!dealerEmail) {
    alert("Please enter the dealer's email address.");
    return;
  }

  const sendMode = await promptSendMode("email");
  const simulateSend = isDevEnvironment && sendMode === "dev";

  const dealerName = document.getElementById("submitDealershipName")?.value.trim() || "";

  const notes = document.getElementById("submitOfferNotes").value.trim();
  const reviewData = await computeReviewData();
  const offerText = await formatOfferText(notes, reviewData);
  const offerSummary = buildEmailOfferSummary(reviewData);
  const vehicle = wizardData.vehicle || {};
  const vehicleInfo = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();

  const customerName = document.getElementById("submitCustomerName").value.trim();
  const customerEmail = document.getElementById("submitCustomerEmail").value.trim();
  const customerPhone = document.getElementById("submitCustomerPhone").value.trim();

  setEmailHandshakeStage("saving");

  let savedOffer;
  try {
    savedOffer = await saveOffer({
      offerText,
      customerName,
      customerEmail,
      customerPhone,
    });
    if (!savedOffer || !savedOffer.id) {
      throw new Error("Failed to save offer");
    }
  } catch (error) {
    setEmailHandshakeStage("error", {
      detail: error?.message || "Unable to save offer before emailing.",
      actions: [
        {
          label: "Back to Preview",
          variant: "btn btn-secondary",
          onClick: () => closeEmailHandshakeModal(),
        },
      ],
    });
    return;
  }

  setEmailHandshakeStage("sending");

  try {
    if (simulateSend) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } else {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId: savedOffer.id,
          recipientEmail: dealerEmail,
          recipientName: dealerName || null,
          offerText,
          offerSummary,
          vehicleInfo: vehicleInfo || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || "Failed to send email.");
      }
    }

    setEmailHandshakeStage("success", {
      actions: [
        {
          label: "Close",
          variant: "btn btn-primary",
          onClick: () => closeEmailHandshakeModal(),
        },
      ],
      detail: simulateSend ? "🧪 Dev simulation: no live email sent." : "",
    });

    closeSubmitOfferModal();
    closeReviewContractModal();
    await openMyOffersModal();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (simulateSend) {
      showToast("🧪 Dev mode: Email not actually sent (simulation).", "warning", 5000);
    }
  } catch (error) {
    setEmailHandshakeStage("error", {
      detail: error?.message || "Unable to send email.",
      actions: [
        {
          label: "Back to Preview",
          variant: "btn btn-secondary",
          onClick: () => closeEmailHandshakeModal(),
        },
      ],
    });
  }
}

/**
 * Poll Twilio for message status updates
 */
async function pollSmsStatus(messageSid, maxAttempts = 15, interval = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${API_BASE}/api/sms-status/${messageSid}`);

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      // Terminal states - stop polling
      if (['delivered', 'sent', 'failed', 'undelivered'].includes(data.status)) {
        return { success: ['delivered', 'sent'].includes(data.status), status: data.status, attempts: i + 1, data };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));

    } catch (error) {
      console.error('[poll-sms] Poll error:', error);
    }
  }

  // Timeout - assume sent if we got this far
  return { success: true, status: 'timeout', attempts: maxAttempts };
}

/**
 * Show sending progress with real status tracking
 */
async function showSendingProgress(options = {}) {
  const {
    smsMessageSid = null,
    emailPromise = null,
    minDuration = 7000
  } = options;

  // Get progress elements
  const progressEl = document.getElementById('offer-send-progress');
  const progressBar = document.getElementById('offer-progress-bar');
  const smsEl = document.getElementById('progress-sms');
  const smsText = document.getElementById('progress-sms-text');
  const emailEl = document.getElementById('progress-email');
  const emailText = document.getElementById('progress-email-text');

  if (!progressEl || !progressBar) {
    return { smsStatus: null, emailStatus: null };
  }

  const startTime = Date.now();

  // Show progress indicator
  if (smsMessageSid) smsEl.style.display = 'flex';
  if (emailPromise) emailEl.style.display = 'flex';
  progressEl.style.display = 'block';
  progressBar.style.width = '0%';

  // Track completion
  const results = {
    smsStatus: null,
    emailStatus: null
  };

  // Start SMS polling if we have a message SID
  const smsPromise = smsMessageSid
    ? pollSmsStatus(smsMessageSid).then(result => {
        results.smsStatus = result;

        // Update SMS text based on status
        if (result.success) {
          smsText.textContent = result.status === 'delivered' ? 'SMS delivered to dealer! ✓' : 'SMS sent to dealer! ✓';
          progressBar.style.width = emailPromise ? '50%' : '100%';
        } else {
          smsText.textContent = 'SMS sending failed ✗';
        }

        return result;
      })
    : Promise.resolve(null);

  // Handle email if provided
  const emailTask = emailPromise
    ? emailPromise.then(result => {
        results.emailStatus = result;
        emailText.textContent = result.ok ? 'Email sent! ✓' : 'Email failed ✗';
        progressBar.style.width = '100%';
        return result;
      }).catch(error => {
        console.error('[progress] Email error:', error);
        emailText.textContent = 'Email failed ✗';
        return { ok: false };
      })
    : Promise.resolve(null);

  // Animate progress bar smoothly during polling
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const currentWidth = parseFloat(progressBar.style.width) || 0;
    const targetWidth = smsMessageSid && !results.smsStatus ?
      Math.min(45, (elapsed / 5000) * 45) : // Cap at 45% until SMS completes
      emailPromise && !results.emailStatus ?
        Math.min(90, 50 + (elapsed / 5000) * 40) : // 50% to 90% for email
        currentWidth; // Stay at current if both done

    if (targetWidth > currentWidth) {
      progressBar.style.width = `${targetWidth}%`;
    }
  }, 200);

  // Wait for both tasks and minimum duration
  await Promise.all([
    smsPromise,
    emailTask,
    new Promise(resolve => setTimeout(resolve, minDuration))
  ]);

  clearInterval(progressInterval);

  // Complete to 100%
  progressBar.style.width = '100%';

  // Hide progress after brief delay
  await new Promise(resolve => setTimeout(resolve, 800));
  progressEl.style.display = 'none';
  smsEl.style.display = 'none';
  emailEl.style.display = 'none';
  smsText.textContent = 'Sending SMS to dealer...';
  emailText.textContent = 'Sending email confirmation...';
  progressBar.style.width = '0%';

  return results;
}

/**
 * Handle SMS button - Send via Twilio
 */
async function handleSmsOffer() {
  try {
    // Validate customer information and dealer phone
    if (!validateSubmissionForm()) return;

    const dealerPhone = document
      .getElementById("submitDealerPhone")
      .value.trim();
    if (!dealerPhone) {
      alert("Please enter the dealer's phone number.");
      return;
    }

    const sendMode = await promptSendMode("sms");
    const simulateSms = isDevEnvironment && sendMode === "dev";

    // Get formatted offer text with notes
    const notes = document.getElementById("submitOfferNotes").value.trim();
    const reviewData = await computeReviewData();
    const offerText = await formatOfferText(notes, reviewData);
    const offerPreviewHtml = buildOfferPreviewHtml(reviewData);

    // Get customer info for saving
    const customerName = document
      .getElementById("submitCustomerName")
      .value.trim();
    const customerEmail = document
      .getElementById("submitCustomerEmail")
      .value.trim();
    const customerPhone = document
      .getElementById("submitCustomerPhone")
      .value.trim();

    // Save offer to customer_offers table silently (no toast)
    const savedOffer = await saveOffer({
      offerText,
      offerPreviewHtml,
      customerName,
      customerEmail,
      customerPhone,
    });

    if (!savedOffer || !savedOffer.id) {
      showToast("Failed to save offer", "error");
      return;
    }

    // Close modals and open My Offers modal FIRST
    closeSubmitOfferModal();
    closeReviewContractModal();
    await openMyOffersModal();
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Prepare offer data
    const vehicle = wizardData.vehicle || {};
    const offerName = `${vehicle.year || ""} ${vehicle.make || ""} ${
      vehicle.model || ""
    }`.trim();

    const offerPriceValue =
      savedOffer?.offer_price ??
      reviewData.salePrice ??
      wizardData.financing?.salePrice ??
      0;
    const paymentValue =
      savedOffer?.monthly_payment ??
      reviewData.monthlyPayment ??
      0;
    const aprValue =
      savedOffer?.apr ??
      reviewData.apr ??
      0;
    const termValue =
      savedOffer?.term_months ??
      reviewData.term ??
      wizardData.financing?.term ??
      72;

    const summaryLines = [
      `Customer Offer: ${formatCurrency(offerPriceValue)}`,
      `Payment: ${formatCurrency(paymentValue)}/mo @ ${(aprValue * 100).toFixed(2)}% for ${termValue} mos`,
      offerName ? `Vehicle: ${offerName}` : null,
    ].filter(Boolean);
    const smsSummary = summaryLines.join("\n");
    let smsResult = null;
    let emailPromise = null;

    if (!simulateSms) {
      const smsResponse = await fetch("/api/send-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId: savedOffer.id,
          offerName: offerName || "Vehicle Offer",
          recipientPhone: dealerPhone,
          offerSummary: smsSummary,
          offerText,
        }),
      });

      if (!smsResponse.ok) {
        const errorData = await smsResponse.json();
        showToast(`Failed to send SMS: ${errorData.detail || errorData.error}`, "error");
        return;
      }

      smsResult = await smsResponse.json();

      emailPromise = customerEmail
        ? fetch("/api/send-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              offerId: savedOffer.id,
              recipientEmail: customerEmail,
              recipientName: customerName,
              offerText,
              offerSummary: smsSummary,
              vehicleInfo: offerName,
            }),
          }).then((res) => res.json())
        : null;
    }

    if (simulateSms) {
      await showSendingProgress({
        smsMessageSid: null,
        emailPromise: null,
        minDuration: 1500,
      });
      showToast(
        "🧪 Dev mode: SMS not actually sent (simulation).",
        "warning",
        5000
      );
      if (customerEmail) {
        showToast(
          "🧪 Dev mode: Email copy not sent (simulation).",
          "warning",
          5000
        );
      }
      return;
    }

    // Show progress with real status tracking (minimum 7 seconds)
    const progressResults = await showSendingProgress({
      smsMessageSid: smsResult.messageSid,
      emailPromise,
      minDuration: 7000,
    });

    // Show success toasts AFTER progress completes
    const dealerPhoneFormatted = dealerPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');

    if (progressResults.smsStatus?.success) {
      if (smsResult.testMode) {
        const maskedVerified = smsResult.to.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4');
        const maskedRequested = smsResult.requestedPhone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4');
        showToast(
          `🧪 TEST MODE: SMS sent to verified number ${maskedVerified} instead of dealer ${maskedRequested}`,
          "warning",
          5000
        );
      } else {
        showToast(
          `📱 SMS sent to dealer ${dealerPhoneFormatted}`,
          "success",
          4000
        );
      }
    } else {
      showToast(`⚠️ SMS may not have been delivered`, "warning", 4000);
    }

    if (progressResults.emailStatus?.ok) {
      showToast(
        `📧 Offer copy sent to ${customerEmail}`,
        "success",
        4000
      );
    }
  } catch (error) {
    console.error("Error sending SMS:", error);
    alert(`Error sending text message: ${error.message}`);
  }
}

/**
 * Handle Copy button (Clipboard API)
 */
async function handleCopyOffer() {
  try {
    // Validate customer information
    if (!validateSubmissionForm()) return;

    // Get formatted offer text with notes
    const notes = document.getElementById("submitOfferNotes").value.trim();
    const reviewData = await computeReviewData();
    const offerText = await formatOfferText(notes, reviewData);

    // Get customer info for saving
    const customerName = document
      .getElementById("submitCustomerName")
      .value.trim();
    const customerEmail = document
      .getElementById("submitCustomerEmail")
      .value.trim();
    const customerPhone = document
      .getElementById("submitCustomerPhone")
      .value.trim();

    // Save offer to customer_offers table
    showToast("Saving offer...", "info");
    const savedOffer = await saveOffer({
      offerText,
      customerName,
      customerEmail,
      customerPhone,
    });

    if (!savedOffer || !savedOffer.id) {
      throw new Error("Failed to save offer");
    }

    // Close modals and open My Offers modal immediately
    closeSubmitOfferModal();
    closeReviewContractModal();
    await openMyOffersModal();
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Copy to clipboard
    await navigator.clipboard.writeText(offerText);

    // Show success toast
    showToast("📋 Offer copied to clipboard!", "success", 4000);
  } catch (error) {
    console.error("Error copying offer:", error);
    alert("Error copying to clipboard. Please try again.");
  }
}

/**
 * Validate submission form
 */
function validateSubmissionForm() {
  const customerName = document
    .getElementById("submitCustomerName")
    .value.trim();
  const customerEmail = document
    .getElementById("submitCustomerEmail")
    .value.trim();
  const customerPhone = document
    .getElementById("submitCustomerPhone")
    .value.trim();
  const dealerPhone = document
    .getElementById("submitDealerPhone")
    .value.trim();
  const dealerEmail = document
    .getElementById("submitDealerEmail")
    .value.trim();

  // Validate required customer fields
  if (!customerName || !customerEmail || !customerPhone) {
    alert("Please fill in all required customer fields (Name, Email, Phone).");
    return false;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    alert("Please enter a valid email address.");
    return false;
  }

  // Validate at least one dealer contact method
  if (!dealerPhone && !dealerEmail) {
    alert(
      "Please provide at least one contact method for the dealer (phone or email)."
    );
    return false;
  }

  return true;
}

/**
 * Handle successful submission
 * @param {number} delayMs - Optional delay in milliseconds before opening My Offers modal
 */
async function handleSubmissionSuccess(delayMs = 0) {
  // Close the submit offer modal
  closeSubmitOfferModal();

  // Close the review contract modal if open
  closeReviewContractModal();

  // Show success toast
  showToast("Offer sent successfully!", "success");

  // Open My Offers modal to show saved offer (with optional delay)
  if (delayMs > 0) {
    setTimeout(async () => {
      if (typeof window.openMyOffersModal === 'function') {
        await window.openMyOffersModal();
      } else {
        console.error("openMyOffersModal function not found");
      }
    }, delayMs);
  } else {
    if (typeof window.openMyOffersModal === 'function') {
      await window.openMyOffersModal();
    } else {
      console.error("openMyOffersModal function not found");
    }
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Save offer to Supabase database
 */
async function saveOfferToDatabase(
  submissionMethod,
  formattedText,
  recipientContact = null
) {
  try {
    const reviewData = await computeReviewData();
    if (!reviewData) {
      console.error("Unable to compute review data");
      return null;
    }

    // Get customer user ID
    const authStore = useAuthStore.getState();
    const userId = authStore.user?.id || null;

    // Get customer data from form
    const customerName = document
      .getElementById("submitCustomerName")
      .value.trim();
    const customerEmail = document
      .getElementById("submitCustomerEmail")
      .value.trim();
    const customerPhone = document
      .getElementById("submitCustomerPhone")
      .value.trim();

    // Save/update customer profile if user is logged in
    if (userId && customerName) {
      await supabase
        .from("customer_profiles")
        .upsert(
          {
            user_id: userId,
            full_name: customerName,
            email: customerEmail,
            phone: customerPhone,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    }

    // Get dealer data from form (salesperson field removed)
    const dealershipName = document
      .getElementById("submitDealershipName")
      .value.trim();
    const dealerPhone = document
      .getElementById("submitDealerPhone")
      .value.trim();
    const dealerEmail = document
      .getElementById("submitDealerEmail")
      .value.trim();

    // Prepare offer data
    const vehicle = wizardData.vehicle || {};
    const trade = wizardData.trade || {};
    const location = wizardData.location || {};
    const notes = document.getElementById("submitOfferNotes").value.trim();

    const offerData = {
      user_id: userId,
      offer_name: `${vehicle.year || ""} ${vehicle.make || ""} ${
        vehicle.model || ""
      }`.trim(),
      status: "submitted",

      // Vehicle data
      vehicle_year: vehicle.year || null,
      vehicle_make: vehicle.make || null,
      vehicle_model: vehicle.model || null,
      vehicle_trim: vehicle.trim || null,
      vehicle_vin: vehicle.vin || null,
      vehicle_condition: deriveSaleCondition(vehicle) || null,
      vehicle_mileage: vehicle.mileage || null,

      // Pricing
      sale_price: reviewData.salePrice || 0,
      down_payment: reviewData.downPayment || 0,

      // Trade-in
      has_tradein: !!(trade && (trade.offer > 0 || trade.payoff > 0)),
      tradein_allowance: trade?.offer || null,
      tradein_payoff: trade?.payoff || null,
      tradein_net: trade ? (trade.offer || 0) - (trade.payoff || 0) : null,

      // Financing
      term: reviewData.term || null,
      apr: reviewData.apr || null,
      monthly_payment: reviewData.monthlyPayment || 0,
      finance_charge: reviewData.financeCharge || 0,
      amount_financed: reviewData.amountFinanced || 0,
      total_of_payments: reviewData.totalOfPayments || 0,
      lender_id: wizardData.selectedApr?.lender_id || null,
      lender_name: wizardData.selectedApr?.lender_name || null,

      // Fees
      fees: reviewData.fees || null,

      // Location
      state_code: location.stateCode || null,
      county_name: location.countyName || null,

      // Complete state snapshot
      wizard_state: wizardData,

      // Notes
      customer_notes: notes || null,
    };

    // Insert offer
    const { data: offer, error: offerError } = await supabase
      .from("saved_offers")
      .insert(offerData)
      .select()
      .single();

    if (offerError) {
      console.error("Error saving offer:", offerError);
      return null;
    }

    // Record submission
    if (offer) {
      await supabase.from("offer_submissions").insert({
        saved_offer_id: offer.id,
        salesperson_id: salespersonId,
        submission_method: submissionMethod,
        formatted_text: formattedText,
        recipient_contact: recipientContact,
      });
    }

    return offer;
  } catch (error) {
    console.error("Error saving offer to database:", error);
    return null;
  }
}

// Make functions globally available
window.formatOfferText = formatOfferText;
window.openSubmitOfferModal = openSubmitOfferModal;
window.closeSubmitOfferModal = closeSubmitOfferModal;
window.toggleDealerEditMode = toggleDealerEditMode;
window.handleShareOffer = handleShareOffer;
window.handleEmailOffer = handleEmailOffer;
window.handleSmsOffer = handleSmsOffer;
window.handleCopyOffer = handleCopyOffer;

function getFeeCategoryState(categoryKey) {
  return feeModalState.categories?.[categoryKey] ?? null;
}

function clearFeeCategoryRows(categoryKey) {
  const category = getFeeCategoryState(categoryKey);
  if (!category) return;
  category.rows.forEach((row) => row.element.remove());
  category.rows = [];
}

function renderFeeModalFromWizardData() {
  ensureWizardFeeDefaults();
  Object.keys(FEE_CATEGORY_CONFIG).forEach((key) => clearFeeCategoryRows(key));

  const storedItems = wizardData.fees?.items ?? {};
  if (feeDebug.enabled) {
    feeDebug.log("renderFeeModalFromWizardData -> storedItems", storedItems);
  }
  Object.entries(feeModalState.categories).forEach(([key, category]) => {
    if (!category.container) return;
    const rows =
      Array.isArray(storedItems[key]) && storedItems[key].length
        ? storedItems[key]
        : [{}];

    rows.forEach((item) => {
      addFeeRow(key, {
        description: item.description ?? "",
        amount: Number.isFinite(item.amount) ? item.amount : null,
      });
    });
    ensureTrailingEmptyRow(key);
    updateCategoryTotal(key);
    if (feeDebug.enabled) {
      feeDebug.table(
        `rendered rows (${key})`,
        category.rows.map((row) => ({
          desc: row.descInput?.value ?? "",
          amount: row.amountInput?.value ?? "",
        }))
      );
    }
  });

  updateTaxInputs();
  applyFeeModalChanges();
}

function updateTaxInputs() {
  ensureWizardFeeDefaults();
  const stateTaxDisplay = document.getElementById("modal-state-tax");
  const countyTaxDisplay = document.getElementById("modal-county-tax");
  if (stateTaxDisplay) {
    stateTaxDisplay.value = (wizardData.fees?.stateTaxRate ?? 0).toFixed(2);
  }
  if (countyTaxDisplay) {
    countyTaxDisplay.value = (wizardData.fees?.countyTaxRate ?? 0).toFixed(2);
  }
  updateFeeSummary();
  updateTaxOverrideIndicators();
}

function handleManualTaxRateInput(event) {
  const input = event?.target;
  if (!input) return;

  ensureWizardFeeDefaults();
  const numericValue = parseFloat(String(input.value).trim());
  const sanitized = Number.isFinite(numericValue)
    ? Math.max(numericValue, 0)
    : 0;

  if (input.id === "modal-state-tax") {
    wizardData.fees.stateTaxRate = sanitized;
  } else if (input.id === "modal-county-tax") {
    wizardData.fees.countyTaxRate = sanitized;
  } else {
    return;
  }

  wizardData.fees.userTaxOverride = true;
  input.value = sanitized.toFixed(2);

  updateTaxInputs();
  updateTaxLabels();
  refreshReviewDebounced();
  autoCalculateQuick().catch((error) => {
    console.error("[taxes] Unable to refresh quick calculation:", error);
  });
}

function updateTaxOverrideIndicators() {
  const overrideActive = Boolean(wizardData.fees?.userTaxOverride);
  if (typeof document !== "undefined") {
    document.querySelectorAll(".tax-override-indicator").forEach((el) => {
      el.style.display = overrideActive ? "inline-flex" : "none";
    });
  }

  const note = document.getElementById("taxSourceNote");
  if (note) {
    note.textContent = overrideActive
      ? "User-entered tax rates are applied. Live tax lookups are bypassed."
      : "Taxes are based on your address entered above.";
  }
}

function addFeeRow(categoryKey, initialData = {}) {
  const category = getFeeCategoryState(categoryKey);
  if (!category || !category.container) return null;

  const rowEl = document.createElement("div");
  rowEl.className = "fee-row";

  const descWrap = document.createElement("div");
  descWrap.className = "fee-row__desc";
  const descInput = document.createElement("input");
  descInput.type = "text";
  descInput.className = "form-input";
  descInput.placeholder = "Description";
  const suggestionStore = category.suggestionStore;
  if (suggestionStore?.datalist) {
    descInput.setAttribute("list", suggestionStore.datalist.id);
  }
  if (initialData.description) {
    descInput.value = initialData.description;
  }
  descWrap.appendChild(descInput);

  const amountWrap = document.createElement("div");
  amountWrap.className = "fee-row__amount";
  const amountInput = document.createElement("input");
  amountInput.type = "text";
  amountInput.className = "form-input";
  amountInput.placeholder = "$0.00";
  amountWrap.appendChild(amountInput);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "fee-row__actions";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "fee-row__btn";
  removeBtn.textContent = "−";
  removeBtn.setAttribute("aria-label", "Remove fee");
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "fee-row__btn";
  addBtn.textContent = "+";
  addBtn.setAttribute("aria-label", "Add fee");
  actionsWrap.appendChild(removeBtn);
  actionsWrap.appendChild(addBtn);

  rowEl.appendChild(descWrap);
  rowEl.appendChild(amountWrap);
  rowEl.appendChild(actionsWrap);

  category.container.appendChild(rowEl);

  setupCurrencyInput(amountInput);
  if (initialData.amount != null) {
    amountInput.value = formatCurrency(initialData.amount);
  }

  const rowState = {
    categoryKey,
    element: rowEl,
    descInput,
    amountInput,
    removeBtn,
    addBtn,
  };

  category.rows.push(rowState);

  const maybeApplySuggestion = () => {
    const store = category.suggestionStore;
    if (!store) return;
    const amount = store.getAmount(descInput.value);
    if (amount == null) return;
    amountInput.value = formatCurrency(amount);
    ensureTrailingEmptyRow(categoryKey);
    updateCategoryTotal(categoryKey);
  };

  descInput.addEventListener("change", () => {
    descInput.value = toTitleCase(descInput.value);
    maybeApplySuggestion();
  });
  descInput.addEventListener("blur", () => {
    descInput.value = toTitleCase(descInput.value);
    maybeApplySuggestion();
  });
  descInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      maybeApplySuggestion();
      const newRow = addFeeRow(categoryKey);
      newRow?.descInput.focus();
    }
  });

  amountInput.addEventListener("input", () => updateCategoryTotal(categoryKey));
  amountInput.addEventListener("blur", () => {
    updateCategoryTotal(categoryKey);
    ensureTrailingEmptyRow(categoryKey);
  });

  removeBtn.addEventListener("click", () =>
    removeFeeRow(categoryKey, rowState)
  );
  addBtn.addEventListener("click", () => {
    const newRow = addFeeRow(categoryKey);
    newRow?.descInput.focus();
  });

  return rowState;
}

function removeFeeRow(categoryKey, row) {
  const category = getFeeCategoryState(categoryKey);
  if (!category) return;
  if (category.rows.length <= 1) {
    row.descInput.value = "";
    row.amountInput.value = "";
    updateCategoryTotal(categoryKey);
    return;
  }
  const index = category.rows.indexOf(row);
  if (index >= 0) {
    category.rows.splice(index, 1);
  }
  row.element.remove();
  updateCategoryTotal(categoryKey);
}

function ensureTrailingEmptyRow(categoryKey) {
  const category = getFeeCategoryState(categoryKey);
  if (!category || !category.rows.length) return;
  const lastRow = category.rows[category.rows.length - 1];
  const hasContent =
    lastRow.descInput.value.trim() !== "" ||
    parseCurrencyToNumber(lastRow.amountInput.value) > 0;
  if (hasContent) {
    addFeeRow(categoryKey);
  }
}

function updateCategoryTotal(categoryKey) {
  const category = getFeeCategoryState(categoryKey);
  if (!category) return;
  let total = 0;
  category.rows.forEach((row) => {
    const numeric = parseCurrencyToNumber(row.amountInput.value);
    if (Number.isFinite(numeric)) {
      total += numeric;
    }
  });
  if (category.totalEl) {
    category.totalEl.textContent = formatCurrency(total);
  }
  applyFeeModalChanges();
  return total;
}

function collectFeeModalData() {
  const items = {};
  const totals = {
    dealerFees: 0,
    customerAddons: 0,
    govtFees: 0,
  };

  Object.entries(feeModalState.categories).forEach(([key, category]) => {
    const categoryItems = category.rows
      .map((row) => {
        const description = row.descInput.value.trim();
        const amount = parseCurrencyToNumber(row.amountInput.value);
        if (!description && !(Number.isFinite(amount) && amount !== 0)) {
          return null;
        }
        return {
          description: toTitleCase(description),
          amount: normalizeCurrencyNumber(amount) ?? 0,
        };
      })
      .filter(Boolean);
    items[key] = categoryItems;
    const sum = categoryItems.reduce(
      (acc, item) => acc + (item.amount ?? 0),
      0
    );
    if (key === "dealer") totals.dealerFees = sum;
    if (key === "customer") totals.customerAddons = sum;
    if (key === "gov") totals.govtFees = sum;
  });

  return { items, totals };
}

function applyFeeModalChanges() {
  const payload = collectFeeModalData();
  if (feeDebug.enabled) {
    feeDebug.log("applyFeeModalChanges payload", payload);
  }
  persistFeeModalState(payload);
  updateFeeSummary(payload.totals);

  // Update quick entry sliders to reflect fee changes
  const dealerFeesSlider = document.getElementById("quickSliderDealerFees");
  const dealerFeesInput = document.getElementById("quickInputDealerFees");
  const customerAddonsSlider = document.getElementById(
    "quickSliderCustomerAddons"
  );
  const customerAddonsInput = document.getElementById(
    "quickInputCustomerAddons"
  );

  let actualDealerFees = 0;
  let actualCustomerAddons = 0;

  if (dealerFeesSlider && dealerFeesInput) {
    dealerFeesSlider.value = payload.totals.dealerFees || 0;
    // Read back the rounded value from slider
    actualDealerFees = parseFloat(dealerFeesSlider.value);
    dealerFeesInput.value = formatCurrency(actualDealerFees);
    updateSliderProgress(dealerFeesSlider);
  }

  if (customerAddonsSlider && customerAddonsInput) {
    customerAddonsSlider.value = payload.totals.customerAddons || 0;
    // Read back the rounded value from slider
    actualCustomerAddons = parseFloat(customerAddonsSlider.value);
    customerAddonsInput.value = formatCurrency(actualCustomerAddons);
    updateSliderProgress(customerAddonsSlider);
  }

  // Update original values so diff indicators reset to new baseline (use rounded values)
  if (window.sliderOriginalValues) {
    window.sliderOriginalValues["quickSliderDealerFees"] = actualDealerFees;
    window.sliderOriginalValues["quickSliderCustomerAddons"] =
      actualCustomerAddons;
  }

  // Trigger recalculation
  autoCalculateQuick();
}

function persistFeeModalState({ items, totals }) {
  ensureWizardFeeDefaults();
  const stateTaxRate = wizardData.fees?.stateTaxRate ?? 0;
  const countyTaxRate = wizardData.fees?.countyTaxRate ?? 0;

  wizardData.fees = {
    dealerFees: normalizeCurrencyNumber(totals.dealerFees) ?? 0,
    customerAddons: normalizeCurrencyNumber(totals.customerAddons) ?? 0,
    govtFees: normalizeCurrencyNumber(totals.govtFees) ?? 0,
    stateTaxRate,
    countyTaxRate,
    items,
    userCustomized: true,
  };
  if (feeDebug.enabled) {
    feeDebug.log("persistFeeModalState", {
      items,
      totals,
      wizardDataFees: {
        dealerFees: wizardData.fees.dealerFees,
        customerAddons: wizardData.fees.customerAddons,
        govtFees: wizardData.fees.govtFees,
        stateTaxRate: wizardData.fees.stateTaxRate,
        countyTaxRate: wizardData.fees.countyTaxRate,
      },
    });
  }

  if (currentStep === 4) {
    refreshReview().catch((error) => {
      console.error("[fees] Unable to refresh review after change:", error);
    });
  }
}

function updateFeeSummary(totalsOverride) {
  ensureWizardFeeDefaults();
  const totals = totalsOverride ?? collectFeeModalData().totals;

  const dealerFees = totals.dealerFees ?? 0;
  const customerAddons = totals.customerAddons ?? 0;
  const govtFees = totals.govtFees ?? 0;
  const totalFees = dealerFees + customerAddons + govtFees;

  const salePrice = parseCurrencyToNumber(wizardData.financing?.salePrice);
  const tradeOffer = wizardData.tradein?.hasTradeIn
    ? parseCurrencyToNumber(wizardData.tradein.value)
    : 0;

  const taxTotals = recomputeTaxes({
    salePrice,
    dealerFees,
    customerAddons,
    tradeOffer,
    stateTaxRate: wizardData.fees.stateTaxRate ?? 0,
    countyTaxRate: wizardData.fees.countyTaxRate ?? 0,
  });

  const totalTaxes = taxTotals.totalTaxes ?? 0;
  const otherCharges = totalFees + totalTaxes;

  setText("modal-fees-total", formatCurrency(totalFees));
  setText("modal-tax-total", formatCurrency(totalTaxes));
  setText("modal-other-charges", formatCurrency(otherCharges));
}

function goToLocationStep() {
  closeFeesModal();
  currentStep = 1;
  updateWizardUI();
}

function setEditFeeStatus(message = "", tone = "info") {
  const statusEl = document.getElementById("edit-fee-status");
  if (!statusEl) return;
  statusEl.textContent = message ?? "";
  if (!message || tone === "info") {
    statusEl.removeAttribute("data-tone");
  } else {
    statusEl.dataset.tone = tone;
  }
}

function setEditFeeFormDisabled(disabled) {
  const form = document.getElementById("edit-fee-form");
  if (!form) return;
  Array.from(form.elements).forEach((el) => {
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLButtonElement
    ) {
      el.disabled = Boolean(disabled);
    }
  });
}

function updateEditFeeNameList(type) {
  const input = document.getElementById("edit-fee-name");
  if (!input) return;
  const store = getFeeSuggestionStore(type);
  if (store?.datalist?.id) {
    input.setAttribute("list", store.datalist.id);
  } else {
    input.removeAttribute("list");
  }
}

function openEditFeeModal(categoryKey = "dealer") {
  const modal = document.getElementById("edit-fee-modal");
  const form = document.getElementById("edit-fee-form");
  const typeSelect = document.getElementById("edit-fee-type");
  const amountInput = document.getElementById("edit-fee-amount");
  const nameInput = document.getElementById("edit-fee-name");
  if (!modal || !form || !typeSelect || !amountInput || !nameInput) return;

  const normalizedCategory =
    categoryKey === "gov"
      ? "gov"
      : categoryKey === "customer"
      ? "customer"
      : "dealer";

  editFeeModalState.activeCategory = normalizedCategory;
  typeSelect.value = normalizedCategory;

  form.reset();
  setEditFeeStatus("");
  updateEditFeeNameList(normalizedCategory);
  formatCurrencyInput(amountInput);

  modal.classList.add("active");
  modal.style.display = "flex";

  // ESC key to close
  if (!window.__editFeeEscHandler) {
    window.__editFeeEscHandler = (e) => {
      const key = e.key || e.code;
      if (key === "Escape" || key === "Esc") {
        e.preventDefault();
        closeEditFeeModal();
      }
    };
    document.addEventListener("keydown", window.__editFeeEscHandler);
  }

  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select?.();
  });
}

function closeEditFeeModal() {
  const modal = document.getElementById("edit-fee-modal");
  const form = document.getElementById("edit-fee-form");
  const amountInput = document.getElementById("edit-fee-amount");
  if (!modal) return;
  modal.classList.remove("active");
  modal.style.display = "none";
  form?.reset();
  setEditFeeStatus("");
  if (amountInput) {
    formatCurrencyInput(amountInput);
  }
}
window.openEditFeeModal = openEditFeeModal;
window.closeEditFeeModal = closeEditFeeModal;

function formatCurrencyInput(input) {
  if (!input) return;
  const numeric = parseCurrencyToNumber(input.value);
  if (Number.isFinite(numeric) && numeric !== 0) {
    input.value = formatCurrency(numeric);
  } else {
    input.value = "";
  }
}

async function handleEditFeeSubmit(event) {
  event.preventDefault();
  const form = document.getElementById("edit-fee-form");
  const typeSelect = document.getElementById("edit-fee-type");
  const nameInput = document.getElementById("edit-fee-name");
  const amountInput = document.getElementById("edit-fee-amount");
  if (!form || !typeSelect || !nameInput || !amountInput) return;

  const typeValue =
    typeSelect.value === "gov"
      ? "gov"
      : typeSelect.value === "customer"
      ? "customer"
      : "dealer";

  const rawName = nameInput.value.trim();
  if (!rawName) {
    setEditFeeStatus("Description is required.", "error");
    nameInput.focus();
    return;
  }

  const amountValue = parseCurrencyToNumber(amountInput.value);
  if (!Number.isFinite(amountValue)) {
    setEditFeeStatus("Enter a valid amount.", "error");
    amountInput.focus();
    return;
  }

  const normalizedName = toTitleCase(rawName);
  const normalizedAmount = normalizeCurrencyNumber(amountValue) ?? 0;

  const state = getFeeSetState(typeValue);
  if (!state.id) {
    setEditFeeStatus(
      "No active fee set available. Please configure sets in Supabase.",
      "error"
    );
    return;
  }

  setEditFeeFormDisabled(true);
  setEditFeeStatus("Saving...");

  try {
    const tableName =
      typeValue === "gov"
        ? "gov_fee_sets"
        : typeValue === "customer"
        ? "customer_addon_sets"
        : "dealer_fee_sets";

    const items = Array.isArray(state.items)
      ? state.items.map((item) => ({ ...item }))
      : [];

    let found = false;
    let existingItemIndex = -1;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] ?? {};
      const existing =
        typeof item?.name === "string" ? item.name.trim().toLowerCase() : "";
      if (existing && existing === normalizedName.toLowerCase()) {
        existingItemIndex = i;
        found = true;
        break;
      }
    }

    // If fee exists, confirm overwrite
    if (found) {
      const existingAmount = items[existingItemIndex]?.amount || 0;
      const confirmed = confirm(
        `"${normalizedName}" already exists with amount ${formatCurrency(
          existingAmount
        )}.\n\nDo you want to update it to ${formatCurrency(normalizedAmount)}?`
      );

      if (!confirmed) {
        setEditFeeFormDisabled(false);
        setEditFeeStatus("");
        return;
      }

      items[existingItemIndex] = {
        ...items[existingItemIndex],
        name: normalizedName,
        amount: normalizedAmount,
      };
    } else {
      items.push({ name: normalizedName, amount: normalizedAmount });
    }

    const { data: updatedRows, error } = await supabase
      .from(tableName)
      .update({ items })
      .eq("id", state.id)
      .select("id, items");

    if (error) throw error;

    const returnedItems =
      Array.isArray(updatedRows) && updatedRows[0]?.items
        ? updatedRows[0].items
        : items;

    state.items = Array.isArray(returnedItems) ? returnedItems : items;
    const normalizedItems = normalizeFeeItems(state.items);
    const store = getFeeSuggestionStore(typeValue);
    store?.setItems(normalizedItems);

    setEditFeeStatus("Fee saved.", "success");

    // Reload ALL fee suggestions from Supabase to ensure fresh data is displayed
    await Promise.all([
      loadDealerFeeSuggestions(),
      loadCustomerAddonSuggestions(),
      loadGovFeeSuggestions(),
    ]);
    if (feeDebug.enabled) {
      const storeSnapshot = getFeeSuggestionStore(typeValue);
      feeDebug.log("post-reload suggestion store", {
        type: typeValue,
        count: storeSnapshot?.items?.length ?? 0,
        matchAmount: storeSnapshot?.getAmount?.(normalizedName) ?? null,
        matchName: normalizedName,
      });
    }

    // Update any existing rows in the fee modal that match the edited fee
    const category = feeModalState.categories[typeValue];
    let rowSnapshotBefore = null;
    if (feeDebug.enabled && category?.rows?.length) {
      rowSnapshotBefore = category.rows.map((row) => ({
        desc: row.descInput?.value ?? "",
        amount: row.amountInput?.value ?? "",
      }));
      feeDebug.table(
        `rows before manual patch (${typeValue})`,
        rowSnapshotBefore
      );
    }
    if (category && category.rows) {
      category.rows.forEach((row) => {
        const desc = row.descInput?.value?.trim();
        if (desc && desc.toLowerCase() === normalizedName.toLowerCase()) {
          row.amountInput.value = formatCurrency(normalizedAmount);
        }
      });
      if (feeDebug.enabled) {
        const rowSnapshotAfter = category.rows.map((row) => ({
          desc: row.descInput?.value ?? "",
          amount: row.amountInput?.value ?? "",
        }));
        feeDebug.table(
          `rows after manual patch (${typeValue})`,
          rowSnapshotAfter
        );
      }
    }

    // Collect current fee modal state and persist it with fresh values
    const currentFeeData = collectFeeModalData();
    if (feeDebug.enabled) {
      feeDebug.log("collectFeeModalData result", {
        totals: currentFeeData?.totals ?? {},
        items: currentFeeData?.items ?? {},
      });
    }
    persistFeeModalState(currentFeeData);

    // Re-render the fee modal from the updated wizardData
    renderFeeModalFromWizardData();

    closeEditFeeModal();

    // Show success toast
    showToast(`Fee "${normalizedName}" saved successfully`, "success");
  } catch (error) {
    console.error("Failed to save fee", error);
    const message =
      error?.message ?? "Unable to save fee right now. Please try again.";
    setEditFeeStatus(message, "error");
  } finally {
    setEditFeeFormDisabled(false);
  }
}

/**
 * Submit lead
 */
async function submitLead() {
  if (!validateStep(4)) {
    return;
  }

  saveStepData(4);

  const submitBtn = event.target;
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg style="animation: spin 1s linear infinite;" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
    </svg>
    Processing...
  `;

  try {
    // TODO: Send to Supabase leads table
    await new Promise((resolve) => setTimeout(resolve, 2000));
    showSuccessMessage();
  } catch (error) {
    console.error("Error submitting lead:", error);
    alert("There was an error submitting your information. Please try again.");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

/**
 * Show success message
 */
function showSuccessMessage() {
  const wizardCard = document.querySelector(".wizard-card");
  wizardCard.innerHTML = `
    <div style="text-align: center; padding: var(--spacing-2xl);">
      <div style="width: 80px; height: 80px; margin: 0 auto var(--spacing-xl); background: linear-gradient(135deg, var(--success), #34d399); border-radius: 50%; display: flex; align-items: center; justify-content: center; animation: scaleIn 0.6s var(--transition-bounce);">
        <svg width="40" height="40" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
      <h2 style="font-family: var(--font-display); font-size: 2rem; font-weight: 700; color: #1e293b; margin-bottom: var(--spacing-sm);">
        You're All Set!
      </h2>
      <p style="font-size: 1.125rem; color: #64748b; margin-bottom: var(--spacing-xl); max-width: 500px; margin-left: auto; margin-right: auto;">
        We're finding the best rates for you. Check your email for next steps and personalized offers.
      </p>
      <div style="display: flex; gap: var(--spacing-sm); justify-content: center;">
        <button type="button" class="btn btn-primary" onclick="window.location.href='index.html'">
          View Full Calculator
        </button>
        <button type="button" class="btn btn-secondary" onclick="window.location.reload()">
          Start Over
        </button>
      </div>
    </div>
  `;
}

// ===================================
// QUICK ENTRY MODE
// ===================================

/**
 * Switch between Wizard and Quick Entry modes
 */
async function switchMode(mode) {
  const wizardMode = document.querySelector(".wizard-card");
  const wizardProgress = document.getElementById("wizard-progress");
  const quickMode = document.getElementById("quick-entry-mode");
  const wizardBtn = document.querySelector(
    '.mode-toggle__btn[data-mode="wizard"]'
  );
  const quickBtn = document.querySelector(
    '.mode-toggle__btn[data-mode="quick"]'
  );

  if (mode === "wizard") {
    wizardMode.style.display = "block";
    wizardProgress.style.display = "block";
    quickMode.style.display = "none";
    wizardBtn.classList.add("active");
    quickBtn.classList.remove("active");
  } else {
    wizardMode.style.display = "none";
    wizardProgress.style.display = "none";
    quickMode.style.display = "block";
    wizardBtn.classList.remove("active");
    quickBtn.classList.add("active");

    // Initialize Quick Entry mode with current wizard data
    await initializeQuickEntry();
  }
}

/**
 * Initialize Quick Entry mode with current wizard data
 */
async function initializeQuickEntry() {
  // Populate location
  const quickLocation = document.getElementById("quick-location");

  if (!quickEntryInitialized) {
    if (!selectedVehicle && !wizardData.vehicle?.vin) {
      ensureWizardFeeDefaults();
      wizardData.financing = {
        ...(wizardData.financing || {}),
        salePrice: 0,
        cashDown: 0,
        term: wizardData.financing?.term || 72,
        creditScoreRange:
          wizardData.financing?.creditScoreRange || "excellent",
      };
      wizardData.tradein = {
        hasTradeIn: false,
        tradeValue: 0,
        tradePayoff: 0,
        vehicles: [],
      };
      wizardData.trade = {
        hasTradeIn: false,
        value: 0,
        payoff: 0,
        vehicles: [],
      };
    }
    quickEntryInitialized = true;
  }

  // Check if location field has a value but wizardData doesn't have coordinates
  const locationValue = quickLocation?.value?.trim();
  if (
    locationValue &&
    (!wizardData.location?.lat || !wizardData.location?.lng) &&
    typeof google !== 'undefined' &&
    google?.maps?.Geocoder
  ) {
    const geocoder = new google.maps.Geocoder();
    try {
      const results = await new Promise((resolve, reject) => {
        geocoder.geocode({ address: locationValue }, (results, status) => {
          if (status === "OK" && results?.length) {
            resolve(results);
          } else {
            reject(new Error(`Geocoding failed: ${status}`));
          }
        });
      });

      if (results && results.length > 0) {
        const location = results[0].geometry?.location;
        const lat =
          typeof location?.lat === "function"
            ? location.lat()
            : location?.lat ?? null;
        const lng =
          typeof location?.lng === "function"
            ? location.lng()
            : location?.lng ?? null;

        const components = results[0].address_components ?? [];
        const locale = extractLocaleFromComponents(components);

        wizardData.location = {
          formatted_address: locationValue,
          address: locationValue,
          lat,
          lng,
          stateCode: locale.stateCode,
          countyName: locale.countyName,
        };
      }
    } catch (error) {
    }
  } else if (wizardData.location?.formatted_address) {
    quickLocation.value = wizardData.location.formatted_address;

    // If we have an address but no coordinates, geocode it
    if (!wizardData.location.lat || !wizardData.location.lng) {
      if (typeof google !== 'undefined' && google?.maps?.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        try {
          const results = await new Promise((resolve, reject) => {
            geocoder.geocode(
              { address: wizardData.location.formatted_address },
              (results, status) => {
                if (status === "OK" && results?.length) {
                  resolve(results);
                } else {
                  reject(new Error(`Geocoding failed: ${status}`));
                }
              }
            );
          });

          if (results && results.length > 0) {
            const location = results[0].geometry?.location;
            const lat =
              typeof location?.lat === "function"
                ? location.lat()
                : location?.lat ?? null;
            const lng =
              typeof location?.lng === "function"
                ? location.lng()
                : location?.lng ?? null;

            wizardData.location = {
              ...wizardData.location,
              lat,
              lng,
            };
          }
        } catch (error) {
        }
      }
    }
  }

  // Populate VIN if selected vehicle exists
  const quickVin = document.getElementById("quick-vin");
  if (selectedVehicle?.vin) {
    quickVin.value = selectedVehicle.vin;
    displayQuickVehicleCard(selectedVehicle);
  }

  // Populate financing details with defaults
  const quickVehiclePrice = document.getElementById("quick-vehicle-price");
  const quickDownPayment = document.getElementById("quick-down-payment");
  const quickLoanTerm = document.getElementById("quick-loan-term");
  const quickCreditScore = document.getElementById("quick-credit-score");

  const salePriceValue =
    parseCurrencyToNumber(wizardData.financing?.salePrice) || 0;
  const cashDownValue =
    parseCurrencyToNumber(wizardData.financing?.cashDown) || 0;

  if (quickVehiclePrice) {
    quickVehiclePrice.value = formatCurrency(salePriceValue);
  }
  if (quickDownPayment) {
    quickDownPayment.value = formatCurrency(cashDownValue);
  }

  // Set defaults: 72 months, excellent credit (750+)
  quickLoanTerm.value = wizardData.financing?.term || "72";
  quickCreditScore.value =
    wizardData.financing?.creditScoreRange || "excellent";

  // Populate trade-in if exists
  if (wizardData.tradein?.hasTradeIn) {
  }

  // Setup saved vehicles dropdown for Quick mode
  setupQuickSavedVehicles();

  // Setup location autocomplete for Quick mode
  setupQuickLocationManualFallback();

  // Setup auto-calculation on input changes
  setupQuickAutoCalculation();

  // Sync slider values from wizardData BEFORE setting up sliders
  // This ensures fees from the modal are reflected in the sliders
  syncSlidersFromWizardData();

  // Setup sliders
  setupQuickSliders();

  // ============================================
  // PHASE 1: Initialize Centered Sliders
  // ============================================
  initializeCenteredSliders();

  // Update tax labels to show state/county info or defaults
  updateTaxLabels();

  // Initial calculation if we have basic data
  autoCalculateQuick();
}

/**
 * Sync slider values from wizardData (called before setupQuickSliders)
 * This ensures sliders show correct values including fees from modal
 */
function syncSlidersFromWizardData() {
  ensureWizardFeeDefaults();
}

/**
 * Setup saved vehicles dropdown for Quick Entry mode
 */
function setupQuickSavedVehicles() {
  const quickVin = document.getElementById("quick-vin");
  const dropdown = document.getElementById("quick-saved-vehicles-dropdown");

  // Remove any existing listeners by cloning (prevents duplicates)
  if (quickVin._savedVehiclesSetup) {
    return;
  }
  quickVin._savedVehiclesSetup = true;

  const showDropdown = () => {
    if (savedVehicles.length > 0) {
      displayQuickSavedVehicles();
    } else {
      // Show "no saved vehicles" message
      dropdown.innerHTML =
        '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No saved vehicles</div>';
      dropdown.style.display = "block";
    }
  };

  quickVin.addEventListener("focus", showDropdown);
  quickVin.addEventListener("click", showDropdown);

  quickVin.addEventListener("input", (e) => {
    const rawValue = e.target.value;
    const value = rawValue.toUpperCase().trim();
    if (value.length > 0) {
      filterQuickSavedVehicles(value);
    } else {
      e.target.value = "";
      displayQuickSavedVehicles();
      clearQuickVehicleSelection();
    }
  });

  // Click outside to close dropdown (with slight delay to avoid race condition)
  document.addEventListener("click", (e) => {
    // Use setTimeout to ensure this runs after any click handlers on the input
    setTimeout(() => {
      if (!quickVin.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    }, 0);
  });
}

/**
 * Display saved vehicles in Quick Entry dropdown
 */
function displayQuickSavedVehicles() {
  const dropdown = document.getElementById("quick-saved-vehicles-dropdown");
  dropdown.innerHTML = "";

  if (savedVehicles.length === 0) {
    dropdown.innerHTML =
      '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No saved vehicles</div>';
    dropdown.style.display = "block";
    return;
  }

  savedVehicles.forEach((vehicle) => {
    const item = document.createElement("div");
    item.className = "saved-vehicle-item";

    item.innerHTML = `
      <div class="saved-vehicle-item__content" data-vehicle-id="${vehicle.id}">
        ${buildVehicleSummaryMarkup(vehicle)}
      </div>
      <button
        class="btn-add-to-garage"
        onclick="event.stopPropagation(); addSavedVehicleToGarage('${vehicle.id}')">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        <span>Add to My Garage</span>
      </button>
    `;

    // Click on content area to select vehicle
    const contentArea = item.querySelector('.saved-vehicle-item__content');
    contentArea.addEventListener("click", () => selectQuickSavedVehicle(vehicle));

    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

/**
 * Filter saved vehicles in Quick Entry mode
 */
function filterQuickSavedVehicles(searchTerm) {
  const dropdown = document.getElementById("quick-saved-vehicles-dropdown");
  const filtered = savedVehicles.filter(
    (v) =>
      (v.vin && v.vin.includes(searchTerm)) ||
      (v.make && v.make.toUpperCase().includes(searchTerm)) ||
      (v.model && v.model.toUpperCase().includes(searchTerm)) ||
      (v.year && String(v.year).includes(searchTerm))
  );

  dropdown.innerHTML = "";

  if (filtered.length === 0) {
    dropdown.innerHTML =
      '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No matches found</div>';
    dropdown.style.display = "block";
    return;
  }

  filtered.forEach((vehicle) => {
    const item = document.createElement("div");
    item.className = "saved-vehicle-item";

    item.innerHTML = `
      <div class="saved-vehicle-item__content" data-vehicle-id="${vehicle.id}">
        ${buildVehicleSummaryMarkup(vehicle)}
      </div>
      <button
        class="btn-add-to-garage"
        onclick="event.stopPropagation(); addSavedVehicleToGarage('${vehicle.id}')">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        <span>Add to My Garage</span>
      </button>
    `;

    // Click on content area to select vehicle
    const contentArea = item.querySelector('.saved-vehicle-item__content');
    contentArea.addEventListener("click", () => selectQuickSavedVehicle(vehicle));

    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

/**
 * Select saved vehicle in Quick Entry mode
 */
async function selectQuickSavedVehicle(vehicle) {
  const quickVin = document.getElementById("quick-vin");
  const dropdown = document.getElementById("quick-saved-vehicles-dropdown");

  quickVin.value = vehicle.vin || "";
  dropdown.style.display = "none";

  // Ensure sale condition is set correctly based on year (back-compat: also set legacy condition)
  if (!vehicle.saleCondition && (!vehicle.condition || vehicle.condition === "")) {
    const currentYear = new Date().getFullYear();
    const inferred = parseInt(vehicle.year) >= currentYear ? "new" : "used";
    vehicle.saleCondition = inferred;
    vehicle.condition = vehicle.condition || inferred;
  }

  // Update selected vehicle globally
  selectedVehicle = vehicle;

  // Also update wizardData.vehicle to ensure sale condition + grade are synced
  wizardData.vehicle = {
    ...vehicle,
    saleCondition: vehicle.saleCondition || vehicle.condition || "new",
    conditionGrade: vehicle.conditionGrade || vehicle.condition_grade || (VEHICLE_GRADE_VALUES.has(String(vehicle.condition).toLowerCase()) ? vehicle.condition : undefined),
  };

  // Update vehicle card display
  displayQuickVehicleCard(vehicle);

  // Auto-populate vehicle price if available
  const askingPriceRaw =
    vehicle.asking_price ??
    vehicle.price ??
    vehicle.estimated_value ??
    vehicle.msrp ??
    null;
  const askingPrice =
    typeof askingPriceRaw === "string"
      ? parseFloat(askingPriceRaw.replace(/[^0-9.-]/g, ""))
      : Number(askingPriceRaw);
  if (Number.isFinite(askingPrice) && askingPrice > 0) {
    const quickVehiclePrice = document.getElementById("quick-vehicle-price");
    if (quickVehiclePrice) {
      quickVehiclePrice.value = formatCurrency(askingPrice);
    }

    // Update wizard data
    wizardData.financing = wizardData.financing || {};
    wizardData.financing.salePrice = askingPrice;
  }

  // Set preferred down payment now that a vehicle is active
  await setPreferredDownPayment();

  // Update sliders to match the new vehicle price
  updateQuickSliderValues();

  // Reset original values for diff indicators (new baseline)
  resetOriginalMonthlyPayment();

  // Reset financing controls to defaults when switching vehicles
  const termDropdown = document.getElementById('quick-loan-term');
  if (termDropdown) {
    termDropdown.value = '72'; // Reset to default 72 months
  }

  // Reset custom APR override when vehicle changes
  customAprOverride = null;

  // Reset financing term in wizardData to default
  if (wizardData.financing) {
    wizardData.financing.term = 72;
  }

  // Reset tooltip original values
  if (window.resetAprTooltipOriginal) window.resetAprTooltipOriginal();
  if (window.resetTermTooltipOriginal) window.resetTermTooltipOriginal();
  if (window.resetMonthlyFCTooltipOriginal)
    window.resetMonthlyFCTooltipOriginal();
  if (window.resetTilBaselines) window.resetTilBaselines();

  // Trigger calculation to update monthly payment
  await autoCalculateQuick();

  // Background VIN verification (non-blocking)
  if (vehicle.vin) {
    verifyVehicleVin(vehicle.vin, vehicle, 'saved').catch(err => {
      console.error('[vin-sync] Background verification failed:', err);
    });
  }
}

/**
 * Display vehicle card in Quick Entry mode
 */
function displayQuickVehicleCard(vehicle) {
  const display = document.getElementById("quick-vehicle-display");
  const card = document.getElementById("quick-vehicle-card");

  if (!display || !card) {
    return;
  }

  if (card) {
    card.classList.add("your-vehicle-card--quick");
  }

  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);
  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(
    vehicle.make || ""
  )} ${capitalizeWords(cleanedModel || "")}${
    vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ""
  }`;

  const imageContent = vehicle.photo_url
    ? `<img src="${vehicle.photo_url}" alt="${vehicleDetailsText}" class="your-vehicle-card__image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="your-vehicle-card__image-placeholder" style="display: none;">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>`
    : `<div class="your-vehicle-card__image-placeholder">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>`;

  // Get user location coordinates
  const userLat = wizardData.location?.lat;
  const userLon = wizardData.location?.lng;

  // Initial card render without distance (will be updated after API call)
  card.innerHTML = `
    <div class="your-vehicle-card__badge">Selected Vehicle</div>
    <div class="your-vehicle-card__layout">
      <div class="your-vehicle-card__media">
        ${imageContent}
      </div>
      <div class="your-vehicle-card__body">
        <div class="your-vehicle-card__title-row">
          <div class="your-vehicle-card__title">${vehicleDetailsText}</div>
          ${
            vehicle.asking_price
              ? `<div class="your-vehicle-card__price">${formatCurrency(
                  vehicle.asking_price
                )}</div>`
              : ""
          }
        </div>
        <div class="your-vehicle-card__meta-grid">
          ${
            vehicle.vin
              ? `
            <div class="your-vehicle-card__info-card">
              <span class="your-vehicle-card__info-label">VIN</span>
              <span class="your-vehicle-card__info-value your-vehicle-card__info-value--mono">${formatVIN(
                vehicle.vin
              )}</span>
            </div>
          `
              : ""
          }
          ${
            vehicle.mileage
              ? `
            <div class="your-vehicle-card__info-card">
              <span class="your-vehicle-card__info-label">Mileage</span>
              <span class="your-vehicle-card__info-value">${formatMileage(
                vehicle.mileage
              )} miles</span>
            </div>
          `
              : ""
          }
          <div class="your-vehicle-card__info-card your-vehicle-card__info-card--distance" id="vehicle-distance-info">
            <span class="your-vehicle-card__info-label">Distance to Dealer</span>
            <span class="your-vehicle-card__info-value your-vehicle-card__info-value--placeholder">Add your location</span>
          </div>
        </div>
      </div>
    </div>
  `;

  display.style.display = "block";

  // Get driving distance and display map if we have valid coordinates
  if (
    userLat &&
    userLon &&
    vehicle.dealer_lat &&
    vehicle.dealer_lng &&
    typeof vehicle.dealer_lat === "number" &&
    typeof vehicle.dealer_lng === "number"
  ) {
    const dealerName = vehicle.dealer_name || "Dealer";

    // Get driving distance from Google Distance Matrix API
    getDrivingDistance(userLat, userLon, vehicle.dealer_lat, vehicle.dealer_lng)
      .then((distanceData) => {
        if (distanceData) {
          const distanceInfoEl = document.getElementById(
            "vehicle-distance-info"
          );
          if (distanceInfoEl) {
            const valueEl = distanceInfoEl.querySelector(
              ".your-vehicle-card__info-value"
            );
            if (valueEl) {
              valueEl.innerHTML = `
                <span class="your-vehicle-card__distance-chip">
                  <span class="your-vehicle-card__distance-icon">📍</span>
                  <span class="your-vehicle-card__distance-miles">${distanceData.distance}</span>
                  <span class="your-vehicle-card__distance-separator"></span>
                  <span class="your-vehicle-card__distance-time">${distanceData.duration}</span>
                </span>
              `;
              valueEl.classList.remove(
                "your-vehicle-card__info-value--placeholder"
              );
            } else {
              distanceInfoEl.innerHTML = `
                <span class="your-vehicle-card__info-label">Distance to Dealer</span>
                <span class="your-vehicle-card__info-value">
                  <span class="your-vehicle-card__distance-chip">
                    <span class="your-vehicle-card__distance-icon">📍</span>
                    <span class="your-vehicle-card__distance-miles">${distanceData.distance}</span>
                    <span class="your-vehicle-card__distance-separator"></span>
                    <span class="your-vehicle-card__distance-time">${distanceData.duration}</span>
                  </span>
                </span>
              `;
            }
          }
        }
      })
      .catch((error) => {
      });

    // Display map with route
    displayDealerMapWithRoute(
      userLat,
      userLon,
      vehicle.dealer_lat,
      vehicle.dealer_lng,
      dealerName
    ).catch((error) => {
    });
  } else {
    const distanceInfoEl = document.getElementById("vehicle-distance-info");
    if (distanceInfoEl) {
      const valueEl = distanceInfoEl.querySelector(
        ".your-vehicle-card__info-value"
      );
      if (valueEl) {
        valueEl.textContent =
          userLat && userLon
            ? "Dealer location unavailable"
            : "Add your location";
        valueEl.classList.add("your-vehicle-card__info-value--placeholder");
      }
    }
    hideDealerMap();
  }
}

function hideQuickVehicleCard() {
  const display = document.getElementById("quick-vehicle-display");
  const card = document.getElementById("quick-vehicle-card");
  if (display) display.style.display = "none";
  if (card) card.innerHTML = "";
  const mapContainer = document.getElementById("quick-dealer-map-container");
  if (mapContainer) mapContainer.style.display = "none";
  const mapCanvas = document.getElementById("quick-dealer-map");
  if (mapCanvas) mapCanvas.innerHTML = "";
}

function clearQuickVehicleSelection() {
  selectedVehicle = null;
  wizardData.vehicle = null;
  wizardData.financing = wizardData.financing || {};
  wizardData.financing.salePrice = 0;

  if (sliderPolarityMap?.salePrice?.setValue) {
    sliderPolarityMap.salePrice.setValue(0);
  }

  const bindings = window.quickSliderBindings || {};
  const saleBinding = bindings.salePrice;
  if (saleBinding?.setBaseline) {
    saleBinding.setBaseline(0, { updateWizard: true });
  } else {
    const saleSlider = document.getElementById("quickSliderSalePrice");
    if (saleSlider) {
      saleSlider.value = 0;
      updateSliderProgress(saleSlider);
      saleSlider.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const saleInput = document.getElementById("quickInputSalePrice");
    if (saleInput) {
      saleInput.value = formatCurrency(0, true, { showCents: true });
    }
  }

  const hiddenPrice = document.getElementById("quick-vehicle-price");
  if (hiddenPrice) hiddenPrice.value = "";

  hideQuickVehicleCard();
  resetQuickCalculationDisplay();
  autoCalculateQuick().catch(() => {});
}

/**
 * Setup location autocomplete for Quick Entry mode
 */
function setupQuickLocationAutocomplete() {
  const quickLocation = document.getElementById("quick-location");
  if (!quickLocation) {
    return false;
  }

  if (!googleMapsLoaded || !window.google?.maps?.places) {
    return false;
  }

  if (quickLocationAutocomplete) {
    google.maps.event.clearInstanceListeners(quickLocationAutocomplete);
  }

  quickLocationAutocomplete = new google.maps.places.Autocomplete(
    quickLocation,
    {
      types: ["geocode"],
      componentRestrictions: { country: "us" },
    }
  );

  quickLocationAutocomplete.addListener("place_changed", async () => {
    const place = quickLocationAutocomplete?.getPlace();
    if (!place?.geometry) return;

    const zip = extractZipFromPlace(place) || "";
    const locale = extractLocaleFromComponents(place.address_components ?? []);

    const lat =
      typeof place.geometry.location?.lat === "function"
        ? place.geometry.location.lat()
        : place.geometry.location?.lat ?? null;
    const lng =
      typeof place.geometry.location?.lng === "function"
        ? place.geometry.location.lng()
        : place.geometry.location?.lng ?? null;

    wizardData.location = {
      ...wizardData.location,
      formatted_address: place.formatted_address ?? zip ?? "",
      address: place.formatted_address ?? zip ?? "",
      zip,
      lat,
      lng,
      stateCode: locale.stateCode,
      countyName: locale.countyName,
    };

    quickLocation.value = place.formatted_address ?? zip ?? "";

    const wizardLocationInput = document.getElementById("user-location");
    if (wizardLocationInput) {
      wizardLocationInput.value = place.formatted_address ?? zip ?? "";
      const hint = wizardLocationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using: ${zip || "your location"}`;
        hint.style.color = "var(--success)";
      }
    }

    applyLocaleToFees(locale);

    try {
      await populateYearDropdowns();
    } catch (error) {
      // Error refreshing year dropdowns
    }

    // If a vehicle is already selected, refresh the card to show map
    if (selectedVehicle) {
      displayQuickVehicleCard(selectedVehicle);
    }

    autoCalculateQuick().catch((error) => {
      // Error recalculating
    });
  });

  return true;
}

function setupQuickLocationManualFallback() {
  if (quickLocationManualHandlerAttached) return;
  const quickLocation = document.getElementById("quick-location");
  if (!quickLocation) return;

  quickLocationManualHandlerAttached = true;
  quickLocation.addEventListener("input", async (event) => {
    const value = event.target.value.trim();
    if (!/^\d{5}$/.test(value)) return;

    wizardData.location = {
      ...wizardData.location,
      zip: value,
      formatted_address: value,
      address: value,
    };

    const wizardLocationInput = document.getElementById("user-location");
    if (wizardLocationInput) {
      wizardLocationInput.value = value;
      const hint = wizardLocationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using ZIP: ${value}`;
        hint.style.color = "var(--success)";
      }
    }

    if (google?.maps?.Geocoder) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: value }, (results, status) => {
        if (status === "OK" && results?.length) {
          const components = results[0].address_components ?? [];
          const locale = extractLocaleFromComponents(components);

          // Extract lat/lng from geometry
          const location = results[0].geometry?.location;
          const lat =
            typeof location?.lat === "function"
              ? location.lat()
              : location?.lat ?? null;
          const lng =
            typeof location?.lng === "function"
              ? location.lng()
              : location?.lng ?? null;

          wizardData.location = {
            ...wizardData.location,
            lat,
            lng,
            stateCode: locale.stateCode,
            countyName: locale.countyName,
          };
          applyLocaleToFees(locale);

          // If a vehicle is already selected, update the display to show map
          if (selectedVehicle) {
            displayQuickVehicleCard(selectedVehicle);
          }
        }
      });
    }

    try {
      await populateYearDropdowns();
    } catch (error) {
      // Error refreshing year dropdowns
    }

    autoCalculateQuick().catch((error) => {
      // Error recalculating
    });
  });
}

/**
 * Get driving distance and time using Google Distance Matrix API
 * @param {number} originLat - Origin latitude
 * @param {number} originLon - Origin longitude
 * @param {number} destLat - Destination latitude
 * @param {number} destLon - Destination longitude
 * @returns {Promise<{distance: string, duration: string, distanceMiles: number}|null>}
 */
async function getDrivingDistance(originLat, originLon, destLat, destLon) {
  if (!window.google?.maps?.DistanceMatrixService) {
    return null;
  }

  try {
    const service = new google.maps.DistanceMatrixService();
    const request = {
      origins: [new google.maps.LatLng(originLat, originLon)],
      destinations: [new google.maps.LatLng(destLat, destLon)],
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    };

    return new Promise((resolve) => {
      service.getDistanceMatrix(request, (response, status) => {
        if (
          status === "OK" &&
          response?.rows?.[0]?.elements?.[0]?.status === "OK"
        ) {
          const element = response.rows[0].elements[0];
          resolve({
            distance: element.distance.text, // e.g., "10.5 mi"
            duration: element.duration.text, // e.g., "15 mins"
            distanceMiles: element.distance.value / 1609.34, // Convert meters to miles
          });
        } else {
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error("[distance-api] Error getting distance:", error);
    return null;
  }
}

/**
 * Display dealer map with driving route from user location to dealer
 * @param {number} originLat - User's latitude
 * @param {number} originLon - User's longitude
 * @param {number} destLat - Dealer's latitude
 * @param {number} destLon - Dealer's longitude
 * @param {string} dealerName - Dealer's name for marker label
 */
async function displayDealerMapWithRoute(
  originLat,
  originLon,
  destLat,
  destLon,
  dealerName = "Dealer"
) {
  const mapContainer = document.getElementById("quick-dealer-map-container");
  const mapElement = document.getElementById("quick-dealer-map");

  if (!mapContainer || !mapElement) {
    return;
  }

  if (!window.google?.maps) {
    mapContainer.style.display = "none";
    return;
  }

  try {
    // Show the map container
    mapContainer.style.display = "block";

    // Initialize map centered between origin and destination
    const centerLat = (originLat + destLat) / 2;
    const centerLon = (originLon + destLon) / 2;

    if (!dealerMap) {
      dealerMap = new google.maps.Map(mapElement, {
        center: { lat: centerLat, lng: centerLon },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
    }

    // Initialize directions service and renderer
    if (!directionsService) {
      directionsService = new google.maps.DirectionsService();
    }

    if (directionsRenderer) {
      directionsRenderer.setMap(null);
    }

    directionsRenderer = new google.maps.DirectionsRenderer({
      map: dealerMap,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: "#4F46E5",
        strokeWeight: 5,
        strokeOpacity: 0.8,
      },
    });

    // Request directions
    const request = {
      origin: new google.maps.LatLng(originLat, originLon),
      destination: new google.maps.LatLng(destLat, destLon),
      travelMode: google.maps.TravelMode.DRIVING,
    };

    directionsService.route(request, (result, status) => {
      if (status === "OK" && result) {
        directionsRenderer.setDirections(result);
      } else {
        console.error("[dealer-map] Directions request failed:", status);

        // Fall back to showing markers without route
        dealerMap.setCenter({ lat: centerLat, lng: centerLon });

        // Add origin marker
        new google.maps.Marker({
          position: { lat: originLat, lng: originLon },
          map: dealerMap,
          title: "Your Location",
          label: "A",
        });

        // Add destination marker
        new google.maps.Marker({
          position: { lat: destLat, lng: destLon },
          map: dealerMap,
          title: dealerName,
          label: "B",
        });
      }
    });
  } catch (error) {
    console.error("[dealer-map] Error displaying map:", error);
  }
}

/**
 * Hide the dealer map
 */
function hideDealerMap() {
  const mapContainer = document.getElementById("quick-dealer-map-container");
  if (mapContainer) {
    mapContainer.style.display = "none";
  }

  // Clean up directions renderer
  if (directionsRenderer) {
    directionsRenderer.setMap(null);
  }
}

/**
 * Setup auto-calculation for Quick Entry mode
 */
function setupQuickAutoCalculation() {
  // Currency formatting inputs with slider sync
  const inputSliderMap = [
    { inputId: "quick-vehicle-price", sliderId: "quickSliderSalePrice" },
    { inputId: "quick-down-payment", sliderId: "quickSliderCashDown" },
  ];

  inputSliderMap.forEach(({ inputId, sliderId }) => {
    const element = document.getElementById(inputId);
    const slider = document.getElementById(sliderId);
    if (element) {
      // Format on blur and sync to slider
      element.addEventListener("blur", (e) => {
        const rawValue = e.target.value.replace(/[^0-9.-]/g, "");
        const numValue = parseFloat(rawValue);
        if (!isNaN(numValue) && numValue > 0) {
          e.target.value = formatCurrency(numValue);
          // Sync to slider and update original values
          if (slider && window.sliderOriginalValues) {
            const bindingField =
              slider.dataset.field || sliderIdLookup[sliderId] || null;
            const binding =
              bindingField && window.quickSliderBindings
                ? window.quickSliderBindings[bindingField]
                : null;

            if (binding) {
              binding.setValue(numValue, {
                triggerThrottle: false,
                updateWizard: true,
              });
            } else {
              const visualValue = convertActualToVisual(slider, numValue);
              slider.value = visualValue;
              updateSliderProgress(slider);
            }
            window.sliderOriginalValues[sliderId] = numValue;
          }
        } else if (numValue === 0) {
          e.target.value = formatCurrency(0);
          if (slider && window.sliderOriginalValues) {
            const bindingField =
              slider.dataset.field || sliderIdLookup[sliderId] || null;
            const binding =
              bindingField && window.quickSliderBindings
                ? window.quickSliderBindings[bindingField]
                : null;

            if (binding) {
              binding.setValue(0, {
                triggerThrottle: false,
                updateWizard: true,
              });
            } else {
              const visualValue = convertActualToVisual(slider, 0);
              slider.value = visualValue;
              updateSliderProgress(slider);
            }
            window.sliderOriginalValues[sliderId] = 0;
          }
        }
        autoCalculateQuick();
      });

      // Auto-calculate on change
      element.addEventListener("change", () => autoCalculateQuick());
    }
  });

  // Non-currency inputs (dropdowns)
  const selectInputs = ["quick-loan-term", "quick-credit-score"];
  selectInputs.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("change", () => autoCalculateQuick());
    }
  });

  // Trade-in checkbox
  // APR editing controls
  setupAprEditing();

  // Term editing controls
  setupTermEditing();

  // Monthly finance charge tooltip
  setupMonthlyFinanceChargeTooltip();
}

/**
 * Setup APR editing functionality in TIL section
 */
function setupAprEditing() {
  const aprValue = document.getElementById("quickTilAPR");
  const aprArrowLeft = document.getElementById("aprArrowLeft");
  const aprArrowRight = document.getElementById("aprArrowRight");

  if (!aprValue || !aprArrowLeft || !aprArrowRight) {
    return;
  }

  // Setup tooltip first and get the update function
  let updateTooltip = null;

  // Parse APR from display text (e.g., "5.49%" -> 0.0549)
  const parseAprFromDisplay = (text) => {
    const match = text.match(/([\d.]+)%/);
    if (match) {
      return parseFloat(match[1]) / 100;
    }
    return null;
  };

  // Format APR for display (e.g., 0.0549 -> "5.49%")
  const formatAprForDisplay = (aprDecimal) => {
    return (aprDecimal * 100).toFixed(2) + "%";
  };

  // Get current APR value
  const getCurrentApr = () => {
    const displayText = aprValue.textContent;
    return parseAprFromDisplay(displayText);
  };

  // Update APR and trigger recalculation
  const updateApr = async (newAprDecimal) => {
    // Clamp to reasonable range (0.01% to 30%)
    newAprDecimal = Math.max(0.0001, Math.min(0.3, newAprDecimal));

    // Store the custom APR override
    customAprOverride = newAprDecimal;

    // Update display immediately
    aprValue.textContent = formatAprForDisplay(newAprDecimal);

    // Trigger recalculation
    await autoCalculateQuick();

    // Update tooltip if it's visible (real-time update)
    if (updateTooltip) {
      updateTooltip();
    }
  };

  // Guard: Check if sale price has been entered
  const canAdjustFinancing = () => {
    const salePrice = wizardData.financing?.salePrice || 0;
    return salePrice > 0;
  };

  // Increment APR by 0.01%
  const incrementApr = async () => {
    if (!canAdjustFinancing()) {
      // Show visual feedback that control is disabled
      aprValue.style.animation = 'shake 0.3s';
      setTimeout(() => { aprValue.style.animation = ''; }, 300);
      return;
    }
    const currentApr = getCurrentApr();
    if (currentApr !== null) {
      await updateApr(currentApr + 0.0001); // +0.01%
    }
  };

  // Decrement APR by 0.01%
  const decrementApr = async () => {
    if (!canAdjustFinancing()) {
      // Show visual feedback that control is disabled
      aprValue.style.animation = 'shake 0.3s';
      setTimeout(() => { aprValue.style.animation = ''; }, 300);
      return;
    }
    const currentApr = getCurrentApr();
    if (currentApr !== null) {
      await updateApr(currentApr - 0.0001); // -0.01%
    }
  };

  // Click handlers for arrow buttons
  aprArrowLeft.addEventListener("click", async (e) => {
    e.preventDefault();
    await decrementApr();
  });

  aprArrowRight.addEventListener("click", async (e) => {
    e.preventDefault();
    await incrementApr();
  });

  // Click-and-hold for continuous adjustment
  let holdInterval = null;
  let holdTimeout = null;

  const startHold = (callback) => {
    callback(); // Immediate first action
    holdTimeout = setTimeout(() => {
      holdInterval = setInterval(callback, 100); // Repeat every 100ms
    }, 300); // Start repeating after 300ms hold
  };

  const stopHold = () => {
    if (holdTimeout) clearTimeout(holdTimeout);
    if (holdInterval) clearInterval(holdInterval);
    holdTimeout = null;
    holdInterval = null;
  };

  aprArrowLeft.addEventListener("mousedown", () => startHold(decrementApr));
  aprArrowLeft.addEventListener("mouseup", stopHold);
  aprArrowLeft.addEventListener("mouseleave", stopHold);

  aprArrowRight.addEventListener("mousedown", () => startHold(incrementApr));
  aprArrowRight.addEventListener("mouseup", stopHold);
  aprArrowRight.addEventListener("mouseleave", stopHold);

  // Keyboard support on arrow buttons themselves
  aprArrowLeft.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      await decrementApr();
    }
  });

  aprArrowRight.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      await incrementApr();
    }
  });

  // Keyboard arrow support when APR value is focused
  aprValue.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      await decrementApr();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      await incrementApr();
    }
  });

  // Enable keyboard control on hover/focus without click
  const valueWrapper = aprValue.closest(".quick-til-value-wrapper");
  let hoverKeyboardActive = false;

  const handleHoverKey = async (e) => {
    if (
      !hoverKeyboardActive ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      return;
    }

    // Only respond when the user is interacting with the APR controls
    const wrapperHovered = valueWrapper?.matches(":hover");
    const wrapperFocused =
      valueWrapper && valueWrapper.contains(document.activeElement);
    if (!wrapperHovered && !wrapperFocused) return;

    // Arrow buttons already handle their own keyboard events
    if (e.target === aprArrowLeft || e.target === aprArrowRight) return;

    e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      await decrementApr();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      await incrementApr();
    }
  };

  const activateHoverKeyboard = () => {
    if (hoverKeyboardActive) return;
    hoverKeyboardActive = true;
    document.addEventListener("keydown", handleHoverKey);
  };

  const deactivateHoverKeyboard = () => {
    if (!hoverKeyboardActive) return;
    hoverKeyboardActive = false;
    document.removeEventListener("keydown", handleHoverKey);
  };

  if (valueWrapper) {
    valueWrapper.addEventListener("mouseenter", activateHoverKeyboard);
    valueWrapper.addEventListener("mouseleave", () => {
      if (!valueWrapper.contains(document.activeElement)) {
        deactivateHoverKeyboard();
      }
    });
  }

  [aprValue, aprArrowLeft, aprArrowRight].forEach((el) => {
    el.addEventListener("focus", activateHoverKeyboard);
    el.addEventListener("blur", () => {
      setTimeout(() => {
        if (
          valueWrapper &&
          !valueWrapper.matches(":hover") &&
          !valueWrapper.contains(document.activeElement)
        ) {
          deactivateHoverKeyboard();
        }
      }, 0);
    });
  });

  // Visual feedback on hover
  aprValue.addEventListener("mouseenter", () => {
    aprValue.style.cursor = "pointer";
  });

  // APR Tooltip functionality - assign to updateTooltip for real-time updates
  updateTooltip = setupAprTooltip(aprValue);
}

/**
 * Setup APR tooltip to show payment impact on hover
 */
function setupAprTooltip(aprValue) {
  const tooltip = document.getElementById("aprTooltip");
  const tooltipPayment = document.getElementById("aprTooltipPayment");
  const tooltipDiff = document.getElementById("aprTooltipDiff");
  const valueWrapper = aprValue.closest(".quick-til-value-wrapper");

  if (!tooltip || !tooltipPayment || !tooltipDiff || !valueWrapper) {
    return () => {}; // Return empty function
  }

  // Store original payment for comparison (set when first calculated)
  let originalPayment = null;
  let isTooltipVisible = false;

  // Show tooltip on hover
  const showTooltip = () => {
    const currentPayment = calculateCurrentMonthlyPayment();

    if (currentPayment === null || currentPayment === 0) {
      return; // Don't show tooltip if no payment calculated yet
    }

    // Set original payment if not set yet
    if (originalPayment === null) {
      originalPayment = currentPayment;
    }

    // Update payment display
    tooltipPayment.textContent = formatCurrency(currentPayment) + "/mo";

    // Calculate difference from original
    const diff = currentPayment - originalPayment;

    // Format difference with buyer-centric color
    if (Math.abs(diff) < 1) {
      tooltipDiff.textContent = "No change";
      tooltipDiff.className = "apr-tooltip__diff neutral";
    } else {
      // Format as +/- (human readable) instead of accounting format
      const sign = diff > 0 ? "+" : "-";
      const absDiff = Math.abs(diff);
      const formattedDiff = absDiff.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      tooltipDiff.textContent = `${sign}$${formattedDiff}/mo`;
      // Buyer-centric: lower payment = positive (green), higher = negative (red)
      tooltipDiff.className =
        diff > 0 ? "apr-tooltip__diff negative" : "apr-tooltip__diff positive";
    }

    tooltip.style.display = "block";
    isTooltipVisible = true;

  };

  // Hide tooltip
  const hideTooltip = () => {
    tooltip.style.display = "none";
    isTooltipVisible = false;

  };

  // Add hover listeners to the entire wrapper (includes arrows and value)
  valueWrapper.addEventListener("mouseenter", showTooltip);
  valueWrapper.addEventListener("mouseleave", hideTooltip);

  // Reset original values when vehicle or major values change
  window.resetAprTooltipOriginal = () => {
    originalPayment = null;
  };

  // Return function to update tooltip if it's visible
  return () => {
    if (isTooltipVisible) {
      showTooltip();
    }
  };
}

/**
 * Setup Term editing functionality in TIL section
 */
function setupTermEditing() {
  const termValue = document.getElementById("quickTilTerm");
  const termArrowLeft = document.getElementById("termArrowLeft");
  const termArrowRight = document.getElementById("termArrowRight");

  if (!termValue || !termArrowLeft || !termArrowRight) {
    return;
  }

  // Setup tooltip first and get the update function
  let updateTooltip = null;

  // Get current term value
  const getCurrentTerm = () => {
    const text = termValue.textContent.trim();
    return parseInt(text) || 0;
  };

  // Update term and trigger recalculation
  const updateTerm = async (newTerm) => {
    // Clamp to reasonable range (12 to 84 months)
    newTerm = Math.max(12, Math.min(84, newTerm));

    // Update display immediately
    termValue.textContent = newTerm.toString();

    // Update wizard data
    if (wizardData.financing) {
      wizardData.financing.term = newTerm;
    }

    // Update the dropdown as well
    const termDropdown = document.getElementById("quick-loan-term");
    if (termDropdown) {
      termDropdown.value = newTerm.toString();
    }

    // Trigger recalculation
    await autoCalculateQuick();

    // Update tooltip if it's visible (real-time update)
    if (updateTooltip) {
      updateTooltip();
    }
  };

  // Guard: Check if sale price has been entered
  const canAdjustFinancing = () => {
    const salePrice = wizardData.financing?.salePrice || 0;
    return salePrice > 0;
  };

  // Increment term by 6 months
  const incrementTerm = async () => {
    if (!canAdjustFinancing()) {
      // Show visual feedback that control is disabled
      termValue.style.animation = 'shake 0.3s';
      setTimeout(() => { termValue.style.animation = ''; }, 300);
      return;
    }
    const currentTerm = getCurrentTerm();
    if (currentTerm > 0) {
      await updateTerm(currentTerm + 6);
    }
  };

  // Decrement term by 6 months
  const decrementTerm = async () => {
    if (!canAdjustFinancing()) {
      // Show visual feedback that control is disabled
      termValue.style.animation = 'shake 0.3s';
      setTimeout(() => { termValue.style.animation = ''; }, 300);
      return;
    }
    const currentTerm = getCurrentTerm();
    if (currentTerm > 0) {
      await updateTerm(currentTerm - 6);
    }
  };

  // Click handlers for arrow buttons
  termArrowLeft.addEventListener("click", async (e) => {
    e.preventDefault();
    await decrementTerm();
  });

  termArrowRight.addEventListener("click", async (e) => {
    e.preventDefault();
    await incrementTerm();
  });

  // Click-and-hold for continuous adjustment
  let termHoldInterval = null;
  let termHoldTimeout = null;

  const startTermHold = (callback) => {
    callback(); // Immediate first action
    termHoldTimeout = setTimeout(() => {
      termHoldInterval = setInterval(callback, 100); // Repeat every 100ms
    }, 300); // Start repeating after 300ms hold
  };

  const stopTermHold = () => {
    if (termHoldTimeout) clearTimeout(termHoldTimeout);
    if (termHoldInterval) clearInterval(termHoldInterval);
    termHoldTimeout = null;
    termHoldInterval = null;
  };

  termArrowLeft.addEventListener("mousedown", () => startTermHold(decrementTerm));
  termArrowLeft.addEventListener("mouseup", stopTermHold);
  termArrowLeft.addEventListener("mouseleave", stopTermHold);

  termArrowRight.addEventListener("mousedown", () => startTermHold(incrementTerm));
  termArrowRight.addEventListener("mouseup", stopTermHold);
  termArrowRight.addEventListener("mouseleave", stopTermHold);

  // Keyboard support on arrow buttons themselves
  termArrowLeft.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      await decrementTerm();
    }
  });

  termArrowRight.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      await incrementTerm();
    }
  });

  // Keyboard arrow support when term value is focused
  termValue.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      await decrementTerm();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      await incrementTerm();
    }
  });

  // Enable keyboard control on hover/focus without click
  const termWrapper = termValue.closest(".quick-til-value-wrapper");
  let termHoverKeyboardActive = false;

  const handleTermHoverKey = async (e) => {
    if (
      !termHoverKeyboardActive ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      return;
    }

    const wrapperHovered = termWrapper?.matches(":hover");
    const wrapperFocused =
      termWrapper && termWrapper.contains(document.activeElement);
    if (!wrapperHovered && !wrapperFocused) return;

    if (e.target === termArrowLeft || e.target === termArrowRight) return;

    e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      await decrementTerm();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      await incrementTerm();
    }
  };

  const activateTermHoverKeyboard = () => {
    if (termHoverKeyboardActive) return;
    termHoverKeyboardActive = true;
    document.addEventListener("keydown", handleTermHoverKey);
  };

  const deactivateTermHoverKeyboard = () => {
    if (!termHoverKeyboardActive) return;
    termHoverKeyboardActive = false;
    document.removeEventListener("keydown", handleTermHoverKey);
  };

  if (termWrapper) {
    termWrapper.addEventListener("mouseenter", activateTermHoverKeyboard);
    termWrapper.addEventListener("mouseleave", () => {
      if (!termWrapper.contains(document.activeElement)) {
        deactivateTermHoverKeyboard();
      }
    });
  }

  [termValue, termArrowLeft, termArrowRight].forEach((el) => {
    el.addEventListener("focus", activateTermHoverKeyboard);
    el.addEventListener("blur", () => {
      setTimeout(() => {
        if (
          termWrapper &&
          !termWrapper.matches(":hover") &&
          !termWrapper.contains(document.activeElement)
        ) {
          deactivateTermHoverKeyboard();
        }
      }, 0);
    });
  });

  // Visual feedback on hover
  termValue.addEventListener("mouseenter", () => {
    termValue.style.cursor = "pointer";
  });

  // Term Tooltip functionality - assign to updateTooltip for real-time updates
  updateTooltip = setupTermTooltip(termValue);
}

/**
 * Setup Term tooltip to show payment impact on hover
 */
function setupTermTooltip(termValue) {
  const tooltip = document.getElementById("termTooltip");
  const tooltipPayment = document.getElementById("termTooltipPayment");
  const tooltipDiff = document.getElementById("termTooltipDiff");
  const valueWrapper = termValue.closest(".quick-til-value-wrapper");

  if (!tooltip || !tooltipPayment || !tooltipDiff || !valueWrapper) {
    return () => {}; // Return empty function
  }

  // Store original payment for comparison (set when first calculated)
  let originalPayment = null;
  let isTooltipVisible = false;

  // Show tooltip on hover
  const showTooltip = () => {
    const currentPayment = calculateCurrentMonthlyPayment();

    if (currentPayment === null || currentPayment === 0) {
      return; // Don't show tooltip if no payment calculated yet
    }

    // Set original payment if not set yet
    if (originalPayment === null) {
      originalPayment = currentPayment;
    }

    // Update payment display
    tooltipPayment.textContent = formatCurrency(currentPayment) + "/mo";

    // Calculate difference from original
    const diff = currentPayment - originalPayment;

    // Format difference with buyer-centric color
    if (Math.abs(diff) < 1) {
      tooltipDiff.textContent = "No change";
      tooltipDiff.className = "apr-tooltip__diff neutral";
    } else {
      // Format as +/- (human readable)
      const sign = diff > 0 ? "+" : "";
      const formattedDiff = Math.abs(diff).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      tooltipDiff.textContent = `${sign}$${formattedDiff}/mo`;
      // Buyer-centric: lower payment = positive (green), higher = negative (red)
      tooltipDiff.className =
        diff > 0 ? "apr-tooltip__diff negative" : "apr-tooltip__diff positive";
    }

    tooltip.style.display = "block";
    isTooltipVisible = true;
  };

  // Hide tooltip
  const hideTooltip = () => {
    tooltip.style.display = "none";
    isTooltipVisible = false;
  };

  // Add hover listeners to the entire wrapper (includes arrows and value)
  valueWrapper.addEventListener("mouseenter", showTooltip);
  valueWrapper.addEventListener("mouseleave", hideTooltip);

  // Reset original payment when vehicle or major values change
  window.resetTermTooltipOriginal = () => {
    originalPayment = null;
  };

  // Return function to update tooltip if it's visible
  return () => {
    if (isTooltipVisible) {
      showTooltip();
    }
  };
}

/**
 * Setup Monthly Finance Charge tooltip
 */
function setupMonthlyFinanceChargeTooltip() {
  const monthlyFCValue = document.getElementById(
    "quickTilMonthlyFinanceCharge"
  );
  const tooltip = document.getElementById("monthlyFinanceChargeTooltip");
  const tooltipAmount = document.getElementById(
    "monthlyFinanceChargeTooltipAmount"
  );
  const tooltipDiff = document.getElementById(
    "monthlyFinanceChargeTooltipDiff"
  );

  if (!monthlyFCValue || !tooltip || !tooltipAmount || !tooltipDiff) {
    return;
  }

  // Store original monthly finance charge for comparison
  let originalMonthlyFC = null;
  let isTooltipVisible = false;

  // Show tooltip on hover
  const showTooltip = () => {
    const currentMonthlyFC = parseCurrency(monthlyFCValue.textContent) || 0;

    if (currentMonthlyFC === 0) {
      return; // Don't show tooltip if no value calculated yet
    }

    // Set original monthly FC if not set yet
    if (originalMonthlyFC === null) {
      originalMonthlyFC = currentMonthlyFC;
    }

    // Update amount display
    tooltipAmount.textContent = formatCurrency(currentMonthlyFC) + "/mo";

    // Calculate difference from original
    const diff = currentMonthlyFC - originalMonthlyFC;

    // Format difference with buyer-centric color
    if (Math.abs(diff) < 1) {
      tooltipDiff.textContent = "No change";
      tooltipDiff.className = "apr-tooltip__diff neutral";
    } else {
      // Format as +/- (human readable)
      const sign = diff > 0 ? "+" : "";
      const formattedDiff = Math.abs(diff).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      tooltipDiff.textContent = `${sign}$${formattedDiff}/mo`;
      // Buyer-centric: lower interest = positive (green), higher = negative (red)
      tooltipDiff.className =
        diff > 0 ? "apr-tooltip__diff negative" : "apr-tooltip__diff positive";
    }

    tooltip.style.display = "block";
    isTooltipVisible = true;
  };

  // Hide tooltip
  const hideTooltip = () => {
    tooltip.style.display = "none";
    isTooltipVisible = false;
  };

  // Add hover listeners to the monthly finance charge value
  monthlyFCValue.addEventListener("mouseenter", showTooltip);
  monthlyFCValue.addEventListener("mouseleave", hideTooltip);

  // Reset original when vehicle or major values change
  window.resetMonthlyFCTooltipOriginal = () => {
    originalMonthlyFC = null;
  };
}

/**
 * Auto-calculate and update Quick Entry display
 */
/**
 * Initialize baseline storage for TIL diffs
 */
if (!window.tilBaselines) {
  window.tilBaselines = {
    apr: null,
    term: null,
    financeCharge: null,
    amountFinanced: null,
    totalPayments: null,
    monthlyFinanceCharge: null,
  };
}

/**
 * Reset TIL diff baselines (called when vehicle changes or major reset)
 */
window.resetTilBaselines = () => {
  window.tilBaselines = {
    apr: null,
    term: null,
    financeCharge: null,
    amountFinanced: null,
    totalPayments: null,
    monthlyFinanceCharge: null,
  };
};

/**
 * Update TIL diff indicators - shows inline green/red notes with +/- amounts
 * Buyer-centric: Green = good (lower costs), Red = bad (higher costs)
 */
function updateTilDiffIndicators(reviewData, monthlyFinanceCharge) {
  if (!reviewData) return; // Safety check

  const baselines = window.tilBaselines;

  // Helper to update a single diff indicator
  const updateDiff = (
    elementId,
    currentValue,
    baselineKey,
    formatFn = (v) => v
  ) => {
    const diffEl = document.getElementById(elementId);
    if (!diffEl) return;

    // Set baseline if not yet set
    if (baselines[baselineKey] === null) {
      baselines[baselineKey] = currentValue;
    }

    const baseline = baselines[baselineKey];
    const diff = currentValue - baseline;

    // Only show if there's a meaningful change (>= $1 or >= 0.01% for APR/term)
    const threshold =
      baselineKey === "apr" ? 0.01 : baselineKey === "term" ? 1 : 1;
    if (Math.abs(diff) < threshold) {
      diffEl.style.display = "none";
      diffEl.textContent = "";
      diffEl.className = "quick-til-diff";
      return;
    }

    // Format the diff
    const absDiff = Math.abs(diff);
    const formattedDiff = formatFn(absDiff);
    const signSymbol = diff < 0 ? "-" : "+";
    diffEl.textContent = `${signSymbol}${formattedDiff}`;

    // Buyer-centric colors: lower costs/terms = green (positive), higher = red
    diffEl.className = `quick-til-diff ${diff < 0 ? "positive" : "negative"}`;
    diffEl.style.display = "block";
  };

  // Update APR and Term diffs (always show when changed)
  updateDiff("aprDiff", reviewData.apr, "apr", (v) => formatPercent(v));
  updateDiff(
    "termDiff",
    reviewData.term,
    "term",
    (v) => `${v} mo`
  );

  // FINANCE CHARGE DIFF LOGIC:
  // Only show finance charge diff when APR or Term has changed from baseline
  // Don't show when sale price changes - that's expected and not helpful
  const aprChanged = baselines.apr !== null && Math.abs(reviewData.apr - baselines.apr) >= 0.0001;
  const termChanged = baselines.term !== null && reviewData.term !== baselines.term;
  const shouldShowFinanceChargeDiff = aprChanged || termChanged;

  if (shouldShowFinanceChargeDiff) {
    // Show diffs for all finance-related values
    updateDiff(
      "financeChargeDiff",
      reviewData.financeCharge,
      "financeCharge",
      (v) => formatCurrency(v, true, { showCents: true })
    );
    updateDiff(
      "amountFinancedDiff",
      reviewData.amountFinanced,
      "amountFinanced",
      (v) => formatCurrency(v, true, { showCents: true })
    );
    updateDiff(
      "totalPaymentsDiff",
      reviewData.totalPayments,
      "totalPayments",
      (v) => formatCurrency(v, true, { showCents: true })
    );
    updateDiff(
      "monthlyFinanceChargeDiff",
      monthlyFinanceCharge,
      "monthlyFinanceCharge",
      (v) => formatCurrency(v, true, { showCents: true })
    );
  } else {
    // Set baselines but don't show diffs (baseline from first calculation)
    if (baselines.financeCharge === null) {
      baselines.financeCharge = reviewData.financeCharge;
    }
    if (baselines.amountFinanced === null) {
      baselines.amountFinanced = reviewData.amountFinanced;
    }
    if (baselines.totalPayments === null) {
      baselines.totalPayments = reviewData.totalPayments;
    }
    if (baselines.monthlyFinanceCharge === null) {
      baselines.monthlyFinanceCharge = monthlyFinanceCharge;
    }

    // Hide all finance diff indicators
    ["financeChargeDiff", "amountFinancedDiff", "totalPaymentsDiff", "monthlyFinanceChargeDiff"].forEach(id => {
      const diffEl = document.getElementById(id);
      if (diffEl) {
        diffEl.style.display = "none";
        diffEl.textContent = "";
        diffEl.className = "quick-til-diff";
      }
    });
  }
}

async function autoCalculateQuick() {
  // Gather all inputs
  const quickVehiclePrice = parseCurrency(
    document.getElementById("quick-vehicle-price")?.value
  );
  const quickDownPayment = parseCurrency(
    document.getElementById("quick-down-payment")?.value
  );
  const quickLoanTerm = parseInt(
    document.getElementById("quick-loan-term")?.value
  );
  let quickCreditScore = document.getElementById("quick-credit-score")?.value;

  // INSTRUMENTATION: Log all gathered values for debugging

  // FIX: If credit score is not set, use a default value from user profile or "excellent" (750+)
  if (!quickCreditScore) {
    // Try to get from wizardData, otherwise default to 'excellent' (750+)
    quickCreditScore = wizardData?.financing?.creditScoreRange || 'excellent';

    // Set it in the DOM so it shows up
    const creditScoreSelect = document.getElementById("quick-credit-score");
    if (creditScoreSelect) {
      creditScoreSelect.value = quickCreditScore;
    }
  }

  // Only calculate if we have the minimum required inputs
  if (
    !quickVehiclePrice ||
    quickVehiclePrice <= 0 ||
    !quickLoanTerm ||
    !quickCreditScore
  ) {
    resetQuickCalculationDisplay();
    return; // Silently return, don't show alerts
  }


  // Update wizard data
  wizardData.financing = {
    salePrice: quickVehiclePrice,
    cashDown: quickDownPayment || 0,
    term: quickLoanTerm,
    creditScoreRange: quickCreditScore,
  };

  // Update trade-in data
  const tradeAllowanceSlider = document.getElementById(
    "quickSliderTradeAllowance"
  );
  const tradePayoffSlider = document.getElementById("quickSliderTradePayoff");

  const existingTradein = wizardData.tradein || {};

  const resolveSliderValue = (sliderEl) => {
    if (!sliderEl) return null;
    const visual = parseFloat(sliderEl.value);
    if (!Number.isFinite(visual)) return null;
    return convertVisualToActual(sliderEl, visual);
  };

  let quickTradeValue = resolveSliderValue(tradeAllowanceSlider);
  if (quickTradeValue === null) {
    quickTradeValue = parseCurrencyToNumber(existingTradein.tradeValue);
  }

  let quickTradePayoff = resolveSliderValue(tradePayoffSlider);
  if (quickTradePayoff === null) {
    quickTradePayoff = parseCurrencyToNumber(existingTradein.tradePayoff);
  }

  const quickHasTradeIn = existingTradein.hasTradeIn ?? false;

  // Consider trade-in active if wizard state indicates one or any trade values are non-zero
  const hasActiveTradeIn =
    quickHasTradeIn || quickTradeValue > 0 || quickTradePayoff > 0;

  if (hasActiveTradeIn) {
    const normalizedValue = Math.max(quickTradeValue || 0, 0);
    const normalizedPayoff = Math.max(quickTradePayoff || 0, 0);

    wizardData.tradein = {
      ...existingTradein,
      hasTradeIn: true,
      tradeValue: normalizedValue,
      tradePayoff: normalizedPayoff,
    };

    if (
      wizardData.trade &&
      Array.isArray(wizardData.trade.vehicles) &&
      wizardData.trade.vehicles.length > 0
    ) {
      wizardData.trade.hasTradeIn = true;
      wizardData.trade.value = normalizedValue;
      wizardData.trade.payoff = normalizedPayoff;
    } else {
      wizardData.trade = {
        hasTradeIn: true,
        value: normalizedValue,
        payoff: normalizedPayoff,
      };
    }
  } else {
    wizardData.tradein = {
      ...existingTradein,
      hasTradeIn: false,
      tradeValue: 0,
      tradePayoff: 0,
    };

    if (
      wizardData.trade &&
      Array.isArray(wizardData.trade.vehicles) &&
      wizardData.trade.vehicles.length > 0
    ) {
      wizardData.trade.hasTradeIn = false;
      wizardData.trade.value = 0;
      wizardData.trade.payoff = 0;
    } else {
      wizardData.trade = null;
    }
  }

  try {
    // Calculate results
    const reviewData = await computeReviewData();

    // Display main results
    // PRECISION: Always show cents for monthly payment (critical financial display)
    setText("quickMonthlyPayment", formatCurrency(reviewData.monthlyPayment, true, { showCents: true }));
    setText("quickTerm", `${reviewData.term} months`);
    setText("quickAPR", formatPercent(reviewData.apr));

    // Display lender info in payment hero OR custom APR badge
    const lenderInfoEl = document.getElementById("quickLenderInfo");
    const lenderNameEl = document.getElementById("quickLenderName");
    const lenderDateEl = document.getElementById("quickLenderDate");
    const lenderDateSeparator = document.getElementById(
      "quickLenderDateSeparator"
    );
    const customAprBadge = document.getElementById("quickCustomAprBadge");

    // Check if using custom APR
    if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
      // Hide lender info, show custom APR badge
      if (lenderInfoEl) lenderInfoEl.style.display = "none";
      if (customAprBadge) customAprBadge.style.display = "flex";
    } else {
      // Hide custom APR badge, show lender info
      if (customAprBadge) customAprBadge.style.display = "none";

      if (lenderInfoEl && lenderNameEl && reviewData.lenderName) {
        lenderNameEl.textContent = reviewData.lenderName;

        if (lenderDateEl && reviewData.lenderEffectiveDate) {
          // Format date nicely (e.g., "2025-11-04" -> "Nov 4, 2025")
          try {
            const date = new Date(reviewData.lenderEffectiveDate);
            const formatted = date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            lenderDateEl.textContent = `Rates as of ${formatted}`;
          } catch {
            lenderDateEl.textContent = `Rates as of ${reviewData.lenderEffectiveDate}`;
          }
          if (lenderDateSeparator) lenderDateSeparator.style.display = "inline";
        } else {
          if (lenderDateEl) lenderDateEl.textContent = "";
          if (lenderDateSeparator) lenderDateSeparator.style.display = "none";
        }

        lenderInfoEl.style.display = "flex";
      } else if (lenderInfoEl) {
        lenderInfoEl.style.display = "none";
      }
    }

    // Display effective date inline under lender dropdown (hide if custom APR)
    const lenderEffectiveDateEl = document.getElementById(
      "lender-effective-date"
    );
    const lenderEffectiveDateValue = document.getElementById(
      "lender-effective-date-value"
    );

    if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
      // Hide effective date when using custom APR
      if (lenderEffectiveDateEl) lenderEffectiveDateEl.style.display = "none";
    } else if (
      lenderEffectiveDateEl &&
      lenderEffectiveDateValue &&
      reviewData.lenderEffectiveDate
    ) {
      lenderEffectiveDateValue.textContent = reviewData.lenderEffectiveDate;
      lenderEffectiveDateEl.style.display = "block";
    } else if (lenderEffectiveDateEl) {
      lenderEffectiveDateEl.style.display = "none";
    }

    // Display TIL cards
    setText("quickTilAPR", formatPercent(reviewData.apr));
    setText("quickTilFinanceCharge", formatCurrency(reviewData.financeCharge));
    setText(
      "quickTilAmountFinanced",
      formatCurrency(reviewData.amountFinanced)
    );
    setText("quickTilTotalPayments", formatCurrency(reviewData.totalPayments));
    setText("quickTilTerm", reviewData.term.toString());

    // Calculate and display Monthly Finance Charge (interest portion per month)
    const monthlyFinanceCharge =
      reviewData.term > 0 ? reviewData.financeCharge / reviewData.term : 0;
    // PRECISION: Always show cents for finance charge (critical financial display)
    setText(
      "quickTilMonthlyFinanceCharge",
      formatCurrency(monthlyFinanceCharge, true, { showCents: true })
    );

    // Update TIL diff indicators
    updateTilDiffIndicators(reviewData, monthlyFinanceCharge);

    // Display calculation breakdown values (read-only mirrors of slider values)
    // PRECISION: Show exact values with cents in itemization
    setText("quickCalcSalePrice", formatCurrency(reviewData.salePrice, true, { showCents: true }));
    setText("quickCalcCashDown", formatCurrency(reviewData.cashDown, true, { showCents: true }));
    setText("quickCalcTradeAllowance", formatCurrency(reviewData.tradeOffer, true, { showCents: true }));
    setText("quickCalcTradePayoff", formatCurrency(reviewData.tradePayoff, true, { showCents: true }));
    setText("quickCalcDealerFees", formatCurrency(reviewData.totalDealerFees, true, { showCents: true }));
    setText(
      "quickCalcCustomerAddons",
      formatCurrency(reviewData.totalCustomerAddons, true, { showCents: true })
    );

    // Display itemization values (read-only)
    // PRECISION: Show exact calculated values with cents
    setText("quickNetTrade", formatCurrencyAccounting(reviewData.netTrade, { showCents: true }));
    setText("quickUnpaidBalance", formatCurrency(reviewData.unpaidBalance, true, { showCents: true }));
    setText("quickOtherCharges", formatCurrency(reviewData.sumOtherCharges, true, { showCents: true }));
    setText("quickGovtFees", formatCurrency(reviewData.totalGovtFees, true, { showCents: true }));
    setText("quickStateTax", formatCurrency(reviewData.stateTaxTotal, true, { showCents: true }));
    setText("quickCountyTax", formatCurrency(reviewData.countyTaxTotal, true, { showCents: true }));
    setText(
      "quickSaleTaxTotal",
      formatCurrency(reviewData.stateTaxTotal + reviewData.countyTaxTotal, true, { showCents: true })
    );
    setText(
      "quickAmountFinancedTotal",
      formatCurrency(reviewData.amountFinanced, true, { showCents: true })
    );

    // Update tax labels with state/county info
    updateTaxLabels();

    // Display cash due
    setText("quickCashDueHighlight", formatCurrency(reviewData.cashDue));

    // NOTE: Don't call updateQuickSliderValues() here - sliders are the source of truth
    // and calling it resets the original values causing diff indicators to disappear
  } catch (error) {
    console.error("Calculation error:", error);
  }
}

/**
 * Update tax labels to show state/county names and rates
 */
function resetQuickCalculationDisplay() {
  const currencyFields = [
    "quickMonthlyPayment",
    "quickTilFinanceCharge",
    "quickTilAmountFinanced",
    "quickTilTotalPayments",
    "quickTilMonthlyFinanceCharge",
    "quickCalcSalePrice",
    "quickCalcCashDown",
    "quickCalcTradeAllowance",
    "quickCalcTradePayoff",
    "quickCalcDealerFees",
    "quickCalcCustomerAddons",
    "quickCalcCustomerAddons",
    "quickNetTrade",
    "quickUnpaidBalance",
    "quickOtherCharges",
    "quickGovtFees",
    "quickStateTax",
    "quickCountyTax",
    "quickSaleTaxTotal",
    "quickAmountFinancedTotal",
    "quickCashDueHighlight",
  ];
  const uniqueCurrencyFields = [...new Set(currencyFields)];
  uniqueCurrencyFields.forEach((id) => setText(id, "$0.00"));
  setText("quickTerm", "0 months");
  setText("quickAPR", "0.00%");
  setText("quickTilAPR", "0.00%");
  setText("quickTilTerm", "0");
  const lenderInfoEl = document.getElementById("quickLenderInfo");
  if (lenderInfoEl) lenderInfoEl.style.display = "none";
  const customAprBadge = document.getElementById("quickCustomAprBadge");
  if (customAprBadge) customAprBadge.style.display = "none";
  const lenderNameEl = document.getElementById("quickLenderName");
  if (lenderNameEl) lenderNameEl.textContent = "";
  const lenderDateEl = document.getElementById("quickLenderDate");
  if (lenderDateEl) lenderDateEl.textContent = "";
  const lenderDateSeparator = document.getElementById(
    "quickLenderDateSeparator"
  );
  if (lenderDateSeparator) lenderDateSeparator.style.display = "none";
  const lenderEffectiveDateEl = document.getElementById(
    "lender-effective-date"
  );
  if (lenderEffectiveDateEl) lenderEffectiveDateEl.style.display = "none";
}

function updateTaxLabels() {
  ensureWizardFeeDefaults();

  const stateCode = wizardData.location?.stateCode || "";
  const countyName = wizardData.location?.countyName || "";
  const stateTaxRate = wizardData.fees?.stateTaxRate || 6.0;
  const countyTaxRate = wizardData.fees?.countyTaxRate || 1.0;
  const overrideActive = Boolean(wizardData.fees?.userTaxOverride);

  // Update quick entry tax labels
  const stateTaxLabel = document.getElementById("quickStateTaxLabel");
  const countyTaxLabel = document.getElementById("quickCountyTaxLabel");
  const buildLabel = (baseHtml) =>
    overrideActive
      ? `${baseHtml} <span class="tax-override-pill">User Tax Rate</span>`
      : baseHtml;

  if (stateTaxLabel) {
    if (stateCode) {
      const base = `${escapeHtml(
        stateCode
      )} State Tax (${stateTaxRate.toFixed(2)}%)`;
      stateTaxLabel.innerHTML = buildLabel(base);
    } else {
      const base = `State Tax (${stateTaxRate.toFixed(
        2
      )}%) <span class="tax-default-hint">Using default</span>`;
      stateTaxLabel.innerHTML = buildLabel(base);
    }
  }

  if (countyTaxLabel) {
    if (countyName) {
      const base = `${escapeHtml(
        countyName
      )} County Tax (${countyTaxRate.toFixed(2)}%)`;
      countyTaxLabel.innerHTML = buildLabel(base);
    } else {
      const base = `County Tax (${countyTaxRate.toFixed(
        2
      )}%) <span class="tax-default-hint">Using default</span>`;
      countyTaxLabel.innerHTML = buildLabel(base);
    }
  }

  // Update fees modal tax labels
  const modalStateTaxLabel = document.getElementById("modalStateTaxLabel");
  const modalCountyTaxLabel = document.getElementById("modalCountyTaxLabel");

  if (modalStateTaxLabel) {
    if (overrideActive) {
      modalStateTaxLabel.textContent = "State Tax Rate";
    } else if (stateCode) {
      modalStateTaxLabel.textContent = `State Tax Rate (${stateCode})`;
    } else {
      modalStateTaxLabel.textContent = "State Tax Rate";
    }
  }

  if (modalCountyTaxLabel) {
    if (overrideActive) {
      modalCountyTaxLabel.textContent = "County Tax Rate";
    } else if (countyName) {
      modalCountyTaxLabel.textContent = `County Tax Rate (${countyName})`;
    } else {
      modalCountyTaxLabel.textContent = "County Tax Rate";
    }
  }

  // Update contract tax labels
  const contractStateTaxLabel = document.getElementById(
    "contractStateTaxLabel"
  );
  const contractCountyTaxLabel = document.getElementById(
    "contractCountyTaxLabel"
  );

  if (contractStateTaxLabel) {
    if (stateCode) {
      contractStateTaxLabel.textContent = `${stateCode} State Tax`;
    } else {
      contractStateTaxLabel.textContent = "State Tax";
    }
  }

  if (contractCountyTaxLabel) {
    if (countyName) {
      contractCountyTaxLabel.textContent = `${countyName} County Tax`;
    } else {
      contractCountyTaxLabel.textContent = "County Tax";
    }
  }

  updateTaxOverrideIndicators();
}

/**
 * Throttle function - limits how often a function can be called
 */
function throttle(func, delay) {
  let lastCall = 0;
  let timeoutId = null;

  return function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    // Clear any pending timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, execute immediately
      lastCall = now;
      return func.apply(this, args);
    } else {
      // Schedule execution after remaining delay
      return new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          resolve(func.apply(this, args));
        }, delay - timeSinceLastCall);
      });
    }
  };
}

/**
 * Setup sliders for Quick Entry itemization
 */

function setupQuickSliders() {
  ensureWizardFeeDefaults();

  const baselines = gatherSliderBaselines();
  initSlidersFromBaseline(baselines);

  if (!window.sliderOriginalValues) {
    window.sliderOriginalValues = {};
  }
  if (!window.sliderBaselines) {
    window.sliderBaselines = new Map();
  }
  if (!window.quickSliderBindings) {
    window.quickSliderBindings = {};
  }

  const quickSliderBindings = window.quickSliderBindings;
  const throttledQuickCalc = throttle(autoCalculateQuick, 150);

  Object.entries(sliderPolarityMap).forEach(([field, meta]) => {
    const slider = document.getElementById(meta.sliderId);
    const input = document.getElementById(meta.inputId);
    const diffIndicator = meta.diffId
      ? document.getElementById(meta.diffId)
      : null;
    const resetBtn = meta.resetId
      ? document.getElementById(meta.resetId)
      : null;

    if (!slider || !input) {
      return;
    }

    // Append reset button to diff indicator
    if (diffIndicator) {
      if (resetBtn && resetBtn.parentElement !== diffIndicator) {
        diffIndicator.appendChild(resetBtn);
      }
    }

    slider.dataset.field = field;
    const step = getSliderStep(meta);
    slider.dataset.stepSize = step;

    slider.dataset.snapZone = Number.isFinite(meta.snapZone)
      ? meta.snapZone
      : step;

    const snapSetting = Number(slider.dataset.snapZone);
    const snapZone =
      Number.isFinite(snapSetting) && snapSetting > 0 ? snapSetting : step;

    window.sliderOriginalValues[meta.sliderId] =
      Number(slider.dataset.origin) || 0;

    const applyVisualValue = (rawVisualValue, options = {}) => {
      const {
        triggerThrottle = true,
        commit = false,
        updateWizard = true,
        skipFormatting = false,
        preserveExact = false,
      } = options;

      const baseline = Number(slider.dataset.origin) || 0;
      const visualOrigin = getSliderVisualOrigin(slider);

      let visualValue = Number(rawVisualValue);
      if (!Number.isFinite(visualValue)) visualValue = visualOrigin;

      visualValue = clampSliderValueToRange(visualValue, slider);

      const delta = visualValue - visualOrigin;

      // STICKY ORIGIN LOGIC:
      // If within snapZone of origin, snap to exact origin (preserves precision)
      // If outside snapZone, snap to absolute step boundaries (clean negotiations)
      if (!preserveExact) {
        if (snapZone > 0 && Math.abs(delta) < snapZone) {
          // Within snap zone - return to exact origin
          visualValue = visualOrigin;
        } else {
          // Outside snap zone - snap to absolute step boundaries
          visualValue = Math.round(visualValue / step) * step;
        }
      }

      visualValue = clampSliderValueToRange(visualValue, slider);

      slider.value = visualValue;

      let actualValue = convertVisualToActual(slider, visualValue);

      const minActual = Number.isFinite(meta.minFloor)
        ? Number(meta.minFloor)
        : -Infinity;
      const maxActual = Number.isFinite(meta.maxCeil)
        ? Number(meta.maxCeil)
        : Infinity;

      if (actualValue < minActual || actualValue > maxActual) {
        actualValue = Math.min(Math.max(actualValue, minActual), maxActual);
        const correctedVisual = convertActualToVisual(slider, actualValue);
        visualValue = correctedVisual;
        slider.value = correctedVisual;
      }

      if (Number.isFinite(actualValue)) {
        slider.dataset.currentActual = String(actualValue);
      } else {
        delete slider.dataset.currentActual;
      }

      if (!skipFormatting) {
        input.value = formatSliderInputValue(actualValue, meta);
      }

      updateSliderVisual(slider, visualValue, baseline, meta);
      updateDiffIndicatorState(
        diffIndicator,
        resetBtn,
        actualValue,
        baseline,
        meta
      );

      if (updateWizard && typeof meta.setValue === 'function') {
        meta.setValue(actualValue);
      }

      if (triggerThrottle) {
        throttledQuickCalc();
      }

      if (commit) {
        autoCalculateQuick();
      }

      return { visualValue, actualValue };
    };

    const applyActualValue = (rawActualValue, options = {}) => {
      const baseline = Number(slider.dataset.origin) || 0;
      const actualValue = Number.isFinite(rawActualValue)
        ? rawActualValue
        : baseline;
      const visualValue = convertActualToVisual(slider, actualValue);
      const { preserveExact, ...restOptions } = options || {};
      const shouldPreserve =
        typeof preserveExact === 'boolean' ? preserveExact : true;
      return applyVisualValue(visualValue, {
        ...restOptions,
        preserveExact: shouldPreserve,
      });
    };

    const adjustByStep = async (
      direction,
      { showTooltip = false } = {}
    ) => {
      const stepSize = step;
      const originActual = Number(slider.dataset.origin) || 0;
      const snapZone =
        Number(slider.dataset.snapZone) ||
        Number(meta.snapZone) ||
        stepSize;
      const currentVisual = Number.isFinite(parseFloat(slider.value))
        ? parseFloat(slider.value)
        : getSliderVisualOrigin(slider);
      const currentActual = convertVisualToActual(slider, currentVisual);
      let targetActual = currentActual + direction * stepSize;

      // Snap relative to true origin within snapZone, otherwise snap to absolute boundaries
      const deltaFromOrigin = targetActual - originActual;
      if (snapZone > 0 && Math.abs(deltaFromOrigin) < snapZone) {
        targetActual = originActual;
      } else {
        targetActual = Math.round(targetActual / stepSize) * stepSize;
      }

      const minActual = Number.isFinite(meta.minFloor)
        ? Number(meta.minFloor)
        : -Infinity;
      const maxActual = Number.isFinite(meta.maxCeil)
        ? Number(meta.maxCeil)
        : Infinity;
      targetActual = Math.min(Math.max(targetActual, minActual), maxActual);

      const { actualValue } = applyActualValue(targetActual, {
        triggerThrottle: false,
        updateWizard: true,
      });

      await throttledQuickCalc();

      if (showTooltip) {
        showSliderTooltip(slider, actualValue);
      }
    };

    const baseline = Number(slider.dataset.origin) || 0;
    const visualOrigin = getSliderVisualOrigin(slider);
    input.value = formatSliderInputValue(baseline, meta);
    updateSliderVisual(slider, visualOrigin, baseline, meta);
    updateDiffIndicatorState(diffIndicator, resetBtn, baseline, baseline, meta);

    applyActualValue(baseline, {
      triggerThrottle: false,
      updateWizard: false,
      skipFormatting: true,
    });

    slider.addEventListener('input', () => {
      applyVisualValue(slider.value, {
        commit: false,
        updateWizard: true,
      });
    });

    slider.addEventListener('change', async () => {
      applyVisualValue(slider.value, {
        triggerThrottle: false,
        updateWizard: true,
      });
      await autoCalculateQuick();
    });

    input.addEventListener('blur', async (event) => {
      const parsed = parseSliderInputValue(event.target.value, meta);
      applyActualValue(parsed, {
        triggerThrottle: false,
        updateWizard: true,
        preserveExact: true,
      });
      await autoCalculateQuick();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        applyActualValue(Number(slider.dataset.origin) || 0, {
          triggerThrottle: false,
          updateWizard: true,
        });
        await autoCalculateQuick();
        hideSliderTooltip();
      });
    }

    const hoverSection =
      slider.closest('.quick-adjustment') ||
      slider.closest('.quick-item--with-slider');

    if (hoverSection) {
      if (hoverSection._arrowKeyHandler) {
        document.removeEventListener('keydown', hoverSection._arrowKeyHandler);
      }

      if (!hoverSection.hasAttribute('tabindex')) {
        hoverSection.setAttribute('tabindex', '0');
      }

      let isHovering = false;

      hoverSection.addEventListener('mouseenter', () => {
        isHovering = true;
        hoverSection.focus();
        showSliderTooltip(
          slider,
          convertVisualToActual(slider, parseFloat(slider.value))
        );
      });

      hoverSection.addEventListener('mousemove', () => {
        if (!isHovering) return;
        showSliderTooltip(
          slider,
          convertVisualToActual(slider, parseFloat(slider.value))
        );
      });

      hoverSection.addEventListener('mouseleave', () => {
        isHovering = false;
        hideSliderTooltip();
        if (window.sliderBaselines) {
          window.sliderBaselines.delete(slider.id);
        }
      });

      const handleArrowKey = async (event) => {
        const allowedKeys = [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
        ];
        if (!allowedKeys.includes(event.key)) {
          return;
        }

        const sliderHasFocus =
          document.activeElement === slider ||
          document.activeElement === input;

        if (!isHovering && !sliderHasFocus) {
          return;
        }

        event.preventDefault();

        if (document.activeElement === input) {
          input.blur();
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const direction =
          event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
        await adjustByStep(direction, { showTooltip: true });
      };

      document.addEventListener('keydown', handleArrowKey);
      hoverSection._arrowKeyHandler = handleArrowKey;
    }

    quickSliderBindings[field] = {
      field,
      meta,
      slider,
      input,
      diffIndicator,
      resetBtn,
      get origin() {
        return Number(slider.dataset.origin) || 0;
      },
      setBaseline: (actualBaseline, options = {}) => {
        const baselineValue = Number.isFinite(actualBaseline)
          ? actualBaseline
          : 0;
        slider.dataset.origin = baselineValue;
        slider.dataset.snapZone = Number.isFinite(meta.snapZone)
          ? meta.snapZone
          : step;
        slider.dataset.stepSize = step;
        window.sliderOriginalValues[meta.sliderId] = baselineValue;

        // STICKY ORIGIN: Keep visual origin at precise value for sticky behavior
        // When user is at origin, they see exact value (e.g., $43,230)
        // When moving away, values snap to step increments (e.g., $43,200, $43,300)
        const visualOriginNext = baselineValue; // No rounding - preserve precision
        setSliderVisualOrigin(slider, visualOriginNext);
        configureSliderRange(slider, baselineValue, meta, visualOriginNext);

        if (options.apply === false) {
          slider.value = visualOriginNext;
          input.value = formatSliderInputValue(baselineValue, meta);
          updateSliderVisual(slider, visualOriginNext, baselineValue, meta);
          updateDiffIndicatorState(
            diffIndicator,
            resetBtn,
            baselineValue,
            baselineValue,
            meta
          );
        } else {
          applyActualValue(baselineValue, {
            triggerThrottle: false,
            updateWizard: options.updateWizard ?? false,
          });
        }
      },
      setValue: (value, options = {}) =>
        applyActualValue(value, {
          triggerThrottle: options.triggerThrottle ?? false,
          commit: options.commit ?? false,
          updateWizard: options.updateWizard ?? true,
        }),
    };

    slider.addEventListener('keydown', async (event) => {
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp'
      ) {
        event.preventDefault();
        const direction =
          event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
        await adjustByStep(direction, { showTooltip: true });
      }
    });
  });
}

function initializeCenteredSliders() {
  ensureWizardFeeDefaults();

  const financing = wizardData.financing || {};
  const tradein = wizardData.tradein || {};
  const fees = wizardData.fees || {};
  const hasVehicleSelection =
    Boolean(selectedVehicle?.vin) || Boolean(wizardData.vehicle?.vin);

  // Update dynamic slider ceilings based on current sale price
  const salePriceForCeil = Number(financing.salePrice) || 0;
  if (salePriceForCeil > 0) {
    try {
      const dpMax = calculateDownPaymentSliderMax(salePriceForCeil);
      if (Number.isFinite(dpMax) && dpMax > 0) {
        sliderPolarityMap.cashDown.maxCeil = dpMax;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
    }
  } else {
    delete sliderPolarityMap.cashDown.maxCeil;
  }

  const baselineValues = {
    salePrice: hasVehicleSelection
      ? Number(financing.salePrice) || 0
      : 0,
    cashDown: Number(financing.cashDown) || 0,
    tradeAllowance: hasVehicleSelection
      ? Number(tradein.tradeValue) || 0
      : 0,
    tradePayoff: hasVehicleSelection
      ? Number(tradein.tradePayoff) || 0
      : 0,
    dealerFees: Number(fees.dealerFees) || 0,
    addons: Number(fees.customerAddons) || 0,
  };


  const bindings = window.quickSliderBindings || {};

  Object.entries(baselineValues).forEach(([field, value]) => {
    const binding = bindings[field];
    if (binding) {
      binding.setBaseline(value, { apply: true, updateWizard: true });
    }
  });

  const calcStore = useCalculatorStore.getState();
  calcStore.updateState({
    salePrice: baselineValues.salePrice,
    cashDown: baselineValues.cashDown,
    tradeValue: baselineValues.tradeAllowance,
    tradePayoff: baselineValues.tradePayoff,
    originalSalePrice: baselineValues.salePrice,
    originalCashDown: baselineValues.cashDown,
    originalTradeValue: baselineValues.tradeAllowance,
    originalTradePayoff: baselineValues.tradePayoff,
    apr: financing.apr || 5.99,
    term: financing.term || 72
  });
}

/**
 * Show slider payment tooltip
 */

function showSliderTooltip(sliderElement, currentValue) {
  const tooltip = document.getElementById("slider-payment-tooltip");
  if (!tooltip) return;

  // Calculate current monthly payment
  const monthlyPayment = calculateCurrentMonthlyPayment();

  // Initialize sliderBaselines if not already done
  if (!window.sliderBaselines) {
    window.sliderBaselines = new Map();
  }

  // Get or set baseline for this specific slider
  const sliderId = sliderElement.id;
  if (!window.sliderBaselines.has(sliderId)) {
    window.sliderBaselines.set(sliderId, monthlyPayment);
  }

  const baseline = window.sliderBaselines.get(sliderId);

  // Calculate change from this slider's baseline
  const paymentDiff = monthlyPayment - baseline;

  // Update tooltip content
  const paymentEl = tooltip.querySelector(".tooltip-payment");
  const changeEl = tooltip.querySelector(".tooltip-change");

  paymentEl.textContent = formatCurrency(monthlyPayment);

  // Update change indicator (buyer-centric: lower payment = green/good, higher payment = red/bad)
  if (Math.abs(paymentDiff) < 1) {
    changeEl.textContent = "No change";
    changeEl.className = "tooltip-change neutral";
  } else {
    // Use explicit +/- signs (not accounting/parentheses style)
    const absValue = Math.abs(paymentDiff).toFixed(0);
    if (paymentDiff > 0) {
      changeEl.textContent = `+$${absValue}/mo`;
      changeEl.className = "tooltip-change negative"; // Payment increase is bad for buyer
    } else {
      changeEl.textContent = `-$${absValue}/mo`;
      changeEl.className = "tooltip-change positive"; // Payment decrease is good for buyer
    }
  }

  // Position tooltip above the slider thumb
  const rect = sliderElement.getBoundingClientRect();
  const sliderValue = parseFloat(sliderElement.value);
  const sliderMin = parseFloat(sliderElement.min);
  const sliderMax = parseFloat(sliderElement.max);

  // Calculate thumb position percentage
  const percentage = (sliderValue - sliderMin) / (sliderMax - sliderMin);
  const thumbPosition = rect.left + rect.width * percentage;

  tooltip.style.left = `${thumbPosition}px`;
  tooltip.style.top = `${rect.top}px`;
  tooltip.style.display = "block";
}

/**
 * Hide slider payment tooltip
 */
function hideSliderTooltip() {
  const tooltip = document.getElementById("slider-payment-tooltip");
  if (tooltip) {
    tooltip.style.display = "none";
  }
}

/**
 * Calculate current monthly payment (helper for tooltip)
 */
function calculateCurrentMonthlyPayment() {
  // Get current calculation result from the page
  const monthlyPaymentEl = document.getElementById("quickMonthlyPayment");
  if (monthlyPaymentEl) {
    const text = monthlyPaymentEl.textContent;
    const value = parseCurrency(text);
    return value;
  }
  return 0;
}

/**
 * Reset original monthly payment (call when vehicle or major values change)
 * Note: No longer needed since we calculate slider payment impact on-the-fly
 */
function resetOriginalMonthlyPayment() {
  // Deprecated - keeping function for compatibility
}

/**
 * Update Quick Entry slider values from wizard data
 */
function updateQuickSliderValues() {
  const bindings = window.quickSliderBindings || {};
  const targetValues = {
    salePrice: wizardData.financing?.salePrice || 0,
    cashDown: wizardData.financing?.cashDown || 0,
    tradeAllowance: wizardData.tradein?.tradeValue || 0,
    tradePayoff: wizardData.tradein?.tradePayoff || 0,
    dealerFees: wizardData.fees?.dealerFees || 0,
    addons: wizardData.fees?.customerAddons || 0,
  };

  Object.entries(targetValues).forEach(([field, value]) => {
    const binding = bindings[field];
    if (!binding) return;
    binding.setBaseline(value, { apply: true });
  });

  // Reset original monthly payment for tooltip
  resetOriginalMonthlyPayment();
}

/**
 * Parse currency string to number
 */
function parseCurrency(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * Register service worker for production only
 * Skip during development (Vite dev server)
 */
const isProd =
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1";
if ("serviceWorker" in navigator && isProd) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {})
      .catch((error) => {});
  });
}
  sendModeModalUI = {
    modal: document.getElementById("send-mode-modal"),
    message: document.getElementById("sendModeMessage"),
    devBtn: document.getElementById("sendModeDevBtn"),
    prodBtn: document.getElementById("sendModeProdBtn"),
    remember: document.getElementById("sendModeRemember"),
  };
