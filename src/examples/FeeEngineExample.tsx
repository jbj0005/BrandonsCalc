import React, { useEffect, useState } from 'react';
import { useFeeEngine } from '../hooks/useFeeEngine';
import { useCalculatorStore } from '../stores/calculatorStore';
import { ScenarioDetectionPanel } from '../ui/components';
import type { GarageVehicle } from '../stores/calculatorStore';

/**
 * Fee Engine Integration Example
 *
 * This component demonstrates how to integrate the fee engine
 * into your application. Copy this pattern to your actual components.
 */

interface FeeEngineExampleProps {
  // User profile data (from your auth/profile context)
  userProfile?: {
    state_code?: string;
    county_name?: string;
    city?: string;
    zip_code?: string;
  };

  // Selected vehicle being purchased (from your vehicle search/selection)
  selectedVehicle?: {
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    condition?: 'new' | 'used';
    odometer?: number;
  };

  // Garage vehicles (for trade-ins)
  garageVehicles?: GarageVehicle[];

  // Lender information (from your lender selection)
  lenderInfo?: {
    lenderName?: string;
    term: number;
    apr: number;
  };
}

export const FeeEngineExample: React.FC<FeeEngineExampleProps> = ({
  userProfile,
  selectedVehicle,
  garageVehicles = [],
  lenderInfo,
}) => {
  // Get calculator state
  const sliders = useCalculatorStore((state) => state.sliders);
  const selectedTradeInVehicles = useCalculatorStore((state) => state.selectedTradeInVehicles);
  const applyFeeEngineResult = useCalculatorStore((state) => state.applyFeeEngineResult);
  const feeEngineResult = useCalculatorStore((state) => state.feeEngineResult);

  // Build selected trade-in vehicles array
  const selectedTradeIns = Array.from(selectedTradeInVehicles)
    .map((vehicleId) => {
      const vehicle = garageVehicles.find((v) => v.id === vehicleId);
      if (!vehicle) return null;

      return {
        id: vehicle.id,
        vin: '', // Add if available
        estimated_value: vehicle.estimated_value || 0,
        payoff_amount: vehicle.payoff_amount || 0,
        lien_holder_name: '', // Add if available
      };
    })
    .filter((v) => v !== null) as Array<{
      id: string;
      vin?: string;
      estimated_value: number;
      payoff_amount: number;
      lien_holder_name?: string;
    }>;

  // Use the fee engine hook
  const { scenarioResult, isCalculating, error, recalculate } = useFeeEngine({
    // From calculator sliders
    salePrice: sliders.salePrice.value,
    cashDown: sliders.cashDown.value,
    loanTerm: lenderInfo?.term || 0,
    apr: lenderInfo?.apr || 0,

    // Trade-ins
    selectedTradeInVehicles: selectedTradeIns,

    // User/vehicle context
    userProfile,
    selectedVehicle,
    preferredLender: lenderInfo?.lenderName,

    // Enable auto-calculation only if we have required data
    enabled: Boolean(userProfile?.state_code && sliders.salePrice.value > 0),
  });

  // Auto-apply result to calculator store
  useEffect(() => {
    if (scenarioResult && !isCalculating) {
      console.log('[FeeEngineExample] Applying scenario result to calculator');
      applyFeeEngineResult(scenarioResult);
    }
  }, [scenarioResult, isCalculating, applyFeeEngineResult]);

  // Show error state
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">
          Fee Calculation Error
        </h3>
        <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
        <button
          onClick={recalculate}
          className="mt-3 text-sm text-red-700 dark:text-red-300 underline hover:no-underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show missing data message
  if (!userProfile?.state_code) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h3 className="text-yellow-800 dark:text-yellow-200 font-semibold mb-2">
          Location Required
        </h3>
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          Please add your location to your profile to enable automatic fee calculation.
        </p>
      </div>
    );
  }

  // Show scenario detection panel
  return (
    <div className="space-y-4">
      {/* Main Scenario Panel */}
      <ScenarioDetectionPanel
        scenarioResult={feeEngineResult}
        isCalculating={isCalculating}
        onRecalculate={recalculate}
      />

      {/* Optional: Fee Breakdown Card */}
      {feeEngineResult && !isCalculating && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
            Fee Breakdown
          </h3>

          {/* Government Fees */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Government Fees
            </h4>
            <div className="space-y-1">
              {feeEngineResult.lineItems
                .filter((item) => item.category === 'government')
                .map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-gray-600 dark:text-gray-400">
                      {item.description}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      ${item.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between font-semibold">
                <span className="text-gray-900 dark:text-gray-100">Total Government Fees</span>
                <span className="text-gray-900 dark:text-gray-100">
                  ${feeEngineResult.totals.governmentFees.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Dealer Fees (if any) */}
          {feeEngineResult.lineItems.some((item) => item.category === 'dealer') && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Dealer Fees
              </h4>
              <div className="space-y-1">
                {feeEngineResult.lineItems
                  .filter((item) => item.category === 'dealer')
                  .map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-gray-600 dark:text-gray-400">
                        {item.description}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        ${item.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Sales Tax Breakdown */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sales Tax
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  State Tax ({(feeEngineResult.taxBreakdown.stateTaxRate * 100).toFixed(1)}%)
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  ${feeEngineResult.taxBreakdown.stateTax.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  County Tax ({(feeEngineResult.taxBreakdown.countyTaxRate * 100).toFixed(1)}%)
                  {feeEngineResult.taxBreakdown.countyTaxCapped && (
                    <span className="text-xs text-orange-600 dark:text-orange-400 ml-1">
                      (capped)
                    </span>
                  )}
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  ${feeEngineResult.taxBreakdown.countyTax.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between font-semibold">
                <span className="text-gray-900 dark:text-gray-100">Total Sales Tax</span>
                <span className="text-gray-900 dark:text-gray-100">
                  ${feeEngineResult.totals.salesTax.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Explanations */}
          {feeEngineResult.explanations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Why These Fees Apply
              </h4>
              <ul className="space-y-1">
                {feeEngineResult.explanations.map((explanation, index) => (
                  <li
                    key={index}
                    className="text-xs text-gray-600 dark:text-gray-400 flex items-start"
                  >
                    <span className="mr-2">•</span>
                    <span>{explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Debug Info (Remove in production) */}
      {process.env.NODE_ENV === 'development' && feeEngineResult && (
        <details className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            Debug Info
          </summary>
          <div className="mt-3 space-y-2">
            <div className="text-xs">
              <span className="font-medium">Scenario ID:</span>{' '}
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                {feeEngineResult.scenarioId}
              </code>
            </div>
            <div className="text-xs">
              <span className="font-medium">Applied Rules:</span>{' '}
              {feeEngineResult.appliedRuleIds.length}
            </div>
            <div className="text-xs">
              <span className="font-medium">Calculation Time:</span>{' '}
              {feeEngineResult.calculationMetadata?.calculationTimeMs}ms
            </div>
            <div className="text-xs">
              <span className="font-medium">Taxable Base:</span>{' '}
              ${feeEngineResult.taxBreakdown.taxableBase.toFixed(2)}
            </div>
          </div>
        </details>
      )}
    </div>
  );
};

export default FeeEngineExample;
