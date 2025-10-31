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

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializeSupabase();
  await loadGoogleMaps();
  populateYearDropdowns();
  setupVINInput();
  setupLocationInput();
  setupFormValidation();
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

    placesAutocomplete.addListener('place_changed', () => {
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
  locationInput.addEventListener('input', (e) => {
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

    // Query vehicles table with specific columns
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
        created_at,
        inserted_at
      `)
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false });

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
      <div class="saved-vehicle-item__title">${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}</div>
      <div class="saved-vehicle-item__details">${vehicle.trim || ''} • ${vehicle.mileage?.toLocaleString() || 'N/A'} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${vehicle.vin || 'N/A'}</div>
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
    searchVehicleByVIN(vehicle.vin);
  }
}

/**
 * Search for vehicle by VIN and show similar vehicles
 */
async function searchVehicleByVIN(vin) {
  const vinInput = document.getElementById('vin-input');
  const loading = document.getElementById('vin-loading');
  const similarSection = document.getElementById('similar-vehicles-section');
  const similarGrid = document.getElementById('similar-vehicles-grid');

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    alert('Please enter a valid 17-character VIN');
    return;
  }

  // Check if user has entered location
  const userZip = wizardData.location?.zip;
  if (!userZip) {
    alert('Please enter your location first to find nearby vehicles');
    document.getElementById('user-location').focus();
    return;
  }

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
      rows: 12
    });

    const searchResponse = await fetch(`${API_BASE}/api/mc/search?${searchParams}`);
    const searchData = await searchResponse.json();

    similarVehicles = searchData.listings || [];

    // 3. Display similar vehicles
    if (similarVehicles.length > 0) {
      displaySimilarVehicles(similarVehicles, vehicleDetails);
      similarSection.style.display = 'block';
    } else {
      selectVehicleFromVIN(vehicleDetails);
    }

  } catch (error) {
    console.error('Error searching vehicle:', error);
    alert(`Could not find vehicle: ${error.message}`);
  } finally {
    loading.style.display = 'none';
    vinInput.disabled = false;
  }
}

/**
 * Display similar vehicles in grid
 */
function displaySimilarVehicles(vehicles, originalVehicle) {
  const grid = document.getElementById('similar-vehicles-grid');
  grid.innerHTML = '';

  vehicles.forEach((vehicle, index) => {
    const card = document.createElement('div');
    card.className = 'vehicle-card';
    card.dataset.index = index;

    const isOriginal = vehicle.vin === originalVehicle.vin;

    card.innerHTML = `
      ${isOriginal ? '<div class="vehicle-card__badge">Your VIN</div>' : ''}
      ${vehicle.photo_url ? `<img src="${vehicle.photo_url}" alt="${vehicle.heading}" class="vehicle-card__image" onerror="this.style.display='none'">` : '<div class="vehicle-card__image"></div>'}
      <div class="vehicle-card__title">${vehicle.year} ${vehicle.make} ${vehicle.model}</div>
      <div class="vehicle-card__details">
        ${vehicle.trim ? `<div class="vehicle-card__detail"><span>${vehicle.trim}</span></div>` : ''}
        ${vehicle.mileage ? `
          <div class="vehicle-card__detail">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
            </svg>
            ${vehicle.mileage.toLocaleString()} mi
          </div>
        ` : ''}
      </div>
      ${vehicle.asking_price ? `<div class="vehicle-card__price">$${vehicle.asking_price.toLocaleString()}</div>` : '<div class="vehicle-card__price">Price Not Available</div>'}
      ${vehicle.dealer_city && vehicle.dealer_state ? `<div class="vehicle-card__location">${vehicle.dealer_city}, ${vehicle.dealer_state}</div>` : ''}
      <div class="vehicle-card__vin">VIN: ${vehicle.vin}</div>
    `;

    card.addEventListener('click', () => selectVehicleCard(index));
    grid.appendChild(card);
  });
}

/**
 * Select a vehicle from the similar vehicles grid
 */
function selectVehicleCard(index) {
  const vehicle = similarVehicles[index];

  document.querySelectorAll('.vehicle-card').forEach(card => {
    card.classList.remove('selected');
  });

  document.querySelector(`.vehicle-card[data-index="${index}"]`).classList.add('selected');

  selectVehicleFromSearch(vehicle);
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
function selectVehicleFromSearch(vehicle) {
  selectedVehicle = {
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    mileage: vehicle.mileage
  };

  showSelectedVehicle();
  hideManualEntry();
}

/**
 * Show selected vehicle display
 */
function showSelectedVehicle() {
  const display = document.getElementById('selected-vehicle-display');
  const content = document.getElementById('selected-vehicle-content');

  content.innerHTML = `
    <div class="selected-vehicle-info">
      <strong>${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}</strong>
      ${selectedVehicle.trim ? ` ${selectedVehicle.trim}` : ''}<br>
      ${selectedVehicle.mileage ? `${selectedVehicle.mileage.toLocaleString()} miles<br>` : ''}
      <span style="font-family: var(--font-mono); font-size: 0.875rem; color: #64748b;">VIN: ${selectedVehicle.vin}</span>
    </div>
  `;

  display.style.display = 'block';
  document.getElementById('similar-vehicles-section').style.display = 'none';
  document.getElementById('vin-input').value = '';
}

/**
 * Clear selected vehicle
 */
function clearSelectedVehicle() {
  selectedVehicle = null;
  document.getElementById('selected-vehicle-display').style.display = 'none';
  document.getElementById('similar-vehicles-section').style.display = 'none';
  document.getElementById('manual-entry-fields').style.display = 'block';
  document.getElementById('vin-input').value = '';
  document.getElementById('vin-input').focus();
}

/**
 * Hide manual entry fields
 */
function hideManualEntry() {
  document.getElementById('manual-entry-fields').style.display = 'none';
}

/**
 * Populate year dropdowns
 */
function populateYearDropdowns() {
  const currentYear = new Date().getFullYear();
  const yearSelects = ['year-input', 'tradein-year'];

  yearSelects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;

    for (let year = currentYear + 1; year >= 1990; year--) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      select.appendChild(option);
    }
  });
}

/**
 * Setup form validation
 */
function setupFormValidation() {
  // Add real-time validation as needed
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

      // Check location
      if (!wizardData.location?.zip) {
        isValid = false;
        errorMessage = 'Please enter your location';
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
          mileage: document.getElementById('mileage-input').value
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
