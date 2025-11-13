import React, { useEffect, useRef, useState } from 'react';
import { Input, InputProps } from './Input';

interface DebugInputProps extends InputProps {
  debugLabel?: string;
}

/**
 * DebugInput - Wrapper around Input with extensive logging
 *
 * This component logs every event and state change to help diagnose
 * cursor jumping and focus loss issues.
 */
export const DebugInput: React.FC<DebugInputProps> = ({
  debugLabel = 'DebugInput',
  onChange,
  onBlur,
  onFocus,
  value,
  ...props
}) => {
  const renderCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousValue = useRef(value);

  // Track renders (using ref to avoid infinite loop)
  renderCount.current += 1;

  console.log(`[${debugLabel}] Render #${renderCount.current}`, {
    value,
    valueChanged: previousValue.current !== value,
    previousValue: previousValue.current,
    currentValue: value,
    hasFocus: document.activeElement === inputRef.current,
    inputId: inputRef.current?.id,
  });
  previousValue.current = value;

  // Track focus changes
  useEffect(() => {
    const handleFocusIn = () => {
      console.log(`[${debugLabel}] ✅ Focus gained`, {
        value,
        selectionStart: inputRef.current?.selectionStart,
        selectionEnd: inputRef.current?.selectionEnd,
      });
    };

    const handleFocusOut = () => {
      console.log(`[${debugLabel}] ❌ Focus lost`, {
        value,
        relatedTarget: (document.activeElement as any)?.tagName,
      });
    };

    const input = inputRef.current;
    if (input) {
      input.addEventListener('focusin', handleFocusIn);
      input.addEventListener('focusout', handleFocusOut);

      return () => {
        input.removeEventListener('focusin', handleFocusIn);
        input.removeEventListener('focusout', handleFocusOut);
      };
    }
  }, [debugLabel, value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const selectionStart = e.target.selectionStart;
    const selectionEnd = e.target.selectionEnd;

    console.log(`[${debugLabel}] 📝 onChange triggered`, {
      oldValue: value,
      newValue,
      selectionStart,
      selectionEnd,
      inputId: e.target.id,
      timestamp: Date.now(),
    });

    if (onChange) {
      onChange(e);
    }

    // Check cursor position after onChange
    setTimeout(() => {
      console.log(`[${debugLabel}] 🔍 After onChange`, {
        hasFocus: document.activeElement === inputRef.current,
        selectionStart: inputRef.current?.selectionStart,
        selectionEnd: inputRef.current?.selectionEnd,
        value: inputRef.current?.value,
      });
    }, 0);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    console.log(`[${debugLabel}] 💨 onBlur triggered`, {
      value: e.target.value,
      relatedTarget: (e.relatedTarget as any)?.tagName,
    });

    if (onBlur) {
      onBlur(e);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    console.log(`[${debugLabel}] 🎯 onFocus triggered`, {
      value: e.target.value,
      selectionStart: e.target.selectionStart,
      selectionEnd: e.target.selectionEnd,
    });

    if (onFocus) {
      onFocus(e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log(`[${debugLabel}] ⌨️ onKeyDown`, {
      key: e.key,
      value: (e.target as HTMLInputElement).value,
      selectionStart: (e.target as HTMLInputElement).selectionStart,
      selectionEnd: (e.target as HTMLInputElement).selectionEnd,
    });

    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    console.log(`[${debugLabel}] 🖱️ onClick`, {
      selectionStart: (e.target as HTMLInputElement).selectionStart,
      selectionEnd: (e.target as HTMLInputElement).selectionEnd,
    });

    if (props.onClick) {
      props.onClick(e);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        {...props}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
      />
      {/* Debug overlay */}
      <div className="absolute -right-2 -top-2 bg-red-500 text-white text-xs px-1 rounded pointer-events-none z-10">
        R:{renderCount.current}
      </div>
    </div>
  );
};

export default DebugInput;
