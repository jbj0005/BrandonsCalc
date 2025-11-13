import { create } from 'zustand';
import type { FeeItems, FeeItem, FeeCategory } from '../types/fees';

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
  value: number;
  baseline: number;
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

  // Settling timer for baseline updates
  settlingTimerId: NodeJS.Timeout | null;
  lastSliderInteraction: number;
}

export interface CalculatorActions {
  // Slider actions
  setSliderValue: (key: SliderKey, value: number, updateBaseline?: boolean) => void;
  setSliderValueWithSettling: (key: SliderKey, value: number) => void;
  setSliderBaseline: (key: SliderKey, baseline: number) => void;
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
  settlingTimerId: null,
  lastSliderInteraction: 0,
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
    const SETTLING_DELAY = 3000; // 3 seconds

    set((state) => {
      // Clear existing timer
      if (state.settlingTimerId) {
        clearTimeout(state.settlingTimerId);
      }

      // Update slider value immediately
      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        value,
      };

      // Start new settling timer
      const timerId = setTimeout(() => {
        // After 3s, update ALL 5 baselines to their current values (State 1)
        set((currentState) => {
          const updatedSliders = { ...currentState.sliders };
          (Object.keys(updatedSliders) as SliderKey[]).forEach((sliderKey) => {
            updatedSliders[sliderKey] = {
              ...updatedSliders[sliderKey],
              baseline: updatedSliders[sliderKey].value,
            };
          });

          return {
            sliders: updatedSliders,
            settlingTimerId: null,
          };
        });
      }, SETTLING_DELAY);

      return {
        sliders: newSliders,
        settlingTimerId: timerId,
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

  resetSlider: (key) => {
    set((state) => {
      const newSliders = { ...state.sliders };
      newSliders[key] = {
        ...newSliders[key],
        value: newSliders[key].baseline,
      };
      return { sliders: newSliders };
    });
  },

  resetAllSliders: () => {
    set((state) => {
      const newSliders = { ...state.sliders };
      (Object.keys(newSliders) as SliderKey[]).forEach((key) => {
        newSliders[key] = {
          ...newSliders[key],
          value: newSliders[key].baseline,
        };
      });
      return { sliders: newSliders };
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
      };

      newSliders.customerAddons = {
        value: customerTotal,
        baseline: customerTotal,
      };

      newSliders.govtFees = {
        value: govTotal,
        baseline: govTotal,
      };

      return { sliders: newSliders };
    });
  },

  // ========================================
  // Coordinated Vehicle Actions
  // ========================================

  applyVehicle: (vehicle) => {
    set((state) => {
      const newSliders = { ...state.sliders };
      const updates: Partial<CalculatorState> = {};

      // Set sale price if provided
      if (vehicle.price !== undefined) {
        const price = parseNumeric(vehicle.price);
        newSliders.salePrice = {
          value: price,
          baseline: price,
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

      // Set sale price if feature enabled
      if (enableSalePriceSync) {
        const price = parseNumeric(vehicle.estimated_value || vehicle.asking_price || 0);
        if (price > 0) {
          newSliders.salePrice = {
            value: price,
            baseline: price,
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
      };

      return {
        sliders: newSliders,
        selectedTradeInVehicles: newSelectedVehicles,
        tradePayoff: payoff,
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
