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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
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

  return (
    <div
      ref={containerRef}
      className={`bg-gray-50 p-4 rounded-lg transition-all ${
        isHovering ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      } ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      tabIndex={0}
    >
      <div className="text-sm font-medium text-gray-600 mb-2">{label}</div>
      <div className="flex items-center justify-center gap-2">
        {/* Decrease Button */}
        <button
          onMouseDown={(e) => startHold(-1, e)}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onClick={(e) => e.preventDefault()}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-300 hover:bg-gray-100 transition-colors active:bg-gray-200"
          aria-label={`Decrease ${label}`}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Value Display */}
        <div className="text-3xl font-bold text-gray-900 min-w-[120px] text-center">
          {formatValue(value)}
        </div>

        {/* Increase Button */}
        <button
          onMouseDown={(e) => startHold(1, e)}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onClick={(e) => e.preventDefault()}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-300 hover:bg-gray-100 transition-colors active:bg-gray-200"
          aria-label={`Increase ${label}`}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Keyboard Hint */}
      {showKeyboardHint && isHovering && (
        <div className="text-xs text-blue-600 text-center mt-2 animate-fade-in">
          Use arrow keys ← →
        </div>
      )}
    </div>
  );
};

export default EnhancedControl;
