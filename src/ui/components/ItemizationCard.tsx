import React from 'react';
import { formatCurrencyExact, formatNegativeParens, formatCurrencyRounded } from '../../utils/formatters';
import { Switch } from './Switch';
import { Badge } from './Badge';
import { CurrencyInput } from './CurrencyInput';
import { EnhancedControl } from './EnhancedControl';

export interface ItemizationCardProps {
  salePrice: number;
  cashDown: number;
  tradeAllowance: number;
  tradePayoff: number;
  dealerFees: number;
  customerAddons: number;
  govtFees: number;
  stateTaxRate: number;
  countyTaxRate: number;
  stateTaxAmount: number;
  countyTaxAmount: number;
  totalTaxes: number;
  unpaidBalance: number;
  amountFinanced: number;
  cashDue: number;
  stateName?: string;
  countyName?: string;
  // Positive equity handling
  tradeInApplied?: number;
  tradeInCashout?: number;
  cashoutAmount?: number;
  // onChange handlers for editable fields
  onSalePriceChange?: (value: number) => void;
  onCashDownChange?: (value: number) => void;
  onTradeAllowanceChange?: (value: number) => void;
  onTradePayoffChange?: (value: number) => void;
  onDealerFeesChange?: (value: number) => void;
  onCustomerAddonsChange?: (value: number) => void;
  onGovtFeesChange?: (value: number) => void;
  onTradeInCashoutChange?: (value: number) => void;
  // Loan terms and payment
  apr?: number;
  loanTerm?: number;
  monthlyPayment?: number;
  baselineMonthlyPayment?: number;
  aprBaselinePayment?: number;
  aprPaymentDiffOverride?: number | null;
  onAprChange?: (value: number) => void;
  onTermChange?: (value: number) => void;
  /** Hide the built-in header when a parent renders its own */
  showHeader?: boolean;
}

/**
 * ItemizationCard - Detailed cost breakdown showing path from Sale Price to Amount Financed
 *
 * Features:
 * - PLUS/LESS sections with blue vertical bars
 * - Indented sub-items
 * - Negative equity shown with parentheses
 * - Tax rates with "Using default" labels
 * - Dark footer for AMOUNT FINANCED
 * - Green footer for Cash Due at Signing
 * - Exact values with 2 decimal places
 */
export const ItemizationCard: React.FC<ItemizationCardProps> = ({
  salePrice,
  cashDown,
  tradeAllowance,
  tradePayoff,
  dealerFees,
  customerAddons,
  govtFees,
  stateTaxRate,
  countyTaxRate,
  stateTaxAmount,
  countyTaxAmount,
  totalTaxes,
  unpaidBalance,
  amountFinanced,
  cashDue,
  stateName,
  countyName,
  tradeInApplied,
  tradeInCashout,
  cashoutAmount,
  onSalePriceChange,
  onCashDownChange,
  onTradeAllowanceChange,
  onTradePayoffChange,
  onDealerFeesChange,
  onCustomerAddonsChange,
  onGovtFeesChange,
  onTradeInCashoutChange,
  apr,
  loanTerm,
  monthlyPayment,
  baselineMonthlyPayment,
  aprBaselinePayment,
  aprPaymentDiffOverride,
  onAprChange,
  onTermChange,
  showHeader = true,
}) => {
  const netTradeIn = tradeAllowance - tradePayoff;
  const otherCharges = dealerFees + customerAddons + govtFees;
  const hasPositiveEquity = netTradeIn > 0;
  const hasSplitEquity = hasPositiveEquity &&
                         tradeInApplied !== undefined &&
                         tradeInCashout !== undefined &&
                         (tradeInApplied > 0 || tradeInCashout > 0);

  return (
    <div className="space-y-4">
      {/* Header with Payment Controls */}
      {showHeader && (
        <div className="space-y-3">
          <h3 className="text-2xl font-bold text-white">Itemization of Costs</h3>
        </div>
      )}

      {/* Breakdown Card */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-lg relative">
        <div className="space-y-3">
          {/* Sale Price */}
          <div className="flex items-center justify-between border-l-4 border-blue-400 pl-4 bg-blue-500/10 py-2 rounded-r-lg">
            <span className="text-base font-semibold text-white">Sale Price</span>
            {onSalePriceChange ? (
              <CurrencyInput
                value={salePrice}
                onChange={onSalePriceChange}
                className="text-base font-bold text-white w-40"
                autoFocus
              />
            ) : (
              <span className="text-base font-bold text-white">
                {formatCurrencyExact(salePrice)}
              </span>
            )}
          </div>

          {/* LESS Cash Down */}
          <div className="flex items-center justify-between border-l-4 border-blue-400 pl-4 bg-blue-500/10 py-2 rounded-r-lg">
            <span className="text-base font-semibold text-white">LESS Cash Down</span>
            {onCashDownChange ? (
              <CurrencyInput
                value={cashDown}
                onChange={onCashDownChange}
                className="text-base font-bold text-white w-40"
              />
            ) : (
              <span className="text-base font-bold text-white">
                {formatCurrencyExact(cashDown)}
              </span>
            )}
          </div>

          {/* LESS Net Trade-In */}
          <div>
            <div className="flex items-center justify-between border-l-4 border-blue-400 pl-4 bg-blue-500/10 py-2 rounded-r-lg">
              <span className="text-base font-semibold text-white">
                {netTradeIn >= 0 ? 'LESS' : 'PLUS'} Net Trade-In
              </span>
              <span className="text-base font-bold text-white">
                {formatNegativeParens(netTradeIn)}
              </span>
            </div>

            {/* Sub-items (indented, no border) */}
            <div className="pl-8 space-y-1.5 pb-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Trade-In Allowance</span>
                {onTradeAllowanceChange ? (
                  <CurrencyInput
                    value={tradeAllowance}
                    onChange={onTradeAllowanceChange}
                    className="text-sm text-white w-32"
                  />
                ) : (
                  <span className="text-white">{formatCurrencyExact(tradeAllowance)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Trade-In Payoff</span>
                {onTradePayoffChange ? (
                  <CurrencyInput
                    value={tradePayoff}
                    onChange={onTradePayoffChange}
                    className="text-sm text-white w-32"
                  />
                ) : (
                  <span className="text-white">{formatCurrencyExact(tradePayoff)}</span>
                )}
              </div>

              {/* Show equity split breakdown if applicable */}
              {hasSplitEquity && (
                <>
                  <div className="border-t border-white/10 my-1"></div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-400 font-medium">Applied to Balance</span>
                    <span className="text-green-400 font-semibold">{formatCurrencyExact(tradeInApplied!)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-blue-400 font-medium">Cash to You</span>
                    {onTradeInCashoutChange ? (
                      <CurrencyInput
                        value={tradeInCashout!}
                        onChange={onTradeInCashoutChange}
                        className="text-sm text-blue-400 font-semibold w-32"
                      />
                    ) : (
                      <span className="text-blue-400 font-semibold">{formatCurrencyExact(tradeInCashout!)}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Unpaid Balance */}
          <div className="flex items-center justify-between border-l-4 border-blue-400 pl-4 bg-blue-500/10 py-2 rounded-r-lg">
            <span className="text-base font-semibold text-white">Unpaid Balance</span>
            <span className="text-base font-bold text-white">
              {formatCurrencyExact(unpaidBalance)}
            </span>
          </div>

          {/* PLUS Other Charges */}
          <div>
            <div className="flex items-center justify-between border-l-4 border-blue-400 pl-4 bg-blue-500/10 py-2 rounded-r-lg">
              <span className="text-base font-semibold text-white">PLUS Other Charges</span>
              <span className="text-base font-bold text-white">
                {formatCurrencyExact(otherCharges)}
              </span>
            </div>

            {/* Sub-items */}
            <div className="pl-8 space-y-1.5 pb-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Total Dealer Fees</span>
                {onDealerFeesChange ? (
                  <CurrencyInput
                    value={dealerFees}
                    onChange={onDealerFeesChange}
                    className="text-sm text-white w-32"
                  />
                ) : (
                  <span className="text-white">{formatCurrencyExact(dealerFees)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Total Customer Add-ons</span>
                {onCustomerAddonsChange ? (
                  <CurrencyInput
                    value={customerAddons}
                    onChange={onCustomerAddonsChange}
                    className="text-sm text-white w-32"
                  />
                ) : (
                  <span className="text-white">{formatCurrencyExact(customerAddons)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Total Gov't Fees</span>
                {onGovtFeesChange ? (
                  <CurrencyInput
                    value={govtFees}
                    onChange={onGovtFeesChange}
                    className="text-sm text-white w-32"
                  />
                ) : (
                  <span className="text-white">{formatCurrencyExact(govtFees)}</span>
                )}
              </div>
            </div>
          </div>

          {/* PLUS Cash Advance to Customer (only if cashout exists) */}
          {cashoutAmount !== undefined && cashoutAmount > 0 && (
            <div className="flex items-center justify-between border-l-4 border-blue-400 pl-4 bg-blue-500/10 py-2 rounded-r-lg">
              <span className="text-base font-semibold text-white">PLUS Cash Advance to Customer</span>
              <span className="text-base font-bold text-blue-400">
                {formatCurrencyExact(cashoutAmount)}
              </span>
            </div>
          )}

          {/* PLUS Sales Tax */}
          <div>
            <div className="flex items-center justify-between border-l-4 border-blue-400 pl-4 bg-blue-500/10 py-2 rounded-r-lg">
              <span className="text-base font-semibold text-white">PLUS Sales Tax</span>
              <span className="text-base font-bold text-white">
                {formatCurrencyExact(totalTaxes)}
              </span>
            </div>

            {/* Sub-items with tax rates */}
            <div className="pl-8 space-y-1.5 pb-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white/60">
                    {stateName ? `${stateName} State Tax` : 'State Tax'} ({stateTaxRate.toFixed(2)}%)
                  </span>
                  {!stateName && (
                    <span className="text-xs text-white/40 italic">Using default</span>
                  )}
                </div>
                <span className="text-white">{formatCurrencyExact(stateTaxAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white/60">
                    {countyName ? `${countyName} Tax` : 'County Tax'} ({countyTaxRate.toFixed(2)}%)
                  </span>
                  {!countyName && (
                    <span className="text-xs text-white/40 italic">Using default</span>
                  )}
                </div>
                <span className="text-white">{formatCurrencyExact(countyTaxAmount)}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/20 my-4"></div>

          {/* AMOUNT FINANCED - Dark Footer */}
          <div className="rounded-lg bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-white uppercase tracking-wide">
                Amount Financed
              </span>
              <span className="text-2xl font-bold text-white">
                {formatCurrencyExact(amountFinanced)}
              </span>
            </div>
          </div>

          {/* Cash Due at Signing - Green Footer */}
          <div className="rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-4 mt-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-white">Cash Due at Signing</span>
              <span className="text-2xl font-bold text-white">
                {formatCurrencyExact(cashDue)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemizationCard;
