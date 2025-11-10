/**
 * legacyHelpers.ts - Global window exports for backward compatibility
 *
 * Exposes React hooks and utilities to the global window scope so
 * legacy code and external modules can call them.
 */

/**
 * Select saved vehicle helper
 * Called when user selects a vehicle from saved vehicles dropdown
 */
export const setupSavedVehicleHandlers = (
  onVehicleSelect: (vehicle: any) => void
) => {
  if (typeof window === 'undefined') return;

  // Expose selectSavedVehicle to window
  window.selectSavedVehicle = (vehicle: any) => {
    console.log('[selectSavedVehicle] Vehicle selected:', vehicle);
    onVehicleSelect(vehicle);
  };

  // Expose selectQuickSavedVehicle alias
  window.selectQuickSavedVehicle = window.selectSavedVehicle;
};

/**
 * Setup global error toast for trade-in sync issues
 */
export const showTradeInSyncError = (message?: string) => {
  const defaultMessage =
    "We couldn't load the selected trade-in details. Please open My Garage to verify your trade-in information.";

  // Check if toast API is available
  if (typeof window !== 'undefined' && window.showToast) {
    window.showToast(message || defaultMessage, 'error');
  } else {
    console.error('[Trade-In Sync Error]', message || defaultMessage);
  }
};

/**
 * Setup profile dropdown toggle
 */
export const setupProfileDropdownToggle = (
  onToggle: (isOpen: boolean) => void
) => {
  if (typeof window === 'undefined') return;

  let isOpen = false;

  window.toggleProfileDropdown = () => {
    isOpen = !isOpen;
    console.log('[toggleProfileDropdown]', isOpen);
    onToggle(isOpen);
  };
};

/**
 * Buyer-perspective slider polarity configuration
 * Maps slider direction to buyer benefit (green = good, red = bad)
 */
export const SLIDER_POLARITY_MAP = {
  salePrice: {
    positiveDirection: 'left', // Lower price is better for buyer
    label: 'Sale Price',
  },
  cashDown: {
    positiveDirection: 'right', // Higher down payment is better for buyer
    label: 'Cash Down',
  },
  dealerFees: {
    positiveDirection: 'left', // Lower fees is better for buyer
    label: 'Dealer Fees',
  },
  tradeAllowance: {
    positiveDirection: 'right', // Higher trade value is better for buyer
    label: 'Trade Allowance',
  },
  tradePayoff: {
    positiveDirection: 'left', // Lower payoff is better for buyer
    label: 'Trade Payoff',
  },
  addons: {
    positiveDirection: 'left', // Lower addons cost is better for buyer
    label: 'Customer Add-ons',
  },
};

/**
 * Compute buyer-positive direction for diff indicators
 */
export const computeBuyerPositive = (
  sliderKey: keyof typeof SLIDER_POLARITY_MAP,
  currentValue: number,
  baselineValue: number
): 'positive' | 'negative' | 'neutral' => {
  const config = SLIDER_POLARITY_MAP[sliderKey];
  if (!config) return 'neutral';

  const diff = currentValue - baselineValue;
  if (Math.abs(diff) < 1) return 'neutral';

  // Positive direction = buyer benefit
  const isMovingPositive =
    (config.positiveDirection === 'right' && diff > 0) ||
    (config.positiveDirection === 'left' && diff < 0);

  return isMovingPositive ? 'positive' : 'negative';
};

/**
 * Format diff indicator with sign and color class
 */
export const formatDiffIndicator = (
  diff: number,
  sliderKey: keyof typeof SLIDER_POLARITY_MAP,
  formatValue: (value: number) => string
): {
  text: string;
  className: string;
} | null => {
  if (Math.abs(diff) < 1) return null;

  const direction = computeBuyerPositive(sliderKey, diff, 0);
  const sign = diff > 0 ? '+' : '-';
  const text = `${sign}${formatValue(Math.abs(diff))}`;

  return {
    text,
    className: `quick-diff-indicator ${direction}`,
  };
};

// Add type definitions to window (Note: showToast already defined in types/index.ts)
declare global {
  interface Window {
    selectSavedVehicle?: (vehicle: any) => void;
    selectQuickSavedVehicle?: (vehicle: any) => void;
    toggleProfileDropdown?: () => void;
  }
}
