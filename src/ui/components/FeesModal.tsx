import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { FeeItem, FeeCategory, FeeSuggestion } from '../../types/fees';
import { fetchFeeSuggestions, FEE_TEMPLATES_UPDATED_EVENT } from '../../services/feeSuggestionsService';
import { formatCurrencyExact, parseCurrency, formatCurrencyInput } from '../../utils/formatters';

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
  onSave: (data: {
    dealerFees: FeeItem[];
    customerAddons: FeeItem[];
    govtFees: FeeItem[];
    stateTaxRate: number;
    countyTaxRate: number;
    userTaxOverride: boolean;
  }) => void;
  onEditTemplates: () => void;
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
  onSave,
  onEditTemplates,
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
    const formatted = value ? formatCurrencyInput(value) : '';
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

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      initializedRef.current = true;

      const dealerSource = initialDealerFees ?? [];
      setDealerRows(
        dealerSource.length > 0
          ? dealerSource.map((f) => ({
              description: f.description,
              amount: formatCurrencyInput(f.amount.toString()),
            }))
          : [{ description: '', amount: '' }]
      );

      const customerSource = initialCustomerAddons ?? [];
      setCustomerRows(
        customerSource.length > 0
          ? customerSource.map((f) => ({
              description: f.description,
              amount: formatCurrencyInput(f.amount.toString()),
            }))
          : [{ description: '', amount: '' }]
      );

      const govSource = initialGovtFees ?? [];
      setGovRows(
        govSource.length > 0
          ? govSource.map((f) => ({
              description: f.description,
              amount: formatCurrencyInput(f.amount.toString()),
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

  // For tax calculation estimate (assuming $50k sale price minus $5k down as rough estimate)
  const estimatedTaxBase = 45000 + dealerTotal + customerTotal + govTotal;

  // Calculate state tax on full base
  const estimatedStateTax = estimatedTaxBase * (stateTaxValue / 100);

  // Calculate county tax with $5k cap on base
  const countyTaxBase = Math.min(estimatedTaxBase, 5000);
  const estimatedCountyTax = countyTaxBase * (countyTaxValue / 100);

  // Total taxes
  const estimatedTaxes = estimatedStateTax + estimatedCountyTax;

  const totalOtherCharges = dealerTotal + customerTotal + govTotal + estimatedTaxes;

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
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            {title}
          </h4>
        </div>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />

                {/* Suggestions dropdown */}
                {activeSuggestion?.category === category &&
                  activeSuggestion?.index === index && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto">
                      {getFilteredSuggestions(category, row.description).map((suggestion, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSuggestion(category, index, suggestion);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${
                            i === selectedSuggestionIndex
                              ? 'bg-blue-100 text-blue-900'
                              : 'hover:bg-blue-50'
                          }`}
                        >
                          <span>{suggestion.description}</span>
                          <span className="text-gray-500">{formatCurrencyExact(suggestion.amount)}</span>
                        </button>
                      ))}
                      {getFilteredSuggestions(category, row.description).length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>
                      )}
                    </div>
                  )}
              </div>

              {/* Amount input */}
              <input
                type="text"
                value={row.amount}
                onChange={(e) => handleAmountChange(category, index, e.target.value)}
                onBlur={() => handleAmountFinalize(category, index, row.amount)}
                onKeyDown={(e) => handleAmountKeyDown(e, category, index, row.amount)}
                placeholder="$0"
                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-right"
              />

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeRow(category, index)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Fee sum at the bottom */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-300">
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
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
          className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
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
          <h2 className="text-2xl font-bold text-gray-900">Itemize Fees & Add-ons</h2>
          <button
            type="button"
            onClick={onEditTemplates}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            Edit Fee Templates
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
          {/* Dealer Fees Section */}
          <div className="p-4 bg-blue-50 rounded-lg">
            {renderFeeSection('Dealer Fees', 'dealer', dealerRows, dealerTotal, 'text-blue-600')}
          </div>

          {/* Customer Add-ons Section */}
          <div className="p-4 bg-green-50 rounded-lg">
            {renderFeeSection('Customer Add-ons', 'customer', customerRows, customerTotal, 'text-green-600')}
          </div>

          {/* Gov't Fees Section */}
          <div className="p-4 bg-amber-50 rounded-lg">
            {renderFeeSection("Gov't Fees", 'gov', govRows, govTotal, 'text-amber-600')}
          </div>

          {/* Tax Rates Section */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Tax Rates
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {stateName || 'State'} Tax Rate (%)
                </label>
                <input
                  type="text"
                  value={stateTax}
                  onChange={(e) => handlePercentChange(e.target.value, setStateTax)}
                  placeholder="6.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {countyName || 'County'} Tax Rate (%)
                </label>
                <input
                  type="text"
                  value={countyTax}
                  onChange={(e) => handlePercentChange(e.target.value, setCountyTax)}
                  placeholder="1.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Summary Section */}
          <div className="p-4 bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg text-white space-y-2">
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
                <span>{stateName || 'State'} Tax ({stateTaxValue.toFixed(2)}%)</span>
                <span className="font-semibold">{formatCurrencyExact(estimatedStateTax)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{countyName || 'County'} Tax ({countyTaxValue.toFixed(2)}%)</span>
                <span className="font-semibold">{formatCurrencyExact(estimatedCountyTax)}</span>
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
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
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
