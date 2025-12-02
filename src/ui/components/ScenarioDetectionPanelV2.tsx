import React, { useMemo, useState } from 'react';
import type { ScenarioResult } from '../../../packages/fee-engine/src';
import { formatCurrencyExact } from '../../utils/formatters';

export interface ScenarioDetectionPanelV2Props {
  scenarioResult: ScenarioResult | null;
  isCalculating?: boolean;
  onRecalculate?: () => void;
  onToggleAutoMode?: (enabled: boolean) => void;
  autoModeEnabled?: boolean;
  showRules?: boolean;
}

export const ScenarioDetectionPanelV2: React.FC<ScenarioDetectionPanelV2Props> = ({
  scenarioResult,
  isCalculating = false,
  onRecalculate,
  onToggleAutoMode,
  autoModeEnabled = true,
  showRules = false,
}) => {
  // All hooks must be called before any conditional returns
  const [showRulesList, setShowRulesList] = useState(false);

  const govLineItems = useMemo(
    () =>
      scenarioResult?.lineItems
        ? scenarioResult.lineItems.filter((item) => item.category === 'government')
        : [],
    [scenarioResult?.lineItems]
  );

  const formatCurrency = (amount: number) => formatCurrencyExact(amount);

  // Now we can do conditional rendering
  if (!scenarioResult && !isCalculating) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">No Scenario Detected</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Add purchase details to calculate fees</p>
            </div>
          </div>
          {onRecalculate && (
            <button
              onClick={onRecalculate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
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
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900/50 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            Calculating government fees...
          </span>
        </div>
      </div>
    );
  }

  if (!scenarioResult) return null;

  const scenario = scenarioResult.detectedScenario;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Purchase Assumptions</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {scenario.isFinanced ? 'Financed' : 'Cash'} purchase
              {scenario.hasTradeIn && ' · With trade-in'}
              {scenario.isTagTransfer && ' · Tag transfer'}
            </p>
          </div>
        </div>
        {onRecalculate && (
          <button
            onClick={onRecalculate}
            disabled={isCalculating}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium disabled:opacity-50"
          >
            Recalculate
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-900/50">
          <div className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">
            Estimated Gov Fees
          </div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {formatCurrency(scenarioResult.totals.governmentFees)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-900/50">
          <div className="text-xs font-medium text-purple-700 dark:text-purple-400 uppercase tracking-wide mb-1">
            Fee Items
          </div>
          <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {govLineItems.length}
          </div>
        </div>
      </div>

      {/* Modern Flow Diagram */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Calculation Flow
        </h4>

        <div className="space-y-3">
          {/* Input Card */}
          <div className="relative">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Step 1</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Purchase Details</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Deal Type:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scenario.isFinanced ? 'Financed' : 'Cash'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Tag:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scenario.isTagTransfer ? 'Transfer' : 'New Plate'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Trade-in:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scenario.hasTradeIn ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">First-time:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scenario.firstTimeRegistration ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
            {/* Connecting Arrow */}
            <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-3 bg-gradient-to-b from-gray-300 to-transparent dark:from-gray-700"></div>
          </div>

          {/* Processing Card */}
          <div className="relative">
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Step 2</div>
                  <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Fee Engine Processing</div>
                </div>
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                Applied {scenarioResult.appliedRuleIds.length} jurisdiction rules to calculate fees
              </div>
            </div>
            {/* Connecting Arrow */}
            <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-3 bg-gradient-to-b from-emerald-300 to-transparent dark:from-emerald-700"></div>
          </div>

          {/* Output Card */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Step 3</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Est. Gov't Fee Results</div>
              </div>
            </div>
            <div className="space-y-2">
              {govLineItems.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">No est. gov't fees calculated</div>
              ) : (
                <>
                  {govLineItems.slice(0, 5).map((item, idx) => (
                    <div key={`${item.code || item.description || idx}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300 truncate">{item.description || 'Government fee'}</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 ml-3">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  {govLineItems.length > 5 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-700">
                      +{govLineItems.length - 5} more fees
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Applied Rules (Optional) */}
      {showRules && scenarioResult.appliedRuleIds.length > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowRulesList(!showRulesList)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <span>Applied Rules ({scenarioResult.appliedRuleIds.length})</span>
            <svg
              className={`w-4 h-4 transition-transform ${showRulesList ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showRulesList && (
            <div className="mt-3 space-y-1 max-h-48 overflow-auto">
              {scenarioResult.appliedRuleIds.map((ruleId) => (
                <div
                  key={ruleId}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded text-xs border border-gray-200 dark:border-gray-700"
                >
                  <span className="truncate text-gray-700 dark:text-gray-300">{ruleId}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-2">gov fee rule</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
