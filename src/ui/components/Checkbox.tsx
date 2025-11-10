import React, { forwardRef, useId } from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Checkbox label */
  label?: string;
  /** Helper text below checkbox */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Indeterminate state (for "select all" scenarios) */
  indeterminate?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Checkbox - Checkbox input component
 *
 * @example
 * <Checkbox
 *   label="Accept terms and conditions"
 *   checked={accepted}
 *   onChange={(e) => setAccepted(e.target.checked)}
 * />
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      helperText,
      error,
      indeterminate = false,
      size = 'md',
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = props.id || generatedId;
    const hasError = !!error;

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

    // Handle indeterminate state
    const checkboxRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        if (node) {
          node.indeterminate = indeterminate;
        }
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [indeterminate, ref]
    );

    return (
      <div className={className}>
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              ref={checkboxRef}
              type="checkbox"
              id={id}
              disabled={disabled}
              className={`
                ${sizeClasses[size]}
                rounded border-gray-300
                text-blue-600
                focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
                ${hasError ? 'border-red-500 focus:ring-red-500' : ''}
                cursor-pointer
              `}
              aria-invalid={hasError}
              aria-describedby={
                error ? `${id}-error` : helperText ? `${id}-helper` : undefined
              }
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
          )}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
