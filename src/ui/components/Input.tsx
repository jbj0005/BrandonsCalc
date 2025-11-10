import React, { forwardRef } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text */
  label?: string;
  /** Error message (shows error state) */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Success state */
  success?: boolean;
  /** Icon element (displayed on left) */
  icon?: React.ReactNode;
  /** Icon element (displayed on right) */
  iconRight?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Full width */
  fullWidth?: boolean;
}

const sizeBaseClasses = {
  sm: 'py-1.5 text-sm',
  md: 'py-2 text-base',
  lg: 'py-3 text-lg',
};

const defaultLeftPadding = {
  sm: 'pl-3',
  md: 'pl-4',
  lg: 'pl-5',
};

const defaultRightPadding = {
  sm: 'pr-3',
  md: 'pr-4',
  lg: 'pr-5',
};

const iconLeftPadding = {
  sm: 'pl-10',
  md: 'pl-12',
  lg: 'pl-14',
};

const iconRightPadding = {
  sm: 'pr-9',
  md: 'pr-10',
  lg: 'pr-12',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      success,
      icon,
      iconRight,
      size = 'md',
      fullWidth = false,
      className = '',
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const hasError = !!error;

    const borderColor = hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
      : success
      ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';

    const leftPaddingClass = icon ? iconLeftPadding[size] : defaultLeftPadding[size];
    const rightPaddingClass = iconRight ? iconRightPadding[size] : defaultRightPadding[size];

    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`
              block w-full rounded-lg border
              ${sizeBaseClasses[size]}
              ${leftPaddingClass}
              ${rightPaddingClass}
              ${borderColor}
              bg-white
              text-gray-900 placeholder-gray-400
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
              ${className}
            `}
            aria-invalid={hasError}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />

          {iconRight && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              {iconRight}
            </div>
          )}

          {/* Error icon */}
          {hasError && !iconRight && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}

          {/* Success icon */}
          {success && !hasError && !iconRight && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Helper text */}
        {!error && helperText && (
          <p id={`${inputId}-helper`} className="mt-1.5 text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
