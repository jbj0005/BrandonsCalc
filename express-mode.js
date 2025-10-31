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

// Supabase client
let supabase = null;
let currentUserId = null;

// Saved vehicles cache
let savedVehicles = [];
let selectedVehicle = null;
let similarVehicles = [];

// Google Places
let placesAutocomplete = null;
let googleMapsLoaded = false;

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
  setupInputFormatting();
  await loadSavedVehicles();
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
      }
    });

    console.log('[express-mode] Supabase initialized. User ID:', currentUserId || 'Anonymous');

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

      wizardData.location = location;
      console.log('Location selected:', location);

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

/**
 * Setup location input (manual ZIP entry if Google Maps not available)
 */
function setupLocationInput() {
  const locationInput = document.getElementById('user-location');

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

    savedVehicles = data || [];
    console.log(`[vehicles] Loaded ${savedVehicles.length} saved vehicles`);
    console.log('[vehicles] First 3 vehicles:', savedVehicles.slice(0, 3).map(v => ({
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model
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
      vehicle.condition = parseInt(year) >= currentYear ? 'New' : 'Used';
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
    // 1. Get vehicle details by VIN
    const vinResponse = await fetch(`${API_BASE}/api/mc/by-vin/${vin}?zip=${userZip}&radius=100`);

    if (!vinResponse.ok) {
      throw new Error('VIN not found');
    }

    const vinData = await vinResponse.json();

    if (!vinData.ok || !vinData.payload) {
      throw new Error('Vehicle not found');
    }

    const vehicleDetails = vinData.payload;

    // 2. Search for similar vehicles
    const searchParams = new URLSearchParams({
      year: vehicleDetails.year,
      make: vehicleDetails.make,
      model: vehicleDetails.model,
      zip: userZip,
      radius: 100,
      rows: 50
    });

    const searchResponse = await fetch(`${API_BASE}/api/mc/search?${searchParams}`);
    const searchData = await searchResponse.json();

    const allSimilarVehicles = searchData.listings || [];

    // 3. Calculate Smart Offer for display in "Your Vehicle" card
    const smartOfferData = calculateQuickSmartOffer(allSimilarVehicles, vehicleDetails);

    // 4. Display the user's vehicle with Smart Offer
    displayYourVehicle(vehicleDetails, smartOfferData);

    // 5. Prioritize vehicles by trim match quality
    similarVehicles = prioritizeVehiclesByTrim(allSimilarVehicles, vehicleDetails);

    // 6. Display similar vehicles
    if (similarVehicles.length > 0) {
      displaySimilarVehicles(similarVehicles, vehicleDetails);
      similarSection.style.display = 'block';
    } else {
      // No similar vehicles found - auto-select this vehicle
      selectedVehicle = {
        ...vehicleDetails,
        condition: vehicleDetails.condition || (parseInt(vehicleDetails.year) >= new Date().getFullYear() ? 'New' : 'Used')
      };
      hideManualEntry();
    }

  } catch (error) {
    console.error('[search-vehicle] Error:', error);

    // If this was a saved vehicle that's no longer available, show the modal
    if (savedVehicle) {
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

    // Auto-populate Sale Price field
    if (selectedVehicle.asking_price) {
      const salePriceInput = document.getElementById('sale-price');
      if (salePriceInput) {
        salePriceInput.value = selectedVehicle.asking_price;
        wizardData.financing.salePrice = selectedVehicle.asking_price;
        console.log('[vehicle-select] Auto-populated Sale Price:', selectedVehicle.asking_price);
      }
    }

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
 * Show selected vehicle display
 * DEPRECATED: This function is no longer used. displayYourVehicle() handles all vehicle display.
 */
function showSelectedVehicle() {
  // This function has been disabled - displayYourVehicle() is now used for all vehicle display
  console.log('[showSelectedVehicle] Function deprecated - use displayYourVehicle() instead');
  return;

  /* COMMENTED OUT - REDUNDANT CODE
  const display = document.getElementById('selected-vehicle-display');
  const content = document.getElementById('selected-vehicle-content');

  // Create beautiful vehicle summary card with photo
  content.innerHTML = `
    <div class="selected-vehicle-card">
      <div class="selected-vehicle-card__image-container">
        ${selectedVehicle.photo_url ?
          `<img src="${selectedVehicle.photo_url}" alt="${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}" class="selected-vehicle-card__image" onerror="this.style.display='none'; this.parentElement.classList.add('no-image')">` :
          '<div class="selected-vehicle-card__image-placeholder"></div>'}
      </div>
      <div class="selected-vehicle-card__details">
        <div class="selected-vehicle-card__header">
          <div class="selected-vehicle-card__title">
            ${selectedVehicle.year} ${capitalizeWords(selectedVehicle.make || '')} ${capitalizeWords(selectedVehicle.model || '')}
          </div>
          ${selectedVehicle.asking_price ?
            `<div class="selected-vehicle-card__price">${formatCurrency(selectedVehicle.asking_price)}</div>` : ''}
        </div>
        <div class="selected-vehicle-card__info">
          ${selectedVehicle.trim ?
            `<div class="selected-vehicle-card__info-item">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
              </svg>
              ${capitalizeWords(selectedVehicle.trim)}
            </div>` : ''}
          ${selectedVehicle.mileage ?
            `<div class="selected-vehicle-card__info-item">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
              </svg>
              ${formatMileage(selectedVehicle.mileage)} miles
            </div>` : ''}
          <div class="selected-vehicle-card__info-item vin-display">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            ${formatVIN(selectedVehicle.vin)}
          </div>
        </div>
        <div class="selected-vehicle-card__badge">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          Your Selection
        </div>
      </div>
      <button class="selected-vehicle-card__change" onclick="clearSelectedVehicle()" title="Change vehicle">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
      </button>
    </div>
  `;

  display.style.display = 'block';
  document.getElementById('similar-vehicles-section').style.display = 'none';
  document.getElementById('vin-input').value = '';
  */
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

    const response = await fetch(`${API_BASE}/api/search?${searchParams}`);
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
 * Setup input formatting for currency and mileage fields
 */
function setupInputFormatting() {
  // Currency fields
  const currencyFields = [
    'sale-price',
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
    populateReviewSummary();
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
      wizardData.financing = {
        vehiclePrice: document.getElementById('vehicle-price').value,
        downPayment: document.getElementById('down-payment').value,
        loanTerm: document.getElementById('loan-term').value,
        creditScore: document.getElementById('credit-score').value
      };
      break;

    case 3: // Trade-in
      const hasTradeIn = document.querySelector('input[name="has-tradein"]:checked')?.value === 'yes';
      if (hasTradeIn) {
        wizardData.tradein = {
          hasTradeIn: true,
          year: document.getElementById('tradein-year').value,
          make: document.getElementById('tradein-make').value,
          model: document.getElementById('tradein-model').value,
          mileage: document.getElementById('tradein-mileage').value,
          value: document.getElementById('tradein-value').value,
          payoff: document.getElementById('tradein-payoff').value
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
 * Populate review summary
 */
function populateReviewSummary() {
  const summaryContainer = document.getElementById('review-summary');
  if (!summaryContainer) return;

  const price = parseFloat(wizardData.financing.vehiclePrice) || 0;
  const downPayment = parseFloat(wizardData.financing.downPayment) || 0;
  const term = parseInt(wizardData.financing.loanTerm) || 60;
  const tradeInValue = wizardData.tradein.hasTradeIn
    ? (parseFloat(wizardData.tradein.value) || 0) - (parseFloat(wizardData.tradein.payoff) || 0)
    : 0;

  const loanAmount = price - downPayment - tradeInValue;

  let estimatedAPR = 6.5;
  switch (wizardData.financing.creditScore) {
    case 'excellent': estimatedAPR = 4.5; break;
    case 'good': estimatedAPR = 6.5; break;
    case 'fair': estimatedAPR = 9.5; break;
    case 'poor': estimatedAPR = 14.5; break;
  }

  const monthlyRate = estimatedAPR / 100 / 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);

  const vehicleInfo = wizardData.vehicle.vin
    ? `VIN: ${wizardData.vehicle.vin}`
    : `${wizardData.vehicle.year} ${wizardData.vehicle.make} ${wizardData.vehicle.model}`;

  summaryContainer.innerHTML = `
    <div style="background: rgba(255, 255, 255, 0.6); border-radius: var(--radius-md); padding: var(--spacing-md); margin-bottom: var(--spacing-md);">
      <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: var(--spacing-sm); color: #1e293b;">
        Your Estimated Payment
      </h3>
      <div style="font-size: 2.5rem; font-weight: 700; color: var(--primary-start); margin-bottom: var(--spacing-xs);">
        $${monthlyPayment.toFixed(2)}<span style="font-size: 1rem; color: #64748b;">/mo</span>
      </div>
      <div style="font-size: 0.875rem; color: #64748b;">
        ${term} months at ${estimatedAPR.toFixed(2)}% APR
      </div>
    </div>

    <div style="background: rgba(255, 255, 255, 0.4); border-radius: var(--radius-md); padding: var(--spacing-md);">
      <div style="display: grid; gap: var(--spacing-sm); font-size: 0.875rem;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748b;">Vehicle:</span>
          <span style="font-weight: 600; color: #1e293b;">${vehicleInfo}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748b;">Purchase Price:</span>
          <span style="font-weight: 600; color: #1e293b;">$${price.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748b;">Down Payment:</span>
          <span style="font-weight: 600; color: #1e293b;">$${downPayment.toLocaleString()}</span>
        </div>
        ${wizardData.tradein.hasTradeIn ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b;">Trade-In Equity:</span>
            <span style="font-weight: 600; color: ${tradeInValue >= 0 ? '#10b981' : '#ef4444'};">
              ${tradeInValue >= 0 ? '+' : ''}$${tradeInValue.toLocaleString()}
            </span>
          </div>
        ` : ''}
        <div style="border-top: 1px solid rgba(203, 213, 225, 0.5); padding-top: var(--spacing-sm); margin-top: var(--spacing-sm); display: flex; justify-content: space-between;">
          <span style="color: #1e293b; font-weight: 600;">Amount to Finance:</span>
          <span style="font-weight: 700; color: var(--primary-start);">$${loanAmount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;
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
