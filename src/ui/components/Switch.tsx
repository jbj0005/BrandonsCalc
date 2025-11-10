import React, { forwardRef, useId } from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Switch label */
  label?: string;
  /** Helper text below switch */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Label position */
  labelPosition?: 'left' | 'right';
}

/**
 * Switch - Toggle switch component
 *
 * @example
 * <Switch
 *   label="Enable notifications"
 *   checked={notificationsEnabled}
 *   onChange={(e) => setNotificationsEnabled(e.target.checked)}
 * />
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      helperText,
      error,
      size = 'md',
      labelPosition = 'right',
      disabled,
      checked,
      className = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = props.id || generatedId;
    const hasError = !!error;

    // Size classes for the switch container
    const containerSizeClasses = {
      sm: 'w-9 h-5',
      md: 'w-11 h-6',
      lg: 'w-14 h-7',
    };

    // Size classes for the switch knob
    const knobSizeClasses = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    // Translation classes for checked state
    const translateClasses = {
      sm: checked ? 'translate-x-4' : 'translate-x-0',
      md: checked ? 'translate-x-5' : 'translate-x-0',
      lg: checked ? 'translate-x-7' : 'translate-x-0',
    };

    const labelSizeClasses = {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
    };

    const switchElement = (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-invalid={hasError}
        aria-describedby={
          error ? `${id}-error` : helperText ? `${id}-helper` : undefined
        }
        disabled={disabled}
        onClick={() => {
          if (!disabled && props.onChange) {
            const event = {
              target: { checked: !checked },
              currentTarget: { checked: !checked },
            } as React.ChangeEvent<HTMLInputElement>;
            props.onChange(event);
          }
        }}
        className={`
          ${containerSizeClasses[size]}
          relative inline-flex items-center rounded-full
          transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${
            checked
              ? hasError
                ? 'bg-red-600'
                : 'bg-blue-600'
              : 'bg-gray-200'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span className="sr-only">{label || 'Toggle'}</span>
        <span
          className={`
            ${knobSizeClasses[size]}
            ${translateClasses[size]}
            inline-block rounded-full bg-white shadow-lg
            transform transition-transform duration-200 ease-in-out
          `}
        />
        {/* Hidden input for form integration */}
        <input
          ref={ref}
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          className="sr-only"
          {...props}
        />
      </button>
    );

    const labelElement = label && (
      <div className="flex-1">
        <label
          id={`${id}-label`}
          htmlFor={id}
          className={`
            ${labelSizeClasses[size]}
            font-medium text-gray-700
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {label}
        </label>
        {helperText && !error && (
          <p id={`${id}-helper`} className="text-sm text-gray-500 mt-1">
            {helperText}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="text-sm text-red-600 mt-1">
            {error}
          </p>
        )}
      </div>
    );

    return (
      <div className={`flex items-start gap-3 ${className}`}>
        {labelPosition === 'left' && labelElement}
        {switchElement}
        {labelPosition === 'right' && labelElement}
      </div>
    );
  }
);

Switch.displayName = 'Switch';

export default Switch;
