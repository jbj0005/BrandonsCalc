import React from 'react';
import type { ScenarioResult } from '../../../packages/fee-engine/src';
import { formatCurrencyExact } from '../../utils/formatters';

export interface ScenarioDetectionPanelProps {
  scenarioResult: ScenarioResult | null;
  isCalculating?: boolean;
  onRecalculate?: () => void;
  onToggleAutoMode?: (enabled: boolean) => void;
  autoModeEnabled?: boolean;
  taxOverride?: {
    taxableBase: number;
    stateTaxAmount: number;
    countyTaxAmount: number;
    stateTaxRate: number;
    countyTaxRate: number;
  };
}

export const ScenarioDetectionPanel: React.FC<ScenarioDetectionPanelProps> = ({
  scenarioResult,
  isCalculating = false,
  onRecalculate,
  onToggleAutoMode,
  autoModeEnabled = true,
  showRules = false,
}) => {
  const [showRulesList, setShowRulesList] = useState(false);

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
  const govLineItems = useMemo(
    () =>
      (scenarioResult.lineItems || []).filter(
        (item) => item.category === 'government'
      ),
    [scenarioResult.lineItems]
  );
  const topGovItems = govLineItems.slice(0, 5);

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

      {/* Gov Fee Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/60 mb-1">Gov Fees Total</div>
          <div className="text-lg font-semibold">{formatCurrency(scenarioResult.totals.governmentFees)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/60 mb-1">Items Returned</div>
          <div className="text-lg font-semibold">{govLineItems.length}</div>
        </div>
      </div>

      {/* Engine diagram: inputs -> gov fees */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-semibold text-white/70 mb-3">How we computed your gov fees</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <div className="rounded-lg border border-white/10 bg-black/10 p-3 space-y-1">
            <div className="text-xs uppercase tracking-wide text-white/60">Inputs</div>
            <div className="text-sm text-white/80">Deal: {scenario.isFinanced ? 'Financed' : 'Cash'}</div>
            <div className="text-sm text-white/80">Tag: {scenario.isTagTransfer ? 'Transfer existing plate' : 'New plate'}</div>
            <div className="text-sm text-white/80">Trade-in: {scenario.hasTradeIn ? 'Included' : 'None'}</div>
            <div className="text-sm text-white/80">First-time reg: {scenario.firstTimeRegistration ? 'Yes' : 'No'}</div>
          </div>
          <div className="flex items-center justify-center">
            <div className="text-white/60 text-sm">→ Fee Engine →</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-white/60">Gov Fee Outputs</div>
            <div className="text-sm text-white/80">Total: {formatCurrency(scenarioResult.totals.governmentFees)}</div>
            <div className="space-y-1">
              {topGovItems.length === 0 && (
                <div className="text-xs text-white/50">No gov fee line items returned.</div>
              )}
              {topGovItems.map((item, idx) => (
                <div key={`${item.code || item.description || idx}`} className="text-xs text-white/70 flex justify-between gap-2">
                  <span className="truncate">{item.description || 'Government fee'}</span>
                  <span className="font-semibold text-white">{formatCurrency(item.amount)}</span>
                </div>
              ))}
              {govLineItems.length > topGovItems.length && (
                <div className="text-xs text-white/50">+{govLineItems.length - topGovItems.length} more</div>
              )}
            </div>
          </div>
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
      {showRules && scenarioResult.appliedRuleIds.length > 0 && (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-white/70">Applied Rules</div>
            <button
              type="button"
              className="text-xs text-emerald-300 hover:text-emerald-200"
              onClick={() => setShowRulesList((prev) => !prev)}
            >
              {showRulesList ? 'Hide' : 'Show'}
            </button>
          </div>
          {showRulesList && (
            <div className="mt-2 space-y-1 text-xs text-white/80 max-h-48 overflow-auto">
              {scenarioResult.appliedRuleIds.map((ruleId) => (
                <div key={ruleId} className="flex items-center justify-between gap-2 border-b border-white/5 py-1">
                  <span className="truncate">{ruleId}</span>
                  <span className="text-white/50">gov fee rule</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
