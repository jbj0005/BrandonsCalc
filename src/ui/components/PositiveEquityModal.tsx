import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from './';
import { ItemizationCard } from './ItemizationCard';
import { formatCurrencyExact, formatCurrencyInput } from '../../utils/formatters';
import type { EquityDecision } from '../../types';

export interface PositiveEquityModalProps {
  isOpen: boolean;
  onClose: () => void;
  positiveEquity: number;
  onApply: (decision: EquityDecision) => void;
  initialDecision?: EquityDecision;
  // Calculation data for preview
  salePrice: number;
  cashDown: number;
  tradeAllowance: number;
  tradePayoff: number;
  dealerFees: number;
  customerAddons: number;
  stateTaxRate: number;
  countyTaxRate: number;
  stateName?: string;
  countyName?: string;
}

/**
 * PositiveEquityModal - Prompt user to choose how to use positive trade-in equity
 *
 * Options:
 * 1. Apply to unpaid balance (reduces loan)
 * 2. Cash out (receive check, adds to loan)
 * 3. Split between both (slider + input)
 */
export const PositiveEquityModal: React.FC<PositiveEquityModalProps> = ({
  isOpen,
  onClose,
  positiveEquity,
  onApply,
  initialDecision,
  salePrice,
  cashDown,
  tradeAllowance,
  tradePayoff,
  dealerFees,
  customerAddons,
  stateTaxRate,
  countyTaxRate,
  stateName,
  countyName,
}) => {
  const [selectedAction, setSelectedAction] = useState<'apply' | 'cashout' | 'split'>(
    initialDecision?.action || 'apply'
  );
  const [splitPercent, setSplitPercent] = useState(50); // Percentage to cashout
  const [cashoutInput, setCashoutInput] = useState('');

  // Initialize with previous decision if editing
  useEffect(() => {
    if (isOpen && initialDecision) {
      setSelectedAction(initialDecision.action);
      if (initialDecision.action === 'split' && positiveEquity > 0) {
        const percent = Math.round((initialDecision.cashoutAmount / positiveEquity) * 100);
        setSplitPercent(percent);
        setCashoutInput(formatCurrencyInput(initialDecision.cashoutAmount.toFixed(2)));
      }
    }
  }, [isOpen, initialDecision, positiveEquity]);

  // Calculate split amounts
  const cashoutFromPercent = (positiveEquity * splitPercent) / 100;
  const appliedFromPercent = positiveEquity - cashoutFromPercent;

  // Parse cashout input - strip formatting before parsing
  const cleanedInput = cashoutInput.replace(/[^0-9.]/g, '');
  const cashoutFromInput = parseFloat(cleanedInput) || 0;
  const validatedCashoutInput = Math.max(0, Math.min(positiveEquity, cashoutFromInput));
  const appliedFromInput = positiveEquity - validatedCashoutInput;

  // Determine final amounts based on selected action
  let finalCashout = 0;
  let finalApplied = 0;

  if (selectedAction === 'apply') {
    finalCashout = 0;
    finalApplied = positiveEquity;
  } else if (selectedAction === 'cashout') {
    finalCashout = positiveEquity;
    finalApplied = 0;
  } else {
    // Split: use input if valid, otherwise use slider
    if (cashoutInput && !isNaN(cashoutFromInput)) {
      finalCashout = validatedCashoutInput;
      finalApplied = appliedFromInput;
    } else {
      finalCashout = cashoutFromPercent;
      finalApplied = appliedFromPercent;
    }
  }

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percent = parseInt(e.target.value);
    setSplitPercent(percent);
    // Clear input when slider is used
    setCashoutInput('');
  };

  // Handle input change - allow raw input while typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Allow only numbers, dots, and dollar signs while typing
    const cleaned = value.replace(/[^0-9.$]/g, '').replace(/\$/g, '');

    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    const formatted = parts.length > 2
      ? parts[0] + '.' + parts.slice(1).join('')
      : cleaned;

    setCashoutInput(formatted);

    // Update slider to match input
    const parsed = parseFloat(formatted) || 0;
    const validated = Math.max(0, Math.min(positiveEquity, parsed));
    if (positiveEquity > 0) {
      const percent = Math.round((validated / positiveEquity) * 100);
      setSplitPercent(percent);
    }
  };

  // Handle input blur - format as currency when done typing
  const handleInputBlur = () => {
    if (cashoutInput) {
      const cleaned = cashoutInput.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned) || 0;
      const validated = Math.max(0, Math.min(positiveEquity, parsed));

      // Format as currency
      const formatted = formatCurrencyInput(validated.toFixed(2));
      setCashoutInput(formatted);
    }
  };

  // Handle input focus - remove formatting to allow editing
  const handleInputFocus = () => {
    if (cashoutInput) {
      const cleaned = cashoutInput.replace(/[^0-9.]/g, '');
      setCashoutInput(cleaned);
    }
  };

  // Handle key press (Enter to confirm)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur(); // Blur the input to trigger formatting
    }
  };

  // Handle apply button
  const handleApply = () => {
    const decision: EquityDecision = {
      action: selectedAction,
      appliedAmount: finalApplied,
      cashoutAmount: finalCashout,
    };
    onApply(decision);
    onClose();
  };

  // Validation
  const isValid = finalApplied >= 0 && finalCashout >= 0 &&
                  Math.abs((finalApplied + finalCashout) - positiveEquity) < 0.01;

  // Calculate preview values for ItemizationCard
  const previewUnpaidBalance = salePrice - cashDown - finalApplied;

  // Tax calculation (same as in CalculatorApp)
  const taxableBase = (salePrice - finalApplied) + dealerFees + customerAddons;
  const previewStateTaxAmount = taxableBase * (stateTaxRate / 100);
  const previewCountyTaxAmount = Math.min(taxableBase, 5000) * (countyTaxRate / 100);
  const previewTotalTaxes = previewStateTaxAmount + previewCountyTaxAmount;

  const previewAmountFinanced = previewUnpaidBalance + dealerFees + customerAddons + previewTotalTaxes + finalCashout;
  const previewCashDue = cashDown; // Simplified for preview

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mb-2">
            <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 text-3xl">
              🎉
            </span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">
            Great News! You Have Positive Equity
          </h3>
          <div className="text-4xl font-bold text-green-600">
            {formatCurrencyExact(positiveEquity)}
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Your trade-in is worth more than you owe
          </p>
        </div>

        {/* Question */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            How would you like to use this equity?
          </h3>

          <div className="space-y-3">
            {/* Option 1: Apply to Unpaid Balance */}
            <label
              className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedAction === 'apply'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start">
                <input
                  type="radio"
                  name="equity-action"
                  value="apply"
                  checked={selectedAction === 'apply'}
                  onChange={(e) => setSelectedAction(e.target.value as 'apply')}
                  className="mt-1 mr-3 w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Apply to Unpaid Balance</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Reduces your loan amount by {formatCurrencyExact(positiveEquity)}
                  </div>
                </div>
              </div>
            </label>

            {/* Option 2: Cash Out */}
            <label
              className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedAction === 'cashout'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start">
                <input
                  type="radio"
                  name="equity-action"
                  value="cashout"
                  checked={selectedAction === 'cashout'}
                  onChange={(e) => setSelectedAction(e.target.value as 'cashout')}
                  className="mt-1 mr-3 w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Cash Out</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Receive {formatCurrencyExact(positiveEquity)} check from dealer, add to loan
                  </div>
                </div>
              </div>
            </label>

            {/* Option 3: Split */}
            <label
              className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedAction === 'split'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start">
                <input
                  type="radio"
                  name="equity-action"
                  value="split"
                  checked={selectedAction === 'split'}
                  onChange={(e) => setSelectedAction(e.target.value as 'split')}
                  className="mt-1 mr-3 w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 mb-3">Split Between Both</div>

                  {selectedAction === 'split' && (
                    <div className="space-y-4 mt-3">
                      {/* Slider */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-gray-700">
                            {100 - splitPercent}% Apply
                          </span>
                          <span className="text-blue-600 font-medium">
                            {splitPercent}% Cashout
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={splitPercent}
                          onChange={handleSliderChange}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      {/* Or divider */}
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white px-2 text-gray-500">Or enter exact amount</span>
                        </div>
                      </div>

                      {/* Input field */}
                      <div>
                        <Input
                          label="Cashout Amount"
                          type="text"
                          value={cashoutInput}
                          onChange={handleInputChange}
                          onKeyDown={handleKeyDown}
                          onBlur={handleInputBlur}
                          onFocus={handleInputFocus}
                          placeholder="$0"
                          helperText={`Maximum: ${formatCurrencyExact(positiveEquity)}`}
                        />
                      </div>

                      {/* Summary */}
                      <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-700">Applied to Balance:</span>
                          <span className="font-semibold text-green-600">
                            {formatCurrencyExact(finalApplied)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-700">Cash to You:</span>
                          <span className="font-semibold text-blue-600">
                            {formatCurrencyExact(finalCashout)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Preview Itemization */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Preview with Selected Option
          </h3>
          <ItemizationCard
            salePrice={salePrice}
            cashDown={cashDown}
            tradeAllowance={tradeAllowance}
            tradePayoff={tradePayoff}
            dealerFees={dealerFees}
            customerAddons={customerAddons}
            stateTaxRate={stateTaxRate}
            countyTaxRate={countyTaxRate}
            stateTaxAmount={previewStateTaxAmount}
            countyTaxAmount={previewCountyTaxAmount}
            totalTaxes={previewTotalTaxes}
            unpaidBalance={previewUnpaidBalance}
            amountFinanced={previewAmountFinanced}
            cashDue={previewCashDue}
            stateName={stateName}
            countyName={countyName}
            tradeInApplied={finalApplied}
            tradeInCashout={finalCashout}
            cashoutAmount={finalCashout > 0 ? finalCashout : undefined}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            disabled={!isValid}
            fullWidth
          >
            Apply Selection
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PositiveEquityModal;
