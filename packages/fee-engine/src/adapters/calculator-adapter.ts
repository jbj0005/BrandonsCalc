import { v4 as uuidv4 } from 'uuid';
import type { ScenarioInput } from '../types/scenario-input';

/**
 * Calculator State (simplified interface - adjust to match your actual store)
 */
export interface CalculatorState {
  // Sale details
  salePrice: number;
  cashDown: number;
  loanTerm: number;
  apr: number;
  scenarioOverrides?: {
    cashPurchase?: boolean;
    includeTradeIn?: boolean;
    tagMode?: 'new_plate' | 'transfer_existing_plate' | 'temp_tag';
    firstTimeRegistration?: boolean;
    enabled?: boolean;
  };

  // Trade-ins
  selectedTradeInVehicles: Array<{
    vin?: string;
    estimated_value?: number;
    payoff_amount?: number;
    lien_holder_name?: string;
  }>;

  // User/location info (from profile)
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
  };

  // Dealer/lender
  preferredLender?: string;
}

/**
 * Calculator to ScenarioInput Adapter
 *
 * Maps calculator store state to the DMS engine's ScenarioInput format
 */
export class CalculatorAdapter {
  /**
   * Convert calculator state to ScenarioInput
   *
   * @param calculatorState - Current calculator state
   * @param dealerId - Optional dealer ID (defaults to 'default')
   * @returns Complete ScenarioInput ready for fee calculation
   */
  mapToScenarioInput(
    calculatorState: CalculatorState,
    dealerId: string = 'default'
  ): ScenarioInput {
    const hasTradeIn =
      calculatorState.scenarioOverrides?.includeTradeIn !== false &&
      calculatorState.selectedTradeInVehicles.length > 0;
    const isCash = calculatorState.scenarioOverrides?.cashPurchase === true;
    const isFinanced = !isCash && calculatorState.loanTerm > 0;

    const profile = calculatorState.userProfile || {};
    const tagMode =
      calculatorState.scenarioOverrides?.tagMode ||
      (hasTradeIn ? 'transfer_existing_plate' : 'new_plate');
    const firstTimeRegistration =
      calculatorState.scenarioOverrides?.firstTimeRegistration ??
      (!hasTradeIn && tagMode === 'new_plate');

    return {
      scenarioId: uuidv4(),
      timestampUtc: new Date().toISOString(),

      // Jurisdiction (from user profile)
      jurisdiction: {
        countryCode: 'US',
        stateCode: profile.state_code || 'FL',
        countyName: profile.county_name || profile.county || '',
        cityName: profile.city || '',
        postalCode: profile.zip_code || '',
      },

      // Dealer context
      dealerContext: {
        dealerId: dealerId,
        configVersion: 'v1',
        feePackageId: 'retail_default', // Can be made dynamic
      },

      // Deal economics
      deal: {
        dealType: isCash ? 'cash' : isFinanced ? 'retail' : 'cash',
        sellingPrice: calculatorState.salePrice,
        cashDown: calculatorState.cashDown,
        termMonths: isCash ? 0 : calculatorState.loanTerm,
        apr: isCash ? 0 : calculatorState.apr,
        lenderName: calculatorState.preferredLender || '',
        lenderType: this.determineLenderType(calculatorState.preferredLender),
      },

      // Vehicle being purchased
      vehicle: {
        vin: calculatorState.selectedVehicle?.vin || '',
        year: calculatorState.selectedVehicle?.year || new Date().getFullYear(),
        make: calculatorState.selectedVehicle?.make || '',
        model: calculatorState.selectedVehicle?.model || '',
        trim: calculatorState.selectedVehicle?.trim || '',
        bodyType: 'sedan', // TODO: Derive from vehicle data
        newOrUsed: calculatorState.selectedVehicle?.condition || 'used',
        odometer: calculatorState.selectedVehicle?.odometer,
        useType: 'personal',
      },

      // Trade-ins
      tradeIns: calculatorState.selectedTradeInVehicles.map((tv) => ({
        vin: tv.vin || '',
        estimatedValue: tv.estimated_value || 0,
        payoffAmount: tv.payoff_amount || 0,
        lienHolderName: tv.lien_holder_name || '',
        titleStateCode: 'FL', // Assumption: all trade-ins have FL titles
      })),

      // Registration scenario
      registration: {
        plateScenario: tagMode,
        firstTimeRegisteredInState: firstTimeRegistration,
        existingPlateNumber: hasTradeIn ? 'TRADE_IN_PLATE' : undefined,
        garagingAddressPostalCode: profile.zip_code,
      },

      // Customer information
      customer: {
        residentStatus: 'resident', // Assume FL resident
        hasExistingStateRegistration: hasTradeIn,
        exemptions: [], // No exemptions by default
      },

      // No overrides by default
      overrides:
        firstTimeRegistration === true
          ? { isInitialRegistration: true }
          : undefined,
    };
  }

  /**
   * Determine lender type from lender name
   */
  private determineLenderType(
    lenderName?: string
  ): 'captive' | 'bank' | 'credit_union' | 'other' {
    if (!lenderName) return 'other';

    const lenderLower = lenderName.toLowerCase();

    if (lenderLower.includes('credit union')) return 'credit_union';
    if (lenderLower.includes('bank')) return 'bank';
    if (lenderLower.includes('captive') || lenderLower.includes('financial')) return 'captive';

    return 'other';
  }
}
