import React, { useState, useRef, useEffect, forwardRef, useMemo } from 'react';
import { Slider, SliderProps } from './Slider';
import { useSliderBaseline } from '../../hooks/useSliderBaseline';
import { formatCurrencyInput } from '../../utils/formatters';

export interface EnhancedSliderProps extends SliderProps {
  /** Current monthly payment for diff calculation */
  monthlyPayment?: number;
  /** Enable baseline tracking and tooltips */
  showTooltip?: boolean;
  /** Enable reset button */
  showReset?: boolean;
  /** Enable input field for exact value entry */
  showInput?: boolean;
  /** Callback when reset is clicked */
  onReset?: () => void;
  /** Baseline value (if different from initial value) */
  baselineValue?: number;
  /** Snap threshold for "at baseline" detection */
  snapThreshold?: number;
  /** Buyer perspective for color coding: "lower-is-better" means increase=red, decrease=green */
  buyerPerspective?: 'lower-is-better' | 'higher-is-better';
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
      showInput = true,
      onReset,
      baselineValue,
      snapThreshold,
      buyerPerspective = 'lower-is-better',
      value,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      formatValue,
      label,
      ...props
    },
    ref
  ) => {
    const sliderRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false);

    const currentValue = Number(value || 0);

    // Update input value when slider value changes (but not when user is typing)
    useEffect(() => {
      if (!isInputFocused) {
        setInputValue(formatCurrencyInput(String(currentValue)));
      }
    }, [currentValue, isInputFocused]);
    const numericMin = Number(min);
    const numericMax = Number(max);
    const range = numericMax - numericMin || 1;
    const clampPercent = (val: number) =>
      Math.min(100, Math.max(0, ((val - numericMin) / range) * 100));

    const effectiveSnapThreshold =
      snapThreshold !== undefined
        ? snapThreshold
        : (typeof step === 'number' ? Number(step) : Number(step || 0)) || 0;

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
      snapThreshold: effectiveSnapThreshold,
    });

    const baselineForDiff = useMemo(() => {
      if (baselineValue !== undefined && Number.isFinite(baselineValue)) {
        return baselineValue;
      }
      return baseline;
    }, [baselineValue, baseline]);

    const diffFromBaseline =
      baselineForDiff != null ? currentValue - baselineForDiff : 0;

    const latestPaymentRef = useRef(monthlyPayment);
    useEffect(() => {
      latestPaymentRef.current = monthlyPayment;
    }, [monthlyPayment]);

    // Update baseline if baselineValue prop changes
    useEffect(() => {
      if (baselineValue !== undefined) {
        updateBaseline(baselineValue, latestPaymentRef.current);
      }
    }, [baselineValue, updateBaseline]);


    const isBuyerPositive = useMemo(() => {
      if (Math.abs(diffFromBaseline) <= effectiveSnapThreshold) return false;
      if (buyerPerspective === 'lower-is-better') {
        return diffFromBaseline < 0;
      }
      return diffFromBaseline > 0;
    }, [diffFromBaseline, buyerPerspective, effectiveSnapThreshold]);

    const baselinePercent = clampPercent(
      baselineForDiff != null ? baselineForDiff : numericMin
    );
    const currentPercent = clampPercent(currentValue);

    const trackGradient = useMemo(() => {
      const neutral = 'var(--neutral, #e5e7eb)';
      const positiveStart = 'var(--primary-start, #1e40af)';
      const positiveEnd = 'var(--primary-end, #3b82f6)';
      const negativeStart = 'var(--error, #ef4444)';
      const negativeEnd = 'var(--error-dark, #b91c1c)';

      if (
        !Number.isFinite(currentPercent) ||
        !Number.isFinite(baselinePercent) ||
        Math.abs(diffFromBaseline) <= effectiveSnapThreshold
      ) {
        return `linear-gradient(to right, ${neutral} 0%, ${neutral} 100%)`;
      }

      const start = Math.min(currentPercent, baselinePercent);
      const end = Math.max(currentPercent, baselinePercent);
      const fillStart = isBuyerPositive ? positiveStart : negativeStart;
      const fillEnd = isBuyerPositive ? positiveEnd : negativeEnd;

      return `linear-gradient(to right,
        ${neutral} 0%,
        ${neutral} ${start}%,
        ${fillStart} ${start}%,
        ${fillEnd} ${end}%,
        ${neutral} ${end}%,
        ${neutral} 100%)`;
    }, [
      baselinePercent,
      currentPercent,
      diffFromBaseline,
      effectiveSnapThreshold,
      isBuyerPositive,
    ]);

    // Handle mouse enter
    const handleMouseEnter = () => {
      setIsHovering(true);
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
        let newValue = Math.max(
          Number(min),
          Math.min(Number(max), currentValue + direction * Number(step))
        );

        // Round to nearest hundredth (0.01)
        newValue = Math.round(newValue * 100) / 100;

        // Create synthetic event
        const syntheticEvent = {
          target: { value: String(newValue) },
        } as React.ChangeEvent<HTMLInputElement>;

        onChange?.(syntheticEvent);
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

    // Handle input field changes
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
      setIsInputFocused(false);
      // Parse the input value and update the slider
      const cleaned = inputValue.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);

      if (!isNaN(parsed) && onChange) {
        const clamped = Math.max(Number(min), Math.min(Number(max), parsed));

        // Set new baseline when user enters exact amount
        updateBaseline(clamped, monthlyPayment);

        const syntheticEvent = {
          target: { value: String(clamped) },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      } else {
        // Invalid input - reset to current value
        setInputValue(formatCurrencyInput(String(currentValue)));
      }
    };

    const handleInputFocus = () => {
      setIsInputFocused(true);
    };

    const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!onChange) return;
      let nextValue = Number(event.target.value);
      const shouldSnap =
        baselineForDiff != null &&
        Number.isFinite(nextValue) &&
        Math.abs(nextValue - baselineForDiff) <= effectiveSnapThreshold;

      if (shouldSnap) {
        nextValue = baselineForDiff as number;
        if (event.target instanceof HTMLInputElement) {
          event.target.value = String(nextValue);
        }
        if (event.currentTarget instanceof HTMLInputElement) {
          event.currentTarget.value = String(nextValue);
        }
      } else {
        // Round to nearest hundredth (0.01) when not snapping to baseline
        nextValue = Math.round(nextValue * 100) / 100;
        if (event.target instanceof HTMLInputElement) {
          event.target.value = String(nextValue);
        }
        if (event.currentTarget instanceof HTMLInputElement) {
          event.currentTarget.value = String(nextValue);
        }
      }

      onChange(event);
    };

    return (
      <div
        ref={containerRef}
        className="relative focus:outline-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        tabIndex={0}
      >
        {/* Input Field (optional) */}
        {showInput && label && (
          <div className="flex items-center justify-between mb-1">
            <div className="relative flex items-center">
              <label className="block text-sm font-medium text-gray-700">
                {label}
              </label>

              {/* Inline Ribbon Tooltip - Absolutely positioned to prevent layout shift */}
              {showTooltip && isHovering && monthlyPayment > 0 && (
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-10">
                  <div className="bg-white/90 backdrop-blur-md border border-gray-200 rounded-lg shadow-xl px-3 py-1.5 min-w-[140px]">
                    {/* Monthly payment */}
                    <div className="text-center text-sm font-bold text-gray-900">
                      {formatCurrency(monthlyPayment)}/mo
                    </div>

                    {/* Diff indicator with color coding */}
                    {paymentDiff !== null && Math.abs(paymentDiff) >= 1 && (
                      <div className={`text-xs text-center mt-0.5 font-semibold flex items-center justify-center gap-1 ${
                        paymentDiff > 0
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}>
                        <span className="text-sm">{paymentDiff > 0 ? '↑' : '↓'}</span>
                        <span>{formatCurrency(Math.abs(paymentDiff))}</span>
                      </div>
                    )}

                    {/* Left-pointing notch */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3 h-3 bg-white/90 border-l border-b border-gray-200 rotate-45" />
                  </div>
                </div>
              )}
            </div>

            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onFocus={handleInputFocus}
              className="w-32 px-3 py-1.5 text-sm font-semibold text-blue-600 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
              placeholder="$0"
            />
          </div>
        )}

        {/* Slider */}
        <Slider
          ref={sliderRef}
          value={value}
          onChange={handleSliderChange}
          min={min}
          max={max}
          step={step}
          formatValue={formatValue}
          trackGradient={trackGradient}
          label={showInput ? undefined : label}
          {...props}
        />

        {/* Diff Indicator */}
        {showTooltip && !isAtBaseline && (
          <div className="flex items-center justify-between mt-1 text-xs">
            <span
              className={`font-medium ${
                buyerPerspective === 'lower-is-better'
                  ? (valueDiff > 0 ? 'text-red-600' : valueDiff < 0 ? 'text-green-600' : 'text-gray-500')
                  : (valueDiff > 0 ? 'text-green-600' : valueDiff < 0 ? 'text-red-600' : 'text-gray-500')
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

      </div>
    );
  }
);

EnhancedSlider.displayName = 'EnhancedSlider';

export default EnhancedSlider;
