import React, { useState, useRef, useEffect } from 'react';
import { formatCurrencyExact, parseCurrency } from '../../utils/formatters';

export interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * CurrencyInput - Inline editable currency input with subtle styling
 *
 * Features:
 * - Shows formatted currency when not focused
 * - Shows editable number when focused
 * - Borderless with subtle underline on hover/focus
 * - Right-aligned for currency values
 * - Enter to save, Escape to cancel
 * - Validates min=0
 */
export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // When focus starts, set edit value to the raw number
  const handleFocus = () => {
    setIsFocused(true);
    setEditValue(value.toString());
  };

  // When focus ends, parse and save the value
  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseCurrency(editValue);
    const validated = Math.max(0, parsed); // Ensure non-negative

    if (validated !== value) {
      onChange(validated);
    }
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur(); // Trigger blur to save
    } else if (e.key === 'Escape') {
      setEditValue(value.toString()); // Reset to original value
      inputRef.current?.blur(); // Cancel edit
    }
  };

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={isFocused ? editValue : formatCurrencyExact(value)}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={`
        bg-transparent
        border-0
        border-b-2
        border-transparent
        outline-none
        text-right
        px-1
        transition-colors
        hover:border-blue-200
        focus:border-blue-500
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${className}
      `.trim()}
    />
  );
};

export default CurrencyInput;
