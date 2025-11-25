import React, { useState, useRef, useEffect } from 'react';
import { parseCurrency, formatCurrencyExact } from '../../utils/formatters';
import type { FeeSuggestion } from '../../types/fees';

export type FeeCategory = 'dealer' | 'customer' | 'gov';

export interface ModernFeeSectionProps {
  title: string;
  category: FeeCategory;
  fees: Array<{ description: string; amount: string }>;
  total: number;
  readOnly?: boolean;
  onAddFee?: () => void;
  onRemoveFee?: (index: number) => void;
  onUpdateFee?: (index: number, field: 'description' | 'amount', value: string) => void;
  onViewDetails?: () => void;
  autoModeEnabled?: boolean;
  onToggleAutoMode?: (enabled: boolean) => void;
  feeRange?: { min: number; max: number }; // Optional min/max range for government fees
  suggestions?: FeeSuggestion[];
  onSuggestionSelect?: (index: number, suggestion: FeeSuggestion) => void;
  inputRefs?: React.MutableRefObject<Map<string, HTMLInputElement>>;
  onDescriptionFocus?: (category: FeeCategory, index: number) => void;
  onDescriptionKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, category: FeeCategory, index: number, searchTerm: string) => void;
  onDescriptionBlur?: () => void;
  onSectionMouseLeave?: () => void;
}

const categoryConfig: Record<FeeCategory, { color: string; bgColor: string; borderColor: string; totalColor: string }> = {
  dealer: {
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50/50 dark:bg-blue-950/20',
    borderColor: 'border-blue-100 dark:border-blue-900/30',
    totalColor: 'text-blue-600 dark:text-blue-500',
  },
  customer: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50/50 dark:bg-green-950/20',
    borderColor: 'border-green-100 dark:border-green-900/30',
    totalColor: 'text-green-600 dark:text-green-500',
  },
  gov: {
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50/50 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-100 dark:border-yellow-900/30',
    totalColor: 'text-yellow-600 dark:text-yellow-500',
  },
};

export const ModernFeeSection: React.FC<ModernFeeSectionProps> = ({
  title,
  category,
  fees,
  total,
  readOnly = false,
  onAddFee,
  onRemoveFee,
  onUpdateFee,
  onViewDetails,
  autoModeEnabled,
  onToggleAutoMode,
  feeRange,
  suggestions = [],
  onSuggestionSelect,
  inputRefs,
  onDescriptionFocus,
  onDescriptionKeyDown,
  onDescriptionBlur,
  onSectionMouseLeave,
}) => {
  const config = categoryConfig[category];
  const showAutoToggle = category === 'gov' && onToggleAutoMode !== undefined;
  const isAutoMode = showAutoToggle && autoModeEnabled;

  const [activeSuggestion, setActiveSuggestion] = useState<number | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const isOverDropdownRef = useRef(false);
  const dropdownRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Close dropdown when clicking outside
  useEffect(() => {
    if (activeSuggestion === null) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      const dropdownEl = dropdownRefs.current.get(activeSuggestion);
      const inputEl = inputRefs?.current.get(`${category}-${activeSuggestion}`);

      // Check if click is outside both the dropdown and the input
      if (
        dropdownEl &&
        inputEl &&
        !dropdownEl.contains(event.target as Node) &&
        !inputEl.contains(event.target as Node)
      ) {
        setActiveSuggestion(null);
        setSelectedSuggestionIndex(0);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeSuggestion, category, inputRefs]);

  // Get filtered suggestions based on search term
  const getFilteredSuggestions = (searchTerm: string): FeeSuggestion[] => {
    if (!searchTerm) return suggestions;
    return suggestions.filter((s) =>
      s.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const handleDescriptionFocusInternal = (index: number) => {
    setActiveSuggestion(index);
    setSelectedSuggestionIndex(0);
    onDescriptionFocus?.(category, index);
  };

  const handleDescriptionBlurInternal = () => {
    setTimeout(() => {
      if (!isOverDropdownRef.current) {
        setActiveSuggestion(null);
      }
    }, 200);
    onDescriptionBlur?.();
  };

  const handleSuggestionClick = (index: number, suggestion: FeeSuggestion) => {
    onSuggestionSelect?.(index, suggestion);
    setActiveSuggestion(null);
  };

  return (
    <div
      className="space-y-4"
      onMouseLeave={onSectionMouseLeave}
    >
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>

        {showAutoToggle && (
          <div className="flex items-center gap-3">
            {onViewDetails && autoModeEnabled && (
              <button
                onClick={onViewDetails}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                View Details
              </button>
            )}

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={() => onToggleAutoMode?.(true)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                  autoModeEnabled
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                Auto
              </button>
              <button
                onClick={() => onToggleAutoMode?.(false)}
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
        )}
      </div>

      {/* Fee Range Indicator (for government fees) */}
      {feeRange && isAutoMode && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Expected Range
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                ${feeRange.min.toFixed(2)} - ${feeRange.max.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Based on your purchase details
          </div>
        </div>
      )}

      {/* Fee List */}
      <div className="space-y-2">
        {fees.length === 0 ? (
          <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isAutoMode
                ? 'Add your location to auto-calculate fees'
                : `Click "+ Add Fee" to add ${title.toLowerCase()}`}
            </p>
          </div>
        ) : (
          fees.map((fee, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isAutoMode
                  ? 'border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/30 opacity-75'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
              }`}
            >
              {/* Description with autocomplete */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={fee.description}
                  onChange={(e) => onUpdateFee?.(index, 'description', e.target.value)}
                  onFocus={() => handleDescriptionFocusInternal(index)}
                  onMouseEnter={() => handleDescriptionFocusInternal(index)}
                  onKeyDown={(e) => onDescriptionKeyDown?.(e, category, index, fee.description)}
                  onBlur={handleDescriptionBlurInternal}
                  ref={(el) => {
                    if (el && inputRefs) {
                      inputRefs.current.set(`${category}-${index}`, el);
                    }
                  }}
                  disabled={readOnly || isAutoMode}
                  placeholder="Fee description..."
                  className={`w-full px-3 py-2 rounded-md text-sm transition-all ${
                    readOnly || isAutoMode
                      ? 'bg-transparent border-none text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                />

                {/* Suggestions dropdown */}
                {activeSuggestion === index && !isAutoMode && !readOnly && (() => {
                  const filteredSuggestions = getFilteredSuggestions(fee.description);
                  const suggestionCount = filteredSuggestions.length;
                  const dropdownMaxHeight = suggestionCount >= 10 ? 'max-h-96' : suggestionCount >= 6 ? 'max-h-64' : 'max-h-48';

                  return (
                    <div
                      ref={(el) => {
                        if (el) {
                          dropdownRefs.current.set(index, el);
                        }
                      }}
                      className={`absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg ${dropdownMaxHeight} overflow-auto`}
                      onMouseEnter={() => {
                        isOverDropdownRef.current = true;
                      }}
                      onMouseLeave={() => {
                        isOverDropdownRef.current = false;
                        setActiveSuggestion(null);
                        setSelectedSuggestionIndex(0);
                      }}
                    >
                      {filteredSuggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSuggestionClick(index, suggestion);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${
                            i === selectedSuggestionIndex
                              ? 'bg-blue-500/20 text-gray-900 dark:text-gray-100'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span>{suggestion.description}</span>
                          <span className="text-gray-500 dark:text-gray-400">{formatCurrencyExact(suggestion.amount)}</span>
                        </button>
                      ))}
                      {filteredSuggestions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No suggestions</div>
                      )}
                    </div>
                  );
                })()}</div>

              {/* Amount */}
              <div className="flex items-center gap-2">
                <span className={`text-lg font-semibold ${
                  isAutoMode
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-gray-900 dark:text-gray-100'
                }`}>
                  ${parseCurrency(fee.amount || '0').toFixed(2)}
                </span>

                {!readOnly && !isAutoMode && onRemoveFee && (
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

                {isAutoMode && (
                  <div className="w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500">
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
      {!readOnly && !isAutoMode && onAddFee && (
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
        <span className={`text-2xl font-bold ${
          isAutoMode
            ? 'text-gray-600 dark:text-gray-400'
            : config.totalColor
        }`}>
          ${total.toFixed(2)}
        </span>
      </div>

      {/* Helper text for auto mode */}
      {isAutoMode && fees.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700">
          <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Auto-calculated</span> based on your location and transaction type.
            Switch to Manual to edit fees.
          </div>
        </div>
      )}
    </div>
  );
};
