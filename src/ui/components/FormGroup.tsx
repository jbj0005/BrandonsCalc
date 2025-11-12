import React from 'react';

export interface FormGroupProps {
  /** Form field label */
  label?: string;
  /** Required indicator */
  required?: boolean;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Form control element (Input, Select, Slider, etc.) */
  children: React.ReactNode;
  /** Unique ID for the form control */
  htmlFor?: string;
  /** Additional className */
  className?: string;
}

/**
 * FormGroup - Wrapper component that combines label, form control, and error/helper text
 *
 * @example
 * <FormGroup label="Email" required error={errors.email}>
 *   <Input type="email" value={email} onChange={handleChange} />
 * </FormGroup>
 */
export const FormGroup: React.FC<FormGroupProps> = ({
  label,
  required,
  error,
  helperText,
  children,
  htmlFor,
  className = '',
}) => {
  const hasError = !!error;
  const groupId = htmlFor || `form-group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={`w-full ${className}`}>
      {/* Label */}
      {label && (
        <label
          htmlFor={groupId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Form Control */}
      <div className="relative">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            // Pass down ID and ARIA attributes to child components
            const additionalProps = {
              id: groupId,
              'aria-invalid': hasError,
              'aria-describedby': error
                ? `${groupId}-error`
                : helperText
                ? `${groupId}-helper`
                : undefined,
            };
            return React.cloneElement(child as React.ReactElement<any>, additionalProps);
          }
          return child;
        })}
      </div>

      {/* Error message */}
      {error && (
        <p id={`${groupId}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Helper text */}
      {!error && helperText && (
        <p id={`${groupId}-helper`} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
};

export default FormGroup;
