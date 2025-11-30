import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { FeeItem, FeeCategory, FeeSuggestion } from '../../types/fees';
import { fetchFeeSuggestions, FEE_TEMPLATES_UPDATED_EVENT } from '../../services/feeSuggestionsService';
import { formatCurrencyExact, parseCurrency, formatCurrencyInput } from '../../utils/formatters';
import { ScenarioDetectionPanelV2 } from './ScenarioDetectionPanelV2';
import { GovFeesSection } from './GovFeesSection';
import { ModernFeeSection } from './ModernFeeSection';
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
  vehicleWeightLbs?: number; // Selected bracket value
  vehicleBodyType?: string;
  estimatedWeight?: number; // Raw NHTSA/GVWR estimated weight
  weightSource?: string; // 'nhtsa_exact' | 'gvwr_derived' | 'manual' | 'manual_required'
  onVehicleMetaChange?: (meta: { weightLbs?: number; bodyType?: string }) => void;
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
  vehicleWeightLbs,
  vehicleBodyType,
  estimatedWeight,
  weightSource,
  onVehicleMetaChange,
}) => {
  const [showAssumptionsModal, setShowAssumptionsModal] = useState(false);
  // Fee rows state
  const [dealerRows, setDealerRows] = useState<FeeRow[]>([]);
  const [customerRows, setCustomerRows] = useState<FeeRow[]>([]);
  const [govRows, setGovRows] = useState<FeeRow[]>([]);

  // Tax rate state
  const [stateTax, setStateTax] = useState<string>('');
  const [countyTax, setCountyTax] = useState<string>('');
  const [autoComputeGov, setAutoComputeGov] = useState(
    scenarioOverrides?.enabled !== false
  );

  useEffect(() => {
    setAutoComputeGov(scenarioOverrides?.enabled !== false);
  }, [scenarioOverrides?.enabled]);

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

  // Ref for dropdown containers (to detect clicks outside)
  const dropdownRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  // Track if we've initialized for current modal session
  const initializedRef = useRef(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!activeSuggestion) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      const key = `${activeSuggestion.category}-${activeSuggestion.index}`;
      const dropdownEl = dropdownRefs.current.get(key);
      const inputEl = inputRefs.current.get(key);

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
  }, [activeSuggestion]);

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

    console.log('[FeesModal] handleTogglePill called:', {
      key,
      currentOverrides: scenarioOverrides,
      nextOverrides: next,
    });

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
        // Toggle includeTradeIn
        next.includeTradeIn = !next.includeTradeIn;

        // COUPLING: When trade-in is included, automatically enable Tag Transfer
        if (next.includeTradeIn && hasTradeIn) {
          next.tagMode = 'transfer_existing_plate';
        }
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
    console.log('[FeesModal] Scenario overrides updated. Fee engine should recalculate automatically.');
    // Note: Fee recalculation happens automatically via useFeeEngine hook when scenarioOverrides changes
  };

  const renderPills = () => {
    const pills = [
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

    const isAutoEnabled = scenarioOverrides?.enabled !== false;

    return (
      <div className="space-y-4">
        {/* Auto Calculate Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div>
            <div className="text-sm font-medium text-white">Auto Calculate Government Fees</div>
            <div className="text-xs text-white/50 mt-0.5">
              {isAutoEnabled ? 'Fees calculated automatically based on purchase details' : 'Enter custom government fees manually'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleTogglePill('enabled')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isAutoEnabled ? 'bg-emerald-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isAutoEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Scenario Keywords */}
        {isAutoEnabled && (
          <div className="space-y-2">
            <div className="text-sm text-white/70">
              Select keywords to adjust your purchase details:
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
        )}
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

  // Sync govRows when fee engine recalculates (auto mode only)
  useEffect(() => {
    if (!isOpen || !initializedRef.current) return;
    // Only sync when auto mode is enabled
    if (scenarioOverrides?.enabled === false) return;

    const govSource = initialGovtFees ?? [];
    setGovRows(
      govSource.length > 0
        ? govSource.map((f) => ({
            description: f.description,
            amount: formatCurrencyExact(f.amount),
          }))
        : [{ description: '', amount: '' }]
    );
  }, [isOpen, initialGovtFees, scenarioOverrides?.enabled]);

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
    color: string,
    disabled?: boolean
  ) => {
    return (
      <div
        className={`space-y-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
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
                  disabled={disabled}
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
                        ref={(el) => {
                          if (el) {
                            dropdownRefs.current.set(`${category}-${index}`, el);
                          }
                        }}
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
                disabled={disabled}
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
                disabled={disabled}
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
          disabled={disabled}
          className="w-full px-3 py-2 border border-dashed border-white/20 rounded-md text-sm text-white/60 hover:border-white/40 hover:text-white transition-colors"
        >
          + Add Row
        </button>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6 space-y-6 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 pr-4">
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>Itemize Fees & Add-ons</h2>
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                handleSave();
                onEditTemplates();
              }}
              className="px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-500/20 rounded-md transition-colors border border-blue-400/30 whitespace-nowrap"
            >
              Edit Fee Templates
            </button>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-4">
          {/* Dealer Fees Section */}
          <ModernFeeSection
            title="Dealer Fees"
            category="dealer"
            fees={dealerRows}
            total={dealerTotal}
            onAddFee={() => addRow('dealer')}
            onRemoveFee={(index) => removeRow('dealer', index)}
            onUpdateFee={(index, field, value) => updateRow('dealer', index, field, value)}
            suggestions={dealerSuggestions}
            onSuggestionSelect={(index, suggestion) => selectSuggestion('dealer', index, suggestion)}
            inputRefs={inputRefs}
            onDescriptionFocus={handleDescriptionFocus}
            onDescriptionKeyDown={handleKeyDown}
            onDescriptionBlur={() => setTimeout(() => setActiveSuggestion(null), 300)}
            onSectionMouseLeave={() => {
              if (activeCategoryRef.current === 'dealer') {
                cleanupEmptyLastRow('dealer');
                activeCategoryRef.current = null;
              }
            }}
          />

          {/* Customer Add-ons Section */}
          <ModernFeeSection
            title="Customer Add-ons"
            category="customer"
            fees={customerRows}
            total={customerTotal}
            onAddFee={() => addRow('customer')}
            onRemoveFee={(index) => removeRow('customer', index)}
            onUpdateFee={(index, field, value) => updateRow('customer', index, field, value)}
            suggestions={customerSuggestions}
            onSuggestionSelect={(index, suggestion) => selectSuggestion('customer', index, suggestion)}
            inputRefs={inputRefs}
            onDescriptionFocus={handleDescriptionFocus}
            onDescriptionKeyDown={handleKeyDown}
            onDescriptionBlur={() => setTimeout(() => setActiveSuggestion(null), 300)}
            onSectionMouseLeave={() => {
              if (activeCategoryRef.current === 'customer') {
                cleanupEmptyLastRow('customer');
                activeCategoryRef.current = null;
              }
            }}
          />

          {/* Gov't Fees Section */}
          <ModernFeeSection
            title="Government Fees"
            category="gov"
            fees={govRows}
            total={govTotal}
            autoModeEnabled={autoComputeGov}
            onToggleAutoMode={(enabled) => {
              setAutoComputeGov(enabled);
              if (onScenarioOverridesChange) {
                onScenarioOverridesChange({
                  ...(scenarioOverrides || {}),
                  enabled: enabled,
                });
              }
              if (!enabled) {
                // Clear gov rows for manual entry
                setGovRows([{ description: '', amount: '' }]);
              } else {
                // Restore gov rows from initial props when re-enabling auto
                setGovRows(
                  (initialGovtFees ?? []).map((f) => ({
                    description: f.description,
                    amount: formatCurrencyExact(f.amount),
                  }))
                );
              }
            }}
            onViewDetails={() => setShowAssumptionsModal(true)}
            onAddFee={() => addRow('gov')}
            onRemoveFee={(index) => removeRow('gov', index)}
            onUpdateFee={(index, field, value) => updateRow('gov', index, field, value)}
            suggestions={govSuggestions}
            onSuggestionSelect={(index, suggestion) => selectSuggestion('gov', index, suggestion)}
            inputRefs={inputRefs}
            onDescriptionFocus={handleDescriptionFocus}
            onDescriptionKeyDown={handleKeyDown}
            onDescriptionBlur={() => setTimeout(() => setActiveSuggestion(null), 300)}
            onSectionMouseLeave={() => {
              if (activeCategoryRef.current === 'gov') {
                cleanupEmptyLastRow('gov');
                activeCategoryRef.current = null;
              }
            }}
          />

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

      {/* Purchase Assumptions Modal (simplified) */}
      <Modal isOpen={showAssumptionsModal} onClose={() => setShowAssumptionsModal(false)} size="lg" isNested>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-xl font-semibold text-white">Purchase Assumptions</h3>
            <p className="text-sm text-white/70">
              Keywords and detected inputs driving your gov't fee calculation.
            </p>
          </div>
          <div className="space-y-4">
            {/* Keywords only (no auto calc toggle - already in parent modal) */}
            {scenarioOverrides?.enabled !== false && (
              <div className="space-y-2">
                <div className="text-sm text-white/70">
                  Select keywords to adjust your purchase details:
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      key: 'cashPurchase' as const,
                      label: 'Cash Purchase',
                      active: scenarioOverrides?.cashPurchase || false,
                    },
                    {
                      key: 'includeTradeIn' as const,
                      label: 'Include Trade-In',
                      active: scenarioOverrides?.includeTradeIn !== false,
                      disabled: !hasTradeIn,
                    },
                    {
                      key: 'tag_new' as const,
                      label: 'New Tag',
                      active: scenarioOverrides?.tagMode === 'new_plate',
                      disabled: hasTradeIn,
                    },
                    {
                      key: 'tag_transfer' as const,
                      label: 'Tag Transfer',
                      active: scenarioOverrides?.tagMode === 'transfer_existing_plate',
                    },
                    {
                      key: 'firstTimeRegistration' as const,
                      label: 'First-Time FL Reg',
                      active: scenarioOverrides?.firstTimeRegistration || false,
                    },
                  ].map((pill) => (
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
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Vehicle meta for gov fees */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">
                  Vehicle type
                </label>
                <select
                  value={vehicleBodyType || 'auto'}
                  onChange={(e) => onVehicleMetaChange?.({ bodyType: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40"
                >
                  <option value="auto">Auto / SUV / Crossover</option>
                  <option value="truck">Truck / Pickup</option>
                  <option value="van">Van</option>
                  <option value="other">Other</option>
                </select>
                <p className="text-xs text-white/50">
                  Trucks/pickups/vans use the higher Florida weight brackets.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">
                  Weight bracket
                </label>
                {/* Show estimated weight if available */}
                {estimatedWeight && weightSource && weightSource !== 'manual_required' && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white/60">Computed:</span>
                    <span className="text-white font-medium">~{estimatedWeight.toLocaleString()} lbs</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      weightSource === 'nhtsa_exact'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {weightSource === 'nhtsa_exact' ? 'NHTSA' : 'Est. from GVWR'}
                    </span>
                  </div>
                )}
                <select
                  value={vehicleWeightLbs ?? ''}
                  onChange={(e) => {
                    onVehicleMetaChange?.({
                      weightLbs: e.target.value ? Number(e.target.value) : undefined,
                    });
                  }}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40"
                >
                  <option value="">Select weight bracket</option>
                  {(vehicleBodyType === 'truck' || vehicleBodyType === 'van'
                    ? [
                        { label: 'Up to 1,999 lbs — $14.50', value: 1999 },
                        { label: '2,000 – 3,000 lbs — $22.50', value: 3000 },
                        { label: '3,001 – 5,000 lbs — $32.50', value: 5000 },
                        { label: '5,001 – 5,999 lbs — $60.75', value: 5999 },
                        { label: '6,000 – 7,999 lbs — $87.75', value: 7999 },
                        { label: '8,000 – 9,999 lbs — $103', value: 9999 },
                        { label: '10,000 – 14,999 lbs — $118', value: 14999 },
                        { label: '15,000 – 19,999 lbs — $177', value: 19999 },
                        { label: '20,000 – 26,000 lbs — $251', value: 26000 },
                        { label: '26,001 – 34,999 lbs — $324', value: 34999 },
                        { label: '35,000 – 43,999 lbs — $405', value: 43999 },
                        { label: '44,000 – 54,999 lbs — $773', value: 54999 },
                        { label: '55,000 – 61,999 lbs — $916', value: 61999 },
                        { label: '62,000 – 71,999 lbs — $1,080', value: 71999 },
                        { label: '72,000+ lbs — $1,322', value: 72000 },
                      ]
                    : [
                        { label: 'Up to 2,499 lbs — $14.50', value: 2499 },
                        { label: '2,500 – 3,499 lbs — $22.50', value: 3499 },
                        { label: '3,500+ lbs — $32.50', value: 3500 },
                      ]
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-white/50">
                  {estimatedWeight
                    ? 'Bracket auto-selected based on computed weight. Change if needed.'
                    : 'Select weight bracket for FL registration fee calculation.'}
                </p>
              </div>
            </div>

            {/* Weight Calculation Explanation */}
            {(estimatedWeight || vehicleWeightLbs) && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <h4 className="font-semibold text-white">Weight Calculation</h4>
                </div>
                <div className="space-y-3 text-sm">
                  {estimatedWeight && weightSource && (
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${
                        weightSource === 'nhtsa_exact' ? 'bg-emerald-500' :
                        weightSource === 'gvwr_derived' ? 'bg-amber-500' : 'bg-blue-500'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium">
                            {estimatedWeight.toLocaleString()} lbs
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            weightSource === 'nhtsa_exact'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : weightSource === 'gvwr_derived'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {weightSource === 'nhtsa_exact' ? 'NHTSA Verified' :
                             weightSource === 'gvwr_derived' ? 'GVWR Estimate' : 'Manual Entry'}
                          </span>
                        </div>
                        <p className="text-white/50 text-xs mt-1">
                          {weightSource === 'nhtsa_exact'
                            ? 'Curb weight from NHTSA Vehicle Product Information Catalog (vPIC)'
                            : weightSource === 'gvwr_derived'
                            ? 'Estimated at ~70% of Gross Vehicle Weight Rating (typical curb weight ratio)'
                            : 'Manually entered weight value'}
                        </p>
                      </div>
                    </div>
                  )}
                  {vehicleWeightLbs && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 bg-blue-400" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white/70">FL Fee Bracket:</span>
                          <span className="text-white font-medium">
                            {vehicleBodyType === 'truck' || vehicleBodyType === 'van' ? (
                              vehicleWeightLbs <= 1999 ? 'Up to 1,999 lbs' :
                              vehicleWeightLbs <= 3000 ? '2,000 – 3,000 lbs' :
                              vehicleWeightLbs <= 5000 ? '3,001 – 5,000 lbs' :
                              vehicleWeightLbs <= 5999 ? '5,001 – 5,999 lbs' :
                              vehicleWeightLbs <= 7999 ? '6,000 – 7,999 lbs' :
                              vehicleWeightLbs <= 9999 ? '8,000 – 9,999 lbs' :
                              `${vehicleWeightLbs.toLocaleString()}+ lbs`
                            ) : (
                              vehicleWeightLbs <= 2499 ? 'Up to 2,499 lbs' :
                              vehicleWeightLbs <= 3499 ? '2,500 – 3,499 lbs' :
                              '3,500+ lbs'
                            )}
                          </span>
                        </div>
                        <p className="text-white/50 text-xs mt-1">
                          Using Florida {vehicleBodyType === 'truck' || vehicleBodyType === 'van' ? 'Truck/Van' : 'Auto/SUV'} registration fee schedule
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-white/40">
                    <strong className="text-white/60">How it works:</strong> Florida registration fees vary by vehicle weight.
                    We automatically look up your vehicle's weight from NHTSA data and select the appropriate fee bracket.
                    {!estimatedWeight && ' Select a bracket above or enter your VIN for automatic lookup.'}
                  </p>
                </div>
              </div>
            )}

            {/* Purchase Assumptions Summary */}
            {showScenarioPanel && scenarioResult && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-900/30 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Purchase Assumptions</h4>
                      <p className="text-sm text-white/60">
                        {scenarioResult.detectedScenario.isFinanced ? 'Financed' : 'Cash'} purchase
                        {scenarioResult.detectedScenario.isTagTransfer && ' · Tag transfer'}
                        {scenarioResult.detectedScenario.tagMode === 'new_plate' && ' · New tag'}
                      </p>
                    </div>
                  </div>
                  {/* Weight assumption note */}
                  {estimatedWeight && weightSource && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-white/50">Vehicle weight:</span>
                        <span className="text-white">~{estimatedWeight.toLocaleString()} lbs</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          weightSource === 'nhtsa_exact'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : weightSource === 'gvwr_derived'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {weightSource === 'nhtsa_exact' ? 'NHTSA verified' :
                           weightSource === 'gvwr_derived' ? 'Estimated from GVWR' : 'Manual'}
                        </span>
                      </div>
                      {weightSource === 'gvwr_derived' && (
                        <p className="text-xs text-white/40 mt-1">
                          Based on ~70% of max vehicle capacity. Adjust bracket above if needed.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Total Gov Fees Card */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 to-blue-900/30 border border-blue-500/20">
                  <div className="text-xs font-medium text-blue-400 uppercase tracking-wide mb-1">
                    Total Gov Fees
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {formatCurrencyExact(scenarioResult.totals.governmentFees)}
                  </div>
                </div>
              </div>
            )}

            {/* Calculating State */}
            {isCalculatingFees && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-950/30 border border-blue-500/20">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-blue-300 font-medium">
                  Calculating government fees...
                </span>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </Modal>
  );
};

export default FeesModal;
