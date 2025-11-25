import React, { useState, useRef, useEffect } from 'react';

export interface EnhancedControlProps {
  /** Current value */
  value: number;
  /** Label for the control */
  label: string;
  /** On value change */
  onChange: (value: number) => void;
  /** Increment/decrement step */
  step?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Format value for display */
  formatValue?: (value: number) => string;
  /** Show keyboard hint */
  showKeyboardHint?: boolean;
  /** Additional className */
  className?: string;
  /** Current monthly payment (for tooltip) */
  monthlyPayment?: number;
  /** Baseline monthly payment (for diff tooltip) */
  baselinePayment?: number;
  /** Override payment diff shown in tooltip */
  paymentDiffOverride?: number | null;
  /** Secondary payment diff (e.g., from sale price baseline) */
  secondaryPaymentDiff?: number | null;
  /** Labels for primary and secondary diffs */
  diffLabels?: { primary?: string; secondary?: string };
  /** Remove card styling (for use within parent card) */
  unstyled?: boolean;
}

/**
 * EnhancedControl - Interactive control with keyboard navigation and click-and-hold
 *
 * Features:
 * - Click-and-hold for continuous adjustment
 * - Arrow key navigation when hovering
 * - Visual hover state
 */
export const EnhancedControl: React.FC<EnhancedControlProps> = ({
  value,
  label,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  formatValue = (v) => v.toString(),
  showKeyboardHint = true,
  className = '',
  monthlyPayment,
  baselinePayment,
  paymentDiffOverride,
  secondaryPaymentDiff,
  diffLabels,
  unstyled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  const HOLD_DELAY_MS = 300;
  const HOLD_INTERVAL_MS = 120;

  // Handle value change
  const handleChange = (delta: number) => {
    const newValue = Math.max(min, Math.min(max, value + delta * step));
    onChange(newValue);
  };

  const startRepeat = (delta: number) => {
    // Immediate change on press
    handleChange(delta);

    // Delay before continuous repeat
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        handleChange(delta);
      }, HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  // Start hold (initial delay, then interval)
  const startHold = (delta: number, event?: React.MouseEvent) => {
    event?.preventDefault();

    startRepeat(delta);
  };

  // Stop hold
  const stopHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHold();
    };
  }, []);

  // Handle keyboard navigation when hovering or focused
  useEffect(() => {
    if (!isHovering && !isFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        return;
      }

      e.preventDefault();

      if (e.key === 'Enter') {
        // Enter key does nothing special for controls (just prevents default form submission)
        return;
      }

      if (activeKeyRef.current === e.key) {
        return;
      }

      const direction = ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 1;
      activeKeyRef.current = e.key;
      startRepeat(direction);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (activeKeyRef.current && e.key === activeKeyRef.current) {
        activeKeyRef.current = null;
        stopHold();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      activeKeyRef.current = null;
      stopHold();
    };
  }, [isHovering, isFocused, value, step, min, max]);

  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate payment diff for tooltip
  const paymentDiff =
    paymentDiffOverride !== undefined
      ? paymentDiffOverride
      : monthlyPayment != null && baselinePayment != null
        ? monthlyPayment - baselinePayment
        : null;

  // Handle mouse move for tooltip positioning
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!monthlyPayment) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 40, // Position above cursor
      });
    }
  };

  // Show/hide tooltip
  const handleButtonMouseEnter = () => {
    if (monthlyPayment) {
      setShowTooltip(true);
    }
  };

  const handleButtonMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative text-center transition-all ${
        unstyled
          ? 'w-full h-full flex flex-col justify-center py-4'
          : 'rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]'
      } ${
        (isHovering || isFocused) && !unstyled ? 'ring-2 ring-blue-100 shadow-[0_12px_28px_rgba(15,23,42,0.12)]' : ''
      } ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setShowTooltip(false);
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseMove={handleMouseMove}
      tabIndex={unstyled ? -1 : 0}
    >
      <div className="text-xs font-semibold tracking-[0.08em] text-emerald-300/70 uppercase mb-2">
        {label}
      </div>
      <div className="flex items-center justify-center gap-3">
        {/* Decrease Button */}
        <button
          onMouseDown={(e) => startHold(-1, e)}
          onMouseUp={stopHold}
          onMouseLeave={() => {
            stopHold();
            handleButtonMouseLeave();
          }}
          onMouseEnter={handleButtonMouseEnter}
          onClick={(e) => e.preventDefault()}
          className="relative w-9 h-9 flex items-center justify-center rounded-full border border-white/20 text-white bg-white/10 hover:bg-white/20 transition-colors"
          aria-label={`Decrease ${label}`}
          type="button"
        >
          {/* Pulsing glow when hovering */}
          {(isHovering || isFocused) && (
            <div className="absolute inset-0 rounded-full bg-blue-500/40 animate-pulse -z-10 blur-md" />
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Value Display */}
        <div className="text-3xl font-bold text-white min-w-[120px] text-center tracking-tight">
          {formatValue(value)}
        </div>

        {/* Increase Button */}
        <button
          onMouseDown={(e) => startHold(1, e)}
          onMouseUp={stopHold}
          onMouseLeave={() => {
            stopHold();
            handleButtonMouseLeave();
          }}
          onMouseEnter={handleButtonMouseEnter}
          onClick={(e) => e.preventDefault()}
          className="relative w-9 h-9 flex items-center justify-center rounded-full border border-white/20 text-white bg-white/10 hover:bg-white/20 transition-colors"
          aria-label={`Increase ${label}`}
          type="button"
        >
          {/* Pulsing glow when hovering */}
          {(isHovering || isFocused) && (
            <div className="absolute inset-0 rounded-full bg-blue-500/40 animate-pulse -z-10 blur-md" />
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M5 2l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Tooltip */}
      {showTooltip && monthlyPayment && (
        <div
          className="absolute z-50 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border border-white/20 px-3 py-2 rounded-md shadow-2xl pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-base font-semibold text-gray-900 dark:text-white">{formatCurrency(monthlyPayment)}/mo</div>

          {/* Show both diffs if secondary exists */}
          {secondaryPaymentDiff !== undefined && secondaryPaymentDiff !== null ? (
            <div className="space-y-0.5 mt-1">
              {/* Primary diff (APR) */}
              {paymentDiff !== null && Math.abs(paymentDiff) >= 0.01 && (
                <div
                  className={`text-xs flex items-center gap-1 ${
                    paymentDiff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  <span>{paymentDiff > 0 ? '↑' : '↓'}</span>
                  <span>{formatCurrency(Math.abs(paymentDiff))}</span>
                  {diffLabels?.primary && <span className="text-gray-500 dark:text-gray-400">{diffLabels.primary}</span>}
                </div>
              )}

              {/* Secondary diff (Sale Price) */}
              {Math.abs(secondaryPaymentDiff) >= 0.01 && (
                <div
                  className={`text-xs flex items-center gap-1 ${
                    secondaryPaymentDiff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  <span>{secondaryPaymentDiff > 0 ? '↑' : '↓'}</span>
                  <span>{formatCurrency(Math.abs(secondaryPaymentDiff))}</span>
                  {diffLabels?.secondary && <span className="text-gray-500 dark:text-gray-400">{diffLabels.secondary}</span>}
                </div>
              )}
            </div>
          ) : (
            /* Single diff display (backward compatible) */
            paymentDiff !== null && Math.abs(paymentDiff) >= 1 && (
              <div
                className={`text-xs mt-1 ${
                  paymentDiff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                }`}
              >
                {paymentDiff > 0 ? '+' : ''}{formatCurrency(paymentDiff)}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedControl;
