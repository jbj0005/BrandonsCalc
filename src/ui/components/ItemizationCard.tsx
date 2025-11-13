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
  onAprChange?: (value: number) => void;
  onTermChange?: (value: number) => void;
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
  onAprChange,
  onTermChange,
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
      <div className="space-y-3">
        <h3 className="text-2xl font-bold text-gray-900">Itemization of Costs</h3>

        {/* Payment Terms and Monthly Payment Row */}
        {(apr !== undefined || loanTerm !== undefined || monthlyPayment !== undefined) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* APR Control */}
            {apr !== undefined && onAprChange && (
              <div className="group rounded-xl border bg-white border-blue-50 p-3 text-center shadow-sm flex flex-col transition-all duration-200 hover:shadow-md hover:border-blue-200 focus-within:shadow-md focus-within:border-blue-300 cursor-pointer">
                <EnhancedControl
                  value={apr}
                  label="Annual Percentage Rate"
                  onChange={(newApr) => onAprChange(parseFloat(newApr.toFixed(2)))}
                  step={0.01}
                  min={0}
                  max={99.99}
                  formatValue={(val) => `${val.toFixed(2)}%`}
                  monthlyPayment={monthlyPayment}
                  baselinePayment={baselineMonthlyPayment}
                  className="w-full"
                  showKeyboardHint={true}
                  unstyled={true}
                />
                {baselineMonthlyPayment != null && monthlyPayment != null && (
                  <div className={`text-xs font-semibold mt-2 ${monthlyPayment - baselineMonthlyPayment < 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {monthlyPayment - baselineMonthlyPayment < 0 ? '↓' : '↑'} {formatCurrencyRounded(Math.abs(monthlyPayment - baselineMonthlyPayment))}
                  </div>
                )}
                <div className="mt-1 text-xs text-slate-500">Cost of credit as yearly rate</div>
              </div>
            )}

            {/* Term Control */}
            {loanTerm !== undefined && onTermChange && (
              <div className="group rounded-xl border bg-white border-blue-50 p-3 text-center shadow-sm flex flex-col transition-all duration-200 hover:shadow-md hover:border-blue-200 focus-within:shadow-md focus-within:border-blue-300 cursor-pointer">
                <EnhancedControl
                  value={loanTerm}
                  label="Term (Months)"
                  onChange={(newTerm) => {
                    const terms = [36, 48, 60, 72, 84];
                    const closest = terms.reduce((prev, curr) =>
                      Math.abs(curr - newTerm) < Math.abs(prev - newTerm) ? curr : prev
                    );
                    onTermChange(closest);
                  }}
                  step={12}
                  min={36}
                  max={84}
                  formatValue={(val) => val.toString()}
                  monthlyPayment={monthlyPayment}
                  baselinePayment={baselineMonthlyPayment}
                  className="w-full"
                  showKeyboardHint={true}
                  unstyled={true}
                />
                <div className="mt-1 text-xs text-slate-500">Length of loan agreement</div>
              </div>
            )}

            {/* Monthly Payment Display */}
            {monthlyPayment !== undefined && (
              <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-4 text-center border border-blue-100 shadow-sm">
                <div className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                  Monthly Payment
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {formatCurrencyRounded(monthlyPayment)}
                </div>
                {loanTerm !== undefined && apr !== undefined && (
                  <div className="text-xs text-gray-600 mt-1">
                    {loanTerm} months • {apr.toFixed(2)}% APR
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Breakdown Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm relative">
        <div className="space-y-3">
          {/* Sale Price */}
          <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
            <span className="text-base font-semibold text-gray-900">Sale Price</span>
            {onSalePriceChange ? (
              <CurrencyInput
                value={salePrice}
                onChange={onSalePriceChange}
                className="text-base font-bold text-gray-900 w-40"
              />
            ) : (
              <span className="text-base font-bold text-gray-900">
                {formatCurrencyExact(salePrice)}
              </span>
            )}
          </div>

          {/* LESS Cash Down */}
          <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
            <span className="text-base font-semibold text-gray-900">LESS Cash Down</span>
            {onCashDownChange ? (
              <CurrencyInput
                value={cashDown}
                onChange={onCashDownChange}
                className="text-base font-bold text-gray-900 w-40"
              />
            ) : (
              <span className="text-base font-bold text-gray-900">
                {formatCurrencyExact(cashDown)}
              </span>
            )}
          </div>

          {/* LESS Net Trade-In */}
          <div>
            <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
              <span className="text-base font-semibold text-gray-900">
                {netTradeIn >= 0 ? 'LESS' : 'PLUS'} Net Trade-In
              </span>
              <span className="text-base font-bold text-gray-900">
                {formatNegativeParens(netTradeIn)}
              </span>
            </div>

            {/* Sub-items (indented, no border) */}
            <div className="pl-8 space-y-1.5 pb-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Trade-In Allowance</span>
                {onTradeAllowanceChange ? (
                  <CurrencyInput
                    value={tradeAllowance}
                    onChange={onTradeAllowanceChange}
                    className="text-sm text-gray-900 w-32"
                  />
                ) : (
                  <span className="text-gray-900">{formatCurrencyExact(tradeAllowance)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Trade-In Payoff</span>
                {onTradePayoffChange ? (
                  <CurrencyInput
                    value={tradePayoff}
                    onChange={onTradePayoffChange}
                    className="text-sm text-gray-900 w-32"
                  />
                ) : (
                  <span className="text-gray-900">{formatCurrencyExact(tradePayoff)}</span>
                )}
              </div>

              {/* Show equity split breakdown if applicable */}
              {hasSplitEquity && (
                <>
                  <div className="border-t border-gray-200 my-1"></div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-700 font-medium">Applied to Balance</span>
                    <span className="text-green-700 font-semibold">{formatCurrencyExact(tradeInApplied!)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-blue-700 font-medium">Cash to You</span>
                    {onTradeInCashoutChange ? (
                      <CurrencyInput
                        value={tradeInCashout!}
                        onChange={onTradeInCashoutChange}
                        className="text-sm text-blue-700 font-semibold w-32"
                      />
                    ) : (
                      <span className="text-blue-700 font-semibold">{formatCurrencyExact(tradeInCashout!)}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Unpaid Balance */}
          <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
            <span className="text-base font-semibold text-gray-900">Unpaid Balance</span>
            <span className="text-base font-bold text-gray-900">
              {formatCurrencyExact(unpaidBalance)}
            </span>
          </div>

          {/* PLUS Other Charges */}
          <div>
            <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
              <span className="text-base font-semibold text-gray-900">PLUS Other Charges</span>
              <span className="text-base font-bold text-gray-900">
                {formatCurrencyExact(otherCharges)}
              </span>
            </div>

            {/* Sub-items */}
            <div className="pl-8 space-y-1.5 pb-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Dealer Fees</span>
                {onDealerFeesChange ? (
                  <CurrencyInput
                    value={dealerFees}
                    onChange={onDealerFeesChange}
                    className="text-sm text-gray-900 w-32"
                  />
                ) : (
                  <span className="text-gray-900">{formatCurrencyExact(dealerFees)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Customer Add-ons</span>
                {onCustomerAddonsChange ? (
                  <CurrencyInput
                    value={customerAddons}
                    onChange={onCustomerAddonsChange}
                    className="text-sm text-gray-900 w-32"
                  />
                ) : (
                  <span className="text-gray-900">{formatCurrencyExact(customerAddons)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Gov't Fees</span>
                {onGovtFeesChange ? (
                  <CurrencyInput
                    value={govtFees}
                    onChange={onGovtFeesChange}
                    className="text-sm text-gray-900 w-32"
                  />
                ) : (
                  <span className="text-gray-900">{formatCurrencyExact(govtFees)}</span>
                )}
              </div>
            </div>
          </div>

          {/* PLUS Cash Advance to Customer (only if cashout exists) */}
          {cashoutAmount !== undefined && cashoutAmount > 0 && (
            <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
              <span className="text-base font-semibold text-gray-900">PLUS Cash Advance to Customer</span>
              <span className="text-base font-bold text-blue-600">
                {formatCurrencyExact(cashoutAmount)}
              </span>
            </div>
          )}

          {/* PLUS Sales Tax */}
          <div>
            <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
              <span className="text-base font-semibold text-gray-900">PLUS Sales Tax</span>
              <span className="text-base font-bold text-gray-900">
                {formatCurrencyExact(totalTaxes)}
              </span>
            </div>

            {/* Sub-items with tax rates */}
            <div className="pl-8 space-y-1.5 pb-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">
                    {stateName ? `${stateName} State Tax` : 'State Tax'} ({stateTaxRate.toFixed(2)}%)
                  </span>
                  {!stateName && (
                    <span className="text-xs text-gray-400 italic">Using default</span>
                  )}
                </div>
                <span className="text-gray-900">{formatCurrencyExact(stateTaxAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">
                    {countyName ? `${countyName} Tax` : 'County Tax'} ({countyTaxRate.toFixed(2)}%)
                  </span>
                  {!countyName && (
                    <span className="text-xs text-gray-400 italic">Using default</span>
                  )}
                </div>
                <span className="text-gray-900">{formatCurrencyExact(countyTaxAmount)}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-300 my-4"></div>

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
