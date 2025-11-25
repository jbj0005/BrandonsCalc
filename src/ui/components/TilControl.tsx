import React, { useState, useRef, useEffect } from 'react';

export interface TilControlProps {
  /** Label for the control */
  label: string;
  /** Current value */
  value: number;
  /** On value change */
  onChange: (value: number) => void;
  /** Format value for display */
  formatValue: (value: number) => string;
  /** Increment/decrement step */
  step: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Diff indicator */
  diff?: {
    value: number;
    formatted: string;
    isPositive: boolean;
  } | null;
  /** Control is disabled */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * TilControl - Interactive control for TIL values (APR, Term)
 *
 * Features:
 * - Click-and-hold for continuous adjustment
 * - Arrow key navigation when hovering
 * - Visual hover state
 * - Buyer-centric diff indicators (green = good, red = bad)
 */
export const TilControl: React.FC<TilControlProps> = ({
  label,
  value,
  onChange,
  formatValue,
  step,
  min,
  max,
  diff,
  disabled = false,
  className = '',
}) => {
  const valueRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle value change
  const handleChange = (delta: number) => {
    const newValue = Math.max(min, Math.min(max, value + delta * step));
    onChange(newValue);
  };

  // Start hold (initial delay, then interval)
  const startHold = (delta: number, event?: React.MouseEvent) => {
    if (disabled) return;
    event?.preventDefault();

    // Immediate change on mousedown
    handleChange(delta);

    // Delay before continuous hold
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        handleChange(delta);
      }, 100); // Adjust every 100ms during hold
    }, 300); // 300ms initial delay
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
    if (!isHovering || disabled) return;

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
  }, [isHovering, value, step, min, max, disabled]);

  return (
    <div
      className={`quick-til-value-wrapper ${disabled ? 'disabled' : ''} ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="quick-til-label">{label}</div>
      <div className="quick-til-value-row">
        {/* Decrease Button */}
        <div className="relative inline-block">
          {/* Pulsing glow when hovering */}
          {isHovering && !disabled && (
            <div className="absolute inset-0 bg-blue-500/40 animate-pulse -z-10 blur-md rounded-full" />
          )}
          <button
            type="button"
            className="quick-til-arrow left"
            id={`${label.toLowerCase().replace(/\s+/g, '')}ArrowLeft`}
            onMouseDown={(e) => startHold(-1, e)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onClick={(e) => e.preventDefault()}
            disabled={disabled}
            tabIndex={0}
            aria-label={`Decrease ${label}`}
          >
            ◀
          </button>
        </div>

        {/* Value Display */}
        <div
          ref={valueRef}
          className="quick-til-value editable"
          tabIndex={0}
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-label={label}
        >
          {formatValue(value)}
          {diff && diff.value !== 0 && (
            <span className={`quick-til-diff ${diff.isPositive ? 'positive' : 'negative'}`}>
              {diff.value > 0 ? '+' : '-'}
              {diff.formatted}
            </span>
          )}
        </div>

        {/* Increase Button */}
        <div className="relative inline-block">
          {/* Pulsing glow when hovering */}
          {isHovering && !disabled && (
            <div className="absolute inset-0 bg-blue-500/40 animate-pulse -z-10 blur-md rounded-full" />
          )}
          <button
            type="button"
            className="quick-til-arrow right"
            id={`${label.toLowerCase().replace(/\s+/g, '')}ArrowRight`}
            onMouseDown={(e) => startHold(1, e)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onClick={(e) => e.preventDefault()}
            disabled={disabled}
            tabIndex={0}
            aria-label={`Increase ${label}`}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
};

export default TilControl;
