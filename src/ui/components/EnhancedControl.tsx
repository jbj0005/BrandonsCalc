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
  unstyled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle value change
  const handleChange = (delta: number) => {
    const newValue = Math.max(min, Math.min(max, value + delta * step));
    onChange(newValue);
  };

  // Start hold (initial delay, then interval)
  const startHold = (delta: number, event?: React.MouseEvent) => {
    event?.preventDefault();

    // Immediate change on mousedown
    handleChange(delta);

    // Delay before continuous hold
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        handleChange(delta);
      }, 100); // Adjust every 100ms during hold
    }, 500); // 500ms initial delay
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

  // Handle keyboard navigation when hovering
  useEffect(() => {
    if (!isHovering) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        return;
      }

      e.preventDefault();
      const direction = ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 1;
      handleChange(direction);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isHovering, value, step, min, max]);

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
  const paymentDiff = monthlyPayment && baselinePayment
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
        isHovering && !unstyled ? 'ring-2 ring-blue-100 shadow-[0_12px_28px_rgba(15,23,42,0.12)]' : ''
      } ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setShowTooltip(false);
      }}
      onMouseMove={handleMouseMove}
      tabIndex={unstyled ? -1 : 0}
    >
      <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase mb-2">
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
          className="w-9 h-9 flex items-center justify-center rounded-full border border-blue-100 text-blue-600 bg-white hover:bg-blue-50 transition-colors"
          aria-label={`Decrease ${label}`}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Value Display */}
        <div className="text-3xl font-bold text-blue-600 min-w-[120px] text-center tracking-tight">
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
          className="w-9 h-9 flex items-center justify-center rounded-full border border-blue-100 text-blue-600 bg-white hover:bg-blue-50 transition-colors"
          aria-label={`Increase ${label}`}
          type="button"
        >
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
          {paymentDiff !== null && Math.abs(paymentDiff) >= 1 && (
            <div
              className={`text-xs mt-1 ${
                paymentDiff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
              }`}
            >
              {paymentDiff > 0 ? '+' : ''}{formatCurrency(paymentDiff)}
            </div>
          )}
        </div>
      )}

      {/* Keyboard Hint */}
      {showKeyboardHint && isHovering && (
        <div className="text-xs text-blue-600 text-center mt-2 animate-fade-in">
          Hover + use ← → to fine tune
        </div>
      )}
    </div>
  );
};

export default EnhancedControl;
