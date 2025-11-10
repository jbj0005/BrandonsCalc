/**
 * useTradeInAutoPopulate - Auto-populate trade-in data from My Garage
 *
 * Manages selected trade-in vehicles from garage_vehicles table and calculates
 * total trade allowance and payoff amounts.
 */

import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

interface GarageVehicle {
  id: string;
  user_id: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  mileage?: number;
  condition?: string;
  estimated_value?: number;
  payoff_amount?: number;
  nickname?: string;
  created_at?: string;
}

interface TradeInData {
  hasTradeIn: boolean;
  tradeValue: number;
  tradePayoff: number;
  vehicles: GarageVehicle[];
}

interface UseTradeInAutoPopulateOptions {
  supabase: SupabaseClient | null;
  userId: string | null;
  isEnabled?: boolean;
  autoSelectLatest?: boolean;
  onTradeInUpdate?: (tradeData: TradeInData) => void;
}

interface UseTradeInAutoPopulateReturn {
  selectedTradeIns: string[];
  handleTradeInSelection: (vehicleId: string, isChecked: boolean) => void;
  updateTradeInCalculations: () => Promise<void>;
  clearTradeIns: () => void;
}

export const useTradeInAutoPopulate = ({
  supabase,
  userId,
  isEnabled = true,
  autoSelectLatest = true,
  onTradeInUpdate,
}: UseTradeInAutoPopulateOptions): UseTradeInAutoPopulateReturn => {
  const [selectedTradeIns, setSelectedTradeIns] = useState<string[]>([]);

  // Update trade-in calculations based on selected vehicles
  const updateTradeInCalculations = useCallback(async () => {
    if (!supabase || !userId) {
      console.warn('[useTradeInAutoPopulate] Cannot update: No Supabase client or user ID');
      return;
    }

    if (selectedTradeIns.length === 0) {
      // No trade-ins selected - reset to 0
      if (onTradeInUpdate) {
        onTradeInUpdate({
          hasTradeIn: false,
          tradeValue: 0,
          tradePayoff: 0,
          vehicles: [],
        });
      }
      return;
    }

    try {
      // Fetch selected vehicles from garage
      const { data: vehicles, error } = await supabase
        .from('garage_vehicles')
        .select('*')
        .in('id', selectedTradeIns);

      if (error) throw error;

      const garageVehicles = vehicles as GarageVehicle[];

      // Calculate totals
      let totalValue = 0;
      let totalPayoff = 0;

      garageVehicles.forEach((vehicle) => {
        totalValue += parseFloat(String(vehicle.estimated_value || 0));
        totalPayoff += parseFloat(String(vehicle.payoff_amount || 0));
      });

      console.log('[useTradeInAutoPopulate] Trade-in totals:', {
        value: totalValue,
        payoff: totalPayoff,
        count: garageVehicles.length,
      });

      // Notify parent component
      if (onTradeInUpdate) {
        onTradeInUpdate({
          hasTradeIn: true,
          tradeValue: totalValue,
          tradePayoff: totalPayoff,
          vehicles: garageVehicles,
        });
      }
    } catch (error) {
      console.error('[useTradeInAutoPopulate] Error updating trade-in calculations:', error);
    }
  }, [supabase, userId, selectedTradeIns, onTradeInUpdate]);

  // Handle checkbox selection
  const handleTradeInSelection = useCallback(
    (vehicleId: string, isChecked: boolean) => {
      setSelectedTradeIns((prev) => {
        if (isChecked) {
          // Add to selected
          if (!prev.includes(vehicleId)) {
            return [...prev, vehicleId];
          }
          return prev;
        } else {
          // Remove from selected
          return prev.filter((id) => id !== vehicleId);
        }
      });
    },
    []
  );

  // Clear all trade-ins
  const clearTradeIns = useCallback(() => {
    setSelectedTradeIns([]);
  }, []);

  // Auto-select latest garage vehicle on mount
  useEffect(() => {
    if (!isEnabled || !autoSelectLatest || !supabase || !userId) return;

    const autoSelectLatestVehicle = async () => {
      try {
        // Fetch most recent garage vehicle
        const { data: vehicles, error } = await supabase
          .from('garage_vehicles')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error || !vehicles || vehicles.length === 0) {
          console.log('[useTradeInAutoPopulate] No garage vehicles found');
          return;
        }

        const latestVehicle = vehicles[0] as GarageVehicle;

        console.log('[useTradeInAutoPopulate] Auto-selecting latest vehicle:', latestVehicle.id);

        // Set as selected trade-in
        setSelectedTradeIns([latestVehicle.id]);
      } catch (error) {
        console.error('[useTradeInAutoPopulate] Error auto-selecting latest vehicle:', error);
      }
    };

    autoSelectLatestVehicle();
  }, [supabase, userId, isEnabled, autoSelectLatest]);

  // Update calculations when selected trade-ins change
  useEffect(() => {
    updateTradeInCalculations();
  }, [updateTradeInCalculations]);

  // Expose to window for global access (for legacy compatibility)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.handleTradeInSelection = handleTradeInSelection;
      window.updateTradeInCalculations = updateTradeInCalculations;
      window.selectedTradeIns = selectedTradeIns;
    }
  }, [handleTradeInSelection, updateTradeInCalculations, selectedTradeIns]);

  return {
    selectedTradeIns,
    handleTradeInSelection,
    updateTradeInCalculations,
    clearTradeIns,
  };
};

// Add type definitions to window
declare global {
  interface Window {
    handleTradeInSelection?: (vehicleId: string, isChecked: boolean) => void;
    updateTradeInCalculations?: () => Promise<void>;
    selectedTradeIns?: string[];
    cashDownBaseline?: number;
  }
}
