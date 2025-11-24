import React from 'react';
import type { ScenarioResult } from '../../../packages/fee-engine/src';
import { Badge } from './Badge';

export interface ScenarioDetectionPanelProps {
  scenarioResult: ScenarioResult | null;
  isCalculating?: boolean;
  onRecalculate?: () => void;
  onToggleAutoMode?: (enabled: boolean) => void;
  autoModeEnabled?: boolean;
}

export const ScenarioDetectionPanel: React.FC<ScenarioDetectionPanelProps> = ({
  scenarioResult,
  isCalculating = false,
  onRecalculate,
  onToggleAutoMode,
  autoModeEnabled = true,
}) => {
  if (!scenarioResult && !isCalculating) {
    return (
      <div className="scenario-detection-panel bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              No scenario detected
            </span>
          </div>
          {onRecalculate && (
            <button
              onClick={onRecalculate}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Calculate Fees
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isCalculating) {
    return (
      <div className="scenario-detection-panel bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4 border border-blue-200 dark:border-blue-800 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            Calculating fees...
          </span>
        </div>
      </div>
    );
  }

  if (!scenarioResult) return null;

  const scenario = scenarioResult.detectedScenario;

  return (
    <div className="scenario-detection-panel bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 mb-4 border border-blue-200 dark:border-blue-800">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Scenario Detected
          </h3>
        </div>
        {onToggleAutoMode && (
          <button
            onClick={() => onToggleAutoMode(!autoModeEnabled)}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            {autoModeEnabled ? 'Switch to Manual' : 'Use Auto-Calculate'}
          </button>
        )}
      </div>

      {/* Scenario Info */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="info" size="sm">
            {scenario.type.replace(/_/g, ' ').toUpperCase()}
          </Badge>
          {scenario.hasTradeIn && (
            <Badge variant="success" size="sm">
              Trade-in
            </Badge>
          )}
          {scenario.isFinanced && (
            <Badge variant="default" size="sm">
              Financed
            </Badge>
          )}
          {scenario.isTagTransfer && (
            <Badge variant="warning" size="sm">
              Tag Transfer
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {scenario.description}
        </p>
      </div>

      {/* Fee Summary */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Gov Fees</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            ${scenarioResult.totals.governmentFees.toFixed(2)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Sales Tax</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            ${scenarioResult.totals.salesTax.toFixed(2)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Fees</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            ${scenarioResult.totals.totalFees.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Tax Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          Tax Breakdown
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Taxable Base:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              ${scenarioResult.taxBreakdown.taxableBase.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">
              State Tax ({(scenarioResult.taxBreakdown.stateTaxRate * 100).toFixed(1)}%):
            </span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              ${scenarioResult.taxBreakdown.stateTax.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">
              County Tax ({(scenarioResult.taxBreakdown.countyTaxRate * 100).toFixed(1)}%):
            </span>
            <div className="flex items-center gap-1">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                ${scenarioResult.taxBreakdown.countyTax.toFixed(2)}
              </span>
              {scenarioResult.taxBreakdown.countyTaxCapped && (
                <span className="text-xs text-orange-600 dark:text-orange-400" title="Capped at $5,000 taxable base per FL law">
                  (capped)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Applied Rules Count */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {scenarioResult.appliedRuleIds.length} rules applied
        </span>
        {onRecalculate && (
          <button
            onClick={onRecalculate}
            disabled={isCalculating}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Recalculate
          </button>
        )}
      </div>
    </div>
  );
};
