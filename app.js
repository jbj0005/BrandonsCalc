/**
 * EXPRESS MODE WIZARD - ENHANCED WITH VIN LOOKUP & SAVED VEHICLES
 * Modern glassmorphic wizard for auto loan calculations
 */

let currentStep = 1;
const totalSteps = 4;

// Wizard data
const wizardData = {
  vehicle: {},
  financing: {},
  tradein: {},
  customer: {}
};

// Saved vehicles cache
let savedVehicles = [];
let selectedVehicle = null;
let similarVehicles = [];

// API Configuration
const API_BASE = window.location.origin;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  populateYearDropdowns();
  setupVINInput();
  setupFormValidation();
  loadSavedVehicles();
});

/**
 * Load saved vehicles from Supabase
 */
async function loadSavedVehicles() {
  try {
    // TODO: Replace with actual Supabase call
    // For now, using mock data
    savedVehicles = [
      {
        id: 1,
        vin: '1HGCM82633A123456',
        year: 2023,
        make: 'Honda',
        model: 'Accord',
        trim: 'EX-L',
        mileage: 15000
      },
      {
        id: 2,
        vin: '5YJ3E1EA7KF234567',
        year: 2022,
        make: 'Tesla',
        model: 'Model 3',
        trim: 'Long Range',
        mileage: 8000
      }
    ];
  } catch (error) {
    console.error('Error loading saved vehicles:', error);
  }
}

/**
 * Setup VIN input with autocomplete and search
 */
function setupVINInput() {
  const vinInput = document.getElementById('vin-input');
  const dropdown = document.getElementById('saved-vehicles-dropdown');

  // Show dropdown on focus
  vinInput.addEventListener('focus', () => {
    if (savedVehicles.length > 0) {
      showSavedVehiclesDropdown();
    }
  });

  // Filter dropdown as user types
  vinInput.addEventListener('input', (e) => {
    const value = e.target.value.toUpperCase().trim();

    // If looks like VIN (17 chars, valid format)
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
      vinInput.style.borderColor = 'var(--success)';
    } else {
      vinInput.style.borderColor = '';
    }

    // Filter saved vehicles
    if (value.length > 0) {
      filterSavedVehicles(value);
    } else {
      showSavedVehiclesDropdown();
    }
  });

  // Search on Enter key
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

  // Hide dropdown when clicking outside
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

  if (savedVehicles.length === 0) {
    dropdown.innerHTML = '<div class="saved-vehicle-item" style="text-align: center; color: #94a3b8;">No saved vehicles</div>';
    dropdown.style.display = 'block';
    return;
  }

  savedVehicles.forEach(vehicle => {
    const item = document.createElement('div');
    item.className = 'saved-vehicle-item';
    item.innerHTML = `
      <div class="saved-vehicle-item__title">${vehicle.year} ${vehicle.make} ${vehicle.model}</div>
      <div class="saved-vehicle-item__details">${vehicle.trim || ''} • ${vehicle.mileage?.toLocaleString() || 'N/A'} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${vehicle.vin}</div>
    `;
    item.addEventListener('click', () => selectSavedVehicle(vehicle));
    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
}

/**
 * Filter saved vehicles by search term
 */
function filterSavedVehicles(searchTerm) {
  const dropdown = document.getElementById('saved-vehicles-dropdown');
  const filtered = savedVehicles.filter(v =>
    v.vin.includes(searchTerm) ||
    v.make.toUpperCase().includes(searchTerm) ||
    v.model.toUpperCase().includes(searchTerm) ||
    String(v.year).includes(searchTerm)
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
      <div class="saved-vehicle-item__title">${vehicle.year} ${vehicle.make} ${vehicle.model}</div>
      <div class="saved-vehicle-item__details">${vehicle.trim || ''} • ${vehicle.mileage?.toLocaleString() || 'N/A'} miles</div>
      <div class="saved-vehicle-item__vin">VIN: ${vehicle.vin}</div>
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
  document.getElementById('vin-input').value = vehicle.vin;
  document.getElementById('saved-vehicles-dropdown').style.display = 'none';
  searchVehicleByVIN(vehicle.vin);
}

/**
 * Search for vehicle by VIN and show similar vehicles
 */
async function searchVehicleByVIN(vin) {
  const vinInput = document.getElementById('vin-input');
  const loading = document.getElementById('vin-loading');
  const similarSection = document.getElementById('similar-vehicles-section');
  const similarGrid = document.getElementById('similar-vehicles-grid');

  // Validate VIN format
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    alert('Please enter a valid 17-character VIN');
    return;
  }

  // Show loading
  loading.style.display = 'block';
  vinInput.disabled = true;
  similarSection.style.display = 'none';

  try {
    // 1. Get vehicle details by VIN
    const vinResponse = await fetch(`${API_BASE}/api/mc/by-vin/${vin}?zip=32801&radius=100`);

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
      zip: '32801', // TODO: Use user's zip
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
      // No similar vehicles, just select the VIN-looked-up vehicle
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

  // Remove previous selection
  document.querySelectorAll('.vehicle-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Mark as selected
  document.querySelector(`.vehicle-card[data-index="${index}"]`).classList.add('selected');

  // Update selected vehicle
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
      // Check if we have a selected vehicle OR manual entry
      if (!selectedVehicle) {
        const year = document.getElementById('year-input').value;
        const make = document.getElementById('make-input').value;
        const model = document.getElementById('model-input').value;

        if (!year || !make || !model) {
          isValid = false;
          errorMessage = 'Please select a vehicle or enter year, make, and model manually';
        }
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
