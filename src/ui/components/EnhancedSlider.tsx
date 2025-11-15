import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useMemo,
  useId,
  useCallback,
} from 'react';
import { Slider, SliderProps } from './Slider';
import { useSliderBaseline } from '../../hooks/useSliderBaseline';
import { formatCurrencyInput } from '../../utils/formatters';
import { normalizeSliderValue } from './enhancedSliderHelpers.mjs';

const activeSliderStore = (() => {
  let currentId: string | null = null;
  const listeners = new Set<(id: string | null) => void>();

  return {
    get: () => currentId,
    set: (id: string | null) => {
      if (currentId === id) return;
      currentId = id;
      listeners.forEach((listener) => listener(currentId));
    },
    subscribe: (listener: (id: string | null) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
})();

export interface EnhancedSliderProps extends SliderProps {
  /** Current monthly payment for diff calculation */
  monthlyPayment?: number;
  /** Optional baseline for monthly payment diffs (State 1) */
  diffBaselinePayment?: number;
  /** Optional override for payment diff display (e.g., captured snapshot) */
  paymentDiffOverride?: number | null;
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
  /** Optional value to use specifically for diff calculations (e.g., immutable State 1) */
  diffBaselineValue?: number;
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
      diffBaselinePayment,
      diffBaselineValue,
      snapThreshold,
      buyerPerspective = 'lower-is-better',
      value,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      formatValue,
      label,
      paymentDiffOverride,
      ...props
    },
    ref
  ) => {
    const sliderKeyboardId = useId();
    const [activeSliderId, setActiveSliderId] = useState<string | null>(activeSliderStore.get());
    useEffect(() => activeSliderStore.subscribe(setActiveSliderId), []);
    const isActiveSlider = activeSliderId === sliderKeyboardId;

    const claimKeyboardControl = useCallback(() => {
      activeSliderStore.set(sliderKeyboardId);
    }, [sliderKeyboardId]);

    const releaseKeyboardControl = useCallback(() => {
      if (activeSliderStore.get() === sliderKeyboardId) {
        activeSliderStore.set(null);
      }
    }, [sliderKeyboardId]);

    const sliderRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false);

    const currentValue = Number(value || 0);

    useEffect(() => {
      return () => {
        releaseKeyboardControl();
      };
    }, [releaseKeyboardControl]);

    // Update input value when slider value changes (but not when user is typing)
    useEffect(() => {
      if (!isInputFocused) {
        setInputValue(formatCurrencyInput(String(currentValue)));
      }
    }, [currentValue, isInputFocused]);
    const numericMin = Number(min);
    const numericMax = Number(max);
    const numericStep =
      typeof step === 'number'
        ? step
        : typeof step === 'string'
          ? Number(step)
          : 0;
    const effectiveStep = Number.isFinite(numericStep) && numericStep > 0 ? numericStep : 0.01;
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

    const snapBaseline = useMemo(() => {
      if (baselineValue !== undefined && Number.isFinite(baselineValue)) {
        return baselineValue;
      }
      return baseline;
    }, [baselineValue, baseline]);

    const diffBaseline = useMemo(() => {
      if (diffBaselineValue !== undefined && Number.isFinite(diffBaselineValue)) {
        return diffBaselineValue;
      }
      return snapBaseline;
    }, [diffBaselineValue, snapBaseline]);

    const diffFromBaseline =
      diffBaseline != null ? currentValue - diffBaseline : 0;

    const valueDiffForDisplay =
      diffBaseline != null ? currentValue - diffBaseline : 0;
    const paymentDiffForDisplay =
      paymentDiffOverride !== undefined
        ? paymentDiffOverride
        : diffBaselinePayment != null && monthlyPayment != null
          ? monthlyPayment - diffBaselinePayment
          : null;

    const isAtDiffBaseline =
      diffBaseline != null
        ? Math.abs(diffFromBaseline) <= effectiveSnapThreshold
        : isAtBaseline;

    const shouldShowDiff = diffBaseline != null;

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
      diffBaseline != null ? diffBaseline : numericMin
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
      claimKeyboardControl();
    };

    // Handle mouse leave
    const handleMouseLeave = () => {
      setIsHovering(false);
      if (!isFocused) {
        releaseKeyboardControl();
      }
    };

    // Handle arrow key navigation (when hovering or focused)
    useEffect(() => {
      const shouldHandleKeys = (isHovering || isActiveSlider) && !isInputFocused;
      if (!shouldHandleKeys) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          return;
        }

        e.preventDefault();

        const direction = ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 1;
        let newValue = Math.max(
          Number(min),
          Math.min(Number(max), currentValue + direction * effectiveStep)
        );

        newValue = normalizeSliderValue({
          rawValue: newValue,
          baseline: snapBaseline,
          snapThreshold: effectiveSnapThreshold,
          disableSnap: snapBaseline != null && currentValue === snapBaseline,
          stepSize: effectiveStep,
        });

        // Create synthetic event
        const syntheticEvent = {
          target: { value: String(newValue) },
        } as React.ChangeEvent<HTMLInputElement>;

        onChange?.(syntheticEvent);
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [
      isHovering,
      isActiveSlider,
      isInputFocused,
      currentValue,
      min,
      max,
      effectiveStep,
      snapBaseline,
      effectiveSnapThreshold,
      onChange,
    ]);

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

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur(); // Blur will trigger handleInputBlur which updates the value
      }
    };

    const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!onChange) return;
      const normalizedValue = normalizeSliderValue({
        rawValue: Number(event.target.value),
        baseline: snapBaseline,
        snapThreshold: effectiveSnapThreshold,
        stepSize: effectiveStep,
      });

      if (event.target instanceof HTMLInputElement) {
        event.target.value = String(normalizedValue);
      }
      if (event.currentTarget instanceof HTMLInputElement) {
        event.currentTarget.value = String(normalizedValue);
      }

      onChange(event);
    };

    return (
      <div
        ref={containerRef}
        className="relative focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => {
          setIsFocused(true);
          claimKeyboardControl();
        }}
        onBlur={() => {
          setIsFocused(false);
          if (!isHovering) {
            releaseKeyboardControl();
          }
        }}
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
                    {paymentDiffForDisplay !== null &&
                      Math.abs(paymentDiffForDisplay) >= 1 && (
                      <div className={`text-xs text-center mt-0.5 font-semibold flex items-center justify-center gap-1 ${
                        paymentDiffForDisplay > 0
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}>
                        <span className="text-sm">
                          {paymentDiffForDisplay > 0 ? '↑' : '↓'}
                        </span>
                        <span>{formatCurrency(Math.abs(paymentDiffForDisplay))}</span>
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
              onKeyDown={handleInputKeyDown}
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
        {showTooltip && shouldShowDiff && (
          <div className="flex items-center justify-between mt-1 text-xs">
            <span
              className={`font-medium ${
                buyerPerspective === 'lower-is-better'
                  ? (valueDiffForDisplay > 0 ? 'text-red-600' : valueDiffForDisplay < 0 ? 'text-green-600' : 'text-gray-500')
                  : (valueDiffForDisplay > 0 ? 'text-green-600' : valueDiffForDisplay < 0 ? 'text-red-600' : 'text-gray-500')
              }`}
            >
              {valueDiffForDisplay > 0 ? '+' : ''}
              {formatValue
                ? formatValue(valueDiffForDisplay)
                : valueDiffForDisplay.toLocaleString()}
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
