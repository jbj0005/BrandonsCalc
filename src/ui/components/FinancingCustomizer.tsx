import React, { useState } from 'react';
import { formatCurrencyExact } from '../../utils/formatters';

export interface PayUpfrontState {
  salesTax: boolean;
  otherCharges: boolean;
  negativeEquity: boolean;
  roundFinanced: boolean;
}

export interface FinancingCustomizerProps {
  payUpfront: PayUpfrontState;
  onToggle: (key: keyof PayUpfrontState) => void;

  // Amounts for each toggle
  salesTaxAmount: number;
  otherChargesAmount: number;
  negativeEquityAmount: number;

  // Rounding info
  rawAmountFinanced: number; // Before rounding
  roundedAmountFinanced: number; // After rounding
  roundingAdjustment: number; // Difference (positive = pay upfront, negative = finance more)

  // Visibility controls
  hasNegativeEquity: boolean;

  // For monthly payment impact calculation
  monthlyPayment?: number;
  apr?: number;
  loanTerm?: number;
}

/**
 * FinancingCustomizer - Expandable panel for moving costs to Cash Due at Signing
 *
 * Features:
 * - Collapsible section with smooth animation
 * - Toggle switches for Sales Tax, Other Charges, Negative Equity
 * - Round Amount Financed to nearest $1,000
 * - Shows impact amounts for each toggle
 */
// Helper to calculate monthly payment for a given principal
const calculateMonthlyPayment = (principal: number, apr: number, termMonths: number): number => {
  if (principal <= 0 || apr <= 0 || termMonths <= 0) return 0;
  const monthlyRate = apr / 100 / 12;
  return (principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))) /
         (Math.pow(1 + monthlyRate, termMonths) - 1);
};

export const FinancingCustomizer: React.FC<FinancingCustomizerProps> = ({
  payUpfront,
  onToggle,
  salesTaxAmount,
  otherChargesAmount,
  negativeEquityAmount,
  rawAmountFinanced,
  roundedAmountFinanced,
  roundingAdjustment,
  hasNegativeEquity,
  monthlyPayment,
  apr,
  loanTerm,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate monthly payment savings for each toggle option
  const canCalculateSavings = monthlyPayment !== undefined && apr !== undefined && loanTerm !== undefined && apr > 0 && loanTerm > 0;

  // Calculate what the payment would be if we reduced the principal by each amount
  const calculateSavings = (reductionAmount: number): number => {
    if (!canCalculateSavings || reductionAmount <= 0) return 0;
    // Current financed amount (use raw if rounding is off, rounded if on)
    const currentPrincipal = payUpfront.roundFinanced ? roundedAmountFinanced : rawAmountFinanced;
    const newPrincipal = currentPrincipal - reductionAmount;
    if (newPrincipal <= 0) return monthlyPayment!;
    const newPayment = calculateMonthlyPayment(newPrincipal, apr!, loanTerm!);
    return monthlyPayment! - newPayment;
  };

  // Monthly savings for each option (only if not already toggled on)
  const salesTaxSavings = !payUpfront.salesTax ? calculateSavings(salesTaxAmount) : 0;
  const otherChargesSavings = !payUpfront.otherCharges ? calculateSavings(otherChargesAmount) : 0;
  const negativeEquitySavings = !payUpfront.negativeEquity ? calculateSavings(negativeEquityAmount) : 0;
  const roundingSavings = !payUpfront.roundFinanced && roundingAdjustment > 0 ? calculateSavings(roundingAdjustment) : 0;

  // Count active toggles
  const activeCount = [
    payUpfront.salesTax,
    payUpfront.otherCharges,
    payUpfront.negativeEquity && hasNegativeEquity,
    payUpfront.roundFinanced,
  ].filter(Boolean).length;

  // Calculate total moved to cash due
  const totalMovedToCashDue =
    (payUpfront.salesTax ? salesTaxAmount : 0) +
    (payUpfront.otherCharges ? otherChargesAmount : 0) +
    (payUpfront.negativeEquity && hasNegativeEquity ? negativeEquityAmount : 0) +
    (payUpfront.roundFinanced ? roundingAdjustment : 0);

  return (
    <div className="mt-2">
      {/* Expandable Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-lg
                   bg-gradient-to-r from-slate-800/50 to-slate-900/50
                   border border-white/10 hover:border-white/20
                   transition-all duration-200 group"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
            Customize Financing
          </span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {activeCount} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {totalMovedToCashDue > 0 && (
            <span className="text-sm text-green-400 font-medium">
              +{formatCurrencyExact(totalMovedToCashDue)} to cash due
            </span>
          )}
          {totalMovedToCashDue < 0 && (
            <span className="text-sm text-blue-400 font-medium">
              {formatCurrencyExact(totalMovedToCashDue)} from cash due
            </span>
          )}
          <svg
            className={`w-5 h-5 text-white/50 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-96 opacity-100 mt-2' : 'max-h-0 opacity-0'
      }`}>
        <div className="px-4 py-4 rounded-lg bg-slate-900/50 border border-white/10 space-y-4">
          {/* Section Label */}
          <div className="text-xs uppercase tracking-wider text-white/40 font-medium">
            Pay at Signing Instead of Financing
          </div>

          {/* Toggle Options */}
          <div className="space-y-3">
            {/* Sales Tax Toggle */}
            <ToggleOption
              label="Sales Tax"
              amount={salesTaxAmount}
              isActive={payUpfront.salesTax}
              onToggle={() => onToggle('salesTax')}
              disabled={salesTaxAmount === 0}
              monthlySavings={salesTaxSavings}
            />

            {/* Other Charges Toggle */}
            <ToggleOption
              label="Other Charges (Fees)"
              amount={otherChargesAmount}
              isActive={payUpfront.otherCharges}
              onToggle={() => onToggle('otherCharges')}
              disabled={otherChargesAmount === 0}
              monthlySavings={otherChargesSavings}
            />

            {/* Negative Equity Toggle - Only show when applicable */}
            {hasNegativeEquity && (
              <ToggleOption
                label="Negative Equity"
                amount={negativeEquityAmount}
                isActive={payUpfront.negativeEquity}
                onToggle={() => onToggle('negativeEquity')}
                monthlySavings={negativeEquitySavings}
              />
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-white/10"></div>

          {/* Rounding Section */}
          <div className="text-xs uppercase tracking-wider text-white/40 font-medium">
            Round Loan Amount
          </div>

          <div className="space-y-2">
            <ToggleOption
              label="Round to Nearest $1,000"
              amount={Math.abs(roundingAdjustment)}
              isActive={payUpfront.roundFinanced}
              onToggle={() => onToggle('roundFinanced')}
              disabled={rawAmountFinanced <= 0}
              showSign={roundingAdjustment !== 0}
              isPositive={roundingAdjustment > 0}
              monthlySavings={roundingSavings}
            />

            {/* Rounding Preview */}
            {payUpfront.roundFinanced && rawAmountFinanced > 0 && (
              <div className="ml-12 text-sm text-white/60">
                <span className="line-through text-white/40">
                  {formatCurrencyExact(rawAmountFinanced)}
                </span>
                <span className="mx-2">→</span>
                <span className="text-white font-medium">
                  {formatCurrencyExact(roundedAmountFinanced)}
                </span>
                {roundingAdjustment !== 0 && (
                  <span className={`ml-2 ${roundingAdjustment > 0 ? 'text-green-400' : 'text-blue-400'}`}>
                    ({roundingAdjustment > 0 ? '+' : ''}{formatCurrencyExact(roundingAdjustment)} {roundingAdjustment > 0 ? 'to cash due' : 'financed'})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Toggle Option Sub-component
interface ToggleOptionProps {
  label: string;
  amount: number;
  isActive: boolean;
  onToggle: () => void;
  disabled?: boolean;
  showSign?: boolean;
  isPositive?: boolean;
  monthlySavings?: number; // Monthly payment reduction when this option is enabled
}

const ToggleOption: React.FC<ToggleOptionProps> = ({
  label,
  amount,
  isActive,
  onToggle,
  disabled = false,
  showSign = true,
  isPositive = true,
  monthlySavings = 0,
}) => {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200
                  ${disabled
                    ? 'opacity-40 cursor-not-allowed bg-slate-800/30'
                    : isActive
                      ? 'bg-green-500/10 border border-green-500/30 hover:bg-green-500/20'
                      : 'bg-slate-800/50 border border-white/5 hover:border-white/20'
                  }`}
    >
      <div className="flex items-center gap-3">
        {/* Toggle Circle */}
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200
                        ${isActive
                          ? 'border-green-400 bg-green-400'
                          : 'border-white/30'
                        }`}>
          {isActive && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-white/70'}`}>
          {label}
        </span>
      </div>

      {/* Amount and Monthly Savings */}
      <div className="flex items-center gap-3">
        {/* Monthly Payment Savings - only show when not active (as preview) */}
        {monthlySavings > 0 && !isActive && !disabled && (
          <span className="text-xs font-medium text-emerald-400">
            -${monthlySavings.toFixed(0)}/mo
          </span>
        )}

        {/* Cash Due Amount */}
        {amount > 0 && (
          <span className={`text-sm font-semibold ${
            isActive
              ? (showSign && isPositive ? 'text-green-400' : 'text-blue-400')
              : 'text-white/50'
          }`}>
            {showSign && isPositive ? '+' : ''}{formatCurrencyExact(amount)}
          </span>
        )}
      </div>
    </button>
  );
};

export default FinancingCustomizer;
