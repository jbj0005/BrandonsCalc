import React, { forwardRef, useId } from 'react';

export interface RadioOption {
  value: string;
  label: string;
  helperText?: string;
  disabled?: boolean;
}

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Radio label */
  label?: string;
  /** Helper text below radio */
  helperText?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

export interface RadioGroupProps {
  /** Radio group label */
  label?: string;
  /** Radio options */
  options: RadioOption[];
  /** Selected value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Input name attribute */
  name: string;
  /** Error message */
  error?: string;
  /** Helper text below group */
  helperText?: string;
  /** Layout orientation */
  orientation?: 'vertical' | 'horizontal';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Radio - Single radio button component
 *
 * @example
 * <Radio
 *   label="Option 1"
 *   name="choice"
 *   value="option1"
 *   checked={selected === 'option1'}
 *   onChange={(e) => setSelected(e.target.value)}
 * />
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      label,
      helperText,
      size = 'md',
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = props.id || generatedId;

    // Size classes
    const sizeClasses = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    const labelSizeClasses = {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
    };

    return (
      <div className={className}>
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              ref={ref}
              type="radio"
              id={id}
              disabled={disabled}
              className={`
                ${sizeClasses[size]}
                border-gray-300
                text-blue-600
                focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
                cursor-pointer
              `}
              {...props}
            />
          </div>

          {label && (
            <div className="ml-3">
              <label
                htmlFor={id}
                className={`
                  ${labelSizeClasses[size]}
                  font-medium text-gray-700
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {label}
              </label>
              {helperText && (
                <p className="text-sm text-gray-500 mt-1">{helperText}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

Radio.displayName = 'Radio';

/**
 * RadioGroup - Radio button group component
 *
 * @example
 * <RadioGroup
 *   label="Payment Method"
 *   name="payment"
 *   value={paymentMethod}
 *   onChange={setPaymentMethod}
 *   options={[
 *     { value: 'credit', label: 'Credit Card' },
 *     { value: 'debit', label: 'Debit Card' },
 *   ]}
 * />
 */
export const RadioGroup: React.FC<RadioGroupProps> = ({
  label,
  options,
  value,
  onChange,
  name,
  error,
  helperText,
  orientation = 'vertical',
  size = 'md',
  disabled,
  className = '',
}) => {
  const groupId = useId();
  const hasError = !!error;

  const handleChange = (optionValue: string) => {
    if (onChange) {
      onChange(optionValue);
    }
  };

  return (
    <fieldset className={className}>
      {label && (
        <legend className="text-base font-semibold text-gray-900 mb-3">
          {label}
        </legend>
      )}

      <div
        className={`
          ${orientation === 'horizontal' ? 'flex flex-wrap gap-6' : 'space-y-4'}
        `}
        role="radiogroup"
        aria-labelledby={label ? `${groupId}-label` : undefined}
        aria-invalid={hasError}
        aria-describedby={
          error ? `${groupId}-error` : helperText ? `${groupId}-helper` : undefined
        }
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            label={option.label}
            helperText={option.helperText}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled || option.disabled}
            size={size}
          />
        ))}
      </div>

      {helperText && !error && (
        <p id={`${groupId}-helper`} className="text-sm text-gray-500 mt-3">
          {helperText}
        </p>
      )}
      {error && (
        <p id={`${groupId}-error`} className="text-sm text-red-600 mt-3">
          {error}
        </p>
      )}
    </fieldset>
  );
};

export default Radio;
