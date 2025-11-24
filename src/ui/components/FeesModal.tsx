import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { FeeItem, FeeCategory, FeeSuggestion } from '../../types/fees';
import { fetchFeeSuggestions, FEE_TEMPLATES_UPDATED_EVENT } from '../../services/feeSuggestionsService';
import { formatCurrencyExact, parseCurrency, formatCurrencyInput } from '../../utils/formatters';
import { ScenarioDetectionPanel } from './ScenarioDetectionPanel';
import type { ScenarioResult } from '../../../packages/fee-engine/src';

interface FeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealerFees: FeeItem[];
  customerAddons: FeeItem[];
  govtFees: FeeItem[];
  stateTaxRate: number;
  countyTaxRate: number;
  stateName: string;
  countyName: string;
  taxableBase: number;
  stateTaxAmount: number;
  countyTaxAmount: number;
  onSave: (data: {
    dealerFees: FeeItem[];
    customerAddons: FeeItem[];
    govtFees: FeeItem[];
    stateTaxRate: number;
    countyTaxRate: number;
    userTaxOverride: boolean;
  }) => void;
  onEditTemplates: () => void;
  scenarioResult?: ScenarioResult | null;
  isCalculatingFees?: boolean;
  onRecalculateFees?: () => void;
  scenarioOverrides?: {
    cashPurchase?: boolean;
    includeTradeIn?: boolean;
    tagMode?: 'new_plate' | 'transfer_existing_plate' | 'temp_tag';
    firstTimeRegistration?: boolean;
    enabled?: boolean;
  };
  onScenarioOverridesChange?: (overrides: {
    cashPurchase?: boolean;
    includeTradeIn?: boolean;
    tagMode?: 'new_plate' | 'transfer_existing_plate' | 'temp_tag';
    firstTimeRegistration?: boolean;
    enabled?: boolean;
  }) => void;
  hasTradeIn?: boolean;
}

interface FeeRow {
  description: string;
  amount: string;
}

export const FeesModal: React.FC<FeesModalProps> = ({
  isOpen,
  onClose,
  dealerFees: initialDealerFees,
  customerAddons: initialCustomerAddons,
  govtFees: initialGovtFees,
  stateTaxRate: initialStateTaxRate,
  countyTaxRate: initialCountyTaxRate,
  stateName,
  countyName,
  taxableBase,
  stateTaxAmount,
  countyTaxAmount,
  onSave,
  onEditTemplates,
  scenarioResult,
  isCalculatingFees = false,
  onRecalculateFees,
  scenarioOverrides,
  onScenarioOverridesChange,
  hasTradeIn = false,
}) => {
  // Fee rows state
  const [dealerRows, setDealerRows] = useState<FeeRow[]>([]);
  const [customerRows, setCustomerRows] = useState<FeeRow[]>([]);
  const [govRows, setGovRows] = useState<FeeRow[]>([]);

  // Tax rate state
  const [stateTax, setStateTax] = useState<string>('');
  const [countyTax, setCountyTax] = useState<string>('');

  // Format percent input (allow numbers and decimal, format to 2 decimal places)
  const handlePercentChange = (value: string, setter: (val: string) => void) => {
    // Remove non-numeric characters except decimal point
    const cleaned = value.replace(/[^\d.]/g, '');

    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return;
    }

    // Limit to 2 decimal places
    if (parts[1] && parts[1].length > 2) {
      return;
    }

    setter(cleaned);
  };

  const handleAmountChange = (category: FeeCategory, index: number, value: string) => {
    updateRow(category, index, 'amount', formatCurrencyInput(value));
  };

  const handleAmountFinalize = (category: FeeCategory, index: number, value: string) => {
    const formatted = value ? formatCurrencyExact(parseCurrency(value)) : '';
    updateRow(category, index, 'amount', formatted);
  };

  const handleAmountKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    category: FeeCategory,
    index: number,
    value: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAmountFinalize(category, index, value);
      // Move focus to next input if available
      const key = `${category}-${index + 1}`;
      const nextRef = inputRefs.current.get(key);
      if (nextRef) {
        nextRef.focus();
      }
    } else if (e.key === 'Tab') {
      handleAmountFinalize(category, index, value);
    }
  };

  // Suggestions state
  const [dealerSuggestions, setDealerSuggestions] = useState<FeeSuggestion[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<FeeSuggestion[]>([]);
  const [govSuggestions, setGovSuggestions] = useState<FeeSuggestion[]>([]);

  // Active suggestion dropdowns
  const [activeSuggestion, setActiveSuggestion] = useState<{
    category: FeeCategory;
    index: number;
  } | null>(null);

  // Track if cursor is over the dropdown (to prevent premature closing)
  const isOverDropdownRef = useRef(false);

  // Keyboard navigation state
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);

  // Ref for auto-focusing new rows
  const inputRefs = React.useRef<Map<string, HTMLInputElement>>(new Map());

  // Track if we've initialized for current modal session
  const initializedRef = useRef(false);

  const loadSuggestions = useCallback(async () => {
    const [dealer, customer, gov] = await Promise.all([
      fetchFeeSuggestions('dealer'),
      fetchFeeSuggestions('customer'),
      fetchFeeSuggestions('gov'),
    ]);

    setDealerSuggestions(dealer);
    setCustomerSuggestions(customer);
    setGovSuggestions(gov);
  }, []);

  // Track if we just auto-focused a new row (to skip showing dropdown)
  const skipNextFocusRef = useRef(false);

  const handleTogglePill = (
    key:
      | 'enabled'
      | 'cashPurchase'
      | 'includeTradeIn'
      | 'tag_new'
      | 'tag_transfer'
      | 'firstTimeRegistration'
  ) => {
    if (!onScenarioOverridesChange) return;

    const next = {
      enabled: scenarioOverrides?.enabled !== false,
      cashPurchase: scenarioOverrides?.cashPurchase || false,
      includeTradeIn: scenarioOverrides?.includeTradeIn ?? true,
      tagMode: scenarioOverrides?.tagMode,
      firstTimeRegistration: scenarioOverrides?.firstTimeRegistration || false,
    };

    switch (key) {
      case 'enabled':
        next.enabled = !next.enabled;
        break;
      case 'cashPurchase':
        next.cashPurchase = !next.cashPurchase;
        break;
      case 'includeTradeIn':
        if (!hasTradeIn) {
          return;
        }
        // Include Trade-In mirrors the My Garage toggle; keep it true when a trade is selected
        next.includeTradeIn = true;
        break;
      case 'tag_new':
        if (hasTradeIn) {
          return;
        }
        next.tagMode = next.tagMode === 'new_plate' ? undefined : 'new_plate';
        break;
      case 'tag_transfer':
        next.tagMode =
          next.tagMode === 'transfer_existing_plate'
            ? undefined
            : 'transfer_existing_plate';
        break;
      case 'firstTimeRegistration':
        next.firstTimeRegistration = !next.firstTimeRegistration;
        break;
      default:
        break;
    }

    // If auto-calc disabled, clear other overrides
    if (key === 'enabled' && next.enabled === false) {
      next.cashPurchase = false;
      next.includeTradeIn = true;
      next.tagMode = undefined;
      next.firstTimeRegistration = false;
    }

    onScenarioOverridesChange(next);
  };

  const renderPills = () => {
    const pills = [
      {
        key: 'enabled' as const,
        label: 'Auto Calculate',
        active: scenarioOverrides?.enabled !== false,
        description: 'Enable/disable automatic gov fee calculation',
      },
      {
        key: 'cashPurchase' as const,
        label: 'Cash Purchase',
        active: scenarioOverrides?.cashPurchase || false,
        description: 'Sets APR & term to 0',
      },
      {
        key: 'includeTradeIn' as const,
        label: 'Include Trade-In',
        active: scenarioOverrides?.includeTradeIn !== false,
        description: hasTradeIn
          ? 'Linked to My Garage trade-in toggle'
          : 'Select a trade-in vehicle in My Garage to enable',
        disabled: !hasTradeIn,
      },
      {
        key: 'tag_new' as const,
        label: 'New Tag',
        active: scenarioOverrides?.tagMode === 'new_plate',
        description: hasTradeIn
          ? 'Trade-in selected; tag transfer assumed'
          : 'Issue a new plate',
        disabled: hasTradeIn,
      },
      {
        key: 'tag_transfer' as const,
        label: 'Tag Transfer',
        active: scenarioOverrides?.tagMode === 'transfer_existing_plate',
        description: 'Transfer existing plate',
      },
      {
        key: 'firstTimeRegistration' as const,
        label: 'First-Time FL Reg',
        active: scenarioOverrides?.firstTimeRegistration || false,
        description: 'Applies initial registration fees',
      },
    ];

    return (
      <div className="space-y-2">
        <div className="text-sm text-white/70">
          Select keywords to adjust your purchase details. Turn off "Auto Calculate" to set custom gov't fees.
        </div>
        <div className="flex flex-wrap gap-2">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => handleTogglePill(pill.key)}
              disabled={pill.disabled}
              className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                pill.disabled
                  ? 'bg-white/5 border-white/5 text-white/30 cursor-not-allowed'
                  : pill.active
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100 shadow-emerald-500/20 shadow'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}
              title={pill.description}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      initializedRef.current = true;

      const dealerSource = initialDealerFees ?? [];
      setDealerRows(
        dealerSource.length > 0
          ? dealerSource.map((f) => ({
              description: f.description,
              amount: formatCurrencyExact(f.amount),
            }))
          : [{ description: '', amount: '' }]
      );

      const customerSource = initialCustomerAddons ?? [];
      setCustomerRows(
        customerSource.length > 0
          ? customerSource.map((f) => ({
              description: f.description,
              amount: formatCurrencyExact(f.amount),
            }))
          : [{ description: '', amount: '' }]
      );

      const govSource = initialGovtFees ?? [];
      setGovRows(
        govSource.length > 0
          ? govSource.map((f) => ({
              description: f.description,
              amount: formatCurrencyExact(f.amount),
            }))
          : [{ description: '', amount: '' }]
      );

      setStateTax((initialStateTaxRate ?? 0).toString());
      setCountyTax((initialCountyTaxRate ?? 0).toString());

      loadSuggestions();
    }

    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [
    isOpen,
    initialDealerFees,
    initialCustomerAddons,
    initialGovtFees,
    initialStateTaxRate,
    initialCountyTaxRate,
    loadSuggestions,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = () => {
      loadSuggestions();
    };
    window.addEventListener(FEE_TEMPLATES_UPDATED_EVENT, handler);
    return () => window.removeEventListener(FEE_TEMPLATES_UPDATED_EVENT, handler);
  }, [loadSuggestions]);

  const showScenarioPanel = scenarioResult || isCalculatingFees;

  // Add row
  const addRow = (category: FeeCategory) => {
    const newRow = { description: '', amount: '' };
    if (category === 'dealer') {
      setDealerRows(rows => [...rows, newRow]);
    } else if (category === 'customer') {
      setCustomerRows(rows => [...rows, newRow]);
    } else {
      setGovRows(rows => [...rows, newRow]);
    }
  };

  // Remove row or clear values if it's the only row
  const removeRow = (category: FeeCategory, index: number) => {
    if (category === 'dealer') {
      setDealerRows(rows => {
        if (rows.length === 1) {
          // Clear values but keep the row
          return [{ description: '', amount: '' }];
        }
        return rows.filter((_, i) => i !== index);
      });
    } else if (category === 'customer') {
      setCustomerRows(rows => {
        if (rows.length === 1) {
          // Clear values but keep the row
          return [{ description: '', amount: '' }];
        }
        return rows.filter((_, i) => i !== index);
      });
    } else {
      setGovRows(rows => {
        if (rows.length === 1) {
          // Clear values but keep the row
          return [{ description: '', amount: '' }];
        }
        return rows.filter((_, i) => i !== index);
      });
    }
  };

  // Update row
  const updateRow = (
    category: FeeCategory,
    index: number,
    field: 'description' | 'amount',
    value: string
  ) => {
    const updater = (rows: FeeRow[]) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));

    if (category === 'dealer') {
      setDealerRows(rows => updater(rows));
    } else if (category === 'customer') {
      setCustomerRows(rows => updater(rows));
    } else {
      setGovRows(rows => updater(rows));
    }

    // Reset selected index when typing
    if (field === 'description') {
      setSelectedSuggestionIndex(0);
    }
  };

  // Handle focus on description field - show dropdown
  const handleDescriptionFocus = (category: FeeCategory, index: number) => {
    // If moving to a different category, clean up empty last row from previous category
    if (activeCategoryRef.current !== null && activeCategoryRef.current !== category) {
      cleanupEmptyLastRow(activeCategoryRef.current);
    }

    // Update active category
    activeCategoryRef.current = category;

    // Skip showing dropdown if we just auto-focused after rapid-fire selection
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }

    setActiveSuggestion({ category, index });
    setSelectedSuggestionIndex(0);
  };

  // Select suggestion
  const selectSuggestion = (category: FeeCategory, index: number, suggestion: FeeSuggestion) => {
    const updater = (rows: FeeRow[]) =>
      rows.map((row, i) =>
        i === index
          ? {
              description: suggestion.description,
              amount: formatCurrencyExact(suggestion.amount),
            }
          : row
      );

    if (category === 'dealer') {
      setDealerRows(rows => updater(rows));
    } else if (category === 'customer') {
      setCustomerRows(rows => updater(rows));
    } else {
      setGovRows(rows => updater(rows));
    }

    setActiveSuggestion(null);

    // Auto-add new empty row and focus it
    addRow(category);

    // Set flag to skip showing dropdown on next focus (rapid-fire mode)
    skipNextFocusRef.current = true;

    // Focus the new row's description field after a short delay
    setTimeout(() => {
      const nextIndex = index + 1;
      const key = `${category}-${nextIndex}`;
      const input = inputRefs.current.get(key);
      if (input) {
        input.focus();
      }
    }, 100);
  };

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    category: FeeCategory,
    index: number,
    searchTerm: string
  ) => {
    const filteredSuggestions = getFilteredSuggestions(category, searchTerm);

    if (filteredSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;

      case 'Enter':
      case 'Tab':
        if (activeSuggestion) {
          e.preventDefault();
          const suggestion = filteredSuggestions[selectedSuggestionIndex];
          if (suggestion) {
            selectSuggestion(category, index, suggestion);
          }
        }
        break;

      case 'Escape':
        e.preventDefault();
        setActiveSuggestion(null);
        setSelectedSuggestionIndex(0);
        break;
    }
  };

  // Get filtered suggestions
  const getFilteredSuggestions = (category: FeeCategory, searchTerm: string): FeeSuggestion[] => {
    const suggestions =
      category === 'dealer'
        ? dealerSuggestions
        : category === 'customer'
        ? customerSuggestions
        : govSuggestions;

    if (!searchTerm) return suggestions;

    return suggestions.filter((s) =>
      s.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Calculate totals
  const calculateTotal = (rows: FeeRow[]): number => {
    return rows.reduce((sum, row) => {
      const amount = parseCurrency(row.amount);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
  };

  const dealerTotal = calculateTotal(dealerRows);
  const customerTotal = calculateTotal(customerRows);
  const govTotal = calculateTotal(govRows);

  const stateTaxValue = parseFloat(stateTax) || 0;
  const countyTaxValue = parseFloat(countyTax) || 0;

  // Use main app taxes as single source of truth
  const stateTaxDisplay = stateTaxAmount;
  const countyTaxDisplay = countyTaxAmount;
  const totalOtherCharges =
    dealerTotal + customerTotal + govTotal + stateTaxDisplay + countyTaxDisplay;
  const stateRateDisplay = stateTaxValue.toFixed(2);
  const countyRateDisplay = countyTaxValue.toFixed(2);

  // Handle save
  const handleSave = () => {
    // Convert rows to FeeItems (filter out empty rows)
    const dealerFees: FeeItem[] = dealerRows
      .filter((row) => row.description.trim() || row.amount.trim())
      .map((row) => ({
        description: row.description.trim(),
        amount: parseCurrency(row.amount),
      }));

    const customerAddons: FeeItem[] = customerRows
      .filter((row) => row.description.trim() || row.amount.trim())
      .map((row) => ({
        description: row.description.trim(),
        amount: parseCurrency(row.amount),
      }));

    const govtFees: FeeItem[] = govRows
      .filter((row) => row.description.trim() || row.amount.trim())
      .map((row) => ({
        description: row.description.trim(),
        amount: parseCurrency(row.amount),
      }));

    // Check if tax rates were manually changed
    const userTaxOverride =
      stateTaxValue !== initialStateTaxRate || countyTaxValue !== initialCountyTaxRate;

    onSave({
      dealerFees,
      customerAddons,
      govtFees,
      stateTaxRate: stateTaxValue,
      countyTaxRate: countyTaxValue,
      userTaxOverride,
    });

    onClose();
  };

  // Track the currently active category for cleanup
  const activeCategoryRef = useRef<FeeCategory | null>(null);
  const rowLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up empty last row in a category
  const cleanupEmptyLastRow = (category: FeeCategory) => {
    const getRows = () => {
      if (category === 'dealer') return dealerRows;
      if (category === 'customer') return customerRows;
      return govRows;
    };

    const rows = getRows();
    const lastRow = rows[rows.length - 1];

    // If last row is empty, remove it (but only if there's more than one row)
    if (rows.length > 1 && lastRow && !lastRow.description.trim() && !lastRow.amount.trim()) {
      if (category === 'dealer') {
        setDealerRows(prev => prev.slice(0, -1));
      } else if (category === 'customer') {
        setCustomerRows(prev => prev.slice(0, -1));
      } else {
        setGovRows(prev => prev.slice(0, -1));
      }
    }
  };

  // Render fee section
  const renderFeeSection = (
    title: string,
    category: FeeCategory,
    rows: FeeRow[],
    total: number,
    color: string
  ) => {
    return (
      <div
        className="space-y-3"
        onMouseLeave={() => {
          if (activeCategoryRef.current === category) {
            cleanupEmptyLastRow(category);
            activeCategoryRef.current = null;
          }
        }}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wide">
            {title}
          </h4>
        </div>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={index}
              className="flex items-center gap-2"
              onMouseEnter={() => {
                if (rowLeaveTimerRef.current) {
                  clearTimeout(rowLeaveTimerRef.current);
                  rowLeaveTimerRef.current = null;
                }
              }}
              onMouseLeave={() => {
                // Debounce closing to allow moving into dropdown without flicker
                if (rowLeaveTimerRef.current) {
                  clearTimeout(rowLeaveTimerRef.current);
                }
                rowLeaveTimerRef.current = setTimeout(() => {
                  if (
                    activeSuggestion?.category === category &&
                    activeSuggestion?.index === index &&
                    !isOverDropdownRef.current
                  ) {
                    setActiveSuggestion(null);
                    setSelectedSuggestionIndex(0);
                  }
                }, 80);
              }}
            >
              {/* Description input with autocomplete */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => updateRow(category, index, 'description', e.target.value)}
                  onFocus={() => handleDescriptionFocus(category, index)}
                  onMouseEnter={() => handleDescriptionFocus(category, index)}
                  onKeyDown={(e) => handleKeyDown(e, category, index, row.description)}
                  onBlur={() => setTimeout(() => setActiveSuggestion(null), 300)}
                  ref={(el) => {
                    if (el) {
                      inputRefs.current.set(`${category}-${index}`, el);
                    }
                  }}
                  placeholder="Description..."
                  className="w-full px-3 py-2 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-400/50 text-sm bg-black/20 text-white placeholder-white/20"
                />

                {/* Suggestions dropdown */}
                {activeSuggestion?.category === category &&
                  activeSuggestion?.index === index && (() => {
                    const filteredSuggestions = getFilteredSuggestions(category, row.description);
                    const suggestionCount = filteredSuggestions.length;

                    // Dynamically size dropdown based on number of suggestions
                    const dropdownMaxHeight = suggestionCount >= 10 ? 'max-h-96' : suggestionCount >= 6 ? 'max-h-64' : 'max-h-48';

                    return (
                      <div
                        className={`absolute z-50 w-full mt-1 bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-md shadow-lg ${dropdownMaxHeight} overflow-auto`}
                        onMouseEnter={() => {
                          isOverDropdownRef.current = true;
                        }}
                        onMouseLeave={() => {
                          isOverDropdownRef.current = false;
                          // Close dropdown when cursor leaves the dropdown
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
                            selectSuggestion(category, index, suggestion);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${
                            i === selectedSuggestionIndex
                              ? 'bg-emerald-500/20 text-white'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span>{suggestion.description}</span>
                          <span className="text-white/50">{formatCurrencyExact(suggestion.amount)}</span>
                        </button>
                      ))}
                      {filteredSuggestions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-white/50">No suggestions</div>
                      )}
                    </div>
                    );
                  })()}
              </div>

              {/* Amount input */}
              <input
                type="text"
                value={row.amount}
                onChange={(e) => handleAmountChange(category, index, e.target.value)}
                onBlur={() => handleAmountFinalize(category, index, row.amount)}
                onKeyDown={(e) => handleAmountKeyDown(e, category, index, row.amount)}
                placeholder="$0"
                className="w-32 px-3 py-2 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-400/50 text-sm text-right bg-black/20 text-white placeholder-white/20"
              />

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeRow(category, index)}
                className="p-2 text-red-400 hover:bg-red-500/20 rounded-md transition-colors border border-white/10 hover:border-red-400/30"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Fee sum at the bottom */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-sm font-semibold text-white uppercase tracking-wide">
            Total
          </span>
          <span className={`text-lg font-bold ${color}`}>
            {formatCurrencyExact(total)}
          </span>
        </div>

        {/* Add row button */}
        <button
          type="button"
          onClick={() => addRow(category)}
          className="w-full px-3 py-2 border border-dashed border-white/20 rounded-md text-sm text-white/60 hover:border-white/40 hover:text-white transition-colors"
        >
          + Add Row
        </button>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>Itemize Fees & Add-ons</h2>
          <button
            type="button"
            onClick={() => {
              handleSave();
              onEditTemplates();
            }}
            className="px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-500/20 rounded-md transition-colors border border-blue-400/30"
          >
            Edit Fee Templates
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
          {/* Dealer Fees Section */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-400/20">
            {renderFeeSection('Dealer Fees', 'dealer', dealerRows, dealerTotal, 'text-blue-400')}
          </div>

          {/* Customer Add-ons Section */}
          <div className="p-4 bg-green-500/10 rounded-lg border border-green-400/20">
            {renderFeeSection('Customer Add-ons', 'customer', customerRows, customerTotal, 'text-green-400')}
          </div>

          {/* Purchase Assumptions / Scenario Panel with keywords */}
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
            {renderPills()}
          {showScenarioPanel && (
            <ScenarioDetectionPanel
              scenarioResult={scenarioResult || null}
              isCalculating={isCalculatingFees}
              onRecalculate={onRecalculateFees}
              taxOverride={{
                taxableBase,
                stateTaxAmount: stateTaxAmount,
                countyTaxAmount: countyTaxAmount,
                stateTaxRate: stateTaxValue,
                countyTaxRate: countyTaxValue,
              }}
            />
          )}
          </div>

          {/* Gov't Fees Section */}
          <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-400/20">
            {renderFeeSection("Gov't Fees", 'gov', govRows, govTotal, 'text-amber-400')}
          </div>

          {/* Tax Rates Section */}
          <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-400/20 space-y-3">
            <h4 className="text-sm font-semibold text-white uppercase tracking-wide">
              Tax Rates
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-emerald-300/80 mb-1">
                  {stateName || 'State'} Tax Rate
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={stateTax}
                    onChange={(e) => handlePercentChange(e.target.value, setStateTax)}
                    placeholder="6.00"
                    className="w-full px-3 py-2 pr-8 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-400/50 text-sm bg-black/20 text-white placeholder-white/20"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/40 pointer-events-none">
                    %
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-emerald-300/80 mb-1">
                  {countyName || 'County'} Tax Rate
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={countyTax}
                    onChange={(e) => handlePercentChange(e.target.value, setCountyTax)}
                    placeholder="1.00"
                    className="w-full px-3 py-2 pr-8 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-400/50 text-sm bg-black/20 text-white placeholder-white/20"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/40 pointer-events-none">
                    %
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Section (on modal background, no card) */}
          <div className="text-white space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide opacity-90">
              Summary
            </h4>

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>Total Dealer Fees</span>
                <span className="font-semibold">{formatCurrencyExact(dealerTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total Customer Add-ons</span>
                <span className="font-semibold">{formatCurrencyExact(customerTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total Gov't Fees</span>
                <span className="font-semibold">{formatCurrencyExact(govTotal)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/20">
                <span>{stateName || 'State'} Tax ({stateRateDisplay}%)</span>
                <span className="font-semibold">{formatCurrencyExact(stateTaxDisplay)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{countyName || 'County'} Tax ({countyRateDisplay}%)</span>
                <span className="font-semibold">{formatCurrencyExact(countyTaxDisplay)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/20">
                <span className="text-base">Total Other Charges</span>
                <span className="text-lg font-bold">{formatCurrencyExact(totalOtherCharges)}</span>
              </div>
            </div>

            <div className="text-xs opacity-75 pt-2">
              * Tax estimate based on typical transaction
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FeesModal;
