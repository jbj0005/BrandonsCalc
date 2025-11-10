/**
 * useTilBaselines - Track baseline values for TIL (Truth in Lending) diff indicators
 *
 * Maintains baseline values for APR, term, finance charge, etc. to show
 * buyer-centric diffs (green = good/lower costs, red = bad/higher costs)
 */

import { useState, useCallback, useEffect } from 'react';

export interface TilBaselines {
  apr: number | null;
  term: number | null;
  financeCharge: number | null;
  amountFinanced: number | null;
  totalPayments: number | null;
  monthlyFinanceCharge: number | null;
}

export interface TilValues {
  apr: number;
  term: number;
  financeCharge: number;
  amountFinanced: number;
  totalPayments: number;
  monthlyFinanceCharge: number;
}

export interface TilDiff {
  value: number;
  formatted: string;
  isPositive: boolean; // Buyer-centric: true = good (lower cost), false = bad (higher cost)
  isSignificant: boolean;
}

export interface TilDiffs {
  apr: TilDiff | null;
  term: TilDiff | null;
  financeCharge: TilDiff | null;
  amountFinanced: TilDiff | null;
  totalPayments: TilDiff | null;
  monthlyFinanceCharge: TilDiff | null;
}

interface UseTilBaselinesReturn {
  baselines: TilBaselines;
  diffs: TilDiffs;
  updateBaselines: (values: Partial<TilValues>) => void;
  resetBaselines: () => void;
  calculateDiffs: (currentValues: TilValues) => TilDiffs;
}

const formatCurrency = (value: number, showCents: boolean = true): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(value);
};

const formatPercent = (value: number): string => {
  return (value * 100).toFixed(2) + '%';
};

export const useTilBaselines = (): UseTilBaselinesReturn => {
  const [baselines, setBaselines] = useState<TilBaselines>({
    apr: null,
    term: null,
    financeCharge: null,
    amountFinanced: null,
    totalPayments: null,
    monthlyFinanceCharge: null,
  });

  const [diffs, setDiffs] = useState<TilDiffs>({
    apr: null,
    term: null,
    financeCharge: null,
    amountFinanced: null,
    totalPayments: null,
    monthlyFinanceCharge: null,
  });

  // Update baselines
  const updateBaselines = useCallback((values: Partial<TilValues>) => {
    setBaselines((prev) => {
      const updated = { ...prev };

      // Only set baseline if it's null
      if (values.apr !== undefined && prev.apr === null) updated.apr = values.apr;
      if (values.term !== undefined && prev.term === null) updated.term = values.term;
      if (values.financeCharge !== undefined && prev.financeCharge === null) {
        updated.financeCharge = values.financeCharge;
      }
      if (values.amountFinanced !== undefined && prev.amountFinanced === null) {
        updated.amountFinanced = values.amountFinanced;
      }
      if (values.totalPayments !== undefined && prev.totalPayments === null) {
        updated.totalPayments = values.totalPayments;
      }
      if (values.monthlyFinanceCharge !== undefined && prev.monthlyFinanceCharge === null) {
        updated.monthlyFinanceCharge = values.monthlyFinanceCharge;
      }

      return updated;
    });
  }, []);

  // Reset baselines
  const resetBaselines = useCallback(() => {
    setBaselines({
      apr: null,
      term: null,
      financeCharge: null,
      amountFinanced: null,
      totalPayments: null,
      monthlyFinanceCharge: null,
    });
    setDiffs({
      apr: null,
      term: null,
      financeCharge: null,
      amountFinanced: null,
      totalPayments: null,
      monthlyFinanceCharge: null,
    });
  }, []);

  // Calculate diffs
  const calculateDiffs = useCallback(
    (currentValues: TilValues): TilDiffs => {
      const calculateDiff = (
        current: number,
        baseline: number | null,
        threshold: number,
        formatter: (v: number) => string
      ): TilDiff | null => {
        if (baseline === null) return null;

        const diff = current - baseline;
        if (Math.abs(diff) < threshold) return null;

        return {
          value: diff,
          formatted: formatter(Math.abs(diff)),
          isPositive: diff < 0, // Buyer-centric: lower is better
          isSignificant: Math.abs(diff) >= threshold,
        };
      };

      const newDiffs: TilDiffs = {
        apr: calculateDiff(currentValues.apr, baselines.apr, 0.0001, formatPercent),
        term: calculateDiff(currentValues.term, baselines.term, 1, (v) => `${v} mo`),
        financeCharge: calculateDiff(
          currentValues.financeCharge,
          baselines.financeCharge,
          1,
          (v) => formatCurrency(v, true)
        ),
        amountFinanced: calculateDiff(
          currentValues.amountFinanced,
          baselines.amountFinanced,
          1,
          (v) => formatCurrency(v, true)
        ),
        totalPayments: calculateDiff(
          currentValues.totalPayments,
          baselines.totalPayments,
          1,
          (v) => formatCurrency(v, true)
        ),
        monthlyFinanceCharge: calculateDiff(
          currentValues.monthlyFinanceCharge,
          baselines.monthlyFinanceCharge,
          1,
          (v) => formatCurrency(v, true)
        ),
      };

      // Only show finance charge diffs when APR or Term has changed
      const aprChanged = newDiffs.apr !== null && newDiffs.apr.isSignificant;
      const termChanged = newDiffs.term !== null && newDiffs.term.isSignificant;
      const shouldShowFinanceChargeDiff = aprChanged || termChanged;

      if (!shouldShowFinanceChargeDiff) {
        newDiffs.financeCharge = null;
        newDiffs.amountFinanced = null;
        newDiffs.totalPayments = null;
        newDiffs.monthlyFinanceCharge = null;
      }

      setDiffs(newDiffs);
      return newDiffs;
    },
    [baselines]
  );

  // Expose to window for global access (legacy compatibility)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.tilBaselines = baselines;
      window.resetTilBaselines = resetBaselines;
    }
  }, [baselines, resetBaselines]);

  return {
    baselines,
    diffs,
    updateBaselines,
    resetBaselines,
    calculateDiffs,
  };
};

// Add type definitions to window
declare global {
  interface Window {
    tilBaselines?: TilBaselines;
    resetTilBaselines?: () => void;
  }
}
