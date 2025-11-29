import { useState, useEffect, useCallback, useRef } from 'react';
import { feeEngineService } from '../services/feeEngineService';
import type { ScenarioResult } from '../../packages/fee-engine/src';
import type { CalculatorState as EngineCalculatorState } from '../../packages/fee-engine/src/adapters/calculator-adapter';

export interface UseFeeEngineParams {
  // Sale details (from calculator sliders)
  salePrice: number;
  cashDown: number;
  loanTerm: number;
  apr: number;

  // Trade-ins (from garage vehicles)
  selectedTradeInVehicles?: Array<{
    id: string;
    vin?: string;
    estimated_value?: number;
    payoff_amount?: number;
    lien_holder_name?: string;
  }>;

  // User profile (location info)
  userProfile?: {
    state_code?: string;
    state?: string;
    county?: string;
    county_name?: string;
    city?: string;
    zip_code?: string;
  };

  // Vehicle being purchased
  selectedVehicle?: {
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    condition?: 'new' | 'used';
    odometer?: number;
    bodyType?: string;
    weightLbs?: number;
  };

  // Lender info
  preferredLender?: string;

  // Dealer ID
  dealerId?: string;

  // Scenario overrides (manual toggles)
  scenarioOverrides?: {
    cashPurchase?: boolean;
    includeTradeIn?: boolean;
    tagMode?: 'new_plate' | 'transfer_existing_plate' | 'temp_tag';
    firstTimeRegistration?: boolean;
    enabled?: boolean;
  };

  // Whether to auto-calculate (can be disabled)
  enabled?: boolean;
}

export interface UseFeeEngineResult {
  scenarioResult: ScenarioResult | null;
  isCalculating: boolean;
  error: Error | null;
  recalculate: () => Promise<void>;
}

/**
 * Fee Engine Integration Hook
 *
 * Automatically calculates government fees and taxes based on
 * calculator state, user profile, and vehicle selection.
 *
 * @param params - Calculator state and user/vehicle context
 * @returns Scenario result with auto-calculated fees
 */
export function useFeeEngine(params: UseFeeEngineParams): UseFeeEngineResult {
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track last calculation params to avoid unnecessary recalculations
  const lastParamsRef = useRef<string>('');

  const calculate = useCallback(async () => {
    const disabled =
      params.enabled === false ||
      params.scenarioOverrides?.enabled === false ||
      !params.userProfile?.state_code;

    // Skip if disabled or missing critical data
    if (disabled) {
      setScenarioResult(null);
      setError(null);
      lastParamsRef.current = '';
      return;
    }

    const isCash = params.scenarioOverrides?.cashPurchase === true;
    const includeTrade = params.scenarioOverrides?.includeTradeIn !== false;

    // Create calculation params
    const calcParams = {
      salePrice: params.salePrice,
      cashDown: params.cashDown,
      loanTerm: isCash ? 0 : params.loanTerm,
      apr: isCash ? 0 : params.apr,
      selectedTradeInVehicles: includeTrade
        ? params.selectedTradeInVehicles || []
        : [],
      userProfile: params.userProfile,
      selectedVehicle: params.selectedVehicle,
      preferredLender: params.preferredLender,
      scenarioOverrides: params.scenarioOverrides,
    };

    // Check if params changed (avoid redundant calculations)
    const paramsHash = JSON.stringify(calcParams);
    if (paramsHash === lastParamsRef.current) {
      return;
    }
    lastParamsRef.current = paramsHash;

    try {
      setIsCalculating(true);
      setError(null);

      console.log('[useFeeEngine] Calculating fees...', {
        salePrice: params.salePrice,
        hasTradeIn: (params.selectedTradeInVehicles?.length || 0) > 0,
        isFinanced: params.loanTerm > 0,
        state: params.userProfile?.state_code,
        county: params.userProfile?.county_name,
      });

      // Call fee engine service
      const result = await feeEngineService.calculateFees(
        calcParams as EngineCalculatorState,
        params.dealerId || 'default'
      );

      setScenarioResult(result);

      console.log('[useFeeEngine] Calculation complete:', {
        scenario: result.detectedScenario.description,
        govFees: result.totals.governmentFees,
        salesTax: result.totals.salesTax,
      });
    } catch (err) {
      console.error('[useFeeEngine] Calculation failed:', err);
      setError(err as Error);
    } finally {
      setIsCalculating(false);
    }
  }, [
    params.salePrice,
    params.cashDown,
    params.loanTerm,
    params.apr,
    params.selectedTradeInVehicles,
    params.userProfile,
    params.selectedVehicle,
    params.preferredLender,
    params.dealerId,
    params.enabled,
    params.scenarioOverrides,
  ]);

  // Auto-calculate when params change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      calculate();
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [calculate]);

  return {
    scenarioResult,
    isCalculating,
    error,
    recalculate: calculate,
  };
}
