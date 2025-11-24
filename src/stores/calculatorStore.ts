import { create } from 'zustand';
import type { FeeItems, FeeItem, FeeCategory } from '../types/fees';
import type { ScenarioResult } from '../../packages/fee-engine/src';

// ============================================================================
// Types
// ============================================================================

export type SliderKey =
  | 'salePrice'
  | 'cashDown'
  | 'tradeAllowance'
  | 'dealerFees'
  | 'customerAddons'
  | 'govtFees';

export interface SliderState {
  value: number;           // Current value (can be adjusted by user)
  baseline: number;        // State 1: Asking price (set on vehicle selection)
  lockedBaseline: number | null;  // State 2: User's negotiated price (for diff calculations)
  isLocked: boolean;       // Whether State 2 is active
}

export interface GarageVehicle {
  id: string;
  estimated_value?: number;
  asking_price?: number;
  payoff_amount?: number;
  year?: number;
  make?: string;
  model?: string;
}

export interface CalculatorState {
  // Slider values + baselines
  sliders: Record<SliderKey, SliderState>;

  // Trade-in selection
  selectedTradeInVehicles: Set<string>;
  tradePayoff: number;

  // Fee itemization
  feeItems: FeeItems;
  stateTaxRate: number | null;
  countyTaxRate: number | null;
  userTaxOverride: boolean;

  // Fee engine scenario result
  feeEngineResult: ScenarioResult | null;

  // Settling timer for baseline updates
  settlingTimerId: NodeJS.Timeout | null;
  lastSliderInteraction: number;

  // Auto-lock timer for sale price State 2
  autoLockTimerId: NodeJS.Timeout | null;
}

export interface CalculatorActions {
  // Slider actions
  setSliderValue: (key: SliderKey, value: number, updateBaseline?: boolean) => void;
  setSliderValueWithSettling: (key: SliderKey, value: number) => void;
  setSliderValueWithAutoLock: (key: SliderKey, value: number) => void;
  setSliderBaseline: (key: SliderKey, baseline: number) => void;
  lockSliderBaseline: (key: SliderKey) => void;
  unlockSliderBaseline: (key: SliderKey) => void;
  toggleSliderLock: (key: SliderKey) => void;
  getEffectiveBaseline: (key: SliderKey) => number;
  resetSlider: (key: SliderKey) => void;
  resetAllSliders: () => void;
  setTradePayoff: (value: number) => void;

  // Fee actions
  setFeeItems: (category: FeeCategory, items: FeeItem[]) => void;
  addFeeItem: (category: FeeCategory, item: FeeItem) => void;
  removeFeeItem: (category: FeeCategory, index: number) => void;
  updateFeeItem: (category: FeeCategory, index: number, item: FeeItem) => void;
  setTaxRates: (stateTaxRate: number, countyTaxRate: number, userOverride?: boolean) => void;
  syncFeeSliders: () => void;
  setFeeEngineResult: (result: ScenarioResult | null) => void;
  applyFeeEngineResult: (result: ScenarioResult) => void;

  // Coordinated vehicle actions
  applyVehicle: (vehicle: {
    price?: number;
    payoff_amount?: number;
  }) => void;

  applyGarageVehicle: (vehicle: GarageVehicle, enableSalePriceSync?: boolean) => void;

  applyProfilePreferences: (profile: {
    preferred_down_payment?: number | null;
  }) => void;

  // Trade-in actions
  toggleTradeInVehicle: (vehicleId: string, garageVehicles: GarageVehicle[]) => void;
  resetTradeIn: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const DEFAULT_SLIDER_STATE: SliderState = {
  value: 0,
  baseline: 0,
  lockedBaseline: null,
  isLocked: false,
};

const INITIAL_STATE: CalculatorState = {
  sliders: {
    salePrice: { ...DEFAULT_SLIDER_STATE },
    cashDown: { ...DEFAULT_SLIDER_STATE },
    tradeAllowance: { ...DEFAULT_SLIDER_STATE },
    dealerFees: { ...DEFAULT_SLIDER_STATE },
    customerAddons: { ...DEFAULT_SLIDER_STATE },
    govtFees: { ...DEFAULT_SLIDER_STATE },
  },
  selectedTradeInVehicles: new Set<string>(),
  tradePayoff: 0,
  feeItems: {
    dealer: [],
    customer: [],
    gov: [],
  },
  stateTaxRate: null,
  countyTaxRate: null,
  userTaxOverride: false,
  feeEngineResult: null,
  settlingTimerId: null,
  lastSliderInteraction: 0,
  autoLockTimerId: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate trade-in totals from selected garage vehicles
 */
function calculateTradeInTotals(
  selectedVehicleIds: Set<string>,
  garageVehicles: GarageVehicle[]
): { allowance: number; payoff: number } {
  let allowance = 0;
  let payoff = 0;

  selectedVehicleIds.forEach((vehicleId) => {
    const vehicle = garageVehicles.find((v) => v.id === vehicleId);
    if (vehicle) {
      allowance += vehicle.estimated_value || vehicle.asking_price || 0;
      payoff += vehicle.payoff_amount || 0;
    }
  });

  return { allowance, payoff };
}

/**
 * Parse numeric value safely
 */
function parseNumeric(value: any): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(parsed) ? 0 : parsed;
}

// ============================================================================
// Store
// ============================================================================

export const useCalculatorStore = create<CalculatorState & CalculatorActions>((set, get) => ({
  ...INITIAL_STATE,

  // ========================================
  // Slider Actions
  // ========================================

  setSliderValue: (key, value, updateBaseline = false) => {
    set((state) => {
      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        value,
        ...(updateBaseline && { baseline: value }),
      };
      return { sliders: newSliders };
    });
  },

  setSliderValueWithSettling: (key, value) => {
    set((state) => {
      // Clear any pending settling timer (we no longer auto-baseline)
      if (state.settlingTimerId) {
        clearTimeout(state.settlingTimerId);
      }

      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        value,
      };

      return {
        sliders: newSliders,
        settlingTimerId: null,
        lastSliderInteraction: Date.now(),
      };
    });
  },

  setSliderBaseline: (key, baseline) => {
    set((state) => {
      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        baseline,
      };
      return { sliders: newSliders };
    });
  },

  setSliderValueWithAutoLock: (key, value) => {
    set((state) => {
      // Clear existing auto-lock timer (auto-lock removed)
      if (state.autoLockTimerId) {
        clearTimeout(state.autoLockTimerId);
      }

      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        value,
      };

      return {
        sliders: newSliders,
        autoLockTimerId: null,
      };
    });
  },

  lockSliderBaseline: (key) => {
    set((state) => {
      // Clear any pending auto-lock timer
      if (state.autoLockTimerId) {
        clearTimeout(state.autoLockTimerId);
      }

      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        lockedBaseline: newSliders[key].value,
        isLocked: true,
      };

      return {
        sliders: newSliders,
        autoLockTimerId: null,
      };
    });
  },

  unlockSliderBaseline: (key) => {
    set((state) => {
      // Clear any pending auto-lock timer
      if (state.autoLockTimerId) {
        clearTimeout(state.autoLockTimerId);
      }

      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        lockedBaseline: null,
        isLocked: false,
      };

      return {
        sliders: newSliders,
        autoLockTimerId: null,
      };
    });
  },

  toggleSliderLock: (key) => {
    const state = get();
    if (state.sliders[key].isLocked) {
      get().unlockSliderBaseline(key);
    } else {
      get().lockSliderBaseline(key);
    }
  },

  getEffectiveBaseline: (key) => {
    const state = get();
    const slider = state.sliders[key];
    // Return State 2 (lockedBaseline) if locked, otherwise State 1 (baseline)
    return slider.isLocked && slider.lockedBaseline !== null
      ? slider.lockedBaseline
      : slider.baseline;
  },

  resetSlider: (key) => {
    set((state) => {
      // Clear timers
      if (state.autoLockTimerId) clearTimeout(state.autoLockTimerId);
      if (state.settlingTimerId) clearTimeout(state.settlingTimerId);

      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        value: newSliders[key].baseline,
        lockedBaseline: null,
        isLocked: false,
      };

      return {
        sliders: newSliders,
        autoLockTimerId: null,
      };
    });
  },

  resetAllSliders: () => {
    set((state) => {
      if (state.autoLockTimerId) clearTimeout(state.autoLockTimerId);
      if (state.settlingTimerId) clearTimeout(state.settlingTimerId);

      const newSliders = { ...state.sliders };
      (Object.keys(newSliders) as SliderKey[]).forEach((key) => {
        newSliders[key] = {
          ...newSliders[key],
          value: newSliders[key].baseline,
          lockedBaseline: null,
          isLocked: false,
        };
      });

      return {
        sliders: newSliders,
        autoLockTimerId: null,
        settlingTimerId: null,
      };
    });
  },

  setTradePayoff: (value) => {
    set({ tradePayoff: value });
  },

  // ========================================
  // Fee Actions
  // ========================================

  setFeeItems: (category, items) => {
    set((state) => {
      const newFeeItems = { ...state.feeItems };
      newFeeItems[category] = items;
      return { feeItems: newFeeItems };
    });
  },

  addFeeItem: (category, item) => {
    set((state) => {
      const newFeeItems = { ...state.feeItems };
      newFeeItems[category] = [...newFeeItems[category], item];
      return { feeItems: newFeeItems };
    });
  },

  removeFeeItem: (category, index) => {
    set((state) => {
      const newFeeItems = { ...state.feeItems };
      newFeeItems[category] = newFeeItems[category].filter((_, i) => i !== index);
      return { feeItems: newFeeItems };
    });
  },

  updateFeeItem: (category, index, item) => {
    set((state) => {
      const newFeeItems = { ...state.feeItems };
      newFeeItems[category] = newFeeItems[category].map((existing, i) =>
        i === index ? item : existing
      );
      return { feeItems: newFeeItems };
    });
  },

  setTaxRates: (stateTaxRate, countyTaxRate, userOverride = false) => {
    set({
      stateTaxRate,
      countyTaxRate,
      userTaxOverride: userOverride,
    });
  },

  syncFeeSliders: () => {
    set((state) => {
      const newSliders = { ...state.sliders };

      // Calculate totals from fee items
      const dealerTotal = state.feeItems.dealer.reduce((sum, item) => sum + item.amount, 0);
      const customerTotal = state.feeItems.customer.reduce((sum, item) => sum + item.amount, 0);
      const govTotal = state.feeItems.gov.reduce((sum, item) => sum + item.amount, 0);

      // Update slider values
      newSliders.dealerFees = {
        value: dealerTotal,
        baseline: dealerTotal,
        lockedBaseline: null,
        isLocked: false,
      };

      newSliders.customerAddons = {
        value: customerTotal,
        baseline: customerTotal,
        lockedBaseline: null,
        isLocked: false,
      };

      newSliders.govtFees = {
        value: govTotal,
        baseline: govTotal,
        lockedBaseline: null,
        isLocked: false,
      };

      return { sliders: newSliders };
    });
  },

  setFeeEngineResult: (result) => {
    set({ feeEngineResult: result });
  },

  applyFeeEngineResult: (result) => {
    set((state) => {
      const newFeeItems = { ...state.feeItems };
      const newSliders = { ...state.sliders };

      const isInitialRegistration = (item: any) => {
        const code = (item?.code || '').toString().toLowerCase();
        const desc = (item?.description || '').toString().toLowerCase();
        return (
          code.includes('initial_registration') ||
          code === 'initial' ||
          desc.includes('initial registration')
        );
      };

      const filteredLineItems = result.lineItems.filter(
        (item) => item.category !== 'dealer' && !isInitialRegistration(item)
      );

      const govFees = filteredLineItems
        .filter((item) => item.category === 'government')
        .map((item) => ({
          description: item.description,
          amount: item.amount,
        }));

      const govTotal = govFees.reduce((sum, item) => sum + item.amount, 0);
      const salesTaxTotal = result.totals?.salesTax ?? 0;
      const sanitizedTotals = {
        ...result.totals,
        governmentFees: govTotal,
        dealerFees: 0,
        totalFees: govTotal + salesTaxTotal,
      };

      const sanitizedResult = {
        ...result,
        lineItems: filteredLineItems,
        totals: sanitizedTotals,
      };

      // Update fee items (government only; leave dealer as user-entered)
      newFeeItems.gov = govFees;

      // Update tax rates from result
      const stateTaxRate = result.taxBreakdown.stateTaxRate;
      const countyTaxRate = result.taxBreakdown.countyTaxRate;

      // Update government fees slider
      newSliders.govtFees = {
        value: govTotal,
        baseline: govTotal,
        lockedBaseline: null,
        isLocked: false,
      };

      return {
        feeItems: newFeeItems,
        sliders: newSliders,
        stateTaxRate,
        countyTaxRate,
        userTaxOverride: false, // Reset override flag since we just auto-calculated
        feeEngineResult: sanitizedResult,
      };
    });
  },

  // ========================================
  // Coordinated Vehicle Actions
  // ========================================

  applyVehicle: (vehicle) => {
    set((state) => {
      const newSliders = { ...state.sliders };
      const updates: Partial<CalculatorState> = {};

      // Set sale price if provided (reset State 2)
      if (vehicle.price !== undefined) {
        const price = parseNumeric(vehicle.price);
        newSliders.salePrice = {
          value: price,
          baseline: price,
          lockedBaseline: null,
          isLocked: false,
        };
      }

      // Set trade payoff if provided
      if (vehicle.payoff_amount !== undefined && vehicle.payoff_amount > 0) {
        updates.tradePayoff = parseNumeric(vehicle.payoff_amount);
      }

      return {
        sliders: newSliders,
        ...(updates.tradePayoff !== undefined ? { tradePayoff: updates.tradePayoff } : {}),
      };
    });
  },

  applyGarageVehicle: (vehicle, enableSalePriceSync = false) => {
    set((state) => {
      const newSliders = { ...state.sliders };
      const newSelectedVehicles = new Set(state.selectedTradeInVehicles);

      // Add vehicle to selection
      newSelectedVehicles.add(vehicle.id);

      // Set sale price if feature enabled (reset State 2)
      if (enableSalePriceSync) {
        const price = parseNumeric(vehicle.estimated_value || vehicle.asking_price || 0);
        if (price > 0) {
          newSliders.salePrice = {
            value: price,
            baseline: price,
            lockedBaseline: null,
            isLocked: false,
          };
        }
      }

      // Calculate trade-in totals from all selected vehicles
      const { allowance, payoff } = calculateTradeInTotals(
        newSelectedVehicles,
        [vehicle] // In practice, parent will call toggleTradeInVehicle with full list
      );

      newSliders.tradeAllowance = {
        value: allowance,
        baseline: allowance,
        lockedBaseline: null,
        isLocked: false,
      };

      return {
        sliders: newSliders,
        selectedTradeInVehicles: newSelectedVehicles,
        tradePayoff: payoff,
        autoLockTimerId: null,
      };
    });
  },

  applyProfilePreferences: (profile) => {
    if (profile.preferred_down_payment !== undefined) {
      set((state) => {
        const newSliders = { ...state.sliders };
        const downPayment = parseNumeric(profile.preferred_down_payment);

        newSliders.cashDown = {
          value: downPayment,
          baseline: downPayment,
          lockedBaseline: null,
          isLocked: false,
        };

        return { sliders: newSliders };
      });
    }
  },

  // ========================================
  // Trade-In Actions
  // ========================================

  toggleTradeInVehicle: (vehicleId, garageVehicles) => {
    set((state) => {
      const newSelectedVehicles = new Set(state.selectedTradeInVehicles);

      // Toggle selection
      if (newSelectedVehicles.has(vehicleId)) {
        newSelectedVehicles.delete(vehicleId);
      } else {
        newSelectedVehicles.add(vehicleId);
      }

      // Calculate new totals
      const { allowance, payoff } = calculateTradeInTotals(newSelectedVehicles, garageVehicles);

      const newSliders = { ...state.sliders };

      // Update trade allowance
      newSliders.tradeAllowance = {
        value: allowance,
        baseline: allowance,
        lockedBaseline: null,
        isLocked: false,
      };

      return {
        selectedTradeInVehicles: newSelectedVehicles,
        sliders: newSliders,
        tradePayoff: payoff,
      };
    });
  },

  resetTradeIn: () => {
    set((state) => {
      const newSliders = { ...state.sliders };

      // Reset trade allowance to baseline
      newSliders.tradeAllowance = {
        ...newSliders.tradeAllowance,
        value: newSliders.tradeAllowance.baseline,
      };

      return {
        selectedTradeInVehicles: new Set<string>(),
        sliders: newSliders,
        tradePayoff: 0,
      };
    });
  },

}));

// Export types for external use
export type CalculatorStore = CalculatorState & CalculatorActions;
