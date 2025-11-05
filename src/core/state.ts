// src/core/state/index.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  User, 
  UserProfile, 
  CalculatorState, 
  GarageVehicle,
  CustomerOffer 
} from '@/types';

// ========================================
// Auth Store
// ========================================
interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: true,
      
      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setIsLoading: (isLoading) => set({ isLoading }),
      
      reset: () => set({
        user: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false
      })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

// ========================================
// Calculator Store
// ========================================
interface CalculatorStoreState extends CalculatorState {
  // Original values for sliders
  originalSalePrice: number;
  originalCashDown: number;
  originalTradeValue: number;
  originalTradePayoff: number;
  
  // Actions
  setSalePrice: (price: number) => void;
  setCashDown: (amount: number) => void;
  setTradeValue: (value: number) => void;
  setTradePayoff: (payoff: number) => void;
  setAPR: (apr: number) => void;
  setTerm: (term: number) => void;
  setDealerFees: (fees: number) => void;
  setCustomerAddons: (addons: number) => void;
  setStateTaxRate: (rate: number) => void;
  setCountyTaxRate: (rate: number) => void;
  
  // Calculated setters
  updateCalculatedValues: () => void;
  resetToOriginal: () => void;
  
  // Bulk update
  updateState: (updates: Partial<CalculatorState>) => void;
}

export const useCalculatorStore = create<CalculatorStoreState>()(
  persist(
    (set, get) => ({
      // Current values
      salePrice: 0,
      cashDown: 0,
      tradeValue: 0,
      tradePayoff: 0,
      apr: 0,
      term: 72,
      
      // Original values
      originalSalePrice: 0,
      originalCashDown: 0,
      originalTradeValue: 0,
      originalTradePayoff: 0,
      
      // Fees
      dealerFees: 0,
      customerAddons: 0,
      stateTaxRate: 0,
      countyTaxRate: 0,
      
      // Calculated
      monthlyPayment: 0,
      totalFinanced: 0,
      financeCharge: 0,
      totalOfPayments: 0,
      totalTax: 0,
      
      // Actions
      setSalePrice: (price) => {
        set({ salePrice: price });
        get().updateCalculatedValues();
      },
      
      setCashDown: (amount) => {
        set({ cashDown: amount });
        get().updateCalculatedValues();
      },
      
      setTradeValue: (value) => {
        set({ tradeValue: value });
        get().updateCalculatedValues();
      },
      
      setTradePayoff: (payoff) => {
        set({ tradePayoff: payoff });
        get().updateCalculatedValues();
      },
      
      setAPR: (apr) => {
        set({ apr });
        get().updateCalculatedValues();
      },
      
      setTerm: (term) => {
        set({ term });
        get().updateCalculatedValues();
      },
      
      setDealerFees: (fees) => {
        set({ dealerFees: fees });
        get().updateCalculatedValues();
      },
      
      setCustomerAddons: (addons) => {
        set({ customerAddons: addons });
        get().updateCalculatedValues();
      },
      
      setStateTaxRate: (rate) => {
        set({ stateTaxRate: rate });
        get().updateCalculatedValues();
      },
      
      setCountyTaxRate: (rate) => {
        set({ countyTaxRate: rate });
        get().updateCalculatedValues();
      },
      
      updateCalculatedValues: () => {
        const state = get();
        
        // Calculate total tax
        const taxableAmount = state.salePrice - state.tradeValue;
        const totalTaxRate = state.stateTaxRate + state.countyTaxRate;
        const totalTax = taxableAmount * (totalTaxRate / 100);
        
        // Calculate amount financed
        const netTrade = state.tradeValue - state.tradePayoff;
        const totalFinanced = state.salePrice + 
                            state.dealerFees + 
                            state.customerAddons + 
                            totalTax - 
                            state.cashDown - 
                            netTrade;
        
        // Calculate monthly payment
        const monthlyRate = state.apr / 100 / 12;
        let monthlyPayment = 0;
        let financeCharge = 0;
        let totalOfPayments = 0;
        
        if (monthlyRate > 0) {
          const numPayments = state.term;
          monthlyPayment = totalFinanced * 
            (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
            (Math.pow(1 + monthlyRate, numPayments) - 1);
          
          totalOfPayments = monthlyPayment * numPayments;
          financeCharge = totalOfPayments - totalFinanced;
        } else {
          monthlyPayment = totalFinanced / state.term;
          totalOfPayments = totalFinanced;
          financeCharge = 0;
        }
        
        set({
          totalTax,
          totalFinanced,
          monthlyPayment,
          financeCharge,
          totalOfPayments
        });
      },
      
      resetToOriginal: () => {
        const state = get();
        set({
          salePrice: state.originalSalePrice,
          cashDown: state.originalCashDown,
          tradeValue: state.originalTradeValue,
          tradePayoff: state.originalTradePayoff
        });
        get().updateCalculatedValues();
      },
      
      updateState: (updates) => {
        set(updates);
        get().updateCalculatedValues();
      }
    }),
    {
      name: 'calculator-storage',
      partialize: (state) => ({
        apr: state.apr,
        term: state.term,
        dealerFees: state.dealerFees,
        stateTaxRate: state.stateTaxRate,
        countyTaxRate: state.countyTaxRate
      })
    }
  )
);

// ========================================
// Garage Store
// ========================================
interface GarageState {
  vehicles: GarageVehicle[];
  selectedVehicle: GarageVehicle | null;
  isLoading: boolean;
  
  // Actions
  setVehicles: (vehicles: GarageVehicle[]) => void;
  addVehicle: (vehicle: GarageVehicle) => void;
  updateVehicle: (id: string, updates: Partial<GarageVehicle>) => void;
  removeVehicle: (id: string) => void;
  selectVehicle: (vehicle: GarageVehicle | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
}

export const useGarageStore = create<GarageState>((set) => ({
  vehicles: [],
  selectedVehicle: null,
  isLoading: false,
  
  setVehicles: (vehicles) => set({ vehicles }),
  
  addVehicle: (vehicle) => set((state) => ({
    vehicles: [...state.vehicles, vehicle]
  })),
  
  updateVehicle: (id, updates) => set((state) => ({
    vehicles: state.vehicles.map((v) =>
      v.id === id ? { ...v, ...updates } : v
    )
  })),
  
  removeVehicle: (id) => set((state) => ({
    vehicles: state.vehicles.filter((v) => v.id !== id)
  })),
  
  selectVehicle: (vehicle) => set({ selectedVehicle: vehicle }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ vehicles: [], selectedVehicle: null, isLoading: false })
}));

// ========================================
// Offer Store
// ========================================
interface OfferState {
  offers: CustomerOffer[];
  currentOffer: CustomerOffer | null;
  isLoading: boolean;
  
  // Actions
  setOffers: (offers: CustomerOffer[]) => void;
  addOffer: (offer: CustomerOffer) => void;
  updateOffer: (id: string, updates: Partial<CustomerOffer>) => void;
  removeOffer: (id: string) => void;
  selectOffer: (offer: CustomerOffer | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
}

export const useOfferStore = create<OfferState>((set) => ({
  offers: [],
  currentOffer: null,
  isLoading: false,
  
  setOffers: (offers) => set({ offers }),
  
  addOffer: (offer) => set((state) => ({
    offers: [...state.offers, offer]
  })),
  
  updateOffer: (id, updates) => set((state) => ({
    offers: state.offers.map((o) =>
      o.id === id ? { ...o, ...updates } : o
    )
  })),
  
  removeOffer: (id) => set((state) => ({
    offers: state.offers.filter((o) => o.id !== id)
  })),
  
  selectOffer: (offer) => set({ currentOffer: offer }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ offers: [], currentOffer: null, isLoading: false })
}));

// ========================================
// Export all stores for convenience
// ========================================
export const stores = {
  auth: useAuthStore,
  calculator: useCalculatorStore,
  garage: useGarageStore,
  offer: useOfferStore
};

// ========================================
// Store Utilities
// ========================================
export const resetAllStores = () => {
  useAuthStore.getState().reset();
  useGarageStore.getState().reset();
  useOfferStore.getState().reset();
  // Calculator store preserves some settings
  useCalculatorStore.getState().resetToOriginal();
};

// Subscribe to auth changes and reset other stores
let previousAuthState = useAuthStore.getState().isAuthenticated;
useAuthStore.subscribe((state) => {
  if (previousAuthState && !state.isAuthenticated) {
    // Clear user-specific data when logging out
    useGarageStore.getState().reset();
    useOfferStore.getState().reset();
  }
  previousAuthState = state.isAuthenticated;
});

// Export type helpers
export type AuthStore = ReturnType<typeof useAuthStore.getState>;
export type CalculatorStore = ReturnType<typeof useCalculatorStore.getState>;
export type GarageStore = ReturnType<typeof useGarageStore.getState>;
export type OfferStore = ReturnType<typeof useOfferStore.getState>;
