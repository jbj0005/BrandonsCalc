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
  location: {}
};

let latestReviewData = null;

const TAX_RATE_CONFIG = {
  FL: {
    stateRate: 0.06,
    counties: {
      HAMILTON: 0.02,
      BREVARD: 0.01
    }
  }
};

const FEE_CATEGORY_CONFIG = {
  dealer: {
    containerId: 'dealer-fee-rows',
    totalId: 'dealer-fee-total',
    datalistId: 'dealer-fee-suggestions',
    label: 'Dealer Fees'
  },
  customer: {
    containerId: 'customer-fee-rows',
    totalId: 'customer-fee-total',
    datalistId: 'customer-fee-suggestions',
    label: 'Customer Add-ons'
  },
  gov: {
    containerId: 'gov-fee-rows',
    totalId: 'gov-fee-total',
    datalistId: 'gov-fee-suggestions',
    label: "Gov't Fees"
  }
};

const feeSetState = {
  dealer: { id: null, items: [] },
  customer: { id: null, items: [] },
  gov: { id: null, items: [] }
};

const feeModalState = {
  categories: {},
  initialized: false
};

const editFeeModalState = {
  activeCategory: 'dealer'
};

// Supabase client
let supabase = null;
let currentUserId = null;

// Saved vehicles cache
let savedVehicles = [];
let selectedVehicle = null;
let similarVehicles = [];

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
function formatCurrency(value, showNegative = true) {
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
  if (isNaN(num)) return '';

  const absValue = Math.abs(num);
  const formatted = absValue.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
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

function toTitleCase(str) {
  return String(str)
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
    .trim();
}

function safeParseJSON(raw) {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[fees] Failed to parse JSON', { error, raw });
    return [];
  }
}

function normalizeFeeItems(records) {
  const items = Array.isArray(records) ? records : [];
  const dedup = new Map();
  for (const item of items) {
    const name =
      typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const key = name.toLowerCase();
    let amount = null;
    if (typeof item?.amount === 'number' && Number.isFinite(item.amount)) {
      amount = item.amount;
    } else if (typeof item?.amount === 'string') {
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
      this.datalist.innerHTML = '';
      const fragment = document.createDocumentFragment();
      this.items.forEach((item) => {
        if (!item?.name) return;
        const option = document.createElement('option');
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
    }
  };
  return store;
}

function getFeeSuggestionStore(type) {
  const category = type === 'gov' ? 'gov' : type === 'customer' ? 'customer' : 'dealer';
  return feeModalState.categories?.[category]?.suggestionStore ?? null;
}

function getFeeSetState(type) {
  return type === 'gov'
    ? feeSetState.gov
    : type === 'customer'
    ? feeSetState.customer
    : feeSetState.dealer;
}

async function fetchFeeItemsFromSet(tableName) {
  if (!supabase) return { setId: null, rawItems: [], normalizedItems: [] };
  const { data, error } = await supabase
    .from(tableName)
    .select('id, label, items')
    .eq('active', true);
  if (error) throw error;
  const records = Array.isArray(data) ? data : [];
  const primary = records[0] ?? null;
  const setId = primary?.id ?? null;
  const rawItems = records.flatMap((record) => {
    if (Array.isArray(record?.items)) return record.items;
    if (typeof record?.items === 'string') return safeParseJSON(record.items);
    return [];
  });
  return {
    setId,
    rawItems,
    normalizedItems: normalizeFeeItems(rawItems)
  };
}

async function fetchFeeItemsFromView(viewName) {
  if (!supabase) return { rawItems: [], normalizedItems: [] };
  const { data, error } = await supabase
    .from(viewName)
    .select('name, amount, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const records = Array.isArray(data) ? data : [];
  const normalizedItems = normalizeFeeItems(records);
  const rawItems = records.map((item) => ({
    name: typeof item?.name === 'string' ? item.name : '',
    amount:
      typeof item?.amount === 'number'
        ? item.amount
        : Number(item?.amount) || 0
  }));
  return { rawItems, normalizedItems };
}

function setSuggestionItems(store, items, context) {
  if (!store) return;
  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`[fees] No items available for ${context}`);
    store.setItems([]);
    return;
  }
  store.setItems(items);
}

async function loadDealerFeeSuggestions() {
  try {
    const store = getFeeSuggestionStore('dealer');
    if (!store) return;
    let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet('dealer_fee_sets');
    feeSetState.dealer.id = setId;
    feeSetState.dealer.items = rawItems;
    let items = normalizedItems;
    let source = 'dealer_fee_sets';
    if (!items.length) {
      const fallback = await fetchFeeItemsFromView('dealer_fee_items_v');
      items = fallback.normalizedItems;
      feeSetState.dealer.items = fallback.rawItems;
      source = 'dealer_fee_items_v';
    }
    setSuggestionItems(store, items, source);
  } catch (error) {
    console.error('[fees] Failed to load dealer fee suggestions', error);
    const store = getFeeSuggestionStore('dealer');
    store?.setItems([]);
  }
}

async function loadCustomerAddonSuggestions() {
  try {
    const store = getFeeSuggestionStore('customer');
    if (!store) return;
    let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet('customer_addon_sets');
    feeSetState.customer.id = setId;
    feeSetState.customer.items = rawItems;
    let items = normalizedItems;
    let source = 'customer_addon_sets';
    if (!items.length) {
      const fallback = await fetchFeeItemsFromView('customer_addon_items_v');
      items = fallback.normalizedItems;
      feeSetState.customer.items = fallback.rawItems;
      source = 'customer_addon_items_v';
    }
    setSuggestionItems(store, items, source);
  } catch (error) {
    console.error('[fees] Failed to load customer addon suggestions', error);
    const store = getFeeSuggestionStore('customer');
    store?.setItems([]);
  }
}

async function loadGovFeeSuggestions() {
  try {
    const store = getFeeSuggestionStore('gov');
    if (!store) return;
    let { setId, rawItems, normalizedItems } = await fetchFeeItemsFromSet('gov_fee_sets');
    feeSetState.gov.id = setId;
    feeSetState.gov.items = rawItems;
    let items = normalizedItems;
    let source = 'gov_fee_sets';
    if (!items.length) {
      const fallback = await fetchFeeItemsFromView('gov_fee_items_v');
      items = fallback.normalizedItems;
      feeSetState.gov.items = fallback.rawItems;
      source = 'gov_fee_items_v';
    }
    setSuggestionItems(store, items, source);
  } catch (error) {
    console.error('[fees] Failed to load gov fee suggestions', error);
    const store = getFeeSuggestionStore('gov');
    store?.setItems([]);
  }
}

async function loadFeeSuggestionData() {
  await Promise.all([
    loadDealerFeeSuggestions(),
    loadCustomerAddonSuggestions(),
    loadGovFeeSuggestions()
  ]);
}

/**
 * Format number input as currency in real-time
 * @param {HTMLInputElement} input - The input element
 */
function setupCurrencyInput(input) {
  input.addEventListener('input', (e) => {
    const cursorPosition = e.target.selectionStart;
    const oldLength = e.target.value.length;

    // Remove non-numeric characters except minus
    let value = e.target.value.replace(/[^0-9-]/g, '');

    // Handle negative sign
    const isNegative = value.startsWith('-');
    value = value.replace(/-/g, '');

    if (value === '') {
      e.target.value = '';
      return;
    }

    const numValue = parseInt(value);
    e.target.value = formatCurrency(isNegative ? -numValue : numValue);

    // Restore cursor position
    const newLength = e.target.value.length;
    const diff = newLength - oldLength;
    e.target.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
  });

  input.addEventListener('blur', (e) => {
    if (e.target.value && !e.target.value.startsWith('$') && !e.target.value.startsWith('(')) {
      const num = parseFloat(e.target.value.replace(/[^0-9.-]/g, ''));
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
  const num = typeof value === 'string' ? parseInt(value.replace(/[^0-9]/g, '')) : value;
  if (isNaN(num) || num === 0) return '';
  return num.toLocaleString('en-US');
}

/**
 * Format mileage input in real-time
 * @param {HTMLInputElement} input - The input element
 */
function setupMileageInput(input) {
  input.addEventListener('input', (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value === '') {
      e.target.value = '';
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
  if (!text) return '';
  return text.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

/**
 * Format VIN for display (uppercase, monospace)
 * @param {string} vin - The VIN to format
 * @returns {string} Formatted VIN
 */
function formatVIN(vin) {
  if (!vin) return '';
  return vin.toUpperCase();
}

/**
 * Generate a pleasant accent color based on trim text
 * @param {string} trim
 * @returns {string} CSS color
 */
function getTrimAccentColor(trim) {
  if (!trim) return '#3b82f6';
  let hash = 0;
  const normalized = trim.toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializeSupabase();
  await loadGoogleMaps();

  // Initialize year dropdown as disabled until location is set
  const yearSelect = document.getElementById('year-input');
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
  await loadSavedVehicles();
  await loadLenders(); // Load lenders for rate comparison

  // Initialize Quick Entry mode (now the default and only mode)
  await initializeQuickEntry();

  // Set up customer profile button
  const profileBtn = document.getElementById('openCustomerProfileBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', openCustomerProfileModal);
  }

  // Auto-populate location and calculator fields from customer profile
  await autoPopulateLocationFromProfile();
  await autoPopulateCalculatorFromProfile();
});

/**
 * Initialize Supabase client
 */
async function initializeSupabase() {
  try {
    // Get Supabase credentials from meta tags (like main calculator does)
    const supabaseUrl = document.querySelector('meta[name="supabase-url"]')?.content ||
                        'https://txndueuqljeujlccngbj.supabase.co'; // Fallback from main app
    const supabaseKey = document.querySelector('meta[name="supabase-anon-key"]')?.content ||
                        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bmR1ZXVxbGpldWpsY2NuZ2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMzI3OTMsImV4cCI6MjA3MjYwODc5M30.ozHVMxQ0qL4mzZ2q2cRkYPduBk927_a7ffd3tOI6Pdc';

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials not found');
      return;
    }

    // Get createClient from the global Supabase library (loaded from CDN)
    const { createClient } = window.supabase;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Get current session
    const { data, error } = await supabase.auth.getSession();

    console.log('[express-mode] getSession result:', {
      hasSession: !!data?.session,
      hasUser: !!data?.session?.user,
      userId: data?.session?.user?.id,
      error
    });

    currentUserId = data?.session?.user?.id ?? null;

    // Listen for auth state changes
    supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      console.log('[auth] Auth state changed:', _event, 'User ID:', newUserId);
      if (newUserId !== currentUserId) {
        currentUserId = newUserId;
        console.log('[auth] User changed:', currentUserId ? 'signed in' : 'signed out');
        loadSavedVehicles();
        updateLoginButton();
      }
    });

    console.log('[express-mode] Supabase initialized. User ID:', currentUserId || 'Anonymous');

    // Update login button state
    updateLoginButton();

    // If no session, check if user needs to sign in
    if (!currentUserId) {
      console.warn('[express-mode] No active session. User needs to sign in on the main app first.');
      console.warn('[express-mode] Visit http://localhost:5174 and sign in, then return here.');
    }
  } catch (error) {
    console.error('Error initializing Supabase:', error);
  }
}

/**
 * Update login button based on auth state
 */
function updateLoginButton() {
  const loginBtn = document.getElementById('hero-login-btn');
  if (!loginBtn) return;

  if (currentUserId) {
    loginBtn.textContent = 'Sign Out';
  } else {
    loginBtn.textContent = 'Sign In';
  }

  loginBtn.style.display = 'block';
}

/**
 * Handle auth button click
 */
async function handleAuthClick() {
  if (!supabase) {
    alert('Authentication not available. Please check your configuration.');
    return;
  }

  if (currentUserId) {
    // Sign out
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
      alert('Error signing out. Please try again.');
    }
  } else {
    // Redirect to sign in - use magic link or redirect to auth page
    const redirectUrl = window.location.origin + window.location.pathname;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });

    if (error) {
      console.error('Sign in error:', error);
      alert('Error signing in. Please try again.');
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
    if (!response.ok) throw new Error('Failed to get config');

    const data = await response.json();
    const apiKey = data.googleMaps?.apiKey;

    if (!apiKey) {
      console.warn('Google Maps API key not available');
      return;
    }

    // Load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGooglePlaces`;
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
    console.error('Error loading Google Maps:', error);
  }
}

/**
 * Setup Google Places autocomplete on location input
 */
function setupPlacesAutocomplete() {
  const locationInput = document.getElementById('user-location');
  if (!locationInput || !google || !google.maps || !google.maps.places) return;

  try {
    placesAutocomplete = new google.maps.places.Autocomplete(locationInput, {
      types: ['address'],
      componentRestrictions: { country: 'us' }
    });

    placesAutocomplete.addListener('place_changed', async () => {
      const place = placesAutocomplete.getPlace();
      if (!place.geometry) return;

      // Extract location data
      const location = {
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        zip: extractZipFromPlace(place)
      };

      const locale = extractLocaleFromComponents(place.address_components ?? []);
      location.stateCode = locale.stateCode;
      location.countyName = locale.countyName;

      wizardData.location = location;
      console.log('Location selected:', location);

      applyLocaleToFees(locale);

      // Update hint to show selected location
      const hint = locationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using: ${location.zip || 'your location'}`;
        hint.style.color = 'var(--success)';
      }

      // Populate year dropdown now that location is set
      await populateYearDropdowns();

      // Show vehicle selection section now that location is set
      const vehicleSelectionSection = document.getElementById('vehicle-selection-section');
      if (vehicleSelectionSection) {
        vehicleSelectionSection.style.display = 'block';
      }
    });
  } catch (error) {
    console.error('Error setting up Places autocomplete:', error);
  }
}

/**
 * Extract ZIP code from Google Place result
 */
function extractZipFromPlace(place) {
  if (!place.address_components) return null;

  for (const component of place.address_components) {
    if (component.types.includes('postal_code')) {
      return component.long_name;
    }
  }
  return null;
}

function extractLocaleFromComponents(components = []) {
  let stateCode = '';
  let countyName = '';
  components.forEach((component) => {
    const types = component?.types ?? [];
    if (types.includes('administrative_area_level_1')) {
      stateCode =
        component.short_name ?? component.long_name ?? stateCode ?? '';
    }
    if (types.includes('administrative_area_level_2')) {
      countyName = (component.long_name ?? component.short_name ?? '')
        .replace(/ County$/i, '')
        .trim();
    }
  });
  return { stateCode, countyName };
}

function applyLocaleToFees({ stateCode, countyName }) {
  ensureWizardFeeDefaults();
  const upperState = stateCode ? stateCode.toUpperCase() : '';
  const upperCounty = countyName ? countyName.toUpperCase() : '';
  wizardData.location = {
    ...wizardData.location,
    stateCode: upperState,
    countyName: countyName ?? ''
  };

  const config = TAX_RATE_CONFIG[upperState] ?? null;
  if (config) {
    const statePercent = Math.round((config.stateRate ?? 0) * 10000) / 100;
    const countyPercent = Math.round(((config.counties?.[upperCounty] ?? 0) * 10000)) / 100;
    wizardData.fees.stateTaxRate = statePercent;
    wizardData.fees.countyTaxRate = countyPercent;
    updateTaxInputs();
    if (currentStep === 4) {
      refreshReview().catch((error) => {
        console.error('[fees] Unable to refresh review after applying locale', error);
      });
    }
  } else {
    updateTaxInputs();
  }

  // Update tax labels in quick entry itemization
  updateTaxLabels();
}

/**
 * Setup location input (manual ZIP entry if Google Maps not available)
 */
function setupLocationInput() {
  const locationInput = document.getElementById('user-location');

  // Skip if element doesn't exist (e.g., in express mode without wizard)
  if (!locationInput) {
    console.log('[location-input] Wizard location input not found; skipping setup');
    return;
  }

  // Also allow manual ZIP entry
  locationInput.addEventListener('input', async (e) => {
    const value = e.target.value.trim();

    // If it looks like a ZIP code (5 digits)
    if (/^\d{5}$/.test(value)) {
      wizardData.location = {
        zip: value,
        address: value
      };

      const hint = locationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using ZIP: ${value}`;
        hint.style.color = 'var(--success)';
      }

      if (google?.maps?.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: value }, (results, status) => {
          if (status === 'OK' && results?.length) {
            const components = results[0].address_components ?? [];
            const { stateCode, countyName } = extractLocaleFromComponents(components);
            applyLocaleToFees({ stateCode, countyName });
          }
        });
      }

      // Populate year dropdown now that location is set
      await populateYearDropdowns();

      // Show vehicle selection section now that location is set
      const vehicleSelectionSection = document.getElementById('vehicle-selection-section');
      if (vehicleSelectionSection) {
        vehicleSelectionSection.style.display = 'block';
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
      console.log('[vehicles] Supabase not initialized');
      return;
    }

    if (!currentUserId) {
      console.log('[vehicles] No user signed in, skipping saved vehicles');
      savedVehicles = [];
      return;
    }

    console.log('[vehicles] Loading saved vehicles for user:', currentUserId);

    // Query vehicles table with specific columns (using inserted_at like main app)
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
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
      `)
      .eq('user_id', currentUserId)
      .order('inserted_at', { ascending: false });

    if (error) {
      console.error('[vehicles] Error loading saved vehicles:', error);
      savedVehicles = [];
      return;
    }

    savedVehicles = (data || []).map((vehicle) => {
      const parsedLat = typeof vehicle.dealer_lat === 'number'
        ? vehicle.dealer_lat
        : vehicle.dealer_lat != null
          ? Number.parseFloat(vehicle.dealer_lat)
          : null;
      const parsedLng = typeof vehicle.dealer_lng === 'number'
        ? vehicle.dealer_lng
        : vehicle.dealer_lng != null
          ? Number.parseFloat(vehicle.dealer_lng)
          : null;

      // Normalize condition: auto-detect based on year if missing or incorrect
      const currentYear = new Date().getFullYear();
      let condition = vehicle.condition ? vehicle.condition.toLowerCase() : '';

      // If condition is missing or invalid, auto-detect from year
      if (!condition || (condition !== 'new' && condition !== 'used')) {
        condition = parseInt(vehicle.year) >= currentYear ? 'new' : 'used';
      }

      return {
        ...vehicle,
        dealer_lat: Number.isFinite(parsedLat) ? parsedLat : null,
        dealer_lng: Number.isFinite(parsedLng) ? parsedLng : null,
        condition: condition  // Normalized to lowercase 'new' or 'used'
      };
    });
    console.log(`[vehicles] Loaded ${savedVehicles.length} saved vehicles`);
    console.log('[vehicles] First 3 vehicles:', savedVehicles.slice(0, 3).map(v => ({
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model,
      condition: v.condition
    })));
  } catch (error) {
    console.error('[vehicles] Error loading saved vehicles:', error);
    savedVehicles = [];
  }
}

/**
 * Setup VIN input with autocomplete and search
 */
function setupVINInput() {
  const vinInput = document.getElementById('vin-input');
  const dropdown = document.getElementById('saved-vehicles-dropdown');

  if (!vinInput || !dropdown) {
    console.warn('[vin-input] VIN input elements not found; skipping main wizard VIN setup');
    return;
  }

  vinInput.addEventListener('focus', () => {
    if (savedVehicles.length > 0) {
      showSavedVehiclesDropdown();
    }
  });

  vinInput.addEventListener('input', (e) => {
    const value = e.target.value.toUpperCase().trim();

    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
      vinInput.style.borderColor = 'var(--success)';
    } else {
      vinInput.style.borderColor = '';
    }

    if (value.length > 0) {
      filterSavedVehicles(value);
    } else {
      showSavedVehiclesDropdown();
    }
  });

  vinInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const vin = vinInput.value.trim();
      if (vin.length === 17) {
        await searchVehicleByVIN(vin);
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!vinInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

/**
 * Setup cascading dropdowns for manual vehicle entry
 */
function setupCascadingDropdowns() {
  const yearInput = document.getElementById('year-input');
  const makeInput = document.getElementById('make-input');
  const modelInput = document.getElementById('model-input');
  const trimInput = document.getElementById('trim-input');

  const makeGroup = document.getElementById('make-group');
  const modelGroup = document.getElementById('model-group');
  const trimGroup = document.getElementById('trim-group');

  // Skip if elements don't exist (e.g., in express mode without wizard)
  if (!yearInput || !makeInput || !modelInput || !trimInput) {
    console.log('[cascading-dropdowns] Wizard elements not found; skipping cascading dropdowns setup');
    return;
  }

  // Populate makes when year is selected
  yearInput.addEventListener('change', async () => {
    const year = yearInput.value;

    if (!year) {
      // Hide all subsequent dropdowns
      makeGroup.style.display = 'none';
      modelGroup.style.display = 'none';
      trimGroup.style.display = 'none';
      return;
    }

    // Show make dropdown and populate it
    makeGroup.style.display = 'block';
    await populateMakes(year);

    // Hide subsequent dropdowns until make is selected
    modelGroup.style.display = 'none';
    trimGroup.style.display = 'none';

    checkAndShowPreview();
  });

  // Populate models when make is selected
  makeInput.addEventListener('change', async () => {
    const year = yearInput.value;
    const make = makeInput.value;

    if (!year || !make) {
      modelGroup.style.display = 'none';
      trimGroup.style.display = 'none';
      return;
    }

    // Show model dropdown and populate it
    modelGroup.style.display = 'block';
    await populateModels(year, make);

    // Hide trim dropdown until model is selected
    trimGroup.style.display = 'none';

    checkAndShowPreview();
  });

  // Populate trims when model is selected
  modelInput.addEventListener('change', async () => {
    const year = yearInput.value;
    const make = makeInput.value;
    const model = modelInput.value;

    if (!year || !make || !model) {
      trimGroup.style.display = 'none';
      return;
    }

    // Show trim dropdown and populate it
    trimGroup.style.display = 'block';
    await populateTrims(year, make, model);

    checkAndShowPreview();
  });

  // Check for preview when trim changes
  trimInput.addEventListener('change', () => {
    checkAndShowPreview();
  });
}

/**
 * Check if manual selection is complete and show preview
 */
async function checkAndShowPreview() {
  const yearInput = document.getElementById('year-input');
  const makeInput = document.getElementById('make-input');
  const modelInput = document.getElementById('model-input');
  const trimInput = document.getElementById('trim-input');

  const year = yearInput.value;
  const make = makeInput.value;
  const model = modelInput.value;
  const trim = trimInput.value || '';

  // Hide preview if required fields aren't filled
  if (!year || !make || !model) {
    document.getElementById('manual-vehicle-preview').style.display = 'none';
    return;
  }

  console.log('[manual-preview] Searching for vehicle:', { year, make, model, trim });

  try {
    // Search for matching vehicle with the user's exact selection
    const zip = wizardData.location?.zip || '';
    const trimParam = trim ? `&trim=${encodeURIComponent(trim)}` : '';

    const response = await fetch(`${API_BASE}/api/mc/search?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}${trimParam}&zip=${zip}&radius=100&rows=1`);

    if (!response.ok) {
      throw new Error('Failed to search for vehicle');
    }

    const data = await response.json();

    if (data.listings && data.listings.length > 0) {
      const vehicle = data.listings[0];
      // Auto-detect condition based on year
      const currentYear = new Date().getFullYear();
      vehicle.condition = parseInt(year) >= currentYear ? 'new' : 'used';
      displayManualVehiclePreview(vehicle);
    } else {
      // No listings found - show informative message
      console.log('[manual-preview] No active listings found for this vehicle');
      displayNoListingsMessage(year, make, model, trim);
    }
  } catch (error) {
    console.error('[manual-preview] Error:', error);
    displayNoListingsMessage(year, make, model, trim);
  }
}

/**
 * Display message when no listings are found
 */
function displayNoListingsMessage(year, make, model, trim) {
  const previewSection = document.getElementById('manual-vehicle-preview');
  const previewCard = document.getElementById('manual-vehicle-preview-card');

  const trimText = trim ? ` - ${capitalizeWords(trim)}` : '';
  const vehicleText = `${year} ${capitalizeWords(make)} ${capitalizeWords(model)}${trimText}`;

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

  previewSection.style.display = 'block';
  console.log('[manual-preview] Displayed no listings message');
}

/**
 * Display manual vehicle selection preview card
 */
function displayManualVehiclePreview(vehicle) {
  const previewSection = document.getElementById('manual-vehicle-preview');
  const previewCard = document.getElementById('manual-vehicle-preview-card');

  // Clean model name
  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);

  // Make card clickable if listing URL exists
  const cardClickHandler = vehicle.listing_url
    ? `onclick="window.open('${vehicle.listing_url}', '_blank')" style="cursor: pointer;"`
    : '';

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

  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(cleanedModel || '')}${vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ''}`;

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
        ${vehicle.condition ? `
          <div class="manual-preview__info">
            <span class="label">Condition:</span>
            <span class="value">${vehicle.condition}</span>
          </div>
        ` : ''}
        ${vehicle.mileage ? `
          <div class="manual-preview__info">
            <span class="label">Mileage:</span>
            <span class="value">${formatMileage(vehicle.mileage)} mi</span>
          </div>
        ` : ''}
        ${vehicle.asking_price ? `
          <div class="manual-preview__info">
            <span class="label">Asking Price:</span>
            <span class="value">${formatCurrency(vehicle.asking_price)}</span>
          </div>
        ` : ''}
        ${vehicle.vin ? `
          <div class="manual-preview__info">
            <span class="label">VIN:</span>
            <span class="value vin-value">${formatVIN(vehicle.vin)}</span>
          </div>
        ` : ''}
        ${vehicle.listing_url ? `
          <a href="${vehicle.listing_url}" target="_blank" class="manual-preview__link-button">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
            View Full Listing & Photos on Dealer Website
          </a>
        ` : ''}
    </div>
  `;

  previewSection.style.display = 'block';
  console.log('[manual-preview] Displayed preview for:', vehicleDetailsText);

  // Store the selection for use in next step
  selectedVehicle = {
    ...vehicle,
    condition: vehicle.condition || 'Used'
  };
}

/**
 * Populate makes for selected year
 */
async function populateMakes(year) {
  const makeSelect = document.getElementById('make-input');

  try {
    makeSelect.innerHTML = '<option value="">Loading...</option>';
    makeSelect.disabled = true;

    // Get user's zip if available for more relevant results
    const zip = wizardData.location?.zip || '';
    const zipParam = zip ? `&zip=${zip}` : '';

    // Try to query MarketCheck for makes by year
    const response = await fetch(`${API_BASE}/api/mc/makes?year=${year}${zipParam}`);

    if (!response.ok) {
      throw new Error('Failed to fetch makes');
    }

    const data = await response.json();
    let makes = data.makes || [];

    // If MarketCheck returns no makes, fall back to Supabase saved vehicles
    if (makes.length === 0) {
      console.log('[cascading-dropdowns] No makes from MarketCheck, falling back to Supabase vehicles');
      const makesSet = new Set();
      savedVehicles
        .filter(v => parseInt(v.year) === parseInt(year))
        .forEach(v => {
          if (v.make) makesSet.add(v.make);
        });
      makes = Array.from(makesSet);

      if (makes.length > 0) {
        console.log(`[cascading-dropdowns] Using ${makes.length} makes from Supabase saved vehicles`);
      }
    }

    // Sort makes alphabetically
    makes.sort((a, b) => a.localeCompare(b));

    // Populate dropdown
    makeSelect.innerHTML = '<option value="">Select Make</option>';
    makes.forEach(make => {
      const option = document.createElement('option');
      option.value = make;
      option.textContent = capitalizeWords(make);
      makeSelect.appendChild(option);
    });

    makeSelect.disabled = false;

    console.log('[cascading-dropdowns] Populated', makes.length, 'makes for year', year);
  } catch (error) {
    console.error('[cascading-dropdowns] Error fetching makes from MarketCheck:', error);

    // Fall back to Supabase saved vehicles
    console.log('[cascading-dropdowns] Falling back to Supabase saved vehicles');
    const makesSet = new Set();
    savedVehicles
      .filter(v => parseInt(v.year) === parseInt(year))
      .forEach(v => {
        if (v.make) makesSet.add(v.make);
      });
    const makes = Array.from(makesSet).sort((a, b) => a.localeCompare(b));

    makeSelect.innerHTML = '<option value="">Select Make</option>';
    makes.forEach(make => {
      const option = document.createElement('option');
      option.value = make;
      option.textContent = capitalizeWords(make);
      makeSelect.appendChild(option);
    });

    makeSelect.disabled = false;

    if (makes.length > 0) {
      console.log(`[cascading-dropdowns] Using ${makes.length} makes from Supabase (MarketCheck unavailable)`);
    } else {
      makeSelect.innerHTML = '<option value="">No makes available</option>';
      console.log('[cascading-dropdowns] No makes available for year', year);
    }
  }
}

/**
 * Populate models for selected year and make
 */
async function populateModels(year, make) {
  const modelSelect = document.getElementById('model-input');

  try {
    modelSelect.innerHTML = '<option value="">Loading...</option>';
    modelSelect.disabled = true;

    // Get user's zip if available for more relevant results
    const zip = wizardData.location?.zip || '';
    const zipParam = zip ? `&zip=${zip}` : '';

    // Try to query MarketCheck for models
    const response = await fetch(`${API_BASE}/api/mc/models?year=${year}&make=${encodeURIComponent(make)}${zipParam}`);

    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }

    const data = await response.json();
    let models = data.models || [];

    // If MarketCheck returns no models, fall back to Supabase saved vehicles
    if (models.length === 0) {
      console.log('[cascading-dropdowns] No models from MarketCheck, falling back to Supabase vehicles');
      const modelsSet = new Set();
      savedVehicles
        .filter(v => parseInt(v.year) === parseInt(year) && v.make === make)
        .forEach(v => {
          if (v.model) modelsSet.add(v.model);
        });
      models = Array.from(modelsSet);

      if (models.length > 0) {
        console.log(`[cascading-dropdowns] Using ${models.length} models from Supabase saved vehicles`);
      }
    }

    // Sort models alphabetically
    models.sort((a, b) => a.localeCompare(b));

    // Populate dropdown
    modelSelect.innerHTML = '<option value="">Select Model</option>';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = capitalizeWords(model);
      modelSelect.appendChild(option);
    });

    modelSelect.disabled = false;

    console.log('[cascading-dropdowns] Populated', models.length, 'models for', year, make);
  } catch (error) {
    console.error('[cascading-dropdowns] Error fetching models from MarketCheck:', error);

    // Fall back to Supabase saved vehicles
    console.log('[cascading-dropdowns] Falling back to Supabase saved vehicles');
    const modelsSet = new Set();
    savedVehicles
      .filter(v => parseInt(v.year) === parseInt(year) && v.make === make)
      .forEach(v => {
        if (v.model) modelsSet.add(v.model);
      });
    const models = Array.from(modelsSet).sort((a, b) => a.localeCompare(b));

    modelSelect.innerHTML = '<option value="">Select Model</option>';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = capitalizeWords(model);
      modelSelect.appendChild(option);
    });

    modelSelect.disabled = false;

    if (models.length > 0) {
      console.log(`[cascading-dropdowns] Using ${models.length} models from Supabase (MarketCheck unavailable)`);
    } else {
      modelSelect.innerHTML = '<option value="">No models available</option>';
      console.log('[cascading-dropdowns] No models available for', year, make);
    }
  }
}

/**
 * Populate trims for selected year, make, and model
 */
async function populateTrims(year, make, model) {
  const trimSelect = document.getElementById('trim-input');

  try {
    trimSelect.innerHTML = '<option value="">Loading...</option>';
    trimSelect.disabled = true;

    // Get user's zip if available for more relevant results
    const zip = wizardData.location?.zip || '';
    const zipParam = zip ? `&zip=${zip}` : '';

    // Try to query MarketCheck for trims
    const response = await fetch(`${API_BASE}/api/mc/trims?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}${zipParam}`);

    if (!response.ok) {
      throw new Error('Failed to fetch trims');
    }

    const data = await response.json();
    let trims = data.trims || [];

    if (trims.length === 0) {
      // Fall back to Supabase saved vehicles
      console.log('[cascading-dropdowns] No trims from MarketCheck, falling back to Supabase vehicles');
      const trimsSet = new Set();
      savedVehicles
        .filter(v => parseInt(v.year) === parseInt(year) && v.make === make && v.model === model)
        .forEach(v => {
          if (v.trim) trimsSet.add(v.trim);
        });
      trims = Array.from(trimsSet).sort((a, b) => a.localeCompare(b));

      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      trims.forEach(trim => {
        const option = document.createElement('option');
        option.value = trim;
        option.textContent = capitalizeWords(trim);
        trimSelect.appendChild(option);
      });
      trimSelect.disabled = false;

      console.log(`[cascading-dropdowns] Using ${trims.length} trims from Supabase (MarketCheck unavailable)`);
      return;
    }

    // Sort trims alphabetically
    trims.sort((a, b) => a.localeCompare(b));

    // Validate each trim by checking if it actually has listings (only if MarketCheck is working)
    console.log('[cascading-dropdowns] Validating', trims.length, 'trims for availability...');
    const validTrims = [];

    // We'll validate trims in batches for better performance
    for (const trim of trims) {
      try {
        const searchResponse = await fetch(
          `${API_BASE}/api/mc/search?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&trim=${encodeURIComponent(trim)}&zip=${zip}&radius=100&rows=1`
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.listings && searchData.listings.length > 0) {
            // Verify the trim actually matches (case-insensitive)
            const listing = searchData.listings[0];
            const listingTrim = listing.trim || listing.build?.trim || '';
            if (listingTrim.toLowerCase() === trim.toLowerCase()) {
              validTrims.push(trim);
              console.log(`[cascading-dropdowns] ✓ Trim "${trim}" has listings`);
            } else {
              console.log(`[cascading-dropdowns] ✗ Trim "${trim}" - no exact match (found "${listingTrim}")`);
            }
          } else {
            console.log(`[cascading-dropdowns] ✗ Trim "${trim}" - no listings found`);
          }
        }
      } catch (err) {
        console.warn(`[cascading-dropdowns] Error validating trim "${trim}":`, err.message);
        // If validation fails due to API quota, skip validation and use all trims
        if (err.message.includes('429')) {
          console.log('[cascading-dropdowns] API quota exhausted, skipping trim validation');
          validTrims.push(...trims.filter(t => !validTrims.includes(t)));
          break;
        }
      }
    }

    // Populate dropdown with only validated trims
    trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';

    if (validTrims.length > 0) {
      validTrims.forEach(trim => {
        const option = document.createElement('option');
        option.value = trim;
        option.textContent = capitalizeWords(trim);
        trimSelect.appendChild(option);
      });
      console.log(`[cascading-dropdowns] Populated ${validTrims.length} validated trims (out of ${trims.length} total)`);
    } else {
      // No valid trims, but don't disable - user can still search without trim
      console.log('[cascading-dropdowns] No valid trims with listings - trim selection optional');
    }

    trimSelect.disabled = false;
  } catch (error) {
    console.error('[cascading-dropdowns] Error fetching trims from MarketCheck:', error);

    // Fall back to Supabase saved vehicles
    console.log('[cascading-dropdowns] Falling back to Supabase saved vehicles');
    const trimsSet = new Set();
    savedVehicles
      .filter(v => parseInt(v.year) === parseInt(year) && v.make === make && v.model === model)
      .forEach(v => {
        if (v.trim) trimsSet.add(v.trim);
      });
    const trims = Array.from(trimsSet).sort((a, b) => a.localeCompare(b));

    trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
    trims.forEach(trim => {
      const option = document.createElement('option');
      option.value = trim;
      option.textContent = capitalizeWords(trim);
      trimSelect.appendChild(option);
    });
    trimSelect.disabled = false;

    console.log(`[cascading-dropdowns] Using ${trims.length} trims from Supabase (MarketCheck unavailable)`);
  }
}

/**
 * Show saved vehicles dropdown
 */
function showSavedVehiclesDropdown() {
  const dropdown = document.getElementById('saved-vehicles-dropdown');
  dropdown.innerHTML = '';

  console.log('[dropdown] Showing saved vehicles dropdown, count:', savedVehicles.length);

  if (savedVehicles.length === 0) {
    dropdown.innerHTML = '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No saved vehicles</div>';
    dropdown.style.display = 'block';
    return;
  }

  savedVehicles.forEach((vehicle, index) => {
    console.log(`[dropdown] Adding vehicle ${index + 1}:`, vehicle.vin, vehicle.year, vehicle.make, vehicle.model);
    const item = document.createElement('div');
    item.className = 'saved-vehicle-item';
    item.innerHTML = `
      <div class="saved-vehicle-item__title">${vehicle.year || ''} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(vehicle.model || '')}</div>
      <div class="saved-vehicle-item__details">${capitalizeWords(vehicle.trim || '')} • ${formatMileage(vehicle.mileage || 0)} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${formatVIN(vehicle.vin || 'N/A')}</div>
    `;
    item.addEventListener('click', () => selectSavedVehicle(vehicle));
    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
  console.log('[dropdown] Dropdown displayed with', dropdown.children.length, 'items');
}

/**
 * Filter saved vehicles by search term
 */
function filterSavedVehicles(searchTerm) {
  const dropdown = document.getElementById('saved-vehicles-dropdown');
  const filtered = savedVehicles.filter(v =>
    (v.vin && v.vin.includes(searchTerm)) ||
    (v.make && v.make.toUpperCase().includes(searchTerm)) ||
    (v.model && v.model.toUpperCase().includes(searchTerm)) ||
    (v.year && String(v.year).includes(searchTerm))
  );

  dropdown.innerHTML = '';

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No matches found</div>';
    dropdown.style.display = 'block';
    return;
  }

  filtered.forEach(vehicle => {
    const item = document.createElement('div');
    item.className = 'saved-vehicle-item';
    item.innerHTML = `
      <div class="saved-vehicle-item__title">${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}</div>
      <div class="saved-vehicle-item__details">${vehicle.trim || ''} • ${vehicle.mileage?.toLocaleString() || 'N/A'} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${vehicle.vin || 'N/A'}</div>
    `;
    item.addEventListener('click', () => selectSavedVehicle(vehicle));
    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
}

/**
 * Select a saved vehicle
 */
function selectSavedVehicle(vehicle) {
  document.getElementById('vin-input').value = vehicle.vin || '';
  document.getElementById('saved-vehicles-dropdown').style.display = 'none';
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

  const modal = document.getElementById('unavailable-vehicle-modal');
  const detailsDiv = document.getElementById('unavailable-vehicle-details');

  // Populate vehicle details
  detailsDiv.innerHTML = `
    <strong>Vehicle Information:</strong>
    <div class="vehicle-info">${vehicle.year || 'N/A'} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(vehicle.model || '')}</div>
    ${vehicle.trim ? `<div class="vehicle-info">Trim: ${capitalizeWords(vehicle.trim)}</div>` : ''}
    ${vehicle.mileage ? `<div class="vehicle-info">Mileage: ${formatMileage(vehicle.mileage)} miles</div>` : ''}
    <div class="vehicle-info">VIN: ${formatVIN(vehicle.vin || 'N/A')}</div>
  `;

  modal.style.display = 'flex';
  console.log('[unavailable-vehicle] Modal shown for:', vehicle.vin);
}

/**
 * Close unavailable vehicle modal
 */
function closeUnavailableVehicleModal() {
  const modal = document.getElementById('unavailable-vehicle-modal');
  modal.style.display = 'none';
  unavailableVehicleData = null;

  // Clear VIN input
  document.getElementById('vin-input').value = '';

  console.log('[unavailable-vehicle] Modal closed');
}
window.closeUnavailableVehicleModal = closeUnavailableVehicleModal;

/**
 * Remove unavailable vehicle from database
 */
async function removeUnavailableVehicle() {
  if (!unavailableVehicleData || !unavailableVehicleData.vin) {
    console.error('[remove-vehicle] No vehicle data to remove');
    return;
  }

  if (!supabase || !currentUserId) {
    alert('Unable to remove vehicle: Not signed in');
    return;
  }

  try {
    console.log('[remove-vehicle] Removing vehicle:', unavailableVehicleData.vin);

    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('user_id', currentUserId)
      .eq('vin', unavailableVehicleData.vin);

    if (error) {
      console.error('[remove-vehicle] Error removing vehicle:', error);
      alert('Failed to remove vehicle from database');
      return;
    }

    console.log('[remove-vehicle] Vehicle removed successfully');

    // Reload saved vehicles to update the dropdown
    await loadSavedVehicles();

    // Close modal
    closeUnavailableVehicleModal();

    // Show success message
    alert('Vehicle removed from your saved vehicles');

  } catch (error) {
    console.error('[remove-vehicle] Error:', error);
    alert('Failed to remove vehicle');
  }
}
window.removeUnavailableVehicle = removeUnavailableVehicle;

/**
 * Search for vehicle by VIN and show similar vehicles
 * @param {string} vin - The VIN to search
 * @param {object} savedVehicle - Optional saved vehicle data (if loading from saved vehicles)
 */
async function searchVehicleByVIN(vin, savedVehicle = null) {
  const vinInput = document.getElementById('vin-input');
  const loading = document.getElementById('vin-loading');
  const similarSection = document.getElementById('similar-vehicles-section');
  const similarGrid = document.getElementById('similar-vehicles-grid');

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    alert('Please enter a valid 17-character VIN');
    return;
  }

  // Check if user has entered location (required for distance calculations and Smart Offer)
  const userZip = wizardData.location?.zip;
  if (!userZip) {
    alert('Please enter your location first.\n\nYour location is needed to:\n• Calculate distance from dealer\n• Find similar vehicles nearby\n• Generate Smart Offer pricing');
    document.getElementById('user-location').focus();
    return;
  }

  console.log('[search-vehicle] Searching for VIN:', vin, 'from zip:', userZip);

  loading.style.display = 'block';
  vinInput.disabled = true;
  similarSection.style.display = 'none';

  try {
    let vehicleDetails = null;
    let allSimilarVehicles = [];

    // 1. Try to get vehicle details by VIN from MarketCheck
    try {
      const vinResponse = await fetch(`${API_BASE}/api/mc/by-vin/${vin}?zip=${userZip}&radius=100`);

      if (vinResponse.ok) {
        const vinData = await vinResponse.json();
        if (vinData.ok && vinData.payload) {
          vehicleDetails = vinData.payload;
        }
      }
    } catch (mcError) {
      console.log('[search-vehicle] MarketCheck VIN lookup failed:', mcError.message);
    }

    // 2. If MarketCheck failed and we have saved vehicle data, use it
    if (!vehicleDetails && savedVehicle) {
      console.log('[search-vehicle] Using saved vehicle data (MarketCheck unavailable)');
      vehicleDetails = savedVehicle;
    }

    // If we still don't have vehicle details, throw error
    if (!vehicleDetails) {
      throw new Error('VIN not found');
    }

    // 3. Try to search for similar vehicles from MarketCheck
    try {
      const searchParams = new URLSearchParams({
        year: vehicleDetails.year,
        make: vehicleDetails.make,
        model: vehicleDetails.model,
        zip: userZip,
        radius: 100,
        rows: 50
      });

      const searchResponse = await fetch(`${API_BASE}/api/mc/search?${searchParams}`);
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        allSimilarVehicles = searchData.listings || [];
      }
    } catch (mcError) {
      console.log('[search-vehicle] MarketCheck search failed:', mcError.message);
      // Continue with empty similar vehicles array
    }

    // 4. Calculate Smart Offer for display in "Your Vehicle" card
    // This will use saved vehicles even if MarketCheck is unavailable
    const smartOfferData = calculateQuickSmartOffer(allSimilarVehicles, vehicleDetails);

    // 5. Display the user's vehicle with Smart Offer
    displayYourVehicle(vehicleDetails, smartOfferData);

    // 6. Prioritize vehicles by trim match quality
    similarVehicles = prioritizeVehiclesByTrim(allSimilarVehicles, vehicleDetails);

    // 7. Auto-select the vehicle (whether or not similar vehicles are found)
    console.log('[search-vehicle] Auto-selecting vehicle');
    selectedVehicle = {
      ...vehicleDetails,
      condition: vehicleDetails.condition || (parseInt(vehicleDetails.year) >= new Date().getFullYear() ? 'new' : 'used')
    };
    hideManualEntry();

    // Populate vehicle price field with asking price or Smart Offer
    const vehiclePriceInput = document.getElementById('vehicle-price');
    if (vehiclePriceInput) {
      const priceToUse = smartOfferData?.offer || vehicleDetails.asking_price;
      if (priceToUse) {
        vehiclePriceInput.value = formatCurrency(priceToUse);
        vehiclePriceInput.dataset.basePrice = priceToUse; // Store base price for formula calculations
        wizardData.financing.salePrice = priceToUse;
        console.log('[vehicle-price] Auto-populated with:', formatCurrency(priceToUse));
      }
    }

    // 8. Display similar vehicles if found (as alternatives)
    if (similarVehicles.length > 0) {
      displaySimilarVehicles(similarVehicles, vehicleDetails);
      similarSection.style.display = 'block';
    }

  } catch (error) {
    console.error('[search-vehicle] Error:', error);

    // If this was a saved vehicle that's no longer available and we couldn't use saved data
    if (savedVehicle && !error.message.includes('quota')) {
      console.log('[search-vehicle] Saved vehicle not found in MarketCheck:', savedVehicle.vin);
      showUnavailableVehicleModal(savedVehicle);
    } else {
      // Manual VIN entry that failed - just show alert
      alert(`Could not find vehicle: ${error.message}`);
    }

  } finally {
    loading.style.display = 'none';
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
  const matchingSavedVehicles = savedVehicles.filter(sv =>
    sv.year === vehicle.year &&
    sv.make?.toLowerCase() === vehicle.make?.toLowerCase() &&
    sv.model?.toLowerCase() === vehicle.model?.toLowerCase() &&
    sv.asking_price && sv.asking_price > 0 &&
    sv.vin !== vehicle.vin // Don't compare vehicle to itself
  );

  console.log('[smart-offer] Found', matchingSavedVehicles.length, 'matching saved vehicles');

  // Combine MarketCheck results with saved vehicles
  const allVehicles = [...similarVehicles, ...matchingSavedVehicles];
  const vehiclesWithPrices = allVehicles.filter(v => v.asking_price && v.asking_price > 0);

  if (vehiclesWithPrices.length < 3) {
    return null; // Not enough data
  }

  // Try exact trim match first
  let filteredVehicles = [];
  if (vehicle.trim) {
    const vehicleTrim = vehicle.trim.toLowerCase();
    filteredVehicles = vehiclesWithPrices.filter(v =>
      v.trim && v.trim.toLowerCase() === vehicleTrim
    );
  }

  // Fall back to all vehicles if not enough exact matches
  if (filteredVehicles.length < 3) {
    filteredVehicles = vehiclesWithPrices;
  }

  // Check for significantly cheaper saved vehicles (same trim, $5k+ cheaper)
  let cheaperSavedVehicle = null;
  if (vehicle.trim) {
    const sameTrimSaved = matchingSavedVehicles.filter(sv =>
      sv.trim?.toLowerCase() === vehicle.trim.toLowerCase() &&
      sv.asking_price < vehicle.asking_price - 5000 // At least $5k cheaper
    );

    if (sameTrimSaved.length > 0) {
      // Find the cheapest one
      cheaperSavedVehicle = sameTrimSaved.reduce((cheapest, current) =>
        current.asking_price < cheapest.asking_price ? current : cheapest
      );
      console.log('[smart-offer] WARNING: Found cheaper saved vehicle:', {
        vin: cheaperSavedVehicle.vin,
        price: cheaperSavedVehicle.asking_price,
        difference: vehicle.asking_price - cheaperSavedVehicle.asking_price
      });
    }
  }

  // Calculate market statistics
  const prices = filteredVehicles.map(v => v.asking_price).sort((a, b) => a - b);
  const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const lowestPrice = prices[0];
  const highestPrice = prices[prices.length - 1];
  const priceRange = highestPrice - lowestPrice;

  // Determine vehicle's market position
  const percentileInMarket = priceRange > 0 ? (vehicle.asking_price - lowestPrice) / priceRange : 0.5;
  const vsAverage = vehicle.asking_price / average;

  let smartOffer;
  let message = '';
  let pricePosition = '';

  // CASE 1: Vehicle is already the cheapest or within 5% of lowest price
  if (vehicle.asking_price <= lowestPrice * 1.05) {
    smartOffer = vehicle.asking_price - 500; // Only $500 discount
    message = 'Already at a great price!';
    pricePosition = 'lowest';
    console.log('[smart-offer] Vehicle is at/near lowest price - minimal discount');
  }
  // CASE 2: Vehicle is below market average (good deal already)
  else if (vsAverage < 0.95) {
    // 3-5% discount for below-average prices
    const discountPercent = 0.04;
    smartOffer = Math.round((vehicle.asking_price * (1 - discountPercent)) / 500) * 500;
    message = 'Priced below market average';
    pricePosition = 'below-average';
    console.log('[smart-offer] Vehicle below average - small discount:', discountPercent * 100 + '%');
  }
  // CASE 3: Vehicle is near market average (±5%)
  else if (vsAverage >= 0.95 && vsAverage <= 1.05) {
    // 8% discount for average-priced vehicles
    const discountPercent = 0.08;
    smartOffer = Math.round((vehicle.asking_price * (1 - discountPercent)) / 500) * 500;
    message = 'Priced at market average';
    pricePosition = 'average';
    console.log('[smart-offer] Vehicle at average - moderate discount:', discountPercent * 100 + '%');
  }
  // CASE 4: Vehicle is above market average (room for negotiation)
  else {
    // 10-12% discount for above-average prices
    const discountPercent = vsAverage > 1.15 ? 0.12 : 0.10;
    smartOffer = Math.round((vehicle.asking_price * (1 - discountPercent)) / 500) * 500;
    message = 'Priced above market average';
    pricePosition = 'above-average';
    console.log('[smart-offer] Vehicle above average - larger discount:', discountPercent * 100 + '%');
  }

  // CRITICAL: Override market position if cheaper saved vehicle exists
  let priceDiff = 0;
  if (cheaperSavedVehicle) {
    priceDiff = vehicle.asking_price - cheaperSavedVehicle.asking_price;
    message = `Appears ${formatCurrency(priceDiff)} higher than similar vehicle`;
    pricePosition = 'overpriced-vs-saved';
  }

  // Safety check: Smart Offer must be at least $500 below asking
  const minimumOffer = vehicle.asking_price - 500;
  smartOffer = Math.min(smartOffer, minimumOffer);

  console.log('[smart-offer] Calculation:', {
    userAskingPrice: vehicle.asking_price,
    marketAverage: Math.round(average),
    lowestPrice,
    highestPrice,
    vsAverage: (vsAverage * 100).toFixed(1) + '%',
    pricePosition,
    calculatedOffer: smartOffer,
    discount: vehicle.asking_price - smartOffer,
    discountPercent: ((vehicle.asking_price - smartOffer) / vehicle.asking_price * 100).toFixed(1) + '%',
    cheaperSavedVehicle: cheaperSavedVehicle ? {
      vin: cheaperSavedVehicle.vin,
      price: cheaperSavedVehicle.asking_price,
      difference: priceDiff
    } : null
  });

  return {
    offer: smartOffer,
    average: Math.round(average),
    count: filteredVehicles.length,
    message,
    pricePosition,
    lowestPrice,
    highestPrice,
    cheaperSavedVehicle: cheaperSavedVehicle ? {
      vin: cheaperSavedVehicle.vin,
      year: cheaperSavedVehicle.year,
      make: cheaperSavedVehicle.make,
      model: cheaperSavedVehicle.model,
      trim: cheaperSavedVehicle.trim,
      asking_price: cheaperSavedVehicle.asking_price,
      mileage: cheaperSavedVehicle.mileage,
      photo_url: cheaperSavedVehicle.photo_url,
      priceDifference: priceDiff
    } : null
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
  if (modelLower.startsWith(makeLower + ' ')) {
    return model.substring(make.length + 1);
  }

  return model;
}

/**
 * Display the user's vehicle in a prominent card with badge
 */
function displayYourVehicle(vehicle, smartOfferData = null) {
  const section = document.getElementById('your-vehicle-section');
  const card = document.getElementById('your-vehicle-card');

  // Clean model name to avoid duplicates
  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);

  // Make card clickable if listing URL exists
  const cardClickHandler = vehicle.listing_url
    ? `onclick="window.open('${vehicle.listing_url}', '_blank')" style="cursor: pointer;"`
    : '';

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
  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(cleanedModel || '')}${vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ''}`;

  // Warning about cheaper saved vehicle
  const cheaperVehicleWarning = smartOfferData?.cheaperSavedVehicle ? `
    <div class="cheaper-vehicle-warning">
      <div class="cheaper-vehicle-warning__icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
      </div>
      <div class="cheaper-vehicle-warning__content">
        <div class="cheaper-vehicle-warning__title">Similar Vehicle Found for Less</div>
        <div class="cheaper-vehicle-warning__details">
          You previously viewed a ${smartOfferData.cheaperSavedVehicle.year} ${capitalizeWords(smartOfferData.cheaperSavedVehicle.make)} ${capitalizeWords(smartOfferData.cheaperSavedVehicle.model)} ${smartOfferData.cheaperSavedVehicle.trim ? '- ' + capitalizeWords(smartOfferData.cheaperSavedVehicle.trim) : ''} for <strong>${formatCurrency(smartOfferData.cheaperSavedVehicle.asking_price)}</strong>
          (${formatCurrency(smartOfferData.cheaperSavedVehicle.priceDifference)} less).
          <a href="#" class="cheaper-vehicle-link" onclick="event.preventDefault(); document.getElementById('vin-input').value='${smartOfferData.cheaperSavedVehicle.vin}'; searchVehicleByVIN('${smartOfferData.cheaperSavedVehicle.vin}');">
            View that vehicle
          </a>
        </div>
      </div>
    </div>
  ` : '';

  const smartOfferHtml = smartOfferData ? `
    <div class="your-vehicle-card__smart-offer">
      <div class="your-vehicle-card__smart-offer-badge">
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"></path>
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"></path>
        </svg>
        <span>Smart Offer</span>
      </div>
      <div class="your-vehicle-card__smart-offer-value">${formatCurrency(smartOfferData.offer)}</div>
      <div class="your-vehicle-card__smart-offer-text">${smartOfferData.message || 'Based on ' + smartOfferData.count + ' similar vehicles'}</div>
      ${cheaperVehicleWarning}
    </div>
  ` : '';

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
          ${vehicle.mileage ? `
            <div class="your-vehicle-card__info-inline">
              <span class="label">Mileage:</span>
              <span class="value">${formatMileage(vehicle.mileage)} mi</span>
            </div>
          ` : ''}
          ${vehicle.asking_price ? `
            <div class="your-vehicle-card__info-inline">
              <span class="label">Asking Price:</span>
              <span class="value">${formatCurrency(vehicle.asking_price)}</span>
            </div>
          ` : ''}
        </div>

        ${smartOfferHtml}

        <div class="your-vehicle-card__vin">
          <span class="label">VIN:</span> ${formatVIN(vehicle.vin)}
        </div>
      </div>
    </div>
  `;

  section.style.display = 'block';
  console.log('[your-vehicle] Displayed vehicle card:', vehicle.vin, smartOfferData);
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
  const trimKeywords = originalTrim.split(/\s+/).filter(w => w.length > 2);

  // Categorize vehicles by match quality
  const exactMatches = [];
  const similarMatches = [];
  const otherVehicles = [];

  vehicles.forEach(vehicle => {
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
    else if (trimKeywords.some(keyword => vehicleTrim.includes(keyword))) {
      similarMatches.push(vehicle);
    }
    // Other trims
    else {
      otherVehicles.push(vehicle);
    }
  });

  console.log('[similar-vehicles] Trim prioritization:', {
    original: originalVehicle.trim,
    exact: exactMatches.length,
    similar: similarMatches.length,
    other: otherVehicles.length
  });

  // Combine in priority order, limit to 12 total
  const prioritized = [
    ...exactMatches,
    ...similarMatches,
    ...otherVehicles
  ].slice(0, 12);

  return prioritized;
}

/**
 * Display similar vehicles in horizontal scrollable grid
 */
function displaySimilarVehicles(vehicles, originalVehicle) {
  const grid = document.getElementById('similar-vehicles-grid');
  grid.innerHTML = '';

  vehicles.forEach((vehicle, index) => {
    const card = document.createElement('div');
    card.className = 'vehicle-card';
    card.dataset.index = index;

    const isOriginal = vehicle.vin === originalVehicle.vin;

    // Determine trim match badge
    let trimMatchBadge = '';
    if (originalVehicle.trim && vehicle.trim && !isOriginal) {
      const originalTrim = originalVehicle.trim.toLowerCase();
      const vehicleTrim = vehicle.trim.toLowerCase();
      const trimKeywords = originalTrim.split(/\s+/).filter(w => w.length > 2);

      if (vehicleTrim === originalTrim) {
        trimMatchBadge = '<div class="vehicle-card__trim-badge exact">Exact Match</div>';
      } else if (trimKeywords.some(keyword => vehicleTrim.includes(keyword))) {
        trimMatchBadge = '<div class="vehicle-card__trim-badge similar">Similar Trim</div>';
      }
    }

    card.innerHTML = `
      ${isOriginal ? '<div class="vehicle-card__badge">Your VIN</div>' : trimMatchBadge}
      ${vehicle.photo_url ? `<img src="${vehicle.photo_url}" alt="${vehicle.heading}" class="vehicle-card__image" onerror="this.style.display='none'">` : '<div class="vehicle-card__image"></div>'}
      <div class="vehicle-card__title">${vehicle.year} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(vehicle.model || '')}</div>
      <div class="vehicle-card__details">
        ${vehicle.trim ? `<div class="vehicle-card__detail"><span>${capitalizeWords(vehicle.trim)}</span></div>` : ''}
        ${vehicle.mileage ? `
          <div class="vehicle-card__detail">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
            </svg>
            ${formatMileage(vehicle.mileage)} mi
          </div>
        ` : ''}
      </div>
      ${vehicle.asking_price ? `<div class="vehicle-card__price">${formatCurrency(vehicle.asking_price)}</div>` : '<div class="vehicle-card__price">Price Not Available</div>'}
      ${vehicle.dealer_city && vehicle.dealer_state ? `<div class="vehicle-card__location">${capitalizeWords(vehicle.dealer_city || '')}, ${vehicle.dealer_state}</div>` : ''}
      <div class="vehicle-card__vin">VIN: ${formatVIN(vehicle.vin)}</div>
    `;

    card.addEventListener('click', () => selectVehicleCard(index));
    grid.appendChild(card);
  });
}

/**
 * Select a vehicle from the similar vehicles grid
 */
async function selectVehicleCard(index) {
  const vehicle = similarVehicles[index];

  document.querySelectorAll('.vehicle-card').forEach(card => {
    card.classList.remove('selected');
  });

  document.querySelector(`.vehicle-card[data-index="${index}"]`).classList.add('selected');

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
    mileage: vehicleDetails.mileage
  };

  showSelectedVehicle();
  hideManualEntry();
}

/**
 * Select vehicle from search results
 */
/**
 * Select vehicle from search and save to Supabase
 */
async function selectVehicleFromSearch(vehicle) {
  try {
    console.log('[vehicle-select] Selected vehicle:', vehicle);

    // Store full vehicle data
    selectedVehicle = {
      vin: vehicle.vin,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || '',
      mileage: vehicle.mileage || 0,
      condition: vehicle.condition || 'Used',
      heading: vehicle.heading || `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
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
      listing_source: 'marketcheck',
      listing_url: vehicle.listing_url || null,
      photo_url: vehicle.photo_url || null
    };

    // Save to Supabase if user is signed in
    if (supabase && currentUserId) {
      console.log('[vehicle-select] Saving to Supabase...');

      // Check if vehicle already exists
      const { data: existingVehicles } = await supabase
        .from('vehicles')
        .select('id')
        .eq('user_id', currentUserId)
        .eq('vin', selectedVehicle.vin)
        .limit(1);

      if (!existingVehicles || existingVehicles.length === 0) {
        // Insert new vehicle
        const { data, error } = await supabase
          .from('vehicles')
          .insert([{
            user_id: currentUserId,
            ...selectedVehicle
          }])
          .select();

        if (error) {
          console.error('[vehicle-select] Error saving vehicle:', error);
        } else {
          console.log('[vehicle-select] Vehicle saved successfully:', data);
          // Reload saved vehicles to update the dropdown
          await loadSavedVehicles();
        }
      } else {
        console.log('[vehicle-select] Vehicle already exists in database');
      }
    }

    // Auto-populate Vehicle Price field
    if (selectedVehicle.asking_price) {
      const vehiclePriceInput = document.getElementById('vehicle-price');
      if (vehiclePriceInput) {
        vehiclePriceInput.value = formatCurrency(selectedVehicle.asking_price);
        vehiclePriceInput.dataset.basePrice = selectedVehicle.asking_price; // Store base price for formula calculations
        wizardData.financing.salePrice = selectedVehicle.asking_price;
        console.log('[vehicle-select] Auto-populated Vehicle Price:', formatCurrency(selectedVehicle.asking_price));
      }
    }

    // Reset custom APR override when vehicle changes
    customAprOverride = null;
    console.log('[vehicle-change] Reset custom APR override');
    // Reset tooltip original values
    if (window.resetAprTooltipOriginal) window.resetAprTooltipOriginal();
    if (window.resetTermTooltipOriginal) window.resetTermTooltipOriginal();
    if (window.resetMonthlyFCTooltipOriginal) window.resetMonthlyFCTooltipOriginal();

    showSelectedVehicle();
    hideManualEntry();

    // Calculate and display Smart Offer
    await calculateSmartOffer(selectedVehicle);
  } catch (error) {
    console.error('[vehicle-select] Error selecting vehicle:', error);
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
  document.getElementById('your-vehicle-section').style.display = 'none';
  document.getElementById('smart-offer-display').style.display = 'none';
  document.getElementById('similar-vehicles-section').style.display = 'none';
  document.getElementById('manual-entry-fields').style.display = 'block';
  document.getElementById('vin-input').value = '';
  document.getElementById('vin-input').focus();
}

/**
 * Calculate Smart Offer based on market data
 */
async function calculateSmartOffer(vehicle) {
  try {
    const userZip = wizardData.location?.zip;
    if (!userZip) {
      console.log('[smart-offer] No user location, skipping Smart Offer');
      return;
    }

    console.log('[smart-offer] Calculating Smart Offer for:', vehicle);

    // Query Marketcheck for similar vehicles (broader search first)
    const searchParams = new URLSearchParams({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      zip: userZip,
      radius: 100,
      rows: 100  // Get more results to enable trim filtering
    });

    // Add trim to search if available (API may support it)
    if (vehicle.trim) {
      searchParams.append('trim', vehicle.trim);
    }

    const response = await fetch(`${API_BASE}/api/mc/search?${searchParams}`);
    if (!response.ok) {
      throw new Error('Failed to fetch similar vehicles');
    }

    const data = await response.json();
    const allVehicles = data.listings || [];

    console.log('[smart-offer] Found', allVehicles.length, 'total vehicles');

    // Filter out vehicles without asking prices
    const vehiclesWithPrices = allVehicles.filter(v => v.asking_price && v.asking_price > 0);

    // Tiered trim filtering for statistical significance
    const MIN_EXACT_MATCHES = 5;  // Ideal: exact trim matches
    const MIN_SIMILAR_MATCHES = 3; // Acceptable: similar trim matches
    const MIN_BROAD_MATCHES = 3;   // Minimum: any trim (with warning)

    let filteredVehicles = [];
    let matchQuality = 'none';
    let trimMatchInfo = '';

    if (vehicle.trim) {
      const vehicleTrim = vehicle.trim.toLowerCase();

      // Level 1: Try exact trim match
      const exactMatches = vehiclesWithPrices.filter(v =>
        v.trim && v.trim.toLowerCase() === vehicleTrim
      );

      console.log('[smart-offer] Exact trim matches:', exactMatches.length);

      if (exactMatches.length >= MIN_EXACT_MATCHES) {
        filteredVehicles = exactMatches;
        matchQuality = 'exact';
        trimMatchInfo = `exact "${capitalizeWords(vehicle.trim)}" trim`;
      } else {
        // Level 2: Try similar trim (contains key words)
        const trimKeywords = vehicleTrim.split(/\s+/).filter(w => w.length > 2);
        const similarMatches = vehiclesWithPrices.filter(v => {
          if (!v.trim) return false;
          const vTrim = v.trim.toLowerCase();
          return trimKeywords.some(keyword => vTrim.includes(keyword));
        });

        console.log('[smart-offer] Similar trim matches:', similarMatches.length);

        if (similarMatches.length >= MIN_SIMILAR_MATCHES) {
          filteredVehicles = similarMatches;
          matchQuality = 'similar';
          trimMatchInfo = `similar to "${capitalizeWords(vehicle.trim)}" trim`;
        } else if (vehiclesWithPrices.length >= MIN_BROAD_MATCHES) {
          // Level 3: Use broader search with warning
          filteredVehicles = vehiclesWithPrices;
          matchQuality = 'broad';
          trimMatchInfo = 'all trims (limited trim-specific data)';
        }
      }
    } else {
      // No trim specified - use all vehicles
      if (vehiclesWithPrices.length >= MIN_BROAD_MATCHES) {
        filteredVehicles = vehiclesWithPrices;
        matchQuality = 'no-trim';
        trimMatchInfo = 'all trims';
      }
    }

    // Check if we have statistically significant data
    if (filteredVehicles.length < MIN_BROAD_MATCHES) {
      console.log('[smart-offer] Insufficient data:', filteredVehicles.length, 'vehicles');
      displayInsufficientDataWarning(vehicle, filteredVehicles.length);
      return;
    }

    // Extract and sort prices
    const prices = filteredVehicles.map(v => v.asking_price).sort((a, b) => a - b);

    // Calculate statistics
    const count = prices.length;
    const average = prices.reduce((sum, price) => sum + price, 0) / count;
    const median = prices[Math.floor(count / 2)];
    const min = prices[0];
    const max = prices[prices.length - 1];

    // Calculate standard deviation
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - average, 2), 0) / count;
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

    const mileageAnalysis = calculateMileageDepreciation(filteredVehicles, vehicle, matchQuality);

    // Smart Offer Algorithm:
    // - Start with median (more robust than average for outliers)
    // - Adjust discount based on match quality
    // - Apply mileage-based adjustment (if calculated)
    // - Ensure it's not below minimum (would be unrealistic)
    // - Round to nearest $500 for psychological appeal
    const discountPercent = matchQuality === 'exact' ? 0.06 :
                           matchQuality === 'similar' ? 0.05 :
                           0.04; // More conservative for broad matches

    const basePrice = matchQuality === 'exact' ? median :
                     (median + average) / 2; // Average median and mean for less certain data

    let recommendedOffer = Math.round((basePrice * (1 - discountPercent)) / 500) * 500;

    // Apply mileage adjustment if analysis is reliable
    if (mileageAnalysis.hasReliableData && mileageAnalysis.adjustment !== 0) {
      console.log('[smart-offer] Applying mileage adjustment:', mileageAnalysis.adjustment);
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
    const confidenceScore = calculateConfidenceScore(count, matchQuality, stdDev, average);

    console.log('[smart-offer] Price Analysis:', {
      count,
      matchQuality,
      average,
      median,
      min,
      max,
      stdDev,
      recommendedOffer: finalOffer,
      savings: savingsFromAverage,
      confidence: confidenceScore
    });

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
      mileageAnalysis // Add mileage impact data for display
    });

  } catch (error) {
    console.error('[smart-offer] Error calculating Smart Offer:', error);
    document.getElementById('smart-offer-display').style.display = 'none';
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
    correlation: 'none', // 'none', 'weak', 'moderate', 'strong'
    vehicleCount: 0
  };

  // Only calculate for vehicles with mileage data
  const vehiclesWithMileage = vehicles.filter(v =>
    v.mileage && v.mileage > 0 && v.asking_price && v.asking_price > 0
  );

  analysis.vehicleCount = vehiclesWithMileage.length;

  // Require minimum sample size and exact trim matches for accuracy
  const MIN_VEHICLES_FOR_MILEAGE_ANALYSIS = 5;
  if (vehiclesWithMileage.length < MIN_VEHICLES_FOR_MILEAGE_ANALYSIS) {
    console.log('[mileage-analysis] Insufficient data:', vehiclesWithMileage.length, 'vehicles');
    return analysis;
  }

  // Only use mileage analysis for exact trim matches
  // Mixed trims have too much price variance from trim differences
  if (matchQuality !== 'exact') {
    console.log('[mileage-analysis] Skipping - only exact trim matches supported');
    return analysis;
  }

  // Require user vehicle to have mileage
  if (!userVehicle.mileage || userVehicle.mileage <= 0) {
    console.log('[mileage-analysis] User vehicle has no mileage data');
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

  vehiclesWithMileage.forEach(v => {
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
  const rSquared = 1 - (ssResidual / ssTotal);

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
    analysis.correlation = 'weak';
    analysis.hasReliableData = false; // Don't adjust price for weak correlations
  } else if (analysis.rSquared < 0.6) {
    analysis.correlation = 'moderate';
    analysis.hasReliableData = true;
  } else {
    analysis.correlation = 'strong';
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
    analysis.adjustment = Math.round(-1 * (analysis.mileageDifference / 1000) * analysis.depreciationPer1kMiles);

    // Cap adjustment at ±20% of average price to prevent extreme values
    const maxAdjustment = meanY * 0.20;
    analysis.adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, analysis.adjustment));
  }

  console.log('[mileage-analysis] Analysis complete:', {
    vehicles: n,
    avgMileage: analysis.averageMileage,
    userMileage: analysis.userMileage,
    depreciationPer1k: analysis.depreciationPer1kMiles,
    rSquared: analysis.rSquared.toFixed(3),
    correlation: analysis.correlation,
    adjustment: analysis.adjustment,
    reliable: analysis.hasReliableData
  });

  return analysis;
}

/**
 * Calculate confidence score for Smart Offer
 * @returns {string} - 'high', 'medium', or 'low'
 */
function calculateConfidenceScore(count, matchQuality, stdDev, average) {
  const coefficientOfVariation = stdDev / average; // Normalized measure of dispersion

  // High confidence: exact trim, good sample size, low variance
  if (matchQuality === 'exact' && count >= 10 && coefficientOfVariation < 0.15) {
    return 'high';
  }

  // Medium confidence: similar trim or decent sample
  if ((matchQuality === 'similar' && count >= 5) ||
      (matchQuality === 'exact' && count >= 5) ||
      (count >= 15 && coefficientOfVariation < 0.20)) {
    return 'medium';
  }

  // Low confidence: broad match or small sample
  return 'low';
}

/**
 * Display warning when insufficient data is available
 */
function displayInsufficientDataWarning(vehicle, count) {
  const display = document.getElementById('smart-offer-display');
  const content = display.querySelector('.smart-offer-content');

  content.innerHTML = `
    <div class="smart-offer-warning">
      <div class="smart-offer-warning-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 48px; height: 48px;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
      </div>
      <div class="smart-offer-warning-title">Limited Market Data</div>
      <div class="smart-offer-warning-text">
        We found only ${count} similar ${vehicle.year} ${capitalizeWords(vehicle.make)} ${capitalizeWords(vehicle.model)}
        ${vehicle.trim ? `<strong>${capitalizeWords(vehicle.trim)}</strong>` : ''} vehicles in your area.
        <br><br>
        This ${vehicle.trim ? 'trim may be rare' : 'vehicle'} or in limited supply.
        We need at least 3 comparable vehicles to provide a reliable Smart Offer.
        <br><br>
        <strong>Recommendation:</strong> Expand your search radius or consult with a dealer for pricing guidance on this specific vehicle.
      </div>
    </div>
  `;

  display.style.display = 'block';
}

/**
 * Display Smart Offer recommendation
 */
function displaySmartOffer(data) {
  const display = document.getElementById('smart-offer-display');
  const content = document.getElementById('smart-offer-content');

  // Determine confidence badge styling
  const confidenceBadgeClass = data.confidence === 'high' ? 'confidence-high' :
                               data.confidence === 'medium' ? 'confidence-medium' :
                               'confidence-low';
  const confidenceLabel = data.confidence === 'high' ? 'High Confidence' :
                         data.confidence === 'medium' ? 'Medium Confidence' :
                         'Low Confidence';
  const confidenceIcon = data.confidence === 'high' ? '✓' :
                        data.confidence === 'medium' ? '•' :
                        '⚠';

  // Determine trim match badge styling
  const trimBadgeClass = data.matchQuality === 'exact' ? 'trim-exact' :
                        data.matchQuality === 'similar' ? 'trim-similar' :
                        'trim-broad';

  // Confidence explanation text
  const confidenceText = data.confidence === 'high' ?
    'Strong statistical significance with exact trim matches and consistent pricing.' :
    data.confidence === 'medium' ?
    'Good data quality with sufficient comparable vehicles.' :
    'Limited comparable data. Use this as a starting point but verify with additional research.';

  // Warning for broad trim matches
  const trimWarning = (data.matchQuality === 'broad' || data.matchQuality === 'no-trim') ? `
    <div class="smart-offer-trim-warning">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 20px; height: 20px; flex-shrink: 0;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
      <div>
        <strong>Mixed Trim Data:</strong> Limited ${data.vehicle.trim ? 'exact trim' : 'trim'} matches found.
        This analysis includes ${data.matchQuality === 'broad' ? 'multiple trims' : 'all available trims'}.
        Pricing may vary significantly based on specific trim packages and options.
      </div>
    </div>
  ` : '';

  // ============================================================================
  // MILEAGE IMPACT VISUALIZATION
  // ============================================================================
  // Show how mileage affects pricing when we have reliable data
  let mileageImpact = '';
  if (data.mileageAnalysis && data.mileageAnalysis.hasReliableData) {
    const mil = data.mileageAnalysis;
    const mileagePosition = mil.userMileage < mil.averageMileage ? 'below' :
                           mil.userMileage > mil.averageMileage ? 'above' : 'at';
    const mileageColor = mil.adjustment > 0 ? 'var(--success)' :
                        mil.adjustment < 0 ? '#ef4444' : '#64748b';
    const mileageIcon = mil.adjustment > 0 ? '↑' : mil.adjustment < 0 ? '↓' : '→';

    const correlationBadge = mil.correlation === 'strong' ?
      '<span class="mileage-correlation strong">Strong Correlation</span>' :
      '<span class="mileage-correlation moderate">Moderate Correlation</span>';

    mileageImpact = `
      <div class="mileage-impact-section">
        <div class="mileage-impact-header">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 24px; height: 24px; color: var(--primary-start);">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          <div>
            <div class="mileage-impact-title">Mileage Impact Analysis</div>
            <div class="mileage-impact-subtitle">How mileage affects this ${data.vehicle.year} ${capitalizeWords(data.vehicle.make)} ${capitalizeWords(data.vehicle.model)}</div>
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
            <div class="mileage-impact-stat-value">${formatMileage(mil.averageMileage)} miles</div>
          </div>
          <div class="mileage-impact-stat">
            <div class="mileage-impact-stat-label">Depreciation Rate</div>
            <div class="mileage-impact-stat-value">${formatCurrency(Math.abs(mil.depreciationPer1kMiles))}/1k mi</div>
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
            Your vehicle has <strong>${formatMileage(Math.abs(mil.mileageDifference))} ${mileagePosition === 'below' ? 'fewer' : 'more'} miles</strong> than the market average.
            ${mil.adjustment > 0 ?
              `This means your vehicle is worth approximately <strong style="color: var(--success);">${formatCurrency(mil.adjustment)} more</strong> than average due to lower mileage.` :
              mil.adjustment < 0 ?
              `This means your vehicle is worth approximately <strong style="color: #ef4444;">${formatCurrency(Math.abs(mil.adjustment))} less</strong> than average due to higher mileage.` :
              'Your mileage is right at the market average.'
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
        Based on <strong>${data.count}</strong> ${data.matchQuality === 'exact' ? 'exact match' : 'comparable'} ${data.vehicle.year} ${capitalizeWords(data.vehicle.make || '')} ${capitalizeWords(data.vehicle.model || '')} vehicles within 100 miles
      </div>
    </div>

    <div class="smart-offer-stats">
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Average Price</div>
        <div class="smart-offer-stat-value">${formatCurrency(Math.round(data.average))}</div>
      </div>
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Median Price</div>
        <div class="smart-offer-stat-value">${formatCurrency(Math.round(data.median))}</div>
      </div>
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Price Range</div>
        <div class="smart-offer-stat-value">${formatCurrency(Math.round(data.min))} - ${formatCurrency(Math.round(data.max))}</div>
      </div>
      <div class="smart-offer-stat">
        <div class="smart-offer-stat-label">Your Savings</div>
        <div class="smart-offer-stat-value" style="color: var(--success);">${formatCurrency(Math.round(data.savings))}</div>
      </div>
    </div>

    ${mileageImpact}

    <div class="smart-offer-confidence">
      <strong>${data.savingsPercent}% below average market price.</strong>
      ${confidenceText}
      ${data.confidence === 'high' ? 'Dealers are more likely to negotiate when your offer is backed by strong local market data.' : ''}
    </div>
  `;

  display.style.display = 'block';

  // Also update the Sale Price field with the Smart Offer
  const salePriceInput = document.getElementById('sale-price');
  if (salePriceInput && data.offer) {
    salePriceInput.value = formatCurrency(data.offer);
    wizardData.financing.salePrice = data.offer;
    console.log('[smart-offer] Updated Sale Price to Smart Offer:', data.offer);
  }
}

/**
 * Hide manual entry fields
 */
function hideManualEntry() {
  document.getElementById('manual-entry-fields').style.display = 'none';
}

/**
 * Populate year dropdowns based on user's location
 */
async function populateYearDropdowns() {
  const yearSelect = document.getElementById('year-input');
  if (!yearSelect) return;

  try {
    // Get user's zip code
    const zip = wizardData.location?.zip || '';

    if (!zip) {
      console.log('[year-dropdown] No location set, cannot populate years');
      yearSelect.innerHTML = '<option value="">Enter location first</option>';
      yearSelect.disabled = true;
      return;
    }

    yearSelect.innerHTML = '<option value="">Loading years...</option>';
    yearSelect.disabled = true;

    // Try to fetch available years from MarketCheck API
    const response = await fetch(`${API_BASE}/api/mc/years?zip=${zip}`);

    if (!response.ok) {
      throw new Error('Failed to fetch years');
    }

    const data = await response.json();
    let years = data.years || [];

    // If MarketCheck returns no years or failed, fall back to Supabase saved vehicles
    if (years.length === 0) {
      console.log('[year-dropdown] No years from MarketCheck, falling back to Supabase vehicles');
      const yearsSet = new Set();
      savedVehicles.forEach(vehicle => {
        if (vehicle.year) {
          yearsSet.add(parseInt(vehicle.year));
        }
      });
      years = Array.from(yearsSet).sort((a, b) => b - a);

      if (years.length > 0) {
        console.log(`[year-dropdown] Using ${years.length} years from Supabase saved vehicles`);
      }
    }

    // Populate dropdown with available years
    yearSelect.innerHTML = '<option value="">Select Year</option>';
    years.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });

    yearSelect.disabled = false;

    console.log('[year-dropdown] Populated', years.length, 'available years');
  } catch (error) {
    console.error('[year-dropdown] Error fetching years from MarketCheck:', error);

    // Fall back to Supabase saved vehicles
    console.log('[year-dropdown] Falling back to Supabase saved vehicles');
    const yearsSet = new Set();
    savedVehicles.forEach(vehicle => {
      if (vehicle.year) {
        yearsSet.add(parseInt(vehicle.year));
      }
    });
    const years = Array.from(yearsSet).sort((a, b) => b - a);

    yearSelect.innerHTML = '<option value="">Select Year</option>';
    years.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });

    yearSelect.disabled = false;

    if (years.length > 0) {
      console.log(`[year-dropdown] Using ${years.length} years from Supabase (MarketCheck unavailable)`);
    } else {
      yearSelect.innerHTML = '<option value="">No vehicles available</option>';
      console.log('[year-dropdown] No vehicles available from either MarketCheck or Supabase');
    }
  }

  // Also populate trade-in year dropdown (no location filter needed for trade-ins)
  const tradeinYearSelect = document.getElementById('tradein-year');
  if (tradeinYearSelect) {
    const currentYear = new Date().getFullYear();
    tradeinYearSelect.innerHTML = '<option value="">Select Year</option>';
    for (let year = currentYear; year >= 1990; year--) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      tradeinYearSelect.appendChild(option);
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

  const scope = current instanceof HTMLInputElement && current.form
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

  console.log('[enter-nav] Moved focus from', current.id || 'field', 'to', next.id || 'field');
}

/**
 * Setup Enter key to move to next field (like app.js)
 */
function setupEnterKeyNavigation() {
  // Get all form fields
  const allFields = document.querySelectorAll('input, select, textarea');

  allFields.forEach(field => {
    field.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;

      // Don't handle Enter on buttons
      if (field.tagName === 'BUTTON') return;

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
  const currencyFields = [
    'down-payment',
    'tradein-value',
    'tradein-payoff'
  ];

  currencyFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      setupCurrencyInput(field);
    }
  });

  // Mileage fields (only trade-in mileage remains)
  const mileageFields = [
    'tradein-mileage'
  ];

  mileageFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      setupMileageInput(field);
    }
  });
}

/**
 * Setup formula calculation for vehicle price field
 * Allows users to enter formulas like "-6%" or "-$500" to calculate discounts
 */
function setupVehiclePriceFormulas() {
  const vehiclePriceInput = document.getElementById('vehicle-price');
  if (!vehiclePriceInput) return;

  vehiclePriceInput.addEventListener('blur', function() {
    const value = this.value.trim();
    if (!value) return;

    // Get base price (asking price stored when vehicle was selected)
    const basePrice = parseFloat(this.dataset.basePrice) || 0;

    console.log('[formula] Processing:', value, 'Base price:', basePrice);

    let calculatedPrice = null;
    let isFormula = false;

    // Handle percentage discount: -6% or 6%
    const percentMatch = value.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
    if (percentMatch && basePrice > 0) {
      const percent = parseFloat(percentMatch[1]);
      calculatedPrice = basePrice * (1 + (percent / 100));
      isFormula = true;
      console.log('[formula] Percentage discount:', percent + '%', '→', calculatedPrice);
    }

    // Handle dollar discount: -$500 or -500
    const dollarMatch = value.match(/^-\$?(\d+(?:,\d{3})*(?:\.\d{2})?)$/);
    if (dollarMatch && basePrice > 0) {
      const discount = parseFloat(dollarMatch[1].replace(/,/g, ''));
      calculatedPrice = basePrice - discount;
      isFormula = true;
      console.log('[formula] Dollar discount:', discount, '→', calculatedPrice);
    }

    // Handle dollar addition: +$500 or +500
    const addMatch = value.match(/^\+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)$/);
    if (addMatch && basePrice > 0) {
      const addition = parseFloat(addMatch[1].replace(/,/g, ''));
      calculatedPrice = basePrice + addition;
      isFormula = true;
      console.log('[formula] Dollar addition:', addition, '→', calculatedPrice);
    }

    // If formula was calculated, apply the result
    if (calculatedPrice !== null && calculatedPrice > 0) {
      const finalPrice = Math.round(calculatedPrice);
      this.value = formatCurrency(finalPrice);
      wizardData.financing.salePrice = finalPrice;
      console.log('[formula] Final price:', finalPrice);

      // Show a subtle hint about what was calculated
      const hint = this.nextElementSibling;
      if (hint && hint.classList.contains('form-hint')) {
        hint.textContent = `Calculated from asking price: ${formatCurrency(basePrice)}`;
        hint.style.color = 'var(--success)';
        setTimeout(() => {
          hint.textContent = 'Enter price or formula: -6% for discount, +$500 for addition';
          hint.style.color = '';
        }, 3000);
      }
    }
    // Not a formula - format as currency
    else if (!isFormula) {
      const numValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(numValue) && numValue > 0) {
        this.value = formatCurrency(numValue);
        wizardData.financing.salePrice = numValue;
        console.log('[vehicle-price] Formatted as currency:', numValue);
      }
    }
  });

  // Handle input to strip non-numeric characters (except formula symbols)
  vehiclePriceInput.addEventListener('input', function() {
    const value = this.value;

    // Allow formulas (%, +, -, $) and numbers
    const cleaned = value.replace(/[^0-9.%+\-$,]/g, '');
    if (cleaned !== value) {
      const cursorPos = this.selectionStart;
      this.value = cleaned;
      this.setSelectionRange(cursorPos, cursorPos);
    }

    // If it's a plain number, update wizardData
    const numValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
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
  document.querySelectorAll('.progress-step').forEach((step, index) => {
    const stepNumber = index + 1;
    step.classList.remove('active', 'completed');

    if (stepNumber < currentStep) {
      step.classList.add('completed');
    } else if (stepNumber === currentStep) {
      step.classList.add('active');
    }
  });

  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
  document.querySelector('.progress-bar__line-fill').style.width = `${progressPercent}%`;

  document.querySelectorAll('.wizard-step').forEach(step => {
    step.classList.remove('active');
  });

  const activeStep = document.querySelector(`.wizard-step[data-step="${currentStep}"]`);
  if (activeStep) {
    activeStep.classList.add('active');
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
      console.error('[review] Unable to populate review section:', error);
    });
  }

  document.querySelector('.wizard-card').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

/**
 * Validate current step
 */
function validateStep(step) {
  let isValid = true;
  let errorMessage = '';

  switch (step) {
    case 1: // Vehicle
      if (!selectedVehicle) {
        const year = document.getElementById('year-input').value;
        const make = document.getElementById('make-input').value;
        const model = document.getElementById('model-input').value;

        if (!year || !make || !model) {
          isValid = false;
          errorMessage = 'Please select a vehicle or enter year, make, and model manually';
        }
      }

      // Check location (required for distance calculations and Smart Offer)
      if (!wizardData.location?.zip) {
        isValid = false;
        errorMessage = 'Please enter your location to calculate distance from dealer';
      }
      break;

    case 2: // Financing
      const price = document.getElementById('vehicle-price').value;
      const term = document.getElementById('loan-term').value;
      const creditScore = document.getElementById('credit-score').value;

      if (!price || !term || !creditScore) {
        isValid = false;
        errorMessage = 'Please fill in all financing details';
      }
      break;

    case 3: // Trade-in (optional)
      isValid = true;
      break;

    case 4: // Review
      const name = document.getElementById('customer-name').value;
      const email = document.getElementById('customer-email').value;
      const phone = document.getElementById('customer-phone').value;
      const zip = document.getElementById('customer-zip').value;

      if (!name || !email || !phone || !zip) {
        isValid = false;
        errorMessage = 'Please fill in all contact information';
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
          year: document.getElementById('year-input').value,
          make: document.getElementById('make-input').value,
          model: document.getElementById('model-input').value,
          trim: document.getElementById('trim-input').value || null,
          condition: document.getElementById('condition-input').value || 'Used'
        };
      }
      break;

    case 2: // Financing
      // Parse currency values properly
      const vehiclePriceRaw = document.getElementById('vehicle-price').value;
      const downPaymentRaw = document.getElementById('down-payment').value;

      wizardData.financing = {
        salePrice: parseFloat(vehiclePriceRaw.replace(/[^0-9.-]/g, '')) || 0,
        downPayment: parseFloat(downPaymentRaw.replace(/[^0-9.-]/g, '')) || 0,
        loanTerm: document.getElementById('loan-term').value,
        creditScore: document.getElementById('credit-score').value
      };

      console.log('[saveStepData] Financing saved:', wizardData.financing);
      break;

    case 3: // Trade-in
      const hasTradeIn = document.querySelector('input[name="has-tradein"]:checked')?.value === 'yes';
      if (hasTradeIn) {
        const tradeValueRaw = document.getElementById('tradein-value').value;
        const tradePayoffRaw = document.getElementById('tradein-payoff').value;

        wizardData.tradein = {
          hasTradeIn: true,
          year: document.getElementById('tradein-year').value,
          make: document.getElementById('tradein-make').value,
          model: document.getElementById('tradein-model').value,
          mileage: document.getElementById('tradein-mileage').value,
          value: parseFloat(tradeValueRaw.replace(/[^0-9.-]/g, '')) || 0,
          payoff: parseFloat(tradePayoffRaw.replace(/[^0-9.-]/g, '')) || 0
        };
      } else {
        wizardData.tradein = { hasTradeIn: false };
      }
      break;

    case 4: // Customer info
      wizardData.customer = {
        name: document.getElementById('customer-name').value,
        email: document.getElementById('customer-email').value,
        phone: document.getElementById('customer-phone').value,
        zip: document.getElementById('customer-zip').value
      };
      break;
  }
}

/**
 * Toggle trade-in fields visibility
 */
function toggleTradeIn(show) {
  const tradeinFields = document.getElementById('tradein-fields');
  if (tradeinFields) {
    tradeinFields.style.display = show ? 'block' : 'none';
  }
}

/**
 * Compute review data shared between summary and detail views
 */
async function computeReviewData() {
  const financing = wizardData.financing || {};
  const tradein = wizardData.tradein || {};

  const salePrice = parseCurrencyToNumber(financing.salePrice);
  const cashDown = Math.max(parseCurrencyToNumber(financing.cashDown || financing.downPayment), 0);
  const term = parseInt(financing.term || financing.loanTerm, 10) || 72;

  const hasTrade = !!tradein.hasTradeIn;
  const tradeOffer = hasTrade ? parseCurrencyToNumber(tradein.tradeValue || tradein.value) : 0;
  const tradePayoff = hasTrade ? parseCurrencyToNumber(tradein.tradePayoff || tradein.payoff) : 0;
  const netTrade = tradeOffer - tradePayoff;
  const positiveEquity = Math.max(netTrade, 0);
  const negativeEquity = Math.max(tradePayoff - tradeOffer, 0);

  if (!wizardData.fees) {
    wizardData.fees = {
      dealerFees: 799,
      customerAddons: 0,
      govtFees: 150,
      stateTaxRate: 6.0,
      countyTaxRate: 1.0
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
    countyTaxRate
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

  let selectedApr;
  try {
    if (selectedLenderId === 'lowest') {
      selectedApr = await calculateLowestApr();
    } else {
      console.log('[review] Manual lender selected:', selectedLenderId);
      let rateInfo = currentRates.get(selectedLenderId);
      if (!rateInfo) {
        console.log('[review] Rate info not found, calculating all rates first');
        await calculateLowestApr();
        rateInfo = currentRates.get(selectedLenderId);
      }

      if (rateInfo) {
        const lender = lendersConfig.find((l) => l.id === selectedLenderId);
        selectedApr = {
          lenderId: selectedLenderId,
          lenderName: lender?.longName || lender?.shortName || selectedLenderId,
          apr: rateInfo.aprDecimal,
          note: rateInfo.note,
          effectiveDate: rateInfo.effectiveDate
        };
        console.log('[review] Using manual lender:', selectedApr.lenderName, '@', (selectedApr.apr * 100).toFixed(2) + '%');
      } else {
        console.warn('[review] Rate info still not found, falling back to lowest');
        selectedApr = await calculateLowestApr();
      }
    }
  } catch (error) {
    console.warn('[review] Falling back to default APR:', error);
  }

  if (!selectedApr || !Number.isFinite(selectedApr.apr)) {
    selectedApr = {
      lenderId: 'default',
      lenderName: 'Standard Rate',
      apr: 0.0699,
      note: 'Default rate - no lenders matched'
    };
  }

  // Check for custom APR override (user manually adjusted APR in TIL section)
  let apr;
  if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
    apr = customAprOverride;
    console.log('[review] Using custom APR override:', (apr * 100).toFixed(2) + '%');
  } else {
    apr = Number.isFinite(selectedApr.apr) ? selectedApr.apr : 0.0699;
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
    lenderId: selectedApr.lenderId || 'default',
    lenderName: selectedApr.lenderName || 'Standard Rate',
    lenderNote: selectedApr.note || '',
    lenderEffectiveDate: selectedApr.effectiveDate || null
  };
}

/* ==========================================================================
   Lender & Rate Provider Logic
   ========================================================================== */

// Store lenders and rates
let lendersConfig = [];
let currentRates = new Map(); // Map<lenderId, {apr, note}>
let selectedLenderId = 'lowest';
let customAprOverride = null; // Store custom APR when user manually adjusts it (decimal form, e.g., 0.0549 for 5.49%)

/**
 * Load lenders from config
 */
async function loadLenders() {
  try {
    const response = await fetch('/config/lenders.json');
    const lenders = await response.json();
    lendersConfig = lenders.filter((l) => l.enabled !== false);

    console.log('[lenders] Loaded', lendersConfig.length, 'lenders');
    populateLenderDropdown();
  } catch (error) {
    console.error('[lenders] Error loading lenders:', error);
    lendersConfig = [];
  }
}

/**
 * Populate lender dropdown
 */
function populateLenderDropdown() {
  const select = document.getElementById('lender-select');
  if (!select) return;

  // Keep "Lowest APR" option
  select.innerHTML = '<option value=\"lowest\">Lowest APR (Recommended)</option>';

  // Add enabled lenders
  lendersConfig.forEach((lender) => {
    const option = document.createElement('option');
    option.value = lender.id;
    option.textContent = lender.longName || lender.shortName;
    select.appendChild(option);
  });

  // Listen for changes
  select.addEventListener('change', (e) => {
    selectedLenderId = e.target.value;
    // Reset custom APR override when lender changes
    customAprOverride = null;
    console.log('[lender-change] Reset custom APR override');
    // Reset tooltip original values
    if (window.resetAprTooltipOriginal) window.resetAprTooltipOriginal();
    if (window.resetTermTooltipOriginal) window.resetTermTooltipOriginal();
    if (window.resetMonthlyFCTooltipOriginal) window.resetMonthlyFCTooltipOriginal();
    // Use autoCalculateQuick for quick entry mode
    autoCalculateQuick().catch((error) => {
      console.error('[rates] Unable to refresh after lender change:', error);
    });
  });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast--show');
  });

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.classList.remove('toast--show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
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
      console.error(`[rates] No rates available for ${lenderId}:`, errorData.message);
      showToast(`No rates available for ${lenderName}. Please check Supabase.`, 'error');
      return null;
    }

    const data = await response.json();
    const rates = Array.isArray(data) ? data : data.rates || [];

    // Store in cache
    rateCache.set(cacheKey, {
      data: rates,
      timestamp: now
    });

    return rates;
  } catch (error) {
    console.error(`[rates] Error fetching rates for ${lenderId}:`, error);
    showToast(`Failed to fetch rates for ${lenderId}: ${error.message}`, 'error');
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
    if (condition && vehicleCondition && vehicleCondition.toLowerCase() !== condition.toLowerCase()) return false;
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
    const aprPercent = rate.base_apr || rate.baseApr || rate.apr_percent || rate.aprPercent;
    const bestApr = bestRate.base_apr || bestRate.baseApr || bestRate.apr_percent || bestRate.aprPercent;
    return aprPercent < bestApr ? rate : bestRate;
  });

  return {
    aprDecimal: (best.base_apr || best.baseApr || best.apr_percent || best.aprPercent) / 100,
    aprPercent: best.base_apr || best.baseApr || best.apr_percent || best.aprPercent,
    note: best.note || '',
    effectiveDate: best.effective_date || best.effectiveDate || null
  };
}

/**
 * Get APR for all lenders and find lowest
 */
async function calculateLowestApr() {
  const term = parseInt(wizardData.financing.loanTerm, 10) || 72;
  const condition = (wizardData.vehicle.condition || '').toLowerCase() === 'new' ? 'new' : 'used';
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
          effectiveDate: match.effectiveDate
        };

        candidates.push(candidate);

        // Store in rates map
        currentRates.set(lender.id, match);
      }
    } catch (error) {
      // Silently skip lender on error
    }
  }

  // Find winner with lowest APR
  if (candidates.length === 0) {
    // Default fallback rate
    return {
      lenderId: 'default',
      lenderName: 'Standard Rate',
      apr: 0.0699, // 6.99%
      note: 'Default rate - no lenders matched'
    };
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
    poor: 600
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
function recomputeTaxes({ salePrice, dealerFees, customerAddons, tradeOffer, stateTaxRate = 6.0, countyTaxRate = 1.0 }) {
  const result = {
    taxableBase: 0,
    stateTaxAmount: 0,
    countyTaxAmount: 0,
    totalTaxes: 0
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

  setText('summaryMonthlyPayment', formatCurrency(data.monthlyPayment));
  setText('summaryTerm', `${data.term} months`);
  setText('summaryAPR', formatPercent(data.apr));
  setText('summaryAmountFinanced', formatCurrency(data.amountFinanced));
  setText('summaryTotalPayments', formatCurrency(data.totalPayments));
  setText('summaryFinanceCharge', formatCurrency(data.financeCharge));
  setText('summaryTotalSalePrice', formatCurrency(data.totalSalePrice));
  setText('summaryOtherCharges', formatCurrency(data.sumOtherCharges));
  setText('summaryCashDue', formatCurrency(data.cashDue));

  const summaryCashToBuyer = document.getElementById('summaryCashToBuyer');
  if (summaryCashToBuyer) {
    if (data.cashToBuyer > 0) {
      summaryCashToBuyer.textContent = `Cash to buyer: ${formatCurrency(data.cashToBuyer)}`;
      summaryCashToBuyer.style.display = '';
    } else {
      summaryCashToBuyer.textContent = '';
      summaryCashToBuyer.style.display = 'none';
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
    lenderName
  } = data;

  setText('reviewHeroYear', wizardData.vehicle.year);
  setText('reviewHeroMake', wizardData.vehicle.make);
  setText('reviewHeroModel', wizardData.vehicle.model);
  setText('reviewHeroTrim', wizardData.vehicle.trim);
  setText('reviewHeroVin', wizardData.vehicle.vin ? `VIN: ${wizardData.vehicle.vin}` : '');
  setText('reviewHeroPrice', formatCurrency(cashPrice));

  const lenderNameEl = document.getElementById('reviewLenderName');
  if (lenderNameEl) {
    lenderNameEl.textContent = lenderName;
    lenderNameEl.title = data.lenderNote || '';
  }

  setText('reviewAPR', formatPercent(apr));
  setText('reviewFinanceCharge', formatCurrency(financeCharge));
  setText('reviewAmountFinanced', formatCurrency(amountFinanced));
  setText('reviewTotalPayments', formatCurrency(totalPayments));
  setText('reviewTotalSalePrice', formatCurrency(totalSalePrice));

  setText('reviewMonthlyPayment', formatCurrency(monthlyPayment));
  setText('reviewNumPayments', term);

  setText('reviewSalePrice', formatCurrency(cashPrice));
  setText('reviewCashDown', formatCurrency(cashDown));
  setText('reviewNetTrade', formatCurrencyAccounting(netTrade));
  setText('reviewTradeAllowance', formatCurrency(tradeOffer));
  setText('reviewTradePayoff', formatCurrency(tradePayoff));
  setText('reviewUnpaidBalance', formatCurrency(unpaidBalance));
  setText('reviewOtherCharges', formatCurrency(sumOtherCharges));
  setText('reviewDealerFees', formatCurrency(totalDealerFees));
  setText('reviewCustomerAddons', formatCurrency(totalCustomerAddons));
  setText('reviewGovtFees', formatCurrency(totalGovtFees));
  setText('reviewStateTax', formatCurrency(stateTaxTotal));
  setText('reviewCountyTax', formatCurrency(countyTaxTotal));
  setText('reviewAmountFinanced2', formatCurrency(amountFinanced));

  setText('reviewCashDue', formatCurrency(cashDue));
  setText('reviewCashToBuyer', formatCurrency(cashToBuyer));

  const cashToBuyerRow = document.getElementById('reviewCashToBuyerRow');
  if (cashToBuyerRow) {
    cashToBuyerRow.style.display = cashToBuyer > 0 ? 'flex' : 'none';
  }

  const netNote = document.getElementById('reviewNetNote');
  const netAmountEl = document.getElementById('reviewNetAmount');
  const netExplanationEl = document.getElementById('reviewNetExplanation');
  if (netNote && netAmountEl && netExplanationEl) {
    if (cashToBuyer > 0 && cashDue > 0) {
      const netAmount = cashToBuyer - cashDue;
      netNote.style.display = 'block';

      if (netAmount > 0) {
        netAmountEl.textContent = formatCurrency(netAmount);
        netAmountEl.style.color = 'var(--success, #22c55e)';
        netExplanationEl.textContent = 'You will receive this amount at signing after equity is applied to amounts due.';
      } else if (netAmount < 0) {
        netAmountEl.textContent = formatCurrency(Math.abs(netAmount));
        netAmountEl.style.color = 'var(--danger, #ef4444)';
        netExplanationEl.textContent = 'You need to bring this amount at signing after equity is applied to amounts due.';
      } else {
        netAmountEl.textContent = formatCurrency(0);
        netAmountEl.style.color = 'var(--text-secondary, #64748b)';
        netExplanationEl.textContent = 'Equity exactly covers all amounts due at signing.';
      }
    } else {
      netNote.style.display = 'none';
      netAmountEl.textContent = '';
      netExplanationEl.textContent = '';
    }
  }

  // Populate collapsible header values
  setText('collapsibleMonthlyPayment', formatCurrency(monthlyPayment));
  setText('collapsibleLenderName', lenderName);
  setText('collapsibleCashDue', formatCurrency(cashDue));

  // Populate review vehicle card (Step 1 style)
  populateReviewVehicleCard(data);

  console.log('[review] Review populated - Amount Financed:', formatCurrency(amountFinanced), 'Monthly:', formatCurrency(monthlyPayment));
}

/**
 * Toggle collapsible review section
 */
function toggleReviewSection(sectionId) {
  const content = document.getElementById(`${sectionId}-content`);
  const header = content?.previousElementSibling;

  if (!content || !header) return;

  const isActive = content.classList.contains('active');

  if (isActive) {
    content.classList.remove('active');
    header.classList.remove('active');
    content.style.display = 'none';
  } else {
    content.classList.add('active');
    header.classList.add('active');
    content.style.display = 'block';
  }
}

/**
 * Populate review vehicle card with Step 1 styling
 */
function populateReviewVehicleCard(reviewData) {
  const card = document.getElementById('review-vehicle-card');
  if (!card) return;

  const vehicle = wizardData.vehicle;
  const { monthlyPayment, term, apr } = reviewData;

  // Clean model name
  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);

  // Build vehicle details text
  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(cleanedModel || '')}${vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ''}`;

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
      ${vehicle.vin ? `<div class="your-vehicle-card__meta">VIN: ${formatVIN(vehicle.vin)}</div>` : ''}
      ${vehicle.mileage ? `<div class="your-vehicle-card__meta">${formatMileage(vehicle.mileage)} miles</div>` : ''}
      <div class="your-vehicle-card__price">
        <div class="your-vehicle-card__price-label">Est. Monthly Payment</div>
        <div class="your-vehicle-card__price-value">${formatCurrency(monthlyPayment)}</div>
        <div class="your-vehicle-card__price-meta">${term} months • ${formatPercent(apr)} APR</div>
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
  const sliderConfigs = [
    {
      sliderId: 'reviewSalePriceSlider',
      inputId: 'reviewSalePriceInput',
      getValue: () => wizardData.financing.salePrice || 0,
      setValue: (val) => {
        wizardData.financing.salePrice = val;
        // Update vehicle price in step 2
        const vehiclePriceInput = document.getElementById('vehicle-price');
        if (vehiclePriceInput) {
          vehiclePriceInput.value = formatCurrency(val);
          vehiclePriceInput.dataset.basePrice = val;
        }
      },
      max: 150000,
      step: 500
    },
    {
      sliderId: 'reviewCashDownSlider',
      inputId: 'reviewCashDownInput',
      getValue: () => wizardData.financing.cashDown || 0,
      setValue: (val) => {
        wizardData.financing.cashDown = val;
        // Update down payment in step 2
        const downPaymentInput = document.getElementById('down-payment');
        if (downPaymentInput) {
          downPaymentInput.value = formatCurrency(val);
        }
      },
      max: 50000,
      step: 100
    },
    {
      sliderId: 'reviewTradeAllowanceSlider',
      inputId: 'reviewTradeAllowanceInput',
      getValue: () => wizardData.tradein?.tradeValue || 0,
      setValue: (val) => {
        if (!wizardData.tradein) wizardData.tradein = {};
        wizardData.tradein.tradeValue = val;
        // Update trade-in value in step 3
        const tradeValueInput = document.getElementById('tradein-value');
        if (tradeValueInput) {
          tradeValueInput.value = formatCurrency(val);
        }
      },
      max: 75000,
      step: 100
    },
    {
      sliderId: 'reviewDealerFeesSlider',
      inputId: 'reviewDealerFeesInput',
      getValue: () => {
        ensureWizardFeeDefaults();
        const fees = wizardData.fees.dealerFees || [];
        return fees.reduce((sum, fee) => sum + (parseFloat(fee.amount) || 0), 0);
      },
      setValue: (val) => {
        ensureWizardFeeDefaults();
        // Distribute the value proportionally across existing dealer fees
        const fees = wizardData.fees.dealerFees || [];
        if (fees.length === 0) {
          // Create a default dealer fee if none exist
          fees.push({ name: 'Dealer Fee', amount: val });
          wizardData.fees.dealerFees = fees;
        } else {
          const currentTotal = fees.reduce((sum, fee) => sum + (parseFloat(fee.amount) || 0), 0);
          if (currentTotal > 0) {
            // Proportional distribution
            fees.forEach(fee => {
              const proportion = (parseFloat(fee.amount) || 0) / currentTotal;
              fee.amount = val * proportion;
            });
          } else {
            // Equal distribution
            const perFee = val / fees.length;
            fees.forEach(fee => fee.amount = perFee);
          }
        }
        wizardData.fees.userCustomized = true;
      },
      max: 10000,
      step: 100
    }
  ];

  sliderConfigs.forEach(config => {
    const slider = document.getElementById(config.sliderId);
    const input = document.getElementById(config.inputId);

    if (!slider || !input) return;

    // Set initial values
    const currentValue = config.getValue();
    slider.value = currentValue;
    slider.max = config.max;
    slider.step = config.step;
    input.value = formatCurrency(currentValue);

    // Update slider progress bar
    updateSliderProgress(slider);

    // Slider to input sync
    slider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);
      input.value = formatCurrency(value);
      updateSliderProgress(slider);
      config.setValue(value);

      // Debounced refresh
      await refreshReviewDebounced();
    });

    // Input to slider sync
    input.addEventListener('blur', async (e) => {
      const rawValue = e.target.value.replace(/[^0-9.-]/g, '');
      let value = parseFloat(rawValue);

      if (isNaN(value) || value < 0) {
        value = 0;
      } else if (value > config.max) {
        value = config.max;
      }

      // Round to step
      value = Math.round(value / config.step) * config.step;

      slider.value = value;
      input.value = formatCurrency(value);
      updateSliderProgress(slider);
      config.setValue(value);

      await refreshReview();
    });

    // Enter key support
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });
}

/**
 * Update slider visual progress
 */
function updateSliderProgress(slider) {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const value = parseFloat(slider.value) || 0;
  const progress = ((value - min) / (max - min)) * 100;
  slider.style.setProperty('--slider-progress', `${progress}%`);
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
function formatCurrencyAccounting(value) {
  const abs = Math.abs(value);
  const formatted = formatCurrency(abs);
  return value < 0 ? `(${formatted})` : formatted;
}

/**
 * Format percentage
 */
function formatPercent(decimal) {
  return (decimal * 100).toFixed(2) + '%';
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
      items: {
        dealer: [],
        customer: [],
        gov: []
      }
    };
  } else if (!wizardData.fees.items) {
    wizardData.fees.items = {
      dealer: [],
      customer: [],
      gov: []
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
      rows: []
    };
  });

  const editFeeForm = document.getElementById('edit-fee-form');
  if (editFeeForm) {
    editFeeForm.addEventListener('submit', handleEditFeeSubmit);
  }

  const typeSelect = document.getElementById('edit-fee-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      updateEditFeeNameList(value);
      editFeeModalState.activeCategory = value;
    });
  }

  const nameInput = document.getElementById('edit-fee-name');
  const amountInput = document.getElementById('edit-fee-amount');
  if (nameInput && amountInput) {
    nameInput.addEventListener('input', () => {
      const currentType =
        typeSelect?.value === 'gov'
          ? 'gov'
          : typeSelect?.value === 'customer'
          ? 'customer'
          : 'dealer';
      const store = getFeeSuggestionStore(currentType);
      const amount = store?.getAmount(nameInput.value) ?? null;
      if (amount != null) {
        amountInput.value = formatCurrency(amount);
      }
    });
  }

  const manageBtn = document.getElementById('modal-edit-fee-button');
  manageBtn?.addEventListener('click', () => {
    openEditFeeModal(editFeeModalState.activeCategory || 'dealer');
  });
}

function openFeesModal() {
  initializeFeeModal();
  const modal = document.getElementById('fees-modal');
  if (!modal) return;

  ensureWizardFeeDefaults();

  renderFeeModalFromWizardData();
  modal.style.display = 'flex';
}
window.openFeesModal = openFeesModal;

function closeFeesModal() {
  const modal = document.getElementById('fees-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}
window.closeFeesModal = closeFeesModal;

/**
 * Open the Review Contract modal and populate with current data
 */
async function openReviewContractModal() {
  // Check if user has custom APR - if so, show confirmation modal first
  if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
    showAprConfirmationModal();
    return; // Don't proceed to review until user makes a choice
  }

  // Otherwise, proceed directly to review
  proceedToReviewModal();
}

/**
 * Show APR confirmation modal when custom APR is detected
 */
function showAprConfirmationModal() {
  const modal = document.getElementById('apr-confirmation-modal');
  if (!modal) return;

  // Get lender rate and custom rate
  const selectedApr = wizardData.selectedApr || {};
  const lenderRate = Number.isFinite(selectedApr.apr) ? selectedApr.apr : 0.0699;

  // Update modal with rates
  const lenderRateEl = document.getElementById('aprConfirmLenderRate');
  const customRateEl = document.getElementById('aprConfirmCustomRate');

  if (lenderRateEl) {
    lenderRateEl.textContent = (lenderRate * 100).toFixed(2) + '%';
  }

  if (customRateEl) {
    customRateEl.textContent = (customAprOverride * 100).toFixed(2) + '%';
  }

  // Show the modal
  modal.style.display = 'flex';
}

/**
 * Handle user's choice from APR confirmation modal
 */
async function confirmAprChoice(choice) {
  const modal = document.getElementById('apr-confirmation-modal');
  if (modal) {
    modal.style.display = 'none';
  }

  if (choice === 'reset') {
    // Reset to lender rate
    customAprOverride = null;

    // Update the APR display
    const aprValue = document.getElementById('quickTilAPR');
    if (aprValue) {
      const selectedApr = wizardData.selectedApr || {};
      const lenderRate = Number.isFinite(selectedApr.apr) ? selectedApr.apr : 0.0699;
      aprValue.textContent = (lenderRate * 100).toFixed(2) + '%';
    }

    // Recalculate with lender rate
    await autoCalculateQuick();
  }
  // If 'keep', do nothing - keep customAprOverride as is

  // Now proceed to review modal
  proceedToReviewModal();
}
window.confirmAprChoice = confirmAprChoice;

/**
 * Actually open the review contract modal (called after APR confirmation or directly)
 */
async function proceedToReviewModal() {
  const modal = document.getElementById('review-contract-modal');
  if (!modal) return;

  try {
    // Get current review data
    const reviewData = await computeReviewData();

    // Populate TIL disclosures
    setText('contractAPR', formatPercent(reviewData.apr));
    setText('contractFinanceCharge', formatCurrency(reviewData.financeCharge));
    setText('contractAmountFinanced', formatCurrency(reviewData.amountFinanced));
    setText('contractTotalPayments', formatCurrency(reviewData.totalPayments));

    // Populate payment schedule
    setText('contractNumPayments', reviewData.term);
    setText('contractMonthlyPayment', formatCurrency(reviewData.monthlyPayment));

    // Populate vehicle information
    const vehicle = wizardData.vehicle;
    if (vehicle) {
      const vehicleText = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Not specified';
      setText('contractVehicle', vehicleText);
      setText('contractVIN', vehicle.vin ? formatVIN(vehicle.vin) : 'Not specified');
      setText('contractMileage', vehicle.mileage ? `${formatMileage(vehicle.mileage)} miles` : 'Not specified');
      setText('contractCondition', vehicle.isNew ? 'New' : 'Used');
    } else {
      setText('contractVehicle', 'Not specified');
      setText('contractVIN', 'Not specified');
      setText('contractMileage', 'Not specified');
      setText('contractCondition', 'Not specified');
    }

    // Populate itemization
    setText('contractSalePrice', formatCurrency(reviewData.salePrice));
    setText('contractDownPayment', formatCurrency(reviewData.downPayment));
    setText('contractNetTrade', formatCurrencyAccounting(reviewData.netTrade));
    setText('contractTradeAllowance', formatCurrency(reviewData.tradeValue));
    setText('contractTradePayoff', formatCurrency(reviewData.tradePayoff));
    setText('contractUnpaidBalance', formatCurrency(reviewData.unpaidBalance));
    setText('contractOtherCharges', formatCurrency(reviewData.sumOtherCharges));
    setText('contractDealerFees', formatCurrency(reviewData.totalDealerFees));
    setText('contractCustomerAddons', formatCurrency(reviewData.totalCustomerAddons));
    setText('contractGovtFees', formatCurrency(reviewData.totalGovtFees));
    setText('contractSaleTaxTotal', formatCurrency(reviewData.stateTaxTotal + reviewData.countyTaxTotal));
    setText('contractStateTax', formatCurrency(reviewData.stateTaxTotal));
    setText('contractCountyTax', formatCurrency(reviewData.countyTaxTotal));
    setText('contractCashDue', formatCurrency(reviewData.cashDue));
    setText('contractAmountFinancedTotal', formatCurrency(reviewData.amountFinanced));

    // Update tax labels with state/county info
    const stateCode = wizardData.location?.stateCode || '';
    const countyName = wizardData.location?.countyName || '';
    const stateTaxRate = wizardData.fees?.stateTaxRate || 6.0;
    const countyTaxRate = wizardData.fees?.countyTaxRate || 1.0;

    const contractStateTaxLabel = document.getElementById('contractStateTaxLabel');
    const contractCountyTaxLabel = document.getElementById('contractCountyTaxLabel');

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
    modal.style.display = 'flex';
  } catch (error) {
    console.error('[review-contract] Error opening modal:', error);
    alert('Error loading contract data. Please try again.');
  }
}
window.openReviewContractModal = openReviewContractModal;

/**
 * Close the Review Contract modal
 */
function closeReviewContractModal() {
  const modal = document.getElementById('review-contract-modal');
  if (modal) {
    modal.style.display = 'none';
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
  const modal = document.getElementById('customer-profile-modal');
  if (!modal) return;

  // Load existing profile
  await loadCustomerProfileData();

  // Set up Google Places autocomplete for address field
  setupProfileAddressAutocomplete();

  modal.style.display = 'flex';
}

/**
 * Close the Customer Profile modal
 */
function closeCustomerProfileModal() {
  const modal = document.getElementById('customer-profile-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Load customer profile from Supabase
 */
async function loadCustomerProfileData() {
  try {
    const profileId = localStorage.getItem('customerProfileId');
    if (!profileId) return null;

    const { data: profile, error } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (error) {
      console.error('Error loading customer profile:', error);
      return null;
    }

    if (profile) {
      // Populate form fields if modal is open
      const profileFullName = document.getElementById('profileFullName');
      if (profileFullName) {
        profileFullName.value = profile.full_name || '';
        document.getElementById('profileEmail').value = profile.email || '';
        document.getElementById('profilePhone').value = profile.phone || '';
        document.getElementById('profileAddress').value = profile.street_address || '';
        document.getElementById('profileCity').value = profile.city || '';
        document.getElementById('profileState').value = profile.state_code || '';
        document.getElementById('profileZip').value = profile.zip_code || '';
        document.getElementById('profileCreditScore').value = profile.credit_score_range || '';

        // Populate preference fields
        document.getElementById('profileDownPayment').value = profile.preferred_down_payment
          ? formatCurrency(profile.preferred_down_payment)
          : '';
        document.getElementById('profileTradeValue').value = profile.preferred_trade_value
          ? formatCurrency(profile.preferred_trade_value)
          : '';
        document.getElementById('profileTradePayoff').value = profile.preferred_trade_payoff
          ? formatCurrency(profile.preferred_trade_payoff)
          : '';
      }

      // Update header label with user's first name
      const firstName = profile.full_name ? profile.full_name.split(' ')[0] : 'Profile';
      const profileLabel = document.getElementById('customerProfileLabel');
      if (profileLabel) {
        profileLabel.textContent = firstName;
      }

      return profile;
    }

    return null;
  } catch (error) {
    console.error('Error loading customer profile:', error);
    return null;
  }
}

/**
 * Setup Google Places autocomplete for profile address field
 */
function setupProfileAddressAutocomplete() {
  const addressInput = document.getElementById('profileAddress');
  if (!addressInput || !google || !google.maps || !google.maps.places) return;

  // Create autocomplete instance
  const autocomplete = new google.maps.places.Autocomplete(addressInput, {
    types: ['address'],
    componentRestrictions: { country: 'us' },
    fields: ['address_components', 'formatted_address', 'place_id']
  });

  // Listen for place selection
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) return;

    // Extract address components
    let streetNumber = '';
    let route = '';
    let city = '';
    let state = '';
    let stateCode = '';
    let zip = '';
    let county = '';

    place.address_components.forEach(component => {
      const types = component.types;

      if (types.includes('street_number')) {
        streetNumber = component.long_name;
      }
      if (types.includes('route')) {
        route = component.long_name;
      }
      if (types.includes('locality')) {
        city = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        state = component.long_name;
        stateCode = component.short_name;
      }
      if (types.includes('postal_code')) {
        zip = component.long_name;
      }
      if (types.includes('administrative_area_level_2')) {
        county = component.long_name.replace(' County', '');
      }
    });

    // Populate fields
    const streetAddress = `${streetNumber} ${route}`.trim();
    document.getElementById('profileAddress').value = streetAddress;
    document.getElementById('profileCity').value = city;
    document.getElementById('profileState').value = stateCode;
    document.getElementById('profileZip').value = zip;

    // Store county for later use when saving
    addressInput.dataset.county = county;
    addressInput.dataset.countyName = county;
    addressInput.dataset.placeId = place.place_id;
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
      const quickLocation = document.getElementById('quick-location');
      if (quickLocation && !quickLocation.value) {
        // Format location string with FULL street address for Google Maps distance calculations
        const locationString = profile.street_address
          ? `${profile.street_address}, ${profile.city}, ${profile.state_code}${profile.zip_code ? ' ' + profile.zip_code : ''}`
          : `${profile.city}, ${profile.state_code}${profile.zip_code ? ' ' + profile.zip_code : ''}`;

        quickLocation.value = locationString;

        console.log('Auto-populated location from profile:', locationString);

        // Geocode the address to get lat/lng coordinates for distance calculations
        if (google?.maps?.Geocoder) {
          const geocoder = new google.maps.Geocoder();

          try {
            const results = await new Promise((resolve, reject) => {
              geocoder.geocode({ address: locationString }, (results, status) => {
                if (status === 'OK' && results?.length) {
                  resolve(results);
                } else {
                  reject(new Error(`Geocoding failed: ${status}`));
                }
              });
            });

            if (results && results[0]) {
              const place = results[0];
              const locale = extractLocaleFromComponents(place.address_components ?? []);
              const zip = extractZipFromPlace(place) || profile.zip_code || '';

              const lat = typeof place.geometry.location?.lat === 'function'
                ? place.geometry.location.lat()
                : place.geometry.location?.lat ?? null;
              const lng = typeof place.geometry.location?.lng === 'function'
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
                countyName: locale.countyName || profile.county_name
              };

              // Update user-location field in wizard
              const wizardLocationInput = document.getElementById('user-location');
              if (wizardLocationInput) {
                wizardLocationInput.value = place.formatted_address ?? locationString;
                const hint = wizardLocationInput.nextElementSibling;
                if (hint) {
                  hint.textContent = `✓ Using: ${zip || 'your location'}`;
                  hint.style.color = 'var(--success)';
                }
              }

              // Apply locale-based fees and taxes
              applyLocaleToFees(locale);

              // Refresh year dropdowns
              try {
                await populateYearDropdowns();
              } catch (error) {
                console.error('[auto-populate] Unable to refresh year dropdowns after location population', error);
              }

              console.log('[auto-populate] Location geocoded with coordinates:', { lat, lng });

              // If a vehicle is already selected, refresh the card to show map with distance
              if (selectedVehicle) {
                console.log('[auto-populate] Re-displaying vehicle card with coordinates');
                displayQuickVehicleCard(selectedVehicle);
              }

              // Trigger auto-calculation
              autoCalculateQuick().catch((error) => {
                console.error('[auto-populate] Unable to recalculate after location population', error);
              });
            }
          } catch (geocodeError) {
            console.error('Geocoding error:', geocodeError);

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
              countyName: profile.county_name
            };

            // Apply locale-based fees even without geocoding
            applyLocaleToFees({
              stateCode: profile.state_code,
              countyName: profile.county_name
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
            countyName: profile.county_name
          };
        }
      }
    }
  } catch (error) {
    console.error('Error auto-populating location:', error);
  }
}

/**
 * Auto-populate calculator fields from customer profile preferences
 */
async function autoPopulateCalculatorFromProfile() {
  try {
    const profile = await loadCustomerProfileData();
    if (!profile) return;

    let valuesChanged = false;

    // Auto-populate down payment
    if (profile.preferred_down_payment && profile.preferred_down_payment > 0) {
      const cashDownSlider = document.getElementById('quickSliderCashDown');
      if (cashDownSlider && !wizardData.financing?.cashDown) {
        // Set slider value
        cashDownSlider.value = profile.preferred_down_payment;

        // Update wizardData
        if (!wizardData.financing) wizardData.financing = {};
        wizardData.financing.cashDown = profile.preferred_down_payment;

        // Update display input
        const cashDownInput = document.getElementById('quickValueCashDown');
        if (cashDownInput) {
          cashDownInput.value = formatCurrency(profile.preferred_down_payment);
        }

        // Dispatch input event to trigger UI updates
        cashDownSlider.dispatchEvent(new Event('input', { bubbles: true }));
        cashDownSlider.dispatchEvent(new Event('change', { bubbles: true }));

        console.log('[auto-populate] Set down payment to:', formatCurrency(profile.preferred_down_payment));
        valuesChanged = true;
      }
    }

    // Auto-populate trade-in values
    if ((profile.preferred_trade_value && profile.preferred_trade_value > 0) ||
        (profile.preferred_trade_payoff && profile.preferred_trade_payoff > 0)) {

      // Enable trade-in checkbox
      const hasTradeCheckbox = document.getElementById('quick-has-tradein');
      if (hasTradeCheckbox && !wizardData.tradein?.hasTradeIn) {
        hasTradeCheckbox.checked = true;

        if (!wizardData.tradein) wizardData.tradein = {};
        wizardData.tradein.hasTradeIn = true;

        // Show trade-in sliders
        const tradeInControls = document.querySelector('.trade-in-controls');
        if (tradeInControls) {
          tradeInControls.style.display = 'block';
        }

        // Don't dispatch change event - just silently check the box and show controls
        // The slider events will handle all necessary UI updates
      }

      // Set trade-in value
      if (profile.preferred_trade_value && profile.preferred_trade_value > 0) {
        const tradeValueSlider = document.getElementById('quickSliderTradeAllowance');
        if (tradeValueSlider && !wizardData.tradein?.value) {
          // Set slider value
          tradeValueSlider.value = profile.preferred_trade_value;

          wizardData.tradein.value = profile.preferred_trade_value;

          // Update display input
          const tradeValueInput = document.getElementById('quickValueTradeAllowance');
          if (tradeValueInput) {
            tradeValueInput.value = formatCurrency(profile.preferred_trade_value);
          }

          // Dispatch input event to trigger UI updates
          tradeValueSlider.dispatchEvent(new Event('input', { bubbles: true }));
          tradeValueSlider.dispatchEvent(new Event('change', { bubbles: true }));

          console.log('[auto-populate] Set trade-in value to:', formatCurrency(profile.preferred_trade_value));
          valuesChanged = true;
        }
      }

      // Set trade-in payoff
      if (profile.preferred_trade_payoff && profile.preferred_trade_payoff > 0) {
        const tradePayoffSlider = document.getElementById('quickSliderTradePayoff');
        if (tradePayoffSlider && !wizardData.tradein?.payoff) {
          // Set slider value
          tradePayoffSlider.value = profile.preferred_trade_payoff;

          wizardData.tradein.payoff = profile.preferred_trade_payoff;

          // Update display input
          const tradePayoffInput = document.getElementById('quickValueTradePayoff');
          if (tradePayoffInput) {
            tradePayoffInput.value = formatCurrency(profile.preferred_trade_payoff);
          }

          // Dispatch input event to trigger UI updates
          tradePayoffSlider.dispatchEvent(new Event('input', { bubbles: true }));
          tradePayoffSlider.dispatchEvent(new Event('change', { bubbles: true }));

          console.log('[auto-populate] Set trade-in payoff to:', formatCurrency(profile.preferred_trade_payoff));
          valuesChanged = true;
        }
      }
    }

    // Trigger recalculation if any values were set
    if (valuesChanged) {
      console.log('[auto-populate] Triggering recalculation...');
      await autoCalculateQuick();
    }
  } catch (error) {
    console.error('Error auto-populating calculator from profile:', error);
  }
}

/**
 * Save customer profile to Supabase
 */
async function saveCustomerProfile() {
  try {
    // Get form values
    const fullName = document.getElementById('profileFullName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const address = document.getElementById('profileAddress').value.trim();
    const city = document.getElementById('profileCity').value.trim();
    const state = document.getElementById('profileState').value.trim().toUpperCase();
    const zip = document.getElementById('profileZip').value.trim();
    const creditScore = document.getElementById('profileCreditScore').value;

    // Get preference values
    const downPayment = parseCurrency(document.getElementById('profileDownPayment').value) || null;
    const tradeValue = parseCurrency(document.getElementById('profileTradeValue').value) || null;
    const tradePayoff = parseCurrency(document.getElementById('profileTradePayoff').value) || null;

    // Validate required fields
    if (!fullName || !email || !phone) {
      alert('Please fill in all required fields: Full Name, Email, and Phone');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address');
      return;
    }

    // Get county data from Google Places if available
    const addressInput = document.getElementById('profileAddress');
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
      preferred_trade_value: tradeValue,
      preferred_trade_payoff: tradePayoff,
      updated_at: new Date().toISOString(),
      last_used_at: new Date().toISOString()
    };

    // Upsert profile (insert or update)
    const { data: profile, error } = await supabase
      .from('customer_profiles')
      .upsert(profileData, {
        onConflict: 'email'
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving customer profile:', error);
      alert('Error saving profile. Please try again.');
      return;
    }

    // Save profile ID to localStorage
    localStorage.setItem('customerProfileId', profile.id);

    // Update header label with user's first name
    const firstName = fullName.split(' ')[0];
    document.getElementById('customerProfileLabel').textContent = firstName;

    // Close modal
    closeCustomerProfileModal();

    // Show success message
    console.log('Customer profile saved successfully:', profile);

    // Auto-populate main location from saved profile
    await autoPopulateLocationFromProfile();

    // Auto-populate calculator fields from saved profile
    await autoPopulateCalculatorFromProfile();

    // TODO: Show toast notification
    alert('Profile saved successfully! Your location and preferences have been auto-populated.');
  } catch (error) {
    console.error('Error saving customer profile:', error);
    alert('Error saving profile. Please try again.');
  }
}

// Make functions globally available
window.openCustomerProfileModal = openCustomerProfileModal;
window.closeCustomerProfileModal = closeCustomerProfileModal;
window.saveCustomerProfile = saveCustomerProfile;

/* ============================================================================
   Submit Offer Functions
   ============================================================================ */

/**
 * Format offer data into fancy unicode text with emoji
 */
function formatOfferText(customerNotes = '') {
  const reviewData = computeReviewData();
  if (!reviewData) {
    return 'Error: Unable to generate offer. Please ensure all fields are filled.';
  }

  const vehicle = wizardData.vehicle || {};
  const financing = wizardData.financing || {};
  const location = wizardData.location || {};
  const dealer = wizardData.dealer || {};
  const trade = wizardData.trade || {};

  // Format currency helper
  const fmt = (num) => {
    if (typeof num !== 'number' || !Number.isFinite(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  };

  // Format number helper
  const fmtNum = (num) => {
    if (typeof num !== 'number' || !Number.isFinite(num)) return '0';
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Build the formatted offer text
  let offerText = `
╔═════════════════════════════════════════╗
║      VEHICLE PURCHASE OFFER             ║
╚═════════════════════════════════════════╝

🚗 VEHICLE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}${vehicle.trim ? ' ' + vehicle.trim : ''}
Condition: ${vehicle.condition === 'new' ? 'New' : 'Used'}  |  Mileage: ${fmtNum(vehicle.mileage || 0)} mi
${vehicle.vin ? 'VIN: ' + vehicle.vin : ''}

💰 PRICING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sale Price:              ${fmt(reviewData.salePrice || 0)}
Down Payment:            ${fmt(reviewData.downPayment || 0)}`;

  // Add trade-in if present
  if (trade && (trade.offer > 0 || trade.payoff > 0)) {
    offerText += `
Trade-In Allowance:      ${fmt(trade.offer || 0)}
Trade-In Payoff:         ${fmt(trade.payoff || 0)}
                        ─────────────
Net Trade Value:         ${fmt((trade.offer || 0) - (trade.payoff || 0))}`;
  }

  offerText += `

📊 FINANCING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Add lender info if available
  const selectedApr = wizardData.selectedApr || {};
  if (selectedApr.lender_name) {
    offerText += `
Lender: ${selectedApr.lender_name}`;
  }

  offerText += `
APR: ${((reviewData.apr || 0) * 100).toFixed(2)}%  |  Term: ${reviewData.term || 0} months
Monthly Payment:         ${fmt(reviewData.monthlyPayment || 0)}
Total Finance Charge:    ${fmt(reviewData.financeCharge || 0)}
Amount Financed:         ${fmt(reviewData.amountFinanced || 0)}
Total of Payments:       ${fmt(reviewData.totalOfPayments || 0)}`;

  // Add fees breakdown if present
  const fees = reviewData.fees || {};
  if (fees.totalDealerFees > 0 || fees.totalCustomerAddons > 0 || fees.totalGovtFees > 0) {
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

  // Add tax information
  offerText += `

📍 LOCATION & TAX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  if (location.countyName || location.stateCode) {
    offerText += `
Location: ${location.countyName ? location.countyName + ', ' : ''}${location.stateCode || ''}`;
  }

  if (fees.salesTax > 0) {
    offerText += `
Sales Tax:               ${fmt(fees.salesTax)} (${((fees.taxRate || 0) * 100).toFixed(2)}%)`;
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
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  offerText += `

─────────────────────────────────────────
Generated on ${currentDate}
Powered by ExcelCalc Finance Calculator
https://excelcalc.com
`;

  return offerText.trim();
}

/**
 * Open Submit Offer modal
 */
async function openSubmitOfferModal() {
  const modal = document.getElementById('submit-offer-modal');
  if (!modal) return;

  // Generate and display offer preview
  const offerText = formatOfferText();
  const previewElement = document.getElementById('offerPreviewText');
  if (previewElement) {
    previewElement.textContent = offerText;
  }

  // Auto-populate customer information from profile
  await loadCustomerDataForSubmission();

  // Auto-populate dealer information from wizardData
  await loadDealerDataForSubmission();

  modal.style.display = 'flex';
}

/**
 * Close Submit Offer modal
 */
function closeSubmitOfferModal() {
  const modal = document.getElementById('submit-offer-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Load customer data for submission (auto-populate from profile)
 */
async function loadCustomerDataForSubmission() {
  try {
    const profileId = localStorage.getItem('customerProfileId');
    if (!profileId) return;

    const { data: profile, error } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (error || !profile) return;

    // Populate customer fields
    document.getElementById('submitCustomerName').value = profile.full_name || '';
    document.getElementById('submitCustomerEmail').value = profile.email || '';
    document.getElementById('submitCustomerPhone').value = profile.phone || '';
  } catch (error) {
    console.error('Error loading customer data:', error);
  }
}

/**
 * Load dealer data for submission (auto-populate from wizardData)
 */
async function loadDealerDataForSubmission() {
  const dealer = wizardData.dealer || {};

  // Populate dealer fields if available
  if (dealer.name) {
    document.getElementById('submitDealershipName').value = dealer.name;
  }
  if (dealer.phone) {
    document.getElementById('submitSalespersonPhone').value = dealer.phone;
  }

  // Set up salesperson auto-complete
  setupSalespersonAutoComplete();
}

/**
 * Setup salesperson auto-complete functionality
 */
function setupSalespersonAutoComplete() {
  const salespersonNameInput = document.getElementById('submitSalespersonName');
  if (!salespersonNameInput) return;

  let debounceTimer;

  salespersonNameInput.addEventListener('input', async (e) => {
    clearTimeout(debounceTimer);

    const query = e.target.value.trim();
    if (query.length < 2) return; // Only search after 2 characters

    debounceTimer = setTimeout(async () => {
      await loadSalespersonSuggestions(query);
    }, 300); // Debounce 300ms
  });

  // When user selects a suggestion, auto-fill other fields
  salespersonNameInput.addEventListener('change', async (e) => {
    const selectedName = e.target.value.trim();
    if (!selectedName) return;

    // Find matching salesperson in database
    const { data: salespeople, error } = await supabase
      .from('salesperson_contacts')
      .select('*')
      .eq('full_name', selectedName)
      .order('last_used_at', { ascending: false })
      .limit(1);

    if (error || !salespeople || salespeople.length === 0) return;

    const salesperson = salespeople[0];

    // Auto-fill fields
    if (salesperson.dealership_name) {
      document.getElementById('submitDealershipName').value = salesperson.dealership_name;
    }
    if (salesperson.phone) {
      document.getElementById('submitSalespersonPhone').value = salesperson.phone;
    }
    if (salesperson.email) {
      document.getElementById('submitSalespersonEmail').value = salesperson.email;
    }
  });
}

/**
 * Load salesperson suggestions from Supabase
 */
async function loadSalespersonSuggestions(query = '') {
  try {
    const datalist = document.getElementById('salespersonSuggestions');
    if (!datalist) return;

    // Clear existing options
    datalist.innerHTML = '';

    if (!query || query.length < 2) return;

    // Query database for matching salespeople
    const { data: salespeople, error } = await supabase
      .from('salesperson_contacts')
      .select('*')
      .or(`full_name.ilike.%${query}%,dealership_name.ilike.%${query}%`)
      .order('times_used', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error loading salesperson suggestions:', error);
      return;
    }

    if (!salespeople || salespeople.length === 0) return;

    // Populate datalist with suggestions
    salespeople.forEach((person) => {
      const option = document.createElement('option');
      option.value = person.full_name;
      option.textContent = `${person.full_name} - ${person.dealership_name || 'Unknown Dealership'}`;
      datalist.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading salesperson suggestions:', error);
  }
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
    const notes = document.getElementById('submitOfferNotes').value.trim();
    const offerText = formatOfferText(notes);

    // Check if Web Share API is available
    if (!navigator.share) {
      alert('Share feature is not supported on this device. Please use Copy or Email instead.');
      return;
    }

    // Save offer to database before sharing
    await saveOfferToDatabase('share', offerText);

    // Use Web Share API
    await navigator.share({
      title: 'Vehicle Purchase Offer',
      text: offerText
    });

    // Success - redirect to My Saved Offers
    await handleSubmissionSuccess();
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error sharing offer:', error);
      alert('Error sharing offer. Please try again.');
    }
  }
}

/**
 * Handle Email button (mailto: link)
 */
async function handleEmailOffer() {
  try {
    // Validate customer information and dealer email
    if (!validateSubmissionForm()) return;

    const salespersonEmail = document.getElementById('submitSalespersonEmail').value.trim();
    if (!salespersonEmail) {
      alert('Please enter the dealer\'s email address.');
      return;
    }

    // Get formatted offer text with notes
    const notes = document.getElementById('submitOfferNotes').value.trim();
    const offerText = formatOfferText(notes);

    // Save offer to database before emailing
    await saveOfferToDatabase('email', offerText, salespersonEmail);

    // Create mailto link
    const vehicle = wizardData.vehicle || {};
    const subject = encodeURIComponent(`Vehicle Purchase Offer - ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`);
    const body = encodeURIComponent(offerText);

    window.location.href = `mailto:${salespersonEmail}?subject=${subject}&body=${body}`;

    // Success - redirect to My Saved Offers after brief delay
    setTimeout(async () => {
      await handleSubmissionSuccess();
    }, 1000);
  } catch (error) {
    console.error('Error emailing offer:', error);
    alert('Error preparing email. Please try again.');
  }
}

/**
 * Handle SMS button (sms: link)
 */
async function handleSmsOffer() {
  try {
    // Validate customer information and dealer phone
    if (!validateSubmissionForm()) return;

    const salespersonPhone = document.getElementById('submitSalespersonPhone').value.trim();
    if (!salespersonPhone) {
      alert('Please enter the dealer\'s phone number.');
      return;
    }

    // Get formatted offer text with notes
    const notes = document.getElementById('submitOfferNotes').value.trim();
    const offerText = formatOfferText(notes);

    // Save offer to database before texting
    await saveOfferToDatabase('sms', offerText, salespersonPhone);

    // Create SMS link
    const body = encodeURIComponent(offerText);

    // Different SMS URL schemes for different platforms
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    const smsUrl = isMac
      ? `sms:${salespersonPhone}&body=${body}`
      : `sms:${salespersonPhone}?body=${body}`;

    window.location.href = smsUrl;

    // Success - redirect to My Saved Offers after brief delay
    setTimeout(async () => {
      await handleSubmissionSuccess();
    }, 1000);
  } catch (error) {
    console.error('Error sending SMS:', error);
    alert('Error preparing text message. Please try again.');
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
    const notes = document.getElementById('submitOfferNotes').value.trim();
    const offerText = formatOfferText(notes);

    // Save offer to database before copying
    await saveOfferToDatabase('copy', offerText);

    // Copy to clipboard
    await navigator.clipboard.writeText(offerText);

    alert('Offer copied to clipboard! You can now paste it anywhere.');

    // Success - redirect to My Saved Offers
    await handleSubmissionSuccess();
  } catch (error) {
    console.error('Error copying offer:', error);
    alert('Error copying to clipboard. Please try again.');
  }
}

/**
 * Validate submission form
 */
function validateSubmissionForm() {
  const customerName = document.getElementById('submitCustomerName').value.trim();
  const customerEmail = document.getElementById('submitCustomerEmail').value.trim();
  const customerPhone = document.getElementById('submitCustomerPhone').value.trim();
  const salespersonPhone = document.getElementById('submitSalespersonPhone').value.trim();
  const salespersonEmail = document.getElementById('submitSalespersonEmail').value.trim();

  // Validate required customer fields
  if (!customerName || !customerEmail || !customerPhone) {
    alert('Please fill in all required customer fields (Name, Email, Phone).');
    return false;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    alert('Please enter a valid email address.');
    return false;
  }

  // Validate at least one dealer contact method
  if (!salespersonPhone && !salespersonEmail) {
    alert('Please provide at least one contact method for the dealer (phone or email).');
    return false;
  }

  return true;
}

/**
 * Handle successful submission
 */
async function handleSubmissionSuccess() {
  // Close the submit offer modal
  closeSubmitOfferModal();

  // Close the review contract modal if open
  closeReviewContractModal();

  // Show congratulatory message
  alert('🎉 Offer submitted successfully!\n\nYou can view your saved offers anytime.');

  // TODO: Redirect to My Saved Offers modal
  // For now, just scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Save offer to Supabase database
 */
async function saveOfferToDatabase(submissionMethod, formattedText, recipientContact = null) {
  try {
    const reviewData = computeReviewData();
    if (!reviewData) {
      console.error('Unable to compute review data');
      return null;
    }

    // Get customer profile ID
    const profileId = localStorage.getItem('customerProfileId');

    // Get customer data from form
    const customerName = document.getElementById('submitCustomerName').value.trim();
    const customerEmail = document.getElementById('submitCustomerEmail').value.trim();
    const customerPhone = document.getElementById('submitCustomerPhone').value.trim();

    // Save/update customer profile if not exists
    let customerId = profileId;
    if (!customerId) {
      const { data: profile, error: profileError } = await supabase
        .from('customer_profiles')
        .upsert({
          full_name: customerName,
          email: customerEmail,
          phone: customerPhone,
          last_used_at: new Date().toISOString()
        }, { onConflict: 'email' })
        .select()
        .single();

      if (!profileError && profile) {
        customerId = profile.id;
        localStorage.setItem('customerProfileId', profile.id);
      }
    }

    // Get salesperson data from form
    const salespersonName = document.getElementById('submitSalespersonName').value.trim();
    const dealershipName = document.getElementById('submitDealershipName').value.trim();
    const salespersonPhone = document.getElementById('submitSalespersonPhone').value.trim();
    const salespersonEmail = document.getElementById('submitSalespersonEmail').value.trim();

    // Save/update salesperson if provided
    let salespersonId = null;
    if (salespersonName || dealershipName) {
      const { data: salesperson, error: salespersonError } = await supabase
        .from('salesperson_contacts')
        .upsert({
          full_name: salespersonName || 'Unknown',
          dealership_name: dealershipName || null,
          phone: salespersonPhone || null,
          email: salespersonEmail || null,
          last_used_at: new Date().toISOString()
        }, { onConflict: 'full_name,dealership_name' })
        .select()
        .single();

      if (!salespersonError && salesperson) {
        salespersonId = salesperson.id;

        // Increment usage count
        await supabase.rpc('increment_salesperson_usage', {
          salesperson_id: salesperson.id
        });
      }
    }

    // Prepare offer data
    const vehicle = wizardData.vehicle || {};
    const trade = wizardData.trade || {};
    const location = wizardData.location || {};
    const notes = document.getElementById('submitOfferNotes').value.trim();

    const offerData = {
      customer_profile_id: customerId,
      salesperson_id: salespersonId,
      offer_name: `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim(),
      status: 'submitted',

      // Vehicle data
      vehicle_year: vehicle.year || null,
      vehicle_make: vehicle.make || null,
      vehicle_model: vehicle.model || null,
      vehicle_trim: vehicle.trim || null,
      vehicle_vin: vehicle.vin || null,
      vehicle_condition: vehicle.condition || null,
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
      customer_notes: notes || null
    };

    // Insert offer
    const { data: offer, error: offerError } = await supabase
      .from('saved_offers')
      .insert(offerData)
      .select()
      .single();

    if (offerError) {
      console.error('Error saving offer:', offerError);
      return null;
    }

    // Record submission
    if (offer) {
      await supabase
        .from('offer_submissions')
        .insert({
          saved_offer_id: offer.id,
          salesperson_id: salespersonId,
          submission_method: submissionMethod,
          formatted_text: formattedText,
          recipient_contact: recipientContact
        });
    }

    console.log('Offer saved successfully:', offer);
    return offer;
  } catch (error) {
    console.error('Error saving offer to database:', error);
    return null;
  }
}

// Make functions globally available
window.formatOfferText = formatOfferText;
window.openSubmitOfferModal = openSubmitOfferModal;
window.closeSubmitOfferModal = closeSubmitOfferModal;
window.setupSalespersonAutoComplete = setupSalespersonAutoComplete;
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
  Object.entries(feeModalState.categories).forEach(([key, category]) => {
    if (!category.container) return;
    const rows = Array.isArray(storedItems[key]) && storedItems[key].length
      ? storedItems[key]
      : [{}];

    rows.forEach((item) => {
      addFeeRow(key, {
        description: item.description ?? '',
        amount: Number.isFinite(item.amount) ? item.amount : null
      });
    });
    ensureTrailingEmptyRow(key);
    updateCategoryTotal(key);
  });

  updateTaxInputs();
  applyFeeModalChanges();
}

function updateTaxInputs() {
  ensureWizardFeeDefaults();
  const stateTaxInput = document.getElementById('modal-state-tax');
  const countyTaxInput = document.getElementById('modal-county-tax');
  if (stateTaxInput) {
    stateTaxInput.value = (wizardData.fees?.stateTaxRate ?? 0).toFixed(2);
  }
  if (countyTaxInput) {
    countyTaxInput.value = (wizardData.fees?.countyTaxRate ?? 0).toFixed(2);
  }
  updateFeeSummary();
}

function addFeeRow(categoryKey, initialData = {}) {
  const category = getFeeCategoryState(categoryKey);
  if (!category || !category.container) return null;

  const rowEl = document.createElement('div');
  rowEl.className = 'fee-row';

  const descWrap = document.createElement('div');
  descWrap.className = 'fee-row__desc';
  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.className = 'form-input';
  descInput.placeholder = 'Description';
  const suggestionStore = category.suggestionStore;
  if (suggestionStore?.datalist) {
    descInput.setAttribute('list', suggestionStore.datalist.id);
  }
  if (initialData.description) {
    descInput.value = initialData.description;
  }
  descWrap.appendChild(descInput);

  const amountWrap = document.createElement('div');
  amountWrap.className = 'fee-row__amount';
  const amountInput = document.createElement('input');
  amountInput.type = 'text';
  amountInput.className = 'form-input';
  amountInput.placeholder = '$0.00';
  amountWrap.appendChild(amountInput);

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'fee-row__actions';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'fee-row__btn';
  removeBtn.textContent = '−';
  removeBtn.setAttribute('aria-label', 'Remove fee');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fee-row__btn';
  addBtn.textContent = '+';
  addBtn.setAttribute('aria-label', 'Add fee');
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
    addBtn
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

  descInput.addEventListener('change', () => {
    descInput.value = toTitleCase(descInput.value);
    maybeApplySuggestion();
  });
  descInput.addEventListener('blur', () => {
    descInput.value = toTitleCase(descInput.value);
    maybeApplySuggestion();
  });
  descInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      maybeApplySuggestion();
      const newRow = addFeeRow(categoryKey);
      newRow?.descInput.focus();
    }
  });

  amountInput.addEventListener('input', () => updateCategoryTotal(categoryKey));
  amountInput.addEventListener('blur', () => {
    updateCategoryTotal(categoryKey);
    ensureTrailingEmptyRow(categoryKey);
  });

  removeBtn.addEventListener('click', () => removeFeeRow(categoryKey, rowState));
  addBtn.addEventListener('click', () => {
    const newRow = addFeeRow(categoryKey);
    newRow?.descInput.focus();
  });

  return rowState;
}

function removeFeeRow(categoryKey, row) {
  const category = getFeeCategoryState(categoryKey);
  if (!category) return;
  if (category.rows.length <= 1) {
    row.descInput.value = '';
    row.amountInput.value = '';
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
    lastRow.descInput.value.trim() !== '' ||
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
    govtFees: 0
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
          amount: normalizeCurrencyNumber(amount) ?? 0
        };
      })
      .filter(Boolean);
    items[key] = categoryItems;
    const sum = categoryItems.reduce((acc, item) => acc + (item.amount ?? 0), 0);
    if (key === 'dealer') totals.dealerFees = sum;
    if (key === 'customer') totals.customerAddons = sum;
    if (key === 'gov') totals.govtFees = sum;
  });

  return { items, totals };
}

function applyFeeModalChanges() {
  const payload = collectFeeModalData();
  persistFeeModalState(payload);
  updateFeeSummary(payload.totals);

  // Update quick entry sliders to reflect fee changes
  const dealerFeesSlider = document.getElementById('quickSliderDealerFees');
  const dealerFeesInput = document.getElementById('quickInputDealerFees');
  const customerAddonsSlider = document.getElementById('quickSliderCustomerAddons');
  const customerAddonsInput = document.getElementById('quickInputCustomerAddons');

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
    window.sliderOriginalValues['quickSliderDealerFees'] = actualDealerFees;
    window.sliderOriginalValues['quickSliderCustomerAddons'] = actualCustomerAddons;
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
    userCustomized: true
  };

  if (currentStep === 4) {
    refreshReview().catch((error) => {
      console.error('[fees] Unable to refresh review after change:', error);
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
    countyTaxRate: wizardData.fees.countyTaxRate ?? 0
  });

  const totalTaxes = taxTotals.totalTaxes ?? 0;
  const otherCharges = totalFees + totalTaxes;

  setText('modal-fees-total', formatCurrency(totalFees));
  setText('modal-tax-total', formatCurrency(totalTaxes));
  setText('modal-other-charges', formatCurrency(otherCharges));
}

function goToLocationStep() {
  closeFeesModal();
  currentStep = 1;
  updateWizardUI();
}

function setEditFeeStatus(message = '', tone = 'info') {
  const statusEl = document.getElementById('edit-fee-status');
  if (!statusEl) return;
  statusEl.textContent = message ?? '';
  if (!message || tone === 'info') {
    statusEl.removeAttribute('data-tone');
  } else {
    statusEl.dataset.tone = tone;
  }
}

function setEditFeeFormDisabled(disabled) {
  const form = document.getElementById('edit-fee-form');
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
  const input = document.getElementById('edit-fee-name');
  if (!input) return;
  const store = getFeeSuggestionStore(type);
  if (store?.datalist?.id) {
    input.setAttribute('list', store.datalist.id);
  } else {
    input.removeAttribute('list');
  }
}

function openEditFeeModal(categoryKey = 'dealer') {
  const modal = document.getElementById('edit-fee-modal');
  const form = document.getElementById('edit-fee-form');
  const typeSelect = document.getElementById('edit-fee-type');
  const amountInput = document.getElementById('edit-fee-amount');
  const nameInput = document.getElementById('edit-fee-name');
  if (!modal || !form || !typeSelect || !amountInput || !nameInput) return;

  const normalizedCategory =
    categoryKey === 'gov'
      ? 'gov'
      : categoryKey === 'customer'
      ? 'customer'
      : 'dealer';

  editFeeModalState.activeCategory = normalizedCategory;
  typeSelect.value = normalizedCategory;

  form.reset();
  setEditFeeStatus('');
  updateEditFeeNameList(normalizedCategory);
  formatCurrencyInput(amountInput);

  modal.style.display = 'flex';
  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select?.();
  });
}

function closeEditFeeModal() {
  const modal = document.getElementById('edit-fee-modal');
  const form = document.getElementById('edit-fee-form');
  const amountInput = document.getElementById('edit-fee-amount');
  if (!modal) return;
  modal.style.display = 'none';
  form?.reset();
  setEditFeeStatus('');
  if (amountInput) {
    formatCurrencyInput(amountInput);
  }
}
window.closeEditFeeModal = closeEditFeeModal;

function formatCurrencyInput(input) {
  if (!input) return;
  const numeric = parseCurrencyToNumber(input.value);
  if (Number.isFinite(numeric) && numeric !== 0) {
    input.value = formatCurrency(numeric);
  } else {
    input.value = '';
  }
}

async function handleEditFeeSubmit(event) {
  event.preventDefault();
  const form = document.getElementById('edit-fee-form');
  const typeSelect = document.getElementById('edit-fee-type');
  const nameInput = document.getElementById('edit-fee-name');
  const amountInput = document.getElementById('edit-fee-amount');
  if (!form || !typeSelect || !nameInput || !amountInput) return;

  const typeValue =
    typeSelect.value === 'gov'
      ? 'gov'
      : typeSelect.value === 'customer'
      ? 'customer'
      : 'dealer';

  const rawName = nameInput.value.trim();
  if (!rawName) {
    setEditFeeStatus('Description is required.', 'error');
    nameInput.focus();
    return;
  }

  const amountValue = parseCurrencyToNumber(amountInput.value);
  if (!Number.isFinite(amountValue)) {
    setEditFeeStatus('Enter a valid amount.', 'error');
    amountInput.focus();
    return;
  }

  const normalizedName = toTitleCase(rawName);
  const normalizedAmount = normalizeCurrencyNumber(amountValue) ?? 0;

  const state = getFeeSetState(typeValue);
  if (!state.id) {
    setEditFeeStatus('No active fee set available. Please configure sets in Supabase.', 'error');
    return;
  }

  setEditFeeFormDisabled(true);
  setEditFeeStatus('Saving...');

  try {
    const tableName =
      typeValue === 'gov'
        ? 'gov_fee_sets'
        : typeValue === 'customer'
        ? 'customer_addon_sets'
        : 'dealer_fee_sets';

    const items = Array.isArray(state.items)
      ? state.items.map((item) => ({ ...item }))
      : [];

    let found = false;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] ?? {};
      const existing = typeof item?.name === 'string' ? item.name.trim().toLowerCase() : '';
      if (existing && existing === normalizedName.toLowerCase()) {
        items[i] = { ...item, name: normalizedName, amount: normalizedAmount };
        found = true;
        break;
      }
    }
    if (!found) {
      items.push({ name: normalizedName, amount: normalizedAmount });
    }

    const { data: updatedRows, error } = await supabase
      .from(tableName)
      .update({ items })
      .eq('id', state.id)
      .select('id, items');

    if (error) throw error;

    const returnedItems =
      Array.isArray(updatedRows) && updatedRows[0]?.items
        ? updatedRows[0].items
        : items;

    state.items = Array.isArray(returnedItems) ? returnedItems : items;
    const normalizedItems = normalizeFeeItems(state.items);
    const store = getFeeSuggestionStore(typeValue);
    store?.setItems(normalizedItems);

    setEditFeeStatus('Fee saved.', 'success');
    await (typeValue === 'gov'
      ? loadGovFeeSuggestions()
      : typeValue === 'customer'
      ? loadCustomerAddonSuggestions()
      : loadDealerFeeSuggestions());

    closeEditFeeModal();
  } catch (error) {
    console.error('Failed to save fee', error);
    const message = error?.message ?? 'Unable to save fee right now. Please try again.';
    setEditFeeStatus(message, 'error');
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
    console.log('Submitting lead:', wizardData);
    // TODO: Send to Supabase leads table
    await new Promise(resolve => setTimeout(resolve, 2000));
    showSuccessMessage();
  } catch (error) {
    console.error('Error submitting lead:', error);
    alert('There was an error submitting your information. Please try again.');
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

/**
 * Show success message
 */
function showSuccessMessage() {
  const wizardCard = document.querySelector('.wizard-card');
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
  const wizardMode = document.querySelector('.wizard-card');
  const wizardProgress = document.getElementById('wizard-progress');
  const quickMode = document.getElementById('quick-entry-mode');
  const wizardBtn = document.querySelector('.mode-toggle__btn[data-mode="wizard"]');
  const quickBtn = document.querySelector('.mode-toggle__btn[data-mode="quick"]');

  if (mode === 'wizard') {
    wizardMode.style.display = 'block';
    wizardProgress.style.display = 'block';
    quickMode.style.display = 'none';
    wizardBtn.classList.add('active');
    quickBtn.classList.remove('active');
  } else {
    wizardMode.style.display = 'none';
    wizardProgress.style.display = 'none';
    quickMode.style.display = 'block';
    wizardBtn.classList.remove('active');
    quickBtn.classList.add('active');

    // Initialize Quick Entry mode with current wizard data
    await initializeQuickEntry();
  }
}

/**
 * Initialize Quick Entry mode with current wizard data
 */
async function initializeQuickEntry() {
  // Populate location
  const quickLocation = document.getElementById('quick-location');

  console.log('[init] wizardData.location:', wizardData.location);
  console.log('[init] quickLocation.value:', quickLocation?.value);

  // Check if location field has a value but wizardData doesn't have coordinates
  const locationValue = quickLocation?.value?.trim();
  if (locationValue && (!wizardData.location?.lat || !wizardData.location?.lng)) {
    console.log('[init] Found location in field without coordinates, geocoding:', locationValue);

    if (google?.maps?.Geocoder) {
      const geocoder = new google.maps.Geocoder();
      try {
        const results = await new Promise((resolve, reject) => {
          geocoder.geocode({ address: locationValue }, (results, status) => {
            if (status === 'OK' && results?.length) {
              resolve(results);
            } else {
              reject(new Error(`Geocoding failed: ${status}`));
            }
          });
        });

        if (results && results.length > 0) {
          const location = results[0].geometry?.location;
          const lat = typeof location?.lat === 'function' ? location.lat() : location?.lat ?? null;
          const lng = typeof location?.lng === 'function' ? location.lng() : location?.lng ?? null;

          const components = results[0].address_components ?? [];
          const locale = extractLocaleFromComponents(components);

          wizardData.location = {
            formatted_address: locationValue,
            address: locationValue,
            lat,
            lng,
            stateCode: locale.stateCode,
            countyName: locale.countyName
          };

          console.log('[init] Geocoded coordinates:', { lat, lng, stateCode: locale.stateCode });
        }
      } catch (error) {
        console.warn('[init] Failed to geocode location from field:', error);
      }
    }
  } else if (wizardData.location?.formatted_address) {
    quickLocation.value = wizardData.location.formatted_address;

    // If we have an address but no coordinates, geocode it
    if (!wizardData.location.lat || !wizardData.location.lng) {
      console.log('[init] Geocoding saved location:', wizardData.location.formatted_address);

      if (google?.maps?.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        try {
          const results = await new Promise((resolve, reject) => {
            geocoder.geocode({ address: wizardData.location.formatted_address }, (results, status) => {
              if (status === 'OK' && results?.length) {
                resolve(results);
              } else {
                reject(new Error(`Geocoding failed: ${status}`));
              }
            });
          });

          if (results && results.length > 0) {
            const location = results[0].geometry?.location;
            const lat = typeof location?.lat === 'function' ? location.lat() : location?.lat ?? null;
            const lng = typeof location?.lng === 'function' ? location.lng() : location?.lng ?? null;

            wizardData.location = {
              ...wizardData.location,
              lat,
              lng
            };

            console.log('[init] Geocoded coordinates:', { lat, lng });
          }
        } catch (error) {
          console.warn('[init] Failed to geocode saved location:', error);
        }
      }
    }
  }

  // Populate VIN if selected vehicle exists
  const quickVin = document.getElementById('quick-vin');
  if (selectedVehicle?.vin) {
    quickVin.value = selectedVehicle.vin;
    displayQuickVehicleCard(selectedVehicle);
  }

  // Populate financing details with defaults
  const quickVehiclePrice = document.getElementById('quick-vehicle-price');
  const quickDownPayment = document.getElementById('quick-down-payment');
  const quickLoanTerm = document.getElementById('quick-loan-term');
  const quickCreditScore = document.getElementById('quick-credit-score');

  if (wizardData.financing?.salePrice) {
    quickVehiclePrice.value = formatCurrency(wizardData.financing.salePrice);
  }
  if (wizardData.financing?.cashDown) {
    quickDownPayment.value = formatCurrency(wizardData.financing.cashDown);
  }

  // Set defaults: 72 months, excellent credit (750+)
  quickLoanTerm.value = wizardData.financing?.term || '72';
  quickCreditScore.value = wizardData.financing?.creditScoreRange || 'excellent';

  // Populate trade-in if exists
  if (wizardData.tradein?.hasTradeIn) {
    const quickHasTradeIn = document.getElementById('quick-has-tradein');
    const quickTradeValue = document.getElementById('quick-tradein-value');
    const quickTradePayoff = document.getElementById('quick-tradein-payoff');

    quickHasTradeIn.checked = true;
    toggleQuickTradeIn(true);

    if (wizardData.tradein.tradeValue) {
      quickTradeValue.value = formatCurrency(wizardData.tradein.tradeValue);
    }
    if (wizardData.tradein.tradePayoff) {
      quickTradePayoff.value = formatCurrency(wizardData.tradein.tradePayoff);
    }
  }

  // Setup saved vehicles dropdown for Quick mode
  setupQuickSavedVehicles();

  // Setup location autocomplete for Quick mode
  setupQuickLocationAutocomplete();
  setupQuickLocationManualFallback();

  // Setup auto-calculation on input changes
  setupQuickAutoCalculation();

  // Sync slider values from wizardData BEFORE setting up sliders
  // This ensures fees from the modal are reflected in the sliders
  syncSlidersFromWizardData();

  // Setup sliders
  setupQuickSliders();

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

  const syncMap = [
    { sliderId: 'quickSliderSalePrice', inputId: 'quickInputSalePrice', value: wizardData.financing?.salePrice || 0 },
    { sliderId: 'quickSliderCashDown', inputId: 'quickInputCashDown', value: wizardData.financing?.cashDown || 0 },
    { sliderId: 'quickSliderTradeAllowance', inputId: 'quickInputTradeAllowance', value: wizardData.tradein?.tradeValue || 0 },
    { sliderId: 'quickSliderTradePayoff', inputId: 'quickInputTradePayoff', value: wizardData.tradein?.tradePayoff || 0 },
    { sliderId: 'quickSliderDealerFees', inputId: 'quickInputDealerFees', value: wizardData.fees?.dealerFees || 0 },
    { sliderId: 'quickSliderCustomerAddons', inputId: 'quickInputCustomerAddons', value: wizardData.fees?.customerAddons || 0 }
  ];

  syncMap.forEach(({ sliderId, inputId, value }) => {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    if (slider && input) {
      slider.value = value;
      input.value = formatCurrency(value);
      updateSliderProgress(slider);
    }
  });

  console.log('[sync-sliders] Synced sliders from wizardData:', {
    dealerFees: wizardData.fees?.dealerFees || 0,
    customerAddons: wizardData.fees?.customerAddons || 0
  });
}

/**
 * Setup saved vehicles dropdown for Quick Entry mode
 */
function setupQuickSavedVehicles() {
  const quickVin = document.getElementById('quick-vin');
  const dropdown = document.getElementById('quick-saved-vehicles-dropdown');

  // Remove any existing listeners by cloning (prevents duplicates)
  if (quickVin._savedVehiclesSetup) {
    console.log('[quick-saved-vehicles] Already setup, skipping duplicate setup');
    return;
  }
  quickVin._savedVehiclesSetup = true;

  console.log('[quick-saved-vehicles] Setting up dropdown, saved vehicles count:', savedVehicles.length);

  const showDropdown = () => {
    console.log('[quick-saved-vehicles] Show dropdown triggered, count:', savedVehicles.length);
    if (savedVehicles.length > 0) {
      displayQuickSavedVehicles();
    } else {
      console.log('[quick-saved-vehicles] No saved vehicles to display');
      // Show "no saved vehicles" message
      dropdown.innerHTML = '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No saved vehicles</div>';
      dropdown.style.display = 'block';
    }
  };

  quickVin.addEventListener('focus', showDropdown);
  quickVin.addEventListener('click', showDropdown);

  quickVin.addEventListener('input', (e) => {
    const value = e.target.value.toUpperCase().trim();
    if (value.length > 0) {
      filterQuickSavedVehicles(value);
    } else {
      displayQuickSavedVehicles();
    }
  });

  // Click outside to close dropdown (with slight delay to avoid race condition)
  document.addEventListener('click', (e) => {
    // Use setTimeout to ensure this runs after any click handlers on the input
    setTimeout(() => {
      if (!quickVin.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    }, 0);
  });
}

/**
 * Display saved vehicles in Quick Entry dropdown
 */
function displayQuickSavedVehicles() {
  console.log('[quick-saved-vehicles] displayQuickSavedVehicles called, count:', savedVehicles.length);
  const dropdown = document.getElementById('quick-saved-vehicles-dropdown');
  dropdown.innerHTML = '';

  if (savedVehicles.length === 0) {
    dropdown.innerHTML = '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No saved vehicles</div>';
    dropdown.style.display = 'block';
    console.log('[quick-saved-vehicles] Showing "no saved vehicles" message');
    return;
  }

  savedVehicles.forEach(vehicle => {
    const item = document.createElement('div');
    item.className = 'saved-vehicle-item';
    item.innerHTML = `
      <div class="saved-vehicle-item__title">${vehicle.year || ''} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(vehicle.model || '')}</div>
      <div class="saved-vehicle-item__details">${capitalizeWords(vehicle.trim || '')} • ${formatMileage(vehicle.mileage || 0)} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${formatVIN(vehicle.vin || 'N/A')}</div>
    `;
    item.addEventListener('click', () => selectQuickSavedVehicle(vehicle));
    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
  console.log('[quick-saved-vehicles] Dropdown displayed with', savedVehicles.length, 'vehicles');
}

/**
 * Filter saved vehicles in Quick Entry mode
 */
function filterQuickSavedVehicles(searchTerm) {
  const dropdown = document.getElementById('quick-saved-vehicles-dropdown');
  const filtered = savedVehicles.filter(v =>
    (v.vin && v.vin.includes(searchTerm)) ||
    (v.make && v.make.toUpperCase().includes(searchTerm)) ||
    (v.model && v.model.toUpperCase().includes(searchTerm)) ||
    (v.year && String(v.year).includes(searchTerm))
  );

  dropdown.innerHTML = '';

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No matches found</div>';
    dropdown.style.display = 'block';
    return;
  }

  filtered.forEach(vehicle => {
    const item = document.createElement('div');
    item.className = 'saved-vehicle-item';
    item.innerHTML = `
      <div class="saved-vehicle-item__title">${vehicle.year || ''} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(vehicle.model || '')}</div>
      <div class="saved-vehicle-item__details">${capitalizeWords(vehicle.trim || '')} • ${formatMileage(vehicle.mileage || 0)} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${formatVIN(vehicle.vin || 'N/A')}</div>
    `;
    item.addEventListener('click', () => selectQuickSavedVehicle(vehicle));
    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
}

/**
 * Select saved vehicle in Quick Entry mode
 */
async function selectQuickSavedVehicle(vehicle) {
  const quickVin = document.getElementById('quick-vin');
  const dropdown = document.getElementById('quick-saved-vehicles-dropdown');

  quickVin.value = vehicle.vin || '';
  dropdown.style.display = 'none';

  // Ensure condition is set correctly based on year
  if (!vehicle.condition || vehicle.condition === '') {
    const currentYear = new Date().getFullYear();
    vehicle.condition = parseInt(vehicle.year) >= currentYear ? 'new' : 'used';
    console.log('[quick-saved-vehicle] Auto-set condition based on year:', vehicle.condition);
  }

  // Update selected vehicle globally
  selectedVehicle = vehicle;

  // Also update wizardData.vehicle to ensure condition is synced
  wizardData.vehicle = {
    ...vehicle,
    condition: vehicle.condition || 'used'
  };

  console.log('[quick-saved-vehicle] Selected vehicle condition:', vehicle.condition, 'Year:', vehicle.year);

  // Update vehicle card display
  displayQuickVehicleCard(vehicle);

  // Auto-populate vehicle price if available
  if (vehicle.asking_price) {
    const quickVehiclePrice = document.getElementById('quick-vehicle-price');
    quickVehiclePrice.value = formatCurrency(vehicle.asking_price);

    // Update wizard data
    wizardData.financing = wizardData.financing || {};
    wizardData.financing.salePrice = vehicle.asking_price;
  }

  // Update sliders to match the new vehicle price
  updateQuickSliderValues();

  // Reset original values for diff indicators (new baseline)
  resetOriginalMonthlyPayment();

  // Reset custom APR override when vehicle changes
  customAprOverride = null;
  console.log('[vehicle-change] Reset custom APR override');
  // Reset tooltip original values
  if (window.resetAprTooltipOriginal) window.resetAprTooltipOriginal();
  if (window.resetTermTooltipOriginal) window.resetTermTooltipOriginal();
  if (window.resetMonthlyFCTooltipOriginal) window.resetMonthlyFCTooltipOriginal();

  // Trigger calculation to update monthly payment
  await autoCalculateQuick();

  console.log('[quick-saved-vehicle] Vehicle selected and calculations updated:', vehicle.year, vehicle.make, vehicle.model);
}

/**
 * Display vehicle card in Quick Entry mode
 */
function displayQuickVehicleCard(vehicle) {
  const display = document.getElementById('quick-vehicle-display');
  const card = document.getElementById('quick-vehicle-card');

  if (!display || !card) {
    console.warn('[quick-vehicle-card] Card container missing');
    return;
  }

  if (card) {
    card.classList.add('your-vehicle-card--quick');
  }

  const cleanedModel = cleanModelName(vehicle.make, vehicle.model);
  const vehicleDetailsText = `${vehicle.year} ${capitalizeWords(vehicle.make || '')} ${capitalizeWords(cleanedModel || '')}${vehicle.trim ? ` - ${capitalizeWords(vehicle.trim)}` : ''}`;

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

  const accentColor = getTrimAccentColor(vehicle.trim);

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
          ${vehicle.asking_price ? `<div class="your-vehicle-card__price">${formatCurrency(vehicle.asking_price)}</div>` : ''}
        </div>
        <div class="your-vehicle-card__meta-grid">
          ${vehicle.vin ? `
            <div class="your-vehicle-card__info-card">
              <span class="your-vehicle-card__info-label">VIN</span>
              <span class="your-vehicle-card__info-value your-vehicle-card__info-value--mono">${formatVIN(vehicle.vin)}</span>
            </div>
          ` : ''}
          ${vehicle.mileage ? `
            <div class="your-vehicle-card__info-card">
              <span class="your-vehicle-card__info-label">Mileage</span>
              <span class="your-vehicle-card__info-value">${formatMileage(vehicle.mileage)} miles</span>
            </div>
          ` : ''}
          <div class="your-vehicle-card__info-card your-vehicle-card__info-card--distance" id="vehicle-distance-info">
            <span class="your-vehicle-card__info-label">Distance to Dealer</span>
            <span class="your-vehicle-card__info-value your-vehicle-card__info-value--placeholder">Add your location</span>
          </div>
        </div>
      </div>
    </div>
  `;

  card.style.setProperty('--vehicle-accent', accentColor);

  display.style.display = 'block';

  // Get driving distance and display map if we have valid coordinates
  if (userLat && userLon && vehicle.dealer_lat && vehicle.dealer_lng &&
      typeof vehicle.dealer_lat === 'number' && typeof vehicle.dealer_lng === 'number') {
    const dealerName = vehicle.dealer_name || 'Dealer';

    // Get driving distance from Google Distance Matrix API
    getDrivingDistance(userLat, userLon, vehicle.dealer_lat, vehicle.dealer_lng)
      .then(distanceData => {
        if (distanceData) {
          const distanceInfoEl = document.getElementById('vehicle-distance-info');
          if (distanceInfoEl) {
            const valueEl = distanceInfoEl.querySelector('.your-vehicle-card__info-value');
            if (valueEl) {
              valueEl.innerHTML = `
                <span class="your-vehicle-card__distance-chip">
                  <span class="your-vehicle-card__distance-icon">📍</span>
                  <span class="your-vehicle-card__distance-miles">${distanceData.distance}</span>
                  <span class="your-vehicle-card__distance-separator"></span>
                  <span class="your-vehicle-card__distance-time">${distanceData.duration}</span>
                </span>
              `;
              valueEl.classList.remove('your-vehicle-card__info-value--placeholder');
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
      .catch(error => {
        console.warn('[vehicle-card] Could not get driving distance:', error);
      });

    // Display map with route
    displayDealerMapWithRoute(userLat, userLon, vehicle.dealer_lat, vehicle.dealer_lng, dealerName)
      .catch(error => {
        console.warn('[vehicle-card] Could not display dealer map:', error);
      });
  } else {
    const distanceInfoEl = document.getElementById('vehicle-distance-info');
    if (distanceInfoEl) {
      const valueEl = distanceInfoEl.querySelector('.your-vehicle-card__info-value');
      if (valueEl) {
        valueEl.textContent = userLat && userLon
          ? 'Dealer location unavailable'
          : 'Add your location';
        valueEl.classList.add('your-vehicle-card__info-value--placeholder');
      }
    }
    hideDealerMap();
  }
}

/**
 * Setup location autocomplete for Quick Entry mode
 */
function setupQuickLocationAutocomplete() {
  const quickLocation = document.getElementById('quick-location');
  if (!quickLocation) {
    return false;
  }

  if (!googleMapsLoaded || !window.google?.maps?.places) {
    console.log('[quick-entry] Google Maps not available, using manual input');
    return false;
  }

  if (quickLocationAutocomplete) {
    google.maps.event.clearInstanceListeners(quickLocationAutocomplete);
  }

  quickLocationAutocomplete = new google.maps.places.Autocomplete(quickLocation, {
    types: ['geocode'],
    componentRestrictions: { country: 'us' }
  });

  quickLocationAutocomplete.addListener('place_changed', async () => {
    const place = quickLocationAutocomplete?.getPlace();
    if (!place?.geometry) return;

    const zip = extractZipFromPlace(place) || '';
    const locale = extractLocaleFromComponents(place.address_components ?? []);

    const lat = typeof place.geometry.location?.lat === 'function'
      ? place.geometry.location.lat()
      : place.geometry.location?.lat ?? null;
    const lng = typeof place.geometry.location?.lng === 'function'
      ? place.geometry.location.lng()
      : place.geometry.location?.lng ?? null;

    wizardData.location = {
      ...wizardData.location,
      formatted_address: place.formatted_address ?? zip ?? '',
      address: place.formatted_address ?? zip ?? '',
      zip,
      lat,
      lng,
      stateCode: locale.stateCode,
      countyName: locale.countyName
    };

    quickLocation.value = place.formatted_address ?? zip ?? '';

    const wizardLocationInput = document.getElementById('user-location');
    if (wizardLocationInput) {
      wizardLocationInput.value = place.formatted_address ?? zip ?? '';
      const hint = wizardLocationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using: ${zip || 'your location'}`;
        hint.style.color = 'var(--success)';
      }
    }

    applyLocaleToFees(locale);

    try {
      await populateYearDropdowns();
    } catch (error) {
      console.error('[quick-entry] Unable to refresh year dropdowns after location selection', error);
    }

    console.log('[quick-location] Location selected with coordinates:', { lat, lng });

    // If a vehicle is already selected, refresh the card to show map
    if (selectedVehicle) {
      console.log('[quick-location] Re-displaying vehicle card with coordinates');
      displayQuickVehicleCard(selectedVehicle);
    }

    autoCalculateQuick().catch((error) => {
      console.error('[quick-entry] Unable to recalculate after quick location change', error);
    });
  });

  return true;
}

function setupQuickLocationManualFallback() {
  if (quickLocationManualHandlerAttached) return;
  const quickLocation = document.getElementById('quick-location');
  if (!quickLocation) return;

  quickLocationManualHandlerAttached = true;
  quickLocation.addEventListener('input', async (event) => {
    const value = event.target.value.trim();
    if (!/^\d{5}$/.test(value)) return;

    wizardData.location = {
      ...wizardData.location,
      zip: value,
      formatted_address: value,
      address: value
    };

    const wizardLocationInput = document.getElementById('user-location');
    if (wizardLocationInput) {
      wizardLocationInput.value = value;
      const hint = wizardLocationInput.nextElementSibling;
      if (hint) {
        hint.textContent = `✓ Using ZIP: ${value}`;
        hint.style.color = 'var(--success)';
      }
    }

    if (google?.maps?.Geocoder) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: value }, (results, status) => {
        if (status === 'OK' && results?.length) {
          const components = results[0].address_components ?? [];
          const locale = extractLocaleFromComponents(components);

          // Extract lat/lng from geometry
          const location = results[0].geometry?.location;
          const lat = typeof location?.lat === 'function' ? location.lat() : location?.lat ?? null;
          const lng = typeof location?.lng === 'function' ? location.lng() : location?.lng ?? null;

          wizardData.location = {
            ...wizardData.location,
            lat,
            lng,
            stateCode: locale.stateCode,
            countyName: locale.countyName
          };
          applyLocaleToFees(locale);

          console.log('[quick-location] Geocoded ZIP to coordinates:', { lat, lng, zip: value });

          // If a vehicle is already selected, update the display to show map
          if (selectedVehicle) {
            console.log('[quick-location] Re-displaying vehicle card with coordinates');
            displayQuickVehicleCard(selectedVehicle);
          }
        }
      });
    }

    try {
      await populateYearDropdowns();
    } catch (error) {
      console.error('[quick-entry] Unable to refresh year dropdowns after manual ZIP entry', error);
    }

    autoCalculateQuick().catch((error) => {
      console.error('[quick-entry] Unable to recalculate after manual quick ZIP entry', error);
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
    console.warn('[distance-api] Google Distance Matrix API not available');
    return null;
  }

  try {
    const service = new google.maps.DistanceMatrixService();
    const request = {
      origins: [new google.maps.LatLng(originLat, originLon)],
      destinations: [new google.maps.LatLng(destLat, destLon)],
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL
    };

    return new Promise((resolve) => {
      service.getDistanceMatrix(request, (response, status) => {
        if (status === 'OK' && response?.rows?.[0]?.elements?.[0]?.status === 'OK') {
          const element = response.rows[0].elements[0];
          resolve({
            distance: element.distance.text, // e.g., "10.5 mi"
            duration: element.duration.text, // e.g., "15 mins"
            distanceMiles: element.distance.value / 1609.34 // Convert meters to miles
          });
        } else {
          console.warn('[distance-api] Distance Matrix request failed:', status);
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('[distance-api] Error getting distance:', error);
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
async function displayDealerMapWithRoute(originLat, originLon, destLat, destLon, dealerName = 'Dealer') {
  const mapContainer = document.getElementById('quick-dealer-map-container');
  const mapElement = document.getElementById('quick-dealer-map');

  if (!mapContainer || !mapElement) {
    console.warn('[dealer-map] Map container elements not found');
    return;
  }

  if (!window.google?.maps) {
    console.warn('[dealer-map] Google Maps API not loaded');
    mapContainer.style.display = 'none';
    return;
  }

  try {
    // Show the map container
    mapContainer.style.display = 'block';

    // Initialize map centered between origin and destination
    const centerLat = (originLat + destLat) / 2;
    const centerLon = (originLon + destLon) / 2;

    if (!dealerMap) {
      dealerMap = new google.maps.Map(mapElement, {
        center: { lat: centerLat, lng: centerLon },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
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
        strokeColor: '#4F46E5',
        strokeWeight: 5,
        strokeOpacity: 0.8
      }
    });

    // Request directions
    const request = {
      origin: new google.maps.LatLng(originLat, originLon),
      destination: new google.maps.LatLng(destLat, destLon),
      travelMode: google.maps.TravelMode.DRIVING
    };

    directionsService.route(request, (result, status) => {
      if (status === 'OK' && result) {
        directionsRenderer.setDirections(result);
        console.log('[dealer-map] Route displayed successfully');
      } else {
        console.error('[dealer-map] Directions request failed:', status);

        // Fall back to showing markers without route
        dealerMap.setCenter({ lat: centerLat, lng: centerLon });

        // Add origin marker
        new google.maps.Marker({
          position: { lat: originLat, lng: originLon },
          map: dealerMap,
          title: 'Your Location',
          label: 'A'
        });

        // Add destination marker
        new google.maps.Marker({
          position: { lat: destLat, lng: destLon },
          map: dealerMap,
          title: dealerName,
          label: 'B'
        });
      }
    });
  } catch (error) {
    console.error('[dealer-map] Error displaying map:', error);
  }
}

/**
 * Hide the dealer map
 */
function hideDealerMap() {
  const mapContainer = document.getElementById('quick-dealer-map-container');
  if (mapContainer) {
    mapContainer.style.display = 'none';
  }

  // Clean up directions renderer
  if (directionsRenderer) {
    directionsRenderer.setMap(null);
  }
}

/**
 * Toggle trade-in fields in Quick Entry mode
 */
// Trade-in modal state
let tradeInData = {
  vin: '',
  year: '',
  make: '',
  model: '',
  trim: '',
  mileage: '',
  value: 0,
  payoff: 0
};

/**
 * Open trade-in modal
 */
function openTradeInModal(checked) {
  const checkbox = document.getElementById('quick-has-tradein');
  const modal = document.getElementById('tradein-modal');

  if (!checked) {
    // User unchecked - clear trade-in
    checkbox.checked = false;
    tradeInData = { vin: '', year: '', make: '', model: '', trim: '', mileage: '', value: 0, payoff: 0 };
    document.getElementById('quick-tradein-summary').style.display = 'none';
    document.getElementById('quick-tradein-value').value = '0';
    document.getElementById('quick-tradein-payoff').value = '0';
    autoCalculateQuick();
    return;
  }

  // Populate modal with existing data
  document.getElementById('tradein-vin').value = tradeInData.vin || '';
  document.getElementById('tradein-year').value = tradeInData.year || '';
  document.getElementById('tradein-make').value = tradeInData.make || '';
  document.getElementById('tradein-model').value = tradeInData.model || '';
  document.getElementById('tradein-trim').value = tradeInData.trim || '';
  document.getElementById('tradein-mileage').value = tradeInData.mileage ? formatMileage(tradeInData.mileage) : '';
  document.getElementById('tradein-value-modal').value = tradeInData.value ? formatCurrency(tradeInData.value) : '';
  document.getElementById('tradein-payoff-modal').value = tradeInData.payoff ? formatCurrency(tradeInData.payoff) : '';

  modal.style.display = 'flex';
}
window.openTradeInModal = openTradeInModal;

/**
 * Close trade-in modal
 */
function closeTradeInModal() {
  const modal = document.getElementById('tradein-modal');
  const checkbox = document.getElementById('quick-has-tradein');

  // If no trade-in data was saved, uncheck the box
  if (!tradeInData.value || tradeInData.value === 0) {
    checkbox.checked = false;
    document.getElementById('quick-tradein-summary').style.display = 'none';
  }

  modal.style.display = 'none';
}
window.closeTradeInModal = closeTradeInModal;

/**
 * Save trade-in details from modal
 */
function saveTradeInDetails() {
  const vin = document.getElementById('tradein-vin').value.trim();
  const year = document.getElementById('tradein-year').value.trim();
  const make = document.getElementById('tradein-make').value.trim();
  const model = document.getElementById('tradein-model').value.trim();
  const trim = document.getElementById('tradein-trim').value.trim();
  const mileage = parseCurrency(document.getElementById('tradein-mileage').value);
  const value = parseCurrency(document.getElementById('tradein-value-modal').value);
  const payoff = parseCurrency(document.getElementById('tradein-payoff-modal').value);

  // Only validate that trade-in value is set if any field has data
  const hasAnyData = vin || year || make || model || trim || mileage || value || payoff;

  if (hasAnyData && (!value || value <= 0)) {
    alert('Please enter a trade-in value greater than $0.');
    return;
  }

  // Save data
  tradeInData = { vin, year, make, model, trim, mileage, value, payoff };

  // Update hidden fields for sliders
  document.getElementById('quick-tradein-value').value = value;
  document.getElementById('quick-tradein-payoff').value = payoff;

  // Update summary display - build title from available info
  const titleParts = [];
  if (year) titleParts.push(year);
  if (make) titleParts.push(capitalizeWords(make));
  if (model) titleParts.push(capitalizeWords(model));
  if (trim) titleParts.push(capitalizeWords(trim));
  const summaryTitle = titleParts.length > 0 ? titleParts.join(' ') : 'Trade-In Vehicle';

  const netValue = value - payoff;
  const summaryDetails = `${mileage ? formatMileage(mileage) + ' miles • ' : ''}Value: ${formatCurrency(value)}${payoff > 0 ? ` • Payoff: ${formatCurrency(payoff)}` : ''} • Net: ${formatCurrency(netValue)}`;

  document.getElementById('quick-tradein-summary-title').textContent = summaryTitle;
  document.getElementById('quick-tradein-summary-details').textContent = summaryDetails;
  document.getElementById('quick-tradein-summary').style.display = 'block';

  // Close modal
  closeTradeInModal();

  // Recalculate
  autoCalculateQuick();
}
window.saveTradeInDetails = saveTradeInDetails;

function toggleQuickTradeIn(hasTradeIn) {
  // Legacy function - now handled by openTradeInModal
  openTradeInModal(hasTradeIn);
}
window.toggleQuickTradeIn = toggleQuickTradeIn;

/**
 * Setup auto-calculation for Quick Entry mode
 */
function setupQuickAutoCalculation() {
  // Currency formatting inputs with slider sync
  const inputSliderMap = [
    { inputId: 'quick-vehicle-price', sliderId: 'quickSliderSalePrice' },
    { inputId: 'quick-down-payment', sliderId: 'quickSliderCashDown' },
    { inputId: 'quick-tradein-value', sliderId: 'quickSliderTradeAllowance' },
    { inputId: 'quick-tradein-payoff', sliderId: 'quickSliderTradePayoff' }
  ];

  inputSliderMap.forEach(({ inputId, sliderId }) => {
    const element = document.getElementById(inputId);
    const slider = document.getElementById(sliderId);
    if (element) {
      // Format on blur and sync to slider
      element.addEventListener('blur', (e) => {
        const rawValue = e.target.value.replace(/[^0-9.-]/g, '');
        const numValue = parseFloat(rawValue);
        if (!isNaN(numValue) && numValue > 0) {
          e.target.value = formatCurrency(numValue);
          // Sync to slider and update original values
          if (slider && window.sliderOriginalValues) {
            slider.value = numValue;
            // IMPORTANT: Read back the slider value after setting it
            // The browser will round it to the nearest valid step value
            const actualSliderValue = parseFloat(slider.value);
            updateSliderProgress(slider);
            window.sliderOriginalValues[sliderId] = actualSliderValue;
            console.log(`[input-sync] Set ${sliderId} to ${numValue}, browser rounded to ${actualSliderValue}, stored as originalValue`);
          }
        } else if (numValue === 0) {
          e.target.value = formatCurrency(0);
          if (slider && window.sliderOriginalValues) {
            slider.value = 0;
            updateSliderProgress(slider);
            window.sliderOriginalValues[sliderId] = 0;
          }
        }
        autoCalculateQuick();
      });

      // Auto-calculate on change
      element.addEventListener('change', () => autoCalculateQuick());
    }
  });

  // Non-currency inputs (dropdowns)
  const selectInputs = ['quick-loan-term', 'quick-credit-score'];
  selectInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', () => autoCalculateQuick());
    }
  });

  // Trade-in checkbox
  const tradeCheckbox = document.getElementById('quick-has-tradein');
  if (tradeCheckbox) {
    tradeCheckbox.addEventListener('change', () => autoCalculateQuick());
  }

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
  const aprValue = document.getElementById('quickTilAPR');
  const aprArrowLeft = document.getElementById('aprArrowLeft');
  const aprArrowRight = document.getElementById('aprArrowRight');

  if (!aprValue || !aprArrowLeft || !aprArrowRight) {
    console.warn('[apr-editing] APR editing elements not found');
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
    return (aprDecimal * 100).toFixed(2) + '%';
  };

  // Get current APR value
  const getCurrentApr = () => {
    const displayText = aprValue.textContent;
    return parseAprFromDisplay(displayText);
  };

  // Update APR and trigger recalculation
  const updateApr = async (newAprDecimal) => {
    // Clamp to reasonable range (0.01% to 30%)
    newAprDecimal = Math.max(0.0001, Math.min(0.30, newAprDecimal));

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

    console.log('[apr-editing] APR updated to:', formatAprForDisplay(newAprDecimal));
  };

  // Increment APR by 0.01%
  const incrementApr = async () => {
    const currentApr = getCurrentApr();
    if (currentApr !== null) {
      await updateApr(currentApr + 0.0001); // +0.01%
    }
  };

  // Decrement APR by 0.01%
  const decrementApr = async () => {
    const currentApr = getCurrentApr();
    if (currentApr !== null) {
      await updateApr(currentApr - 0.0001); // -0.01%
    }
  };

  // Click handlers for arrow buttons
  aprArrowLeft.addEventListener('click', async (e) => {
    e.preventDefault();
    await decrementApr();
  });

  aprArrowRight.addEventListener('click', async (e) => {
    e.preventDefault();
    await incrementApr();
  });

  // Keyboard arrow support when APR value is focused
  aprValue.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      await decrementApr();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      await incrementApr();
    }
  });

  // Visual feedback on hover
  aprValue.addEventListener('mouseenter', () => {
    aprValue.style.cursor = 'pointer';
  });

  // APR Tooltip functionality - assign to updateTooltip for real-time updates
  updateTooltip = setupAprTooltip(aprValue);

  console.log('[apr-editing] APR editing setup complete');
}

/**
 * Setup APR tooltip to show payment impact on hover
 */
function setupAprTooltip(aprValue) {
  const tooltip = document.getElementById('aprTooltip');
  const tooltipPayment = document.getElementById('aprTooltipPayment');
  const tooltipDiff = document.getElementById('aprTooltipDiff');
  const valueWrapper = aprValue.closest('.quick-til-value-wrapper');

  // Finance charge tooltip elements
  const financeChargeTooltip = document.getElementById('financeChargeTooltip');
  const financeChargeTooltipDiff = document.getElementById('financeChargeTooltipDiff');

  if (!tooltip || !tooltipPayment || !tooltipDiff || !valueWrapper) {
    console.warn('[apr-tooltip] Tooltip elements not found');
    return () => {}; // Return empty function
  }

  // Store original values for comparison (set when first calculated)
  let originalPayment = null;
  let originalFinanceCharge = null;
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
    tooltipPayment.textContent = formatCurrency(currentPayment) + '/mo';

    // Calculate difference from original
    const diff = currentPayment - originalPayment;

    // Format difference with buyer-centric color
    if (Math.abs(diff) < 1) {
      tooltipDiff.textContent = 'Same as original';
      tooltipDiff.className = 'apr-tooltip__diff neutral';
    } else {
      // Format as +/- (human readable) instead of accounting format
      const sign = diff > 0 ? '+' : '-';
      const absDiff = Math.abs(diff);
      const formattedDiff = absDiff.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
      tooltipDiff.textContent = `${sign}$${formattedDiff}/mo from original`;
      // Buyer-centric: lower payment = positive (green), higher = negative (red)
      tooltipDiff.className = diff > 0 ? 'apr-tooltip__diff negative' : 'apr-tooltip__diff positive';
    }

    tooltip.style.display = 'block';
    isTooltipVisible = true;

    // Also show finance charge tooltip if available
    if (financeChargeTooltip && financeChargeTooltipDiff) {
      // Get current finance charge from the DOM (already calculated by autoCalculateQuick)
      const financeChargeEl = document.getElementById('quickTilFinanceCharge');
      if (!financeChargeEl) return;

      const currentFinanceCharge = parseCurrency(financeChargeEl.textContent) || 0;

      // Set original finance charge if not set yet
      if (originalFinanceCharge === null) {
        originalFinanceCharge = currentFinanceCharge;
      }

      // Calculate difference from original
      const fcDiff = currentFinanceCharge - originalFinanceCharge;

      // Format difference with buyer-centric color - same format as APR tooltip
      if (Math.abs(fcDiff) < 1) {
        financeChargeTooltipDiff.textContent = 'No change';
        financeChargeTooltipDiff.className = 'finance-charge-tooltip__diff neutral';
      } else {
        // Format as +/- (human readable) - same as payment tooltip
        const sign = fcDiff > 0 ? '+' : '';
        const formattedDiff = Math.abs(fcDiff).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
        financeChargeTooltipDiff.textContent = `${sign}$${formattedDiff}`;
        // Buyer-centric: lower finance charge = positive (green), higher = negative (red)
        financeChargeTooltipDiff.className = fcDiff > 0 ? 'finance-charge-tooltip__diff negative' : 'finance-charge-tooltip__diff positive';
      }

      financeChargeTooltip.style.display = 'block';
    }
  };

  // Hide tooltip
  const hideTooltip = () => {
    tooltip.style.display = 'none';
    isTooltipVisible = false;

    // Also hide finance charge tooltip
    if (financeChargeTooltip) {
      financeChargeTooltip.style.display = 'none';
    }
  };

  // Add hover listeners to the entire wrapper (includes arrows and value)
  valueWrapper.addEventListener('mouseenter', showTooltip);
  valueWrapper.addEventListener('mouseleave', hideTooltip);

  // Reset original values when vehicle or major values change
  window.resetAprTooltipOriginal = () => {
    originalPayment = null;
    originalFinanceCharge = null;
    console.log('[apr-tooltip] Reset original payment and finance charge baseline');
  };

  console.log('[apr-tooltip] APR tooltip setup complete');

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
  const termValue = document.getElementById('quickTilTerm');
  const termArrowLeft = document.getElementById('termArrowLeft');
  const termArrowRight = document.getElementById('termArrowRight');

  if (!termValue || !termArrowLeft || !termArrowRight) {
    console.warn('[term-editing] Term editing elements not found');
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
    const termDropdown = document.getElementById('quick-loan-term');
    if (termDropdown) {
      termDropdown.value = newTerm.toString();
    }

    // Trigger recalculation
    await autoCalculateQuick();

    // Update tooltip if it's visible (real-time update)
    if (updateTooltip) {
      updateTooltip();
    }

    console.log('[term-editing] Term updated to:', newTerm);
  };

  // Increment term by 6 months
  const incrementTerm = async () => {
    const currentTerm = getCurrentTerm();
    if (currentTerm > 0) {
      await updateTerm(currentTerm + 6);
    }
  };

  // Decrement term by 6 months
  const decrementTerm = async () => {
    const currentTerm = getCurrentTerm();
    if (currentTerm > 0) {
      await updateTerm(currentTerm - 6);
    }
  };

  // Click handlers for arrow buttons
  termArrowLeft.addEventListener('click', async (e) => {
    e.preventDefault();
    await decrementTerm();
  });

  termArrowRight.addEventListener('click', async (e) => {
    e.preventDefault();
    await incrementTerm();
  });

  // Keyboard arrow support when term value is focused
  termValue.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      await decrementTerm();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      await incrementTerm();
    }
  });

  // Visual feedback on hover
  termValue.addEventListener('mouseenter', () => {
    termValue.style.cursor = 'pointer';
  });

  // Term Tooltip functionality - assign to updateTooltip for real-time updates
  updateTooltip = setupTermTooltip(termValue);

  console.log('[term-editing] Term editing setup complete');
}

/**
 * Setup Term tooltip to show payment impact on hover
 */
function setupTermTooltip(termValue) {
  const tooltip = document.getElementById('termTooltip');
  const tooltipPayment = document.getElementById('termTooltipPayment');
  const tooltipDiff = document.getElementById('termTooltipDiff');
  const valueWrapper = termValue.closest('.quick-til-value-wrapper');

  if (!tooltip || !tooltipPayment || !tooltipDiff || !valueWrapper) {
    console.warn('[term-tooltip] Tooltip elements not found');
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
    tooltipPayment.textContent = formatCurrency(currentPayment) + '/mo';

    // Calculate difference from original
    const diff = currentPayment - originalPayment;

    // Format difference with buyer-centric color
    if (Math.abs(diff) < 1) {
      tooltipDiff.textContent = 'Same as original';
      tooltipDiff.className = 'apr-tooltip__diff neutral';
    } else {
      // Format as +/- (human readable)
      const sign = diff > 0 ? '+' : '';
      const formattedDiff = Math.abs(diff).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
      tooltipDiff.textContent = `${sign}$${formattedDiff}/mo from original`;
      // Buyer-centric: lower payment = positive (green), higher = negative (red)
      tooltipDiff.className = diff > 0 ? 'apr-tooltip__diff negative' : 'apr-tooltip__diff positive';
    }

    tooltip.style.display = 'block';
    isTooltipVisible = true;
  };

  // Hide tooltip
  const hideTooltip = () => {
    tooltip.style.display = 'none';
    isTooltipVisible = false;
  };

  // Add hover listeners to the entire wrapper (includes arrows and value)
  valueWrapper.addEventListener('mouseenter', showTooltip);
  valueWrapper.addEventListener('mouseleave', hideTooltip);

  // Reset original payment when vehicle or major values change
  window.resetTermTooltipOriginal = () => {
    originalPayment = null;
    console.log('[term-tooltip] Reset original payment baseline');
  };

  console.log('[term-tooltip] Term tooltip setup complete');

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
  const monthlyFCValue = document.getElementById('quickTilMonthlyFinanceCharge');
  const tooltip = document.getElementById('monthlyFinanceChargeTooltip');
  const tooltipAmount = document.getElementById('monthlyFinanceChargeTooltipAmount');
  const tooltipDiff = document.getElementById('monthlyFinanceChargeTooltipDiff');

  if (!monthlyFCValue || !tooltip || !tooltipAmount || !tooltipDiff) {
    console.warn('[monthly-fc-tooltip] Tooltip elements not found');
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
    tooltipAmount.textContent = formatCurrency(currentMonthlyFC) + '/mo';

    // Calculate difference from original
    const diff = currentMonthlyFC - originalMonthlyFC;

    // Format difference with buyer-centric color
    if (Math.abs(diff) < 1) {
      tooltipDiff.textContent = 'Same as original';
      tooltipDiff.className = 'apr-tooltip__diff neutral';
    } else {
      // Format as +/- (human readable)
      const sign = diff > 0 ? '+' : '';
      const formattedDiff = Math.abs(diff).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
      tooltipDiff.textContent = `${sign}$${formattedDiff}/mo from original`;
      // Buyer-centric: lower interest = positive (green), higher = negative (red)
      tooltipDiff.className = diff > 0 ? 'apr-tooltip__diff negative' : 'apr-tooltip__diff positive';
    }

    tooltip.style.display = 'block';
    isTooltipVisible = true;
  };

  // Hide tooltip
  const hideTooltip = () => {
    tooltip.style.display = 'none';
    isTooltipVisible = false;
  };

  // Add hover listeners to the monthly finance charge value
  monthlyFCValue.addEventListener('mouseenter', showTooltip);
  monthlyFCValue.addEventListener('mouseleave', hideTooltip);

  // Reset original when vehicle or major values change
  window.resetMonthlyFCTooltipOriginal = () => {
    originalMonthlyFC = null;
    console.log('[monthly-fc-tooltip] Reset original baseline');
  };

  console.log('[monthly-fc-tooltip] Monthly Finance Charge tooltip setup complete');
}

/**
 * Auto-calculate and update Quick Entry display
 */
async function autoCalculateQuick() {
  // Gather all inputs
  const quickVehiclePrice = parseCurrency(document.getElementById('quick-vehicle-price')?.value);
  const quickDownPayment = parseCurrency(document.getElementById('quick-down-payment')?.value);
  const quickLoanTerm = parseInt(document.getElementById('quick-loan-term')?.value);
  const quickCreditScore = document.getElementById('quick-credit-score')?.value;
  const quickHasTradeIn = document.getElementById('quick-has-tradein')?.checked;

  // Only calculate if we have the minimum required inputs
  if (!quickVehiclePrice || quickVehiclePrice <= 0 || !quickLoanTerm || !quickCreditScore) {
    return; // Silently return, don't show alerts
  }

  // Update wizard data
  wizardData.financing = {
    salePrice: quickVehiclePrice,
    cashDown: quickDownPayment || 0,
    term: quickLoanTerm,
    creditScoreRange: quickCreditScore
  };

  // Update trade-in data
  const quickTradeValue = parseCurrency(document.getElementById('quick-tradein-value')?.value);
  const quickTradePayoff = parseCurrency(document.getElementById('quick-tradein-payoff')?.value);

  // Consider trade-in active if checkbox is checked OR if any trade values are non-zero
  const hasActiveTradeIn = quickHasTradeIn || (quickTradeValue > 0) || (quickTradePayoff > 0);

  if (hasActiveTradeIn) {
    wizardData.tradein = {
      hasTradeIn: true,
      tradeValue: quickTradeValue || 0,
      tradePayoff: quickTradePayoff || 0
    };
  } else {
    wizardData.tradein = {
      hasTradeIn: false,
      tradeValue: 0,
      tradePayoff: 0
    };
  }

  try {
    // Calculate results
    const reviewData = await computeReviewData();

    // Display main results
    setText('quickMonthlyPayment', formatCurrency(reviewData.monthlyPayment));
    setText('quickTerm', `${reviewData.term} months`);
    setText('quickAPR', formatPercent(reviewData.apr));

    // Display lender info in payment hero OR custom APR badge
    const lenderInfoEl = document.getElementById('quickLenderInfo');
    const lenderNameEl = document.getElementById('quickLenderName');
    const lenderDateEl = document.getElementById('quickLenderDate');
    const lenderDateSeparator = document.getElementById('quickLenderDateSeparator');
    const customAprBadge = document.getElementById('quickCustomAprBadge');

    console.log('[hero] Updating lender hero:', {
      lenderName: reviewData.lenderName,
      effectiveDate: reviewData.lenderEffectiveDate,
      lenderId: reviewData.lenderId,
      customAprOverride: customAprOverride
    });

    // Check if using custom APR
    if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
      // Hide lender info, show custom APR badge
      if (lenderInfoEl) lenderInfoEl.style.display = 'none';
      if (customAprBadge) customAprBadge.style.display = 'flex';
      console.log('[hero] Displaying custom APR badge');
    } else {
      // Hide custom APR badge, show lender info
      if (customAprBadge) customAprBadge.style.display = 'none';

      if (lenderInfoEl && lenderNameEl && reviewData.lenderName) {
        lenderNameEl.textContent = reviewData.lenderName;

        if (lenderDateEl && reviewData.lenderEffectiveDate) {
          // Format date nicely (e.g., "2025-11-04" -> "Nov 4, 2025")
          try {
            const date = new Date(reviewData.lenderEffectiveDate);
            const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            lenderDateEl.textContent = `Rates as of ${formatted}`;
          } catch {
            lenderDateEl.textContent = `Rates as of ${reviewData.lenderEffectiveDate}`;
          }
          if (lenderDateSeparator) lenderDateSeparator.style.display = 'inline';
        } else {
          if (lenderDateEl) lenderDateEl.textContent = '';
          if (lenderDateSeparator) lenderDateSeparator.style.display = 'none';
        }

        lenderInfoEl.style.display = 'flex';
      } else if (lenderInfoEl) {
        lenderInfoEl.style.display = 'none';
      }
    }

    // Display effective date inline under lender dropdown (hide if custom APR)
    const lenderEffectiveDateEl = document.getElementById('lender-effective-date');
    const lenderEffectiveDateValue = document.getElementById('lender-effective-date-value');

    if (customAprOverride !== null && Number.isFinite(customAprOverride)) {
      // Hide effective date when using custom APR
      if (lenderEffectiveDateEl) lenderEffectiveDateEl.style.display = 'none';
    } else if (lenderEffectiveDateEl && lenderEffectiveDateValue && reviewData.lenderEffectiveDate) {
      lenderEffectiveDateValue.textContent = reviewData.lenderEffectiveDate;
      lenderEffectiveDateEl.style.display = 'block';
    } else if (lenderEffectiveDateEl) {
      lenderEffectiveDateEl.style.display = 'none';
    }

    // Display TIL cards
    setText('quickTilAPR', formatPercent(reviewData.apr));
    setText('quickTilFinanceCharge', formatCurrency(reviewData.financeCharge));
    setText('quickTilAmountFinanced', formatCurrency(reviewData.amountFinanced));
    setText('quickTilTotalPayments', formatCurrency(reviewData.totalPayments));
    setText('quickTilTerm', reviewData.term.toString());

    // Calculate and display Monthly Finance Charge (interest portion per month)
    const monthlyFinanceCharge = reviewData.term > 0 ? reviewData.financeCharge / reviewData.term : 0;
    setText('quickTilMonthlyFinanceCharge', formatCurrency(monthlyFinanceCharge));

    // Display calculation breakdown values (read-only mirrors of slider values)
    setText('quickCalcSalePrice', formatCurrency(reviewData.salePrice));
    setText('quickCalcCashDown', formatCurrency(reviewData.cashDown));
    setText('quickCalcTradeAllowance', formatCurrency(reviewData.tradeOffer));
    setText('quickCalcTradePayoff', formatCurrency(reviewData.tradePayoff));
    setText('quickCalcDealerFees', formatCurrency(reviewData.totalDealerFees));
    setText('quickCalcCustomerAddons', formatCurrency(reviewData.totalCustomerAddons));

    // Display itemization values (read-only)
    setText('quickNetTrade', formatCurrencyAccounting(reviewData.netTrade));
    setText('quickUnpaidBalance', formatCurrency(reviewData.unpaidBalance));
    setText('quickOtherCharges', formatCurrency(reviewData.sumOtherCharges));
    setText('quickGovtFees', formatCurrency(reviewData.totalGovtFees));
    setText('quickStateTax', formatCurrency(reviewData.stateTaxTotal));
    setText('quickCountyTax', formatCurrency(reviewData.countyTaxTotal));
    setText('quickSaleTaxTotal', formatCurrency(reviewData.stateTaxTotal + reviewData.countyTaxTotal));
    setText('quickAmountFinancedTotal', formatCurrency(reviewData.amountFinanced));

    // Update tax labels with state/county info
    updateTaxLabels();

    // Display cash due
    setText('quickCashDueHighlight', formatCurrency(reviewData.cashDue));

    // NOTE: Don't call updateQuickSliderValues() here - sliders are the source of truth
    // and calling it resets the original values causing diff indicators to disappear

    console.log('[quick-entry] Auto-calculation complete - Monthly Payment:', formatCurrency(reviewData.monthlyPayment));
  } catch (error) {
    console.error('[quick-entry] Calculation error:', error);
  }
}

/**
 * Update tax labels to show state/county names and rates
 */
function updateTaxLabels() {
  ensureWizardFeeDefaults();

  const stateCode = wizardData.location?.stateCode || '';
  const countyName = wizardData.location?.countyName || '';
  const stateTaxRate = wizardData.fees?.stateTaxRate || 6.0;
  const countyTaxRate = wizardData.fees?.countyTaxRate || 1.0;

  const stateTaxLabel = document.getElementById('quickStateTaxLabel');
  const countyTaxLabel = document.getElementById('quickCountyTaxLabel');

  if (stateTaxLabel) {
    if (stateCode) {
      stateTaxLabel.textContent = `${stateCode} State Tax (${stateTaxRate.toFixed(2)}%)`;
    } else {
      stateTaxLabel.innerHTML = `State Tax (${stateTaxRate.toFixed(2)}%) <span style="font-size: 10px; opacity: 0.7;">- using default</span>`;
    }
  }

  if (countyTaxLabel) {
    if (countyName) {
      countyTaxLabel.textContent = `${countyName} County Tax (${countyTaxRate.toFixed(2)}%)`;
    } else {
      countyTaxLabel.innerHTML = `County Tax (${countyTaxRate.toFixed(2)}%) <span style="font-size: 10px; opacity: 0.7;">- using default</span>`;
    }
  }
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
  const sliderConfigs = [
    {
      sliderId: 'quickSliderSalePrice',
      inputId: 'quickInputSalePrice',
      diffId: 'quickDiffSalePrice',
      resetId: 'quickResetSalePrice',
      sourceId: 'quick-vehicle-price',
      max: 150000,
      step: 100,
      buyerPositiveOnDecrease: true, // Lower price is better for buyer
      updateWizardData: (val) => {
        wizardData.financing.salePrice = val;
        document.getElementById('quick-vehicle-price').value = formatCurrency(val);
      }
    },
    {
      sliderId: 'quickSliderCashDown',
      inputId: 'quickInputCashDown',
      diffId: 'quickDiffCashDown',
      resetId: 'quickResetCashDown',
      sourceId: 'quick-down-payment',
      max: 50000,
      step: 100,
      buyerPositiveOnDecrease: true, // Less cash down is better for buyer
      updateWizardData: (val) => {
        wizardData.financing.cashDown = val;
        document.getElementById('quick-down-payment').value = formatCurrency(val);
      }
    },
    {
      sliderId: 'quickSliderTradeAllowance',
      inputId: 'quickInputTradeAllowance',
      diffId: 'quickDiffTradeAllowance',
      resetId: 'quickResetTradeAllowance',
      sourceId: 'quick-tradein-value',
      max: 75000,
      step: 100,
      buyerPositiveOnDecrease: false, // Higher trade value is better for buyer
      updateWizardData: (val) => {
        if (!wizardData.tradein) wizardData.tradein = {};
        wizardData.tradein.hasTradeIn = true; // Ensure trade-in is enabled when slider is moved
        wizardData.tradein.tradeValue = val;
        document.getElementById('quick-tradein-value').value = formatCurrency(val);
      }
    },
    {
      sliderId: 'quickSliderTradePayoff',
      inputId: 'quickInputTradePayoff',
      diffId: 'quickDiffTradePayoff',
      resetId: 'quickResetTradePayoff',
      sourceId: 'quick-tradein-payoff',
      max: 75000,
      step: 100,
      buyerPositiveOnDecrease: true, // Less payoff is better for buyer
      updateWizardData: (val) => {
        if (!wizardData.tradein) wizardData.tradein = {};
        wizardData.tradein.hasTradeIn = true; // Ensure trade-in is enabled when slider is moved
        wizardData.tradein.tradePayoff = val;
        document.getElementById('quick-tradein-payoff').value = formatCurrency(val);
      }
    },
    {
      sliderId: 'quickSliderDealerFees',
      inputId: 'quickInputDealerFees',
      diffId: 'quickDiffDealerFees',
      resetId: 'quickResetDealerFees',
      max: 10000,
      step: 100,
      buyerPositiveOnDecrease: true, // Lower fees are better for buyer
      updateWizardData: (val) => {
        ensureWizardFeeDefaults();
        wizardData.fees.dealerFees = val;
        wizardData.fees.userCustomized = true;
      }
    },
    {
      sliderId: 'quickSliderCustomerAddons',
      inputId: 'quickInputCustomerAddons',
      diffId: 'quickDiffCustomerAddons',
      resetId: 'quickResetCustomerAddons',
      max: 10000,
      step: 100,
      buyerPositiveOnDecrease: true, // Fewer add-ons are better for buyer
      updateWizardData: (val) => {
        ensureWizardFeeDefaults();
        wizardData.fees.customerAddons = val;
        wizardData.fees.userCustomized = true;
      }
    }
  ];

  // Use global original values object (shared with updateQuickSliderValues)
  if (!window.sliderOriginalValues) {
    window.sliderOriginalValues = {};
  }
  const originalValues = window.sliderOriginalValues;

  // Create throttled version of expensive calculation (150ms delay)
  const throttledCalculate = throttle(autoCalculateQuick, 150);

  sliderConfigs.forEach(config => {
    const slider = document.getElementById(config.sliderId);
    const input = document.getElementById(config.inputId);
    const diffIndicator = document.getElementById(config.diffId);
    const resetBtn = document.getElementById(config.resetId);

    if (!slider || !input) {
      console.warn(`[setupQuickSliders] Missing elements for ${config.sliderId}:`, {
        slider: !!slider,
        input: !!input
      });
      return;
    }

    console.log(`[setupQuickSliders] Setting up ${config.sliderId}`);

    slider.min = config.min || 0;
    slider.max = config.max;
    slider.step = config.step;

    // Ensure slider has a valid numeric value (not empty string or NaN)
    const currentValue = parseFloat(slider.value);
    if (!Number.isFinite(currentValue)) {
      slider.value = 0;
      input.value = formatCurrency(0);
    }

    // Store original value when first loaded
    originalValues[config.sliderId] = parseFloat(slider.value) || 0;

    console.log(`[setupQuickSliders] ${config.sliderId} initialized: value=${slider.value}, original=${originalValues[config.sliderId]}`);

    // Move reset button inside diff indicator
    if (resetBtn && diffIndicator) {
      diffIndicator.appendChild(resetBtn);
    }

    // Update diff indicator (buyer-centric: green = good for buyer, red = bad for buyer)
    const updateDiff = (currentValue) => {
      const original = originalValues[config.sliderId];
      const diff = currentValue - original;

      if (diff === 0) {
        diffIndicator.style.display = 'none';
      } else {
        diffIndicator.style.display = 'flex';

        // Determine if change is positive or negative for buyer
        let isBuyerPositive;
        if (config.buyerPositiveOnDecrease) {
          // For fields where decrease is good (sale price, cash down, fees, etc.)
          isBuyerPositive = diff < 0;
        } else {
          // For fields where increase is good (trade allowance)
          isBuyerPositive = diff > 0;
        }

        const diffClass = isBuyerPositive ? 'positive' : 'negative';
        diffIndicator.className = `quick-diff-indicator ${diffClass}`;

        // Create diff text span if it doesn't exist
        let diffText = diffIndicator.querySelector('.diff-text');
        if (!diffText) {
          diffText = document.createElement('span');
          diffText.className = 'diff-text';
          diffIndicator.insertBefore(diffText, resetBtn);
        }

        // Calculate payment difference for THIS specific slider
        // (not cumulative from all changes, just this slider's impact)
        const currentPayment = calculateCurrentMonthlyPayment();

        // Temporarily calculate what payment would be if this slider was at original value
        const currentSliderValue = currentValue;
        const originalSliderValue = original;

        // Store current wizardData state
        const wizardDataBackup = JSON.parse(JSON.stringify(wizardData));

        // Temporarily set slider to original value and calculate
        config.updateWizardData(originalSliderValue);
        const reviewData = computeReviewData();
        const paymentWithOriginalSlider = reviewData?.totalPayment || 0;

        // Restore current state
        config.updateWizardData(currentSliderValue);
        // Restore full wizardData to ensure nothing else changed
        Object.assign(wizardData, wizardDataBackup);

        // Calculate the impact of THIS slider change only
        const paymentDiff = currentPayment - paymentWithOriginalSlider;

        // Format payment difference with buyer-centric color (always payment-centric: decrease = good, increase = bad)
        let paymentText = '';
        if (Math.abs(paymentDiff) >= 1) {
          const paymentSign = paymentDiff > 0 ? '+' : '';
          const paymentClass = paymentDiff > 0 ? 'payment-negative' : 'payment-positive';
          paymentText = ` <span class="${paymentClass}">(${paymentSign}$${Math.abs(paymentDiff).toFixed(0)}/mo)</span>`;
        }

        diffText.innerHTML = `${diff > 0 ? '+' : ''}${formatCurrency(diff)} from original${paymentText}`;
      }
    };

    // Slider to input sync (while dragging - use throttled calculation)
    slider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);

      console.log(`[slider-input] ${config.sliderId}: ${value}`);

      // Update UI immediately (fast, no lag)
      input.value = formatCurrency(value);
      updateSliderProgress(slider);
      updateDiff(value);
      config.updateWizardData(value);

      // Throttle expensive calculations (max once per 150ms)
      try {
        await throttledCalculate();
        // Update tooltip after calculation completes so it shows new payment
        showSliderTooltip(slider, value);
      } catch (error) {
        console.error(`[slider-input] Error in ${config.sliderId}:`, error);
      }
    });

    // When user releases slider, do final unthrottled calculation
    slider.addEventListener('change', async (e) => {
      let value = parseFloat(e.target.value);
      const originalValue = originalValues[config.sliderId];

      // Snap to original if within half a step
      if (Math.abs(value - originalValue) <= config.step / 2) {
        value = originalValue;
        slider.value = value;
        input.value = formatCurrency(value);
        updateSliderProgress(slider);
        updateDiff(value);
        config.updateWizardData(value);
      }

      console.log(`[slider-change] ${config.sliderId}: ${value}`);

      // Final calculation without throttling
      try {
        await autoCalculateQuick();
      } catch (error) {
        console.error(`[slider-change] Error in ${config.sliderId}:`, error);
      }
    });

    // Input to slider sync
    input.addEventListener('blur', async (e) => {
      const rawValue = e.target.value.replace(/[^0-9.-]/g, '');
      let value = parseFloat(rawValue);

      if (isNaN(value) || value < 0) value = 0;
      else if (value > config.max) value = config.max;

      value = Math.round(value / config.step) * config.step;

      slider.value = value;
      input.value = formatCurrency(value);
      updateSliderProgress(slider);
      updateDiff(value);
      config.updateWizardData(value);
      await autoCalculateQuick();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });

    // Reset button click
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const original = originalValues[config.sliderId];
        slider.value = original;
        input.value = formatCurrency(original);
        updateSliderProgress(slider);
        updateDiff(original);
        config.updateWizardData(original);
        await autoCalculateQuick();
      });
    }

    // Get the parent adjustment container (for ribbons in "Adjust Your Numbers")
    const adjustmentSection = slider.closest('.quick-adjustment');

    // Get the parent slider section (for sliders in itemization/breakdown)
    const sliderSection = slider.closest('.quick-item--with-slider');

    // Use whichever section exists
    const hoverSection = adjustmentSection || sliderSection;

    if (hoverSection) {
      // Make the section focusable for keyboard navigation
      if (!hoverSection.hasAttribute('tabindex')) {
        hoverSection.setAttribute('tabindex', '0');
      }

      // Track if mouse is over this section
      let isHovering = false;

      // Show tooltip when hovering over entire section
      hoverSection.addEventListener('mouseenter', () => {
        isHovering = true;
        const value = parseFloat(slider.value);
        showSliderTooltip(slider, value);

        // Focus the section so arrow keys work immediately
        hoverSection.focus();
      });

      hoverSection.addEventListener('mousemove', () => {
        const value = parseFloat(slider.value);
        showSliderTooltip(slider, value);
      });

      hoverSection.addEventListener('mouseleave', () => {
        isHovering = false;
        hideSliderTooltip();

        // Clear baseline for this slider so it gets a fresh one next time
        sliderBaselines.delete(slider.id);
      });

      // Handle arrow keys when hovering over section (with throttling)
      const handleArrowKey = async (e) => {
        if (!isHovering) return;

        const originalValue = originalValues[config.sliderId];

        // Check for arrow keys
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();

          // If input is focused, blur it first to avoid conflicts
          if (document.activeElement === input) {
            input.blur();
            await new Promise(resolve => setTimeout(resolve, 0));
          }

          // Decrease value
          let currentValue = parseFloat(slider.value);
          let newValue = currentValue - config.step;

          // Apply min constraint
          const minValue = parseFloat(slider.min) || 0;
          newValue = Math.max(minValue, newValue);

          slider.value = newValue;
          // Read back the actual value (browser may round to step)
          const actualValue = parseFloat(slider.value);
          input.value = formatCurrency(actualValue);
          updateSliderProgress(slider);
          updateDiff(actualValue);
          config.updateWizardData(actualValue);

          // Use throttled calculations for arrow keys too
          await throttledCalculate();
          showSliderTooltip(slider, actualValue);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();

          // If input is focused, blur it first to avoid conflicts
          if (document.activeElement === input) {
            input.blur();
            await new Promise(resolve => setTimeout(resolve, 0));
          }

          // Increase value
          let currentValue = parseFloat(slider.value);
          let newValue = currentValue + config.step;

          // Apply max constraint
          newValue = Math.min(parseFloat(slider.max) || 100000, newValue);

          slider.value = newValue;
          // Read back the actual value (browser may round to step)
          const actualValue = parseFloat(slider.value);
          input.value = formatCurrency(actualValue);
          updateSliderProgress(slider);
          updateDiff(actualValue);
          config.updateWizardData(actualValue);

          // Use throttled calculations for arrow keys too
          await throttledCalculate();
          showSliderTooltip(slider, actualValue);
        }
      };

      // Add keyboard listener to document (so it works regardless of focus)
      document.addEventListener('keydown', handleArrowKey);

      // Store cleanup function for later if needed
      hoverSection._arrowKeyHandler = handleArrowKey;
    }
  });

  // Store configs for later use
  window.sliderOriginalValues = originalValues;
}

/**
 * Show slider payment tooltip
 */

function showSliderTooltip(sliderElement, currentValue) {
  const tooltip = document.getElementById('slider-payment-tooltip');
  if (!tooltip) return;

  // Calculate current monthly payment
  const monthlyPayment = calculateCurrentMonthlyPayment();

  // Get or set baseline for this specific slider
  const sliderId = sliderElement.id;
  if (!sliderBaselines.has(sliderId)) {
    sliderBaselines.set(sliderId, monthlyPayment);
  }

  const baseline = sliderBaselines.get(sliderId);

  // Calculate change from this slider's baseline
  const paymentDiff = monthlyPayment - baseline;

  // Update tooltip content
  const paymentEl = tooltip.querySelector('.tooltip-payment');
  const changeEl = tooltip.querySelector('.tooltip-change');

  paymentEl.textContent = `${formatCurrency(monthlyPayment)}/mo`;

  // Update change indicator (buyer-centric: lower payment = green/good, higher payment = red/bad)
  if (Math.abs(paymentDiff) < 1) {
    changeEl.textContent = 'No change';
    changeEl.className = 'tooltip-change neutral';
  } else {
    // Use explicit +/- signs (not accounting style)
    const sign = paymentDiff > 0 ? '+' : '-';
    const absValue = Math.abs(paymentDiff);
    changeEl.textContent = `${sign}$${absValue.toFixed(0)}/mo`;
    // Payment increase is bad for buyer (red), payment decrease is good (green)
    changeEl.className = paymentDiff > 0 ? 'tooltip-change negative' : 'tooltip-change positive';
  }

  // Position tooltip above the slider thumb
  const rect = sliderElement.getBoundingClientRect();
  const sliderValue = parseFloat(sliderElement.value);
  const sliderMin = parseFloat(sliderElement.min);
  const sliderMax = parseFloat(sliderElement.max);

  // Calculate thumb position percentage
  const percentage = (sliderValue - sliderMin) / (sliderMax - sliderMin);
  const thumbPosition = rect.left + (rect.width * percentage);

  tooltip.style.left = `${thumbPosition}px`;
  tooltip.style.top = `${rect.top}px`;
  tooltip.style.display = 'block';
}

/**
 * Hide slider payment tooltip
 */
function hideSliderTooltip() {
  const tooltip = document.getElementById('slider-payment-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

/**
 * Calculate current monthly payment (helper for tooltip)
 */
function calculateCurrentMonthlyPayment() {
  // Get current calculation result from the page
  const monthlyPaymentEl = document.getElementById('quickMonthlyPayment');
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
  const updates = [
    { sliderId: 'quickSliderSalePrice', inputId: 'quickInputSalePrice', diffId: 'quickDiffSalePrice', resetId: 'quickResetSalePrice', value: wizardData.financing?.salePrice || 0 },
    { sliderId: 'quickSliderCashDown', inputId: 'quickInputCashDown', diffId: 'quickDiffCashDown', resetId: 'quickResetCashDown', value: wizardData.financing?.cashDown || 0 },
    { sliderId: 'quickSliderTradeAllowance', inputId: 'quickInputTradeAllowance', diffId: 'quickDiffTradeAllowance', resetId: 'quickResetTradeAllowance', value: wizardData.tradein?.tradeValue || 0 },
    { sliderId: 'quickSliderTradePayoff', inputId: 'quickInputTradePayoff', diffId: 'quickDiffTradePayoff', resetId: 'quickResetTradePayoff', value: wizardData.tradein?.tradePayoff || 0 },
    { sliderId: 'quickSliderDealerFees', inputId: 'quickInputDealerFees', diffId: 'quickDiffDealerFees', resetId: 'quickResetDealerFees', value: wizardData.fees?.dealerFees || 0 },
    { sliderId: 'quickSliderCustomerAddons', inputId: 'quickInputCustomerAddons', diffId: 'quickDiffCustomerAddons', resetId: 'quickResetCustomerAddons', value: wizardData.fees?.customerAddons || 0 }
  ];

  updates.forEach(({ sliderId, inputId, diffId, resetId, value }) => {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    const diffIndicator = document.getElementById(diffId);
    const resetBtn = document.getElementById(resetId);

    if (slider && input) {
      slider.value = value;
      // IMPORTANT: Read back the slider value after setting it
      // The browser will round it to the nearest valid step value
      const actualSliderValue = parseFloat(slider.value);
      input.value = formatCurrency(actualSliderValue);
      updateSliderProgress(slider);

      // Reset original value to current value (use the rounded value from slider)
      if (window.sliderOriginalValues) {
        window.sliderOriginalValues[sliderId] = actualSliderValue;
      }

      // Hide diff indicator and reset button since we're at the new "original" value
      if (diffIndicator) diffIndicator.style.display = 'none';
      if (resetBtn) resetBtn.style.display = 'none';
    }
  });

  // Reset original monthly payment for tooltip
  resetOriginalMonthlyPayment();
}

/**
 * Parse currency string to number
 */
function parseCurrency(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Register service worker for production only
 * Skip during development (Vite dev server)
 */
const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
if ('serviceWorker' in navigator && isProd) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration);
      })
      .catch((error) => {
        console.log('[SW] Registration failed:', error);
      });
  });
}
