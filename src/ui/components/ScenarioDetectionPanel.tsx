import React from 'react';
import type { ScenarioResult } from '../../../packages/fee-engine/src';
import { formatCurrencyExact } from '../../utils/formatters';

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

  const formatCurrency = (amount: number) => formatCurrencyExact(amount);
  const stateTaxAmount = scenarioResult.taxBreakdown.stateTax;
  const countyTaxAmount = scenarioResult.taxBreakdown.countyTax;
  const totalTaxAmount = stateTaxAmount + countyTaxAmount;

  return (
    <div className="scenario-detection-panel rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-5 text-white shadow-inner">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-white/90">
            Purchase Assumptions
          </h3>
        </div>
        {onToggleAutoMode && (
          <button
            onClick={() => onToggleAutoMode(!autoModeEnabled)}
            className="text-xs text-white/60 hover:text-white transition-colors"
          >
            {autoModeEnabled ? 'Switch to Manual' : 'Use Auto-Calculate'}
          </button>
        )}
      </div>

      {/* Scenario description and notes */}
      <div className="mb-4 text-sm text-white/80">
        <div className="text-white/70">
          Deal type: {scenario.isFinanced ? 'Financed' : 'Cash'}{scenario.hasTradeIn ? ' · Includes trade-in' : ''}{scenario.isTagTransfer ? ' · Tag transfer' : ''}
        </div>
      </div>

      {/* Fee Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/60 mb-1">Gov Fees</div>
          <div className="text-lg font-semibold">{formatCurrency(scenarioResult.totals.governmentFees)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/60 mb-1">Sales Tax</div>
          <div className="text-lg font-semibold">{formatCurrency(scenarioResult.totals.salesTax)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/60 mb-1">Total Taxes & Gov't Fees</div>
          <div className="text-lg font-semibold">{formatCurrency(scenarioResult.totals.totalFees)}</div>
        </div>
      </div>

      {/* Tax Breakdown */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-semibold text-white/70 mb-2">Tax Breakdown</div>
        <div className="space-y-1 text-xs text-white/80">
          <div className="flex justify-between">
            <span>Taxable Base:</span>
            <span className="font-semibold text-white">{formatCurrency(scenarioResult.taxBreakdown.taxableBase)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              State Tax ({(scenarioResult.taxBreakdown.stateTaxRate * 100).toFixed(1)}%):
            </span>
            <span className="font-semibold text-white">{formatCurrency(scenarioResult.taxBreakdown.stateTax)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>
              County Tax ({(scenarioResult.taxBreakdown.countyTaxRate * 100).toFixed(1)}%):
            </span>
            <span className="font-semibold text-white">{formatCurrency(scenarioResult.taxBreakdown.countyTax)}</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/10 text-sm font-semibold text-white flex justify-between">
          <span>Total Taxes</span>
          <span>{formatCurrency(totalTaxAmount)}</span>
        </div>
      </div>

      {/* Applied Rules Count */}
      <div className="mt-3 flex items-center justify-between text-xs text-white/60">
        <span>{scenarioResult.appliedRuleIds.length} rules applied</span>
        {onRecalculate && (
          <button
            onClick={onRecalculate}
            disabled={isCalculating}
            className="text-emerald-300 hover:text-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Recalculate
          </button>
        )}
      </div>
    </div>
  );
};
