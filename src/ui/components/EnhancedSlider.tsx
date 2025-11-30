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
  /** Enable lock/unlock baseline feature (State 2) */
  showLock?: boolean;
  /** Whether baseline is currently locked */
  isLocked?: boolean;
  /** Locked baseline value (State 2) */
  lockedBaseline?: number | null;
  /** Callback when lock is toggled */
  onToggleLock?: () => void;
  /** Auto-lock timer active */
  isAutoLockPending?: boolean;
  /** Toggle mode: 'spring' animates back after reset, 'three-state' cycles $0/Current/Preference */
  toggleMode?: 'spring' | 'three-state';
  /** For three-state toggle: the user's saved preference value */
  userPreferenceValue?: number;
  /** For three-state toggle: current toggle state */
  toggleState?: 'zero' | 'current' | 'preference';
  /** For three-state toggle: callback when toggle state changes */
  onToggleStateChange?: (state: 'zero' | 'current' | 'preference', value: number) => void;
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
      showLock = false,
      isLocked = false,
      lockedBaseline = null,
      onToggleLock,
      isAutoLockPending = false,
      toggleMode,
      userPreferenceValue,
      toggleState = 'preference',
      onToggleStateChange,
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
    const [springAnimating, setSpringAnimating] = useState(false);

    const currentValue = Number(value || 0);

    const [lastManualValue, setLastManualValue] = useState<number>(currentValue); // Track manually set values

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

    // Track manually set values for three-state toggle (when user moves slider while in 'current' mode)
    useEffect(() => {
      if (toggleMode === 'three-state' && toggleState === 'current' && currentValue > 0) {
        setLastManualValue(currentValue);
      }
    }, [currentValue, toggleMode, toggleState]);

    // Three-state toggle: cycle through states
    const threeStateOrder: Array<'zero' | 'current' | 'preference'> = ['zero', 'current', 'preference'];

    const cycleToNextState = () => {
      if (toggleMode !== 'three-state' || !onToggleStateChange) return;

      const currentIndex = threeStateOrder.indexOf(toggleState);
      const nextIndex = (currentIndex + 1) % threeStateOrder.length;
      const nextState = threeStateOrder[nextIndex];

      let newValue: number;
      if (nextState === 'zero') {
        newValue = 0;
      } else if (nextState === 'current') {
        // Keep current value or use last manual value
        newValue = currentValue > 0 ? currentValue : lastManualValue;
      } else {
        // preference
        newValue = userPreferenceValue ?? 2000;
      }

      // Only call onToggleStateChange - parent handles both state and value updates
      // Don't call onChange here to avoid parent's onChange handler interfering with toggle state
      onToggleStateChange(nextState, newValue);
    };

    // Handle toggle click
    const handleToggleClick = () => {
      if (toggleMode === 'spring') {
        // Spring-loaded: reset to baseline, animate toggle back
        setSpringAnimating(true);
        const baselineVal = resetToBaseline();
        const syntheticEvent = {
          target: { value: String(baselineVal) },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange?.(syntheticEvent);
        onReset?.();

        // Spring back after animation
        setTimeout(() => {
          setSpringAnimating(false);
        }, 300);
      } else if (toggleMode === 'three-state') {
        cycleToNextState();
      }
    };

    // Handle reset (legacy, for backwards compatibility)
    const handleReset = () => {
      if (toggleMode) {
        handleToggleClick();
        return;
      }
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

    const glowClass =
      isFocused || isHovering
        ? 'before:absolute before:inset-x-0 before:top-0 before:h-10 before:rounded-md before:bg-emerald-500/25 before:blur-xl before:opacity-70'
        : '';

    return (
      <div
        ref={containerRef}
        className={`relative rounded-lg focus:outline-none ${glowClass}`}
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
            <div className="relative flex items-center gap-2">
              <label className="relative z-10 block text-sm font-medium text-emerald-300/80">
                {label}
              </label>

              {/* Lock/Unlock Button */}
              {showLock && onToggleLock && (
                <button
                  onClick={onToggleLock}
                  className={`p-1 rounded transition-all duration-200 ${
                    isLocked
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                  }`}
                  title={isLocked ? 'Unlock baseline price' : 'Lock baseline price'}
                  type="button"
                  aria-label={isLocked ? 'Unlock baseline price' : 'Lock baseline price'}
                >
                  {isLocked ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                    </svg>
                  )}
                </button>
              )}

              {/* Auto-lock Progress Indicator */}
              {showLock && isAutoLockPending && !isLocked && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                  <span className="text-xs text-emerald-300/60">Setting baseline...</span>
                </div>
              )}

              {/* Locked Baseline Indicator */}
              {showLock && isLocked && lockedBaseline !== null && formatValue && (
                <span className="text-xs text-emerald-400/80 font-medium">
                  Baseline: {formatValue(lockedBaseline)}
                </span>
              )}

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
              className="w-32 px-3 py-1.5 text-sm font-semibold text-white bg-black/20 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 text-right"
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

        {/* Payment Diff Note (static display above value diff) */}
        {paymentDiffForDisplay !== null && Math.abs(paymentDiffForDisplay) >= 0.01 && baselineValue !== undefined && (
          <div className="mt-1 text-xs text-center font-semibold">
            <span
              className={
                paymentDiffForDisplay < 0 ? 'text-emerald-400' : 'text-red-400'
              }
            >
              {paymentDiffForDisplay < 0 ? '↓' : '↑'}{' '}
              {formatCurrency(Math.abs(paymentDiffForDisplay))}{' '}
            </span>
            <span className="text-white/50">
              from {formatValue ? formatValue(baselineValue) : formatCurrency(baselineValue)} baseline
            </span>
          </div>
        )}

        {/* Diff Indicator and Toggle Controls */}
        {showTooltip && (shouldShowDiff || toggleMode === 'three-state') && (
          <div className="flex items-center justify-between mt-1 text-xs">
            {/* Diff value - only show if there's a diff to display */}
            {shouldShowDiff ? (
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
            ) : (
              <span />
            )}
            {showReset && toggleMode === 'spring' && (
              <button
                onClick={handleToggleClick}
                className={`
                  relative flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
                  transition-all duration-300 ease-out
                  ${springAnimating
                    ? 'bg-blue-500/30 text-blue-300 scale-95'
                    : 'bg-white/10 text-white/60 hover:bg-white/15 border border-white/20 hover:border-white/30 active:scale-95'
                  }
                `}
                type="button"
                title="Reset to baseline"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${springAnimating ? 'rotate-[-360deg]' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className={`transition-opacity duration-200 ${springAnimating ? 'opacity-50' : ''}`}>
                  Reset
                </span>
              </button>
            )}
            {showReset && toggleMode === 'three-state' && (
              <button
                onClick={handleToggleClick}
                className="relative flex items-center rounded-full text-xs font-medium bg-slate-800/80 border border-white/20 overflow-hidden"
                type="button"
                title={`Current: ${toggleState === 'zero' ? '$0' : toggleState === 'current' ? 'Manual' : 'Preference'} — Click to cycle`}
              >
                {/* Three-state segmented control */}
                <div className="flex">
                  <span className={`px-2 py-1 transition-all duration-200 ${
                    toggleState === 'zero'
                      ? 'bg-red-500/30 text-red-300'
                      : 'text-white/40 hover:text-white/60'
                  }`}>
                    $0
                  </span>
                  <span className={`px-2 py-1 transition-all duration-200 border-x border-white/10 ${
                    toggleState === 'current'
                      ? 'bg-blue-500/30 text-blue-300'
                      : 'text-white/40 hover:text-white/60'
                  }`}>
                    Manual
                  </span>
                  <span className={`px-2 py-1 transition-all duration-200 ${
                    toggleState === 'preference'
                      ? 'bg-emerald-500/30 text-emerald-300'
                      : 'text-white/40 hover:text-white/60'
                  }`}>
                    Pref
                  </span>
                </div>
              </button>
            )}
            {showReset && !toggleMode && (
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
