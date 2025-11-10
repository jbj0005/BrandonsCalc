import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook for tracking slider baseline values and calculating diffs
 * Used to show "change from original" indicators
 */
export const useSliderBaseline = (
  currentValue: number,
  monthlyPayment: number,
  options: {
    enabled?: boolean;
    snapThreshold?: number;
  } = {}
) => {
  const { enabled = true, snapThreshold = 0 } = options;

  // Store baseline value and payment
  const [baseline, setBaseline] = useState<number>(currentValue);
  const [baselinePayment, setBaselinePayment] = useState<number>(monthlyPayment);
  const isInitialized = useRef(false);

  // Initialize baseline on mount
  useEffect(() => {
    if (!isInitialized.current && enabled) {
      setBaseline(currentValue);
      setBaselinePayment(monthlyPayment);
      isInitialized.current = true;
    }
  }, [currentValue, monthlyPayment, enabled]);

  // Calculate diffs
  const valueDiff = currentValue - baseline;
  const paymentDiff = monthlyPayment - baselinePayment;
  const isAtBaseline = Math.abs(valueDiff) <= snapThreshold;

  // Reset to baseline
  const resetToBaseline = useCallback(() => {
    return baseline;
  }, [baseline]);

  // Update baseline (e.g., when vehicle changes)
  const updateBaseline = useCallback((newValue: number, newPayment: number) => {
    setBaseline(newValue);
    setBaselinePayment(newPayment);
  }, []);

  return {
    baseline,
    baselinePayment,
    valueDiff,
    paymentDiff,
    isAtBaseline,
    resetToBaseline,
    updateBaseline,
  };
};
