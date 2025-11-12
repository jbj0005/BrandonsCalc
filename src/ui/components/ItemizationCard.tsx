import React from 'react';
import { formatCurrencyExact, formatNegativeParens } from '../../utils/formatters';
import { Switch } from './Switch';
import { Badge } from './Badge';

export interface ItemizationCardProps {
  salePrice: number;
  cashDown: number;
  tradeAllowance: number;
  tradePayoff: number;
  dealerFees: number;
  customerAddons: number;
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
}) => {
  const netTradeIn = tradeAllowance - tradePayoff;
  const otherCharges = dealerFees + customerAddons; // Note: Gov't fees = 0 for now
  const hasPositiveEquity = netTradeIn > 0;
  const hasSplitEquity = hasPositiveEquity &&
                         tradeInApplied !== undefined &&
                         tradeInCashout !== undefined &&
                         (tradeInApplied > 0 || tradeInCashout > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <h3 className="text-2xl font-bold text-gray-900">Itemization of Costs</h3>

      {/* Breakdown Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          {/* Sale Price */}
          <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
            <span className="text-base font-semibold text-gray-900">Sale Price</span>
            <span className="text-base font-bold text-gray-900">
              {formatCurrencyExact(salePrice)}
            </span>
          </div>

          {/* LESS Cash Down */}
          <div className="flex items-center justify-between border-l-4 border-blue-500 pl-4 bg-blue-50/30 py-2">
            <span className="text-base font-semibold text-gray-900">LESS Cash Down</span>
            <span className="text-base font-bold text-gray-900">
              {formatCurrencyExact(cashDown)}
            </span>
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
                <span className="text-gray-900">{formatCurrencyExact(tradeAllowance)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Trade-In Payoff</span>
                <span className="text-gray-900">{formatCurrencyExact(tradePayoff)}</span>
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
                    <span className="text-blue-700 font-semibold">{formatCurrencyExact(tradeInCashout!)}</span>
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
                <span className="text-gray-900">{formatCurrencyExact(dealerFees)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Customer Add-ons</span>
                <span className="text-gray-900">{formatCurrencyExact(customerAddons)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Gov't Fees</span>
                <span className="text-gray-900">{formatCurrencyExact(0)}</span>
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
