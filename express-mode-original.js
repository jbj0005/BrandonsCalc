/**
 * EXPRESS MODE WIZARD
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  populateYearDropdowns();
  setupVINValidation();
  setupFormValidation();
});

/**
 * Populate year dropdowns
 */
function populateYearDropdowns() {
  const currentYear = new Date().getFullYear();
  const yearSelects = ['year-input', 'tradein-year'];

  yearSelects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Add years from current year down to 1990
    for (let year = currentYear + 1; year >= 1990; year--) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      select.appendChild(option);
    }
  });
}

/**
 * Setup VIN validation
 */
function setupVINValidation() {
  const vinInput = document.getElementById('vin-input');
  if (!vinInput) return;

  vinInput.addEventListener('input', (e) => {
    // Convert to uppercase and remove invalid characters
    let value = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    e.target.value = value;

    // If VIN is complete, disable manual entry
    if (value.length === 17) {
      disableManualEntry(true);
      // TODO: Fetch vehicle details from VIN
      console.log('VIN complete:', value);
    } else {
      disableManualEntry(false);
    }
  });
}

/**
 * Disable/enable manual vehicle entry
 */
function disableManualEntry(disable) {
  const manualFields = ['year-input', 'make-input', 'model-input'];
  manualFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.disabled = disable;
      field.style.opacity = disable ? '0.5' : '1';
    }
  });
}

/**
 * Setup form validation
 */
function setupFormValidation() {
  // Add real-time validation as needed
  // For now, we'll validate on next button click
}

/**
 * Navigate to next step
 */
function wizardNext() {
  // Validate current step
  if (!validateStep(currentStep)) {
    return;
  }

  // Save current step data
  saveStepData(currentStep);

  // Move to next step
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
  // Update progress steps
  document.querySelectorAll('.progress-step').forEach((step, index) => {
    const stepNumber = index + 1;
    step.classList.remove('active', 'completed');

    if (stepNumber < currentStep) {
      step.classList.add('completed');
    } else if (stepNumber === currentStep) {
      step.classList.add('active');
    }
  });

  // Update progress bar fill
  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
  document.querySelector('.progress-bar__line-fill').style.width = `${progressPercent}%`;

  // Update wizard steps
  document.querySelectorAll('.wizard-step').forEach(step => {
    step.classList.remove('active');
  });

  const activeStep = document.querySelector(`.wizard-step[data-step="${currentStep}"]`);
  if (activeStep) {
    activeStep.classList.add('active');
  }

  // If on review step, populate summary
  if (currentStep === 4) {
    populateReviewSummary();
  }

  // Scroll to top of card
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
      const vin = document.getElementById('vin-input').value;
      const year = document.getElementById('year-input').value;
      const make = document.getElementById('make-input').value;
      const model = document.getElementById('model-input').value;

      if (!vin && (!year || !make || !model)) {
        isValid = false;
        errorMessage = 'Please enter a VIN or provide year, make, and model';
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
      // Trade-in is optional, so always valid
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
      wizardData.vehicle = {
        vin: document.getElementById('vin-input').value,
        year: document.getElementById('year-input').value,
        make: document.getElementById('make-input').value,
        model: document.getElementById('model-input').value,
        mileage: document.getElementById('mileage-input').value
      };
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
      const hasTradeIn = document.querySelector('input[name="has-tradein"]:checked').value === 'yes';
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

  // Calculate estimated payment
  const price = parseFloat(wizardData.financing.vehiclePrice) || 0;
  const downPayment = parseFloat(wizardData.financing.downPayment) || 0;
  const term = parseInt(wizardData.financing.loanTerm) || 60;
  const tradeInValue = wizardData.tradein.hasTradeIn
    ? (parseFloat(wizardData.tradein.value) || 0) - (parseFloat(wizardData.tradein.payoff) || 0)
    : 0;

  const loanAmount = price - downPayment - tradeInValue;

  // Estimate APR based on credit score
  let estimatedAPR = 6.5;
  switch (wizardData.financing.creditScore) {
    case 'excellent': estimatedAPR = 4.5; break;
    case 'good': estimatedAPR = 6.5; break;
    case 'fair': estimatedAPR = 9.5; break;
    case 'poor': estimatedAPR = 14.5; break;
  }

  // Calculate monthly payment
  const monthlyRate = estimatedAPR / 100 / 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);

  // Build summary HTML
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
  // Validate final step
  if (!validateStep(4)) {
    return;
  }

  // Save final step data
  saveStepData(4);

  // Show loading state
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
    // TODO: Send lead to backend
    console.log('Submitting lead:', wizardData);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Success! Show success message
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

// Add spin animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
