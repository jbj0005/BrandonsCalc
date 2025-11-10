// ============================================
// APP.JS INTEGRATION GUIDE
// Complete integration code for existing app.js
// ============================================

// Add these imports at the very top of your app.js file:
import { AuthManager } from './src/features/auth/auth-manager';
import { sliderManager } from './src/features/calculator/slider-manager';
import { SMSSender } from './src/features/offers/sms-sender';
import { useAuthStore, useCalculatorStore, useGarageStore, useOfferStore } from './src/core/state';
import { 
  supabase, 
  createCustomerOffer, 
  getGarageVehicles,
  getRateSheets 
} from './src/lib/supabase';

// ============================================
// INITIALIZATION CODE
// Add this inside your DOMContentLoaded event listener
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  
  // ============================================
  // 1. Initialize Authentication
  // ============================================
  await AuthManager.initialize();
  
  // Listen for profile loaded event
  window.addEventListener('profile-loaded', (e) => {
    const { profile } = e.detail;
    
    // Auto-populate wizardData with user profile
    if (window.wizardData) {
      wizardData.customer.name = profile.full_name || '';
      wizardData.customer.email = profile.email || '';
      wizardData.customer.phone = profile.phone || '';
      
      if (profile.preferred_down_payment) {
        wizardData.financing.cashDown = profile.preferred_down_payment;
        // Update the input field
        const cashDownInput = document.getElementById('quickSliderCashDown');
        if (cashDownInput) {
          cashDownInput.value = profile.preferred_down_payment;
        }
      }
      
      if (profile.preferred_trade_value) {
        wizardData.tradein.tradeValue = profile.preferred_trade_value;
      }
      
      if (profile.preferred_trade_payoff) {
        wizardData.tradein.tradePayoff = profile.preferred_trade_payoff;
      }
      
      // Load user's garage vehicles
      loadUserGarageVehicles();
    }
  });
  
  // ============================================
  // 2. Initialize Sliders After Vehicle Selection
  // ============================================
  window.initializeSliders = function() {
    const salePrice = wizardData.financing.salePrice || 0;
    const cashDown = wizardData.financing.cashDown || 0;
    const tradeValue = wizardData.tradein.tradeValue || 0;
    const tradePayoff = wizardData.tradein.tradePayoff || 0;
    
    sliderManager.initialize([
      { id: 'quickSliderSalePrice', originalValue: salePrice },
      { id: 'quickSliderCashDown', originalValue: cashDown },
      { id: 'quickSliderTradeAllowance', originalValue: tradeValue },
      { id: 'quickSliderTradePayoff', originalValue: tradePayoff }
    ]);
    
    // Update calculator store with initial values
    const calcStore = useCalculatorStore.getState();
    calcStore.updateState({
      salePrice,
      cashDown,
      tradeValue,
      tradePayoff,
      originalSalePrice: salePrice,
      originalCashDown: cashDown,
      originalTradeValue: tradeValue,
      originalTradePayoff: tradePayoff,
      apr: wizardData.financing.apr || 5.99,
      term: wizardData.financing.term || 72
    });
  };
  
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
  
  // ============================================
  // 3. Load User's Garage Vehicles
  // ============================================
  async function loadUserGarageVehicles() {
    const authStore = useAuthStore.getState();
    if (!authStore.user) return;
    
    const vehicles = await getGarageVehicles(authStore.user.id);
    useGarageStore.getState().setVehicles(vehicles);
    
    
    // Add vehicles to trade-in dropdown if it exists
    const tradeSelect = document.getElementById('trade-vehicle-select');
    if (tradeSelect && vehicles.length > 0) {
      // Clear existing options
      tradeSelect.innerHTML = '<option value="">Select from garage...</option>';
      
      vehicles.forEach(vehicle => {
        const option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}`.trim();
        option.dataset.value = vehicle.estimated_value || '0';
        option.dataset.payoff = vehicle.payoff_amount || '0';
        tradeSelect.appendChild(option);
      });
      
      // Add change listener
      tradeSelect.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        const vehicle = vehicles.find(v => v.id === selectedId);
        if (vehicle) {
          wizardData.tradein.tradeValue = vehicle.estimated_value || 0;
          wizardData.tradein.tradePayoff = vehicle.payoff_amount || 0;
          wizardData.tradein.vehicle = vehicle;
          
          // Update sliders
          sliderManager.updateSliderValue('quickSliderTradeAllowance', vehicle.estimated_value || 0);
          sliderManager.updateSliderValue('quickSliderTradePayoff', vehicle.payoff_amount || 0);
          
          refreshReview();
        }
      });
    }
  }
  
  // ============================================
  // 4. Load Rate Sheets
  // ============================================
  async function loadRateSheets(creditScore) {
    const rates = await getRateSheets(creditScore);
    
    // Update APR dropdown if it exists
    const aprSelect = document.getElementById('apr-select');
    if (aprSelect && rates.length > 0) {
      aprSelect.innerHTML = '';
      
      // Group by lender
      const lenderGroups = {};
      rates.forEach(rate => {
        if (!lenderGroups[rate.lender_name]) {
          lenderGroups[rate.lender_name] = [];
        }
        lenderGroups[rate.lender_name].push(rate);
      });
      
      // Create optgroups
      Object.entries(lenderGroups).forEach(([lender, lenderRates]) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = lender;
        
        lenderRates.forEach(rate => {
          const option = document.createElement('option');
          option.value = rate.apr;
          option.textContent = `${rate.term_months} months @ ${rate.apr}% APR`;
          optgroup.appendChild(option);
        });
        
        aprSelect.appendChild(optgroup);
      });
      
      // Select best rate
      if (rates.length > 0) {
        aprSelect.value = rates[0].apr;
        wizardData.financing.apr = rates[0].apr;
        wizardData.financing.term = rates[0].term_months;
        refreshReview();
      }
    }
  }
  
  // ============================================
  // 5. Enhanced SMS Handler
  // ============================================
  window.handleSmsOffer = async function() {
    const dealerPhone = document.getElementById('dealerPhone')?.value;
    const dealerName = document.getElementById('dealerName')?.value;
    const message = document.getElementById('dealerMessage')?.value;
    
    if (!dealerPhone || !dealerName) {
      showToast('Please enter dealer name and phone number', 'error');
      return;
    }
    
    // Validate phone number
    if (!SMSSender.validatePhoneNumber(dealerPhone)) {
      showToast('Please enter a valid phone number', 'error');
      return;
    }
    
    const btn = document.getElementById('btnSmsOffer');
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';
    
    try {
      // Create offer in database first
      const authStore = useAuthStore.getState();
      const calcStore = useCalculatorStore.getState();
      
      const offer = await createCustomerOffer({
        user_id: authStore.user?.id,
        
        // Vehicle info
        vehicle_year: wizardData.vehicle.year || 2024,
        vehicle_make: wizardData.vehicle.make || 'Unknown',
        vehicle_model: wizardData.vehicle.model || 'Model',
        vehicle_trim: wizardData.vehicle.trim,
        vehicle_price: wizardData.financing.salePrice || 0,
        
        // Financing
        down_payment: wizardData.financing.cashDown || 0,
        trade_value: wizardData.tradein.tradeValue || 0,
        trade_payoff: wizardData.tradein.tradePayoff || 0,
        apr: wizardData.financing.apr || 5.99,
        term_months: wizardData.financing.term || 72,
        monthly_payment: calcStore.monthlyPayment,
        
        // Fees & Taxes
        dealer_fees: calcStore.dealerFees,
        customer_addons: calcStore.customerAddons,
        state_tax_rate: calcStore.stateTaxRate,
        county_tax_rate: calcStore.countyTaxRate,
        total_tax: calcStore.totalTax,
        
        // Totals
        amount_financed: calcStore.totalFinanced,
        finance_charge: calcStore.financeCharge,
        total_of_payments: calcStore.totalOfPayments,
        
        // Customer info
        customer_name: wizardData.customer.name,
        customer_email: wizardData.customer.email,
        customer_phone: wizardData.customer.phone,
        customer_location: wizardData.customer.location,
        
        // Dealer info
        dealer_name: dealerName,
        dealer_phone: dealerPhone,
        dealer_address: wizardData.dealer.address,
        
        status: 'draft'
      });
      
      // Store in offer store
      useOfferStore.getState().selectOffer(offer);
      
      // Build offer URL
      const offerUrl = `${window.location.origin}/offer/${offer.share_token}`;
      
      // Send SMS
      const result = await SMSSender.sendOffer({
        dealerPhone,
        dealerName,
        customerName: wizardData.customer.name || 'Customer',
        vehicle: `${wizardData.vehicle.year || ''} ${wizardData.vehicle.make || ''} ${wizardData.vehicle.model || ''}`.trim(),
        monthlyPayment: calcStore.monthlyPayment,
        downPayment: wizardData.financing.cashDown || 0,
        term: wizardData.financing.term || 72,
        apr: wizardData.financing.apr || 5.99,
        totalPrice: wizardData.financing.salePrice,
        message,
        offerUrl
      });
      
      if (result.success) {
        showToast('SMS sent successfully! 📱', 'success');
        
        // Close modal if it exists
        const modal = document.getElementById('submitOfferModal');
        if (modal) {
          modal.style.display = 'none';
        }
        
        // Show offer link
        showOfferLink(offerUrl);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('SMS Error:', error);
      showToast(`Failed to send SMS: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  };
  
  // ============================================
  // 6. Save Offer Handler
  // ============================================
  window.saveOffer = async function() {
    const authStore = useAuthStore.getState();
    
    if (!authStore.user) {
      showToast('Please sign in to save offers', 'warning');
      AuthManager.getInstance().showAuthModal('signin');
      return;
    }
    
    const calcStore = useCalculatorStore.getState();
    
    try {
      const offer = await createCustomerOffer({
        user_id: authStore.user.id,
        
        // Vehicle info
        vehicle_year: wizardData.vehicle.year || 2024,
        vehicle_make: wizardData.vehicle.make || 'Unknown',
        vehicle_model: wizardData.vehicle.model || 'Model',
        vehicle_trim: wizardData.vehicle.trim,
        vehicle_price: wizardData.financing.salePrice || 0,
        
        // Financing details (same as SMS handler)
        down_payment: wizardData.financing.cashDown || 0,
        trade_value: wizardData.tradein.tradeValue || 0,
        trade_payoff: wizardData.tradein.tradePayoff || 0,
        apr: wizardData.financing.apr || 5.99,
        term_months: wizardData.financing.term || 72,
        monthly_payment: calcStore.monthlyPayment,
        
        // Fees & Taxes
        dealer_fees: calcStore.dealerFees,
        customer_addons: calcStore.customerAddons,
        state_tax_rate: calcStore.stateTaxRate,
        county_tax_rate: calcStore.countyTaxRate,
        total_tax: calcStore.totalTax,
        
        // Totals
        amount_financed: calcStore.totalFinanced,
        finance_charge: calcStore.financeCharge,
        total_of_payments: calcStore.totalOfPayments,
        
        // Customer info
        customer_name: wizardData.customer.name,
        customer_email: wizardData.customer.email,
        customer_phone: wizardData.customer.phone,
        
        status: 'draft'
      });
      
      // Add to offer store
      useOfferStore.getState().addOffer(offer);
      
      showToast('Offer saved successfully! 💾', 'success');
      
      // Show share link
      const shareUrl = `${window.location.origin}/offer/${offer.share_token}`;
      showOfferLink(shareUrl);
      
    } catch (error) {
      console.error('Save error:', error);
      showToast('Failed to save offer', 'error');
    }
  };
  
  // ============================================
  // 7. Helper Functions
  // ============================================
  
  // Show offer share link
  function showOfferLink(url) {
    const linkContainer = document.createElement('div');
    linkContainer.className = 'offer-link-container';
    linkContainer.innerHTML = `
      <div class="offer-link-content">
        <h4>Offer Link Created</h4>
        <p>Share this link with the dealer:</p>
        <div class="link-box">
          <input type="text" value="${url}" readonly id="offer-link-input">
          <button onclick="copyOfferLink()">Copy</button>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="close-btn">Close</button>
      </div>
    `;
    
    document.body.appendChild(linkContainer);
  }
  
  // Copy offer link to clipboard
  window.copyOfferLink = function() {
    const input = document.getElementById('offer-link-input');
    input.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard! 📋', 'success');
  };
  
  // Enhanced toast function with Zustand integration
  window.showToast = function(message, type = 'info', options = {}) {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        ${getToastIcon(type)}
        <span>${message}</span>
      </div>
    `;
    
    // Add to container
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    // Remove after duration
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, options.duration || 3000);
  };
  
  function getToastIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return `<span class="toast-icon">${icons[type] || icons.info}</span>`;
  }
  
  // ============================================
  // 8. Subscribe to Store Changes
  // ============================================
  
  // Subscribe to auth changes
  useAuthStore.subscribe((state, prevState) => {
    if (state.isAuthenticated !== prevState.isAuthenticated) {
      
      if (state.isAuthenticated) {
        // User signed in
        loadUserGarageVehicles();
        
        // Load user's saved offers
        if (state.user) {
          loadUserOffers(state.user.id);
        }
      } else {
        // User signed out
        // Clear user-specific data
        useGarageStore.getState().reset();
        useOfferStore.getState().reset();
      }
    }
  });
  
  // Subscribe to calculator changes
  useCalculatorStore.subscribe((state) => {
  });
  
  // ============================================
  // 9. Load User Offers
  // ============================================
  async function loadUserOffers(userId) {
    const { getCustomerOffers } = await import('./src/lib/supabase');
    const offers = await getCustomerOffers(userId);
    useOfferStore.getState().setOffers(offers);
  }
  
  // ============================================
  // Continue with your existing initialization code...
  // ============================================
  
  // Your existing code here...
  
});

// ============================================
// CSS STYLES TO ADD TO YOUR EXISTING CSS
// ============================================
const additionalStyles = `
/* Toast Container */
#toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 800;
  pointer-events: none;
}

.toast {
  background: white;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  min-width: 300px;
  transform: translateX(400px);
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: auto;
}

.toast.show {
  transform: translateX(0);
  opacity: 1;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toast-icon {
  font-size: 20px;
}

.toast-success {
  border-left: 4px solid #10b981;
}

.toast-error {
  border-left: 4px solid #ef4444;
}

.toast-warning {
  border-left: 4px solid #f59e0b;
}

.toast-info {
  border-left: 4px solid #3b82f6;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Auto-filled fields */
.auto-filled {
  animation: autofill-pulse 1s ease;
}

@keyframes autofill-pulse {
  0% {
    background-color: rgba(59, 130, 246, 0);
  }
  50% {
    background-color: rgba(59, 130, 246, 0.1);
  }
  100% {
    background-color: rgba(59, 130, 246, 0);
  }
}

/* Offer Link Container */
.offer-link-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  z-index: 600;
  min-width: 400px;
}

.offer-link-content h4 {
  margin: 0 0 12px 0;
  color: #333;
}

.link-box {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}

.link-box input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-family: monospace;
  font-size: 12px;
}

.link-box button {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.link-box button:hover {
  background: #2563eb;
}

.close-btn {
  width: 100%;
  padding: 10px;
  background: #f3f4f6;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 12px;
}

.close-btn:hover {
  background: #e5e7eb;
}
`;

// Add styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// ============================================
// Export for debugging in console
// ============================================
window.ExcelCalc = {
  auth: useAuthStore,
  calculator: useCalculatorStore,
  garage: useGarageStore,
  offers: useOfferStore,
  supabase,
  sliderManager,
  SMSSender,
  AuthManager
};

