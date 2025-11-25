import React from 'react';
import type { FeeItem } from '../../types/fees';
import { parseCurrency } from '../../utils/formatters';

export interface GovFeesSectionProps {
  fees: Array<{ description: string; amount: string }>;
  autoModeEnabled: boolean;
  onToggleAutoMode: (enabled: boolean) => void;
  onViewAssumptions?: () => void;
  onAddFee?: () => void;
  onRemoveFee?: (index: number) => void;
  onUpdateFee?: (index: number, field: 'description' | 'amount', value: string) => void;
  total: number;
}

export const GovFeesSection: React.FC<GovFeesSectionProps> = ({
  fees,
  autoModeEnabled,
  onToggleAutoMode,
  onViewAssumptions,
  onAddFee,
  onRemoveFee,
  onUpdateFee,
  total,
}) => {
  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Government Fees
        </h3>

        {/* Mode Toggle */}
        <div className="flex items-center gap-3">
          {onViewAssumptions && autoModeEnabled && (
            <button
              onClick={onViewAssumptions}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              View Details
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={() => onToggleAutoMode(true)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                autoModeEnabled
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => onToggleAutoMode(false)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                !autoModeEnabled
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Manual
            </button>
          </div>
        </div>
      </div>

      {/* Fee List */}
      <div className="space-y-2">
        {fees.length === 0 ? (
          <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {autoModeEnabled
                ? 'Add your location to auto-calculate fees'
                : 'Click "+ Add Fee" to add government fees'}
            </p>
          </div>
        ) : (
          fees.map((fee, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                autoModeEnabled
                  ? 'border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
              }`}
            >
              {/* Description */}
              <input
                type="text"
                value={fee.description}
                onChange={(e) => onUpdateFee?.(index, 'description', e.target.value)}
                disabled={autoModeEnabled}
                placeholder="Fee description..."
                className={`flex-1 px-3 py-2 rounded-md text-sm transition-all ${
                  autoModeEnabled
                    ? 'bg-transparent border-none text-gray-700 dark:text-gray-300 cursor-default'
                    : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />

              {/* Amount */}
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  ${parseCurrency(fee.amount || '0').toFixed(2)}
                </span>

                {!autoModeEnabled && onRemoveFee && (
                  <button
                    onClick={() => onRemoveFee(index)}
                    className="p-2 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Remove fee"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {autoModeEnabled && (
                  <div className="w-4 h-4 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Row Button (Manual mode only) */}
      {!autoModeEnabled && onAddFee && (
        <button
          onClick={onAddFee}
          className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-gray-200 transition-all"
        >
          + Add Fee
        </button>
      )}

      {/* Total */}
      <div className="flex items-center justify-between pt-4 border-t-2 border-gray-200 dark:border-gray-700">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
          Total
        </span>
        <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">
          ${total.toFixed(2)}
        </span>
      </div>

      {/* Helper text */}
      {autoModeEnabled && fees.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-blue-900 dark:text-blue-200">
            <span className="font-medium">Auto-calculated</span> based on your location and transaction type.
            Switch to Manual to edit fees.
          </div>
        </div>
      )}
    </div>
  );
};
