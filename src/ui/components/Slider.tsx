import React, { forwardRef, useState } from 'react';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label?: string;
  /** Show current value */
  showValue?: boolean;
  /** Format value display */
  formatValue?: (value: number) => string;
  /** Helper text */
  helperText?: string;
  /** Full width */
  fullWidth?: boolean;
  /** Custom track gradient */
  trackGradient?: string;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      label,
      showValue = true,
      formatValue,
      helperText,
      fullWidth = false,
      className = '',
      id,
      min = 0,
      max = 100,
      step = 1,
      value,
      defaultValue,
      onChange,
      trackGradient,
      ...props
    },
    ref
  ) => {
    const { style: inputStyle, ...restProps } = props;
    const sliderId = id || `slider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const [internalValue, setInternalValue] = useState(defaultValue || min);
    const currentValue = value !== undefined ? value : internalValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(Number(newValue));
      onChange?.(e);
    };

    const displayValue = formatValue
      ? formatValue(Number(currentValue))
      : currentValue;

    // Calculate percentage for gradient
    const percentage = ((Number(currentValue) - Number(min)) / (Number(max) - Number(min))) * 100;

    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {(label || showValue) && (
          <div className="flex items-center justify-between mb-2">
            {label && (
              <label
                htmlFor={sliderId}
                className="block text-sm font-medium text-gray-700"
              >
                {label}
              </label>
            )}
            {showValue && (
              <span className="text-sm font-semibold text-blue-600">
                {displayValue}
              </span>
            )}
          </div>
        )}

        <div className="relative">
          <input
            ref={ref}
            id={sliderId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={currentValue}
            onChange={handleChange}
            className={`
              w-full h-2 rounded-lg appearance-none cursor-pointer
              bg-gray-200
              focus:outline-none
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-blue-600
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:hover:bg-blue-700
              [&::-webkit-slider-thumb]:active:bg-blue-800
              [&::-webkit-slider-thumb]:shadow-md
              [&::-moz-range-thumb]:w-5
              [&::-moz-range-thumb]:h-5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-blue-600
              [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:hover:bg-blue-700
              [&::-moz-range-thumb]:active:bg-blue-800
              [&::-moz-range-thumb]:shadow-md
              ${className}
            `}
            style={{
              background:
                trackGradient ||
                `linear-gradient(to right, #2563eb 0%, #2563eb ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`,
              ...inputStyle,
            }}
            {...restProps}
          />
        </div>

        {helperText && (
          <p className="mt-1.5 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export default Slider;
