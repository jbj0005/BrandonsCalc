import React, { useState, useRef, useEffect, forwardRef } from 'react';
import { Slider, SliderProps } from './Slider';
import { useSliderBaseline } from '../../hooks/useSliderBaseline';

export interface EnhancedSliderProps extends SliderProps {
  /** Current monthly payment for diff calculation */
  monthlyPayment?: number;
  /** Enable baseline tracking and tooltips */
  showTooltip?: boolean;
  /** Enable reset button */
  showReset?: boolean;
  /** Callback when reset is clicked */
  onReset?: () => void;
  /** Baseline value (if different from initial value) */
  baselineValue?: number;
  /** Snap threshold for "at baseline" detection */
  snapThreshold?: number;
}

/**
 * EnhancedSlider - Slider with tooltips, keyboard navigation, and baseline tracking
 *
 * Features:
 * - Hover tooltip showing monthly payment and diff from baseline
 * - Arrow key navigation when hovering/focused
 * - Visual diff indicator
 * - Reset to baseline button
 */
export const EnhancedSlider = forwardRef<HTMLInputElement, EnhancedSliderProps>(
  (
    {
      monthlyPayment = 0,
      showTooltip = true,
      showReset = true,
      onReset,
      baselineValue,
      snapThreshold = 0,
      value,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      formatValue,
      ...props
    },
    ref
  ) => {
    const sliderRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

    const currentValue = Number(value || 0);

    // Baseline tracking
    const {
      baseline,
      paymentDiff,
      valueDiff,
      isAtBaseline,
      resetToBaseline,
      updateBaseline,
    } = useSliderBaseline(currentValue, monthlyPayment, {
      enabled: showTooltip,
      snapThreshold,
    });

    // Update baseline if baselineValue prop changes
    useEffect(() => {
      if (baselineValue !== undefined) {
        updateBaseline(baselineValue, monthlyPayment);
      }
    }, [baselineValue, monthlyPayment, updateBaseline]);

    // Update tooltip position
    const updateTooltipPosition = () => {
      if (!sliderRef.current) return;

      const slider = sliderRef.current;
      const rect = slider.getBoundingClientRect();
      const percentage = ((currentValue - Number(min)) / (Number(max) - Number(min)));
      const thumbPosition = rect.left + rect.width * percentage;

      setTooltipPosition({
        x: thumbPosition,
        y: rect.top - 60, // Position above slider
      });
    };

    // Handle mouse enter
    const handleMouseEnter = () => {
      setIsHovering(true);
      updateTooltipPosition();
    };

    // Handle mouse move
    const handleMouseMove = () => {
      if (isHovering) {
        updateTooltipPosition();
      }
    };

    // Handle mouse leave
    const handleMouseLeave = () => {
      setIsHovering(false);
    };

    // Handle arrow key navigation
    useEffect(() => {
      if (!isHovering) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          return;
        }

        e.preventDefault();

        const direction = ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 1;
        const newValue = Math.max(
          Number(min),
          Math.min(Number(max), currentValue + direction * Number(step))
        );

        // Create synthetic event
        const syntheticEvent = {
          target: { value: String(newValue) },
        } as React.ChangeEvent<HTMLInputElement>;

        onChange?.(syntheticEvent);
        updateTooltipPosition();
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isHovering, currentValue, min, max, step, onChange]);

    // Handle reset
    const handleReset = () => {
      const baselineVal = resetToBaseline();
      const syntheticEvent = {
        target: { value: String(baselineVal) },
      } as React.ChangeEvent<HTMLInputElement>;

      onChange?.(syntheticEvent);
      onReset?.();
    };

    // Format currency
    const formatCurrency = (val: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    };

    return (
      <div
        ref={containerRef}
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        tabIndex={0}
      >
        {/* Slider */}
        <Slider
          ref={sliderRef}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          formatValue={formatValue}
          {...props}
        />

        {/* Diff Indicator */}
        {showTooltip && !isAtBaseline && (
          <div className="flex items-center justify-between mt-1 text-xs">
            <span
              className={`font-medium ${
                valueDiff > 0 ? 'text-red-600' : valueDiff < 0 ? 'text-green-600' : 'text-gray-500'
              }`}
            >
              {valueDiff > 0 ? '+' : ''}
              {formatValue ? formatValue(valueDiff) : valueDiff.toLocaleString()}
            </span>
            {showReset && (
              <button
                onClick={handleReset}
                className="text-blue-600 hover:text-blue-800 text-xs underline"
                type="button"
              >
                Reset
              </button>
            )}
          </div>
        )}

        {/* Tooltip */}
        {showTooltip && isHovering && (
          <div
            className="fixed z-50 pointer-events-none transition-all duration-100"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="bg-gray-900 text-white px-4 py-2 rounded-lg shadow-xl">
              <div className="text-center">
                <div className="text-lg font-bold">{formatCurrency(monthlyPayment)}</div>
                <div className="text-xs mt-1">
                  {Math.abs(paymentDiff) < 1 ? (
                    <span className="text-gray-300">No change</span>
                  ) : paymentDiff > 0 ? (
                    <span className="text-red-400">+{formatCurrency(paymentDiff)}/mo</span>
                  ) : (
                    <span className="text-green-400">{formatCurrency(paymentDiff)}/mo</span>
                  )}
                </div>
              </div>
              {/* Arrow */}
              <div
                className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900"
              />
            </div>
          </div>
        )}
      </div>
    );
  }
);

EnhancedSlider.displayName = 'EnhancedSlider';

export default EnhancedSlider;
