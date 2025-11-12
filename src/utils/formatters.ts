export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
};

export const formatCurrencyInput = (value: string): string => {
  if (!value) return '';
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const [integerPartRaw, decimalRaw] = cleaned.split('.');
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const formattedInt = Number(integerPart).toLocaleString();
  const cents =
    decimalRaw !== undefined ? decimalRaw.replace(/\D/g, '').slice(0, 2) : '';
  const base = cents ? `${formattedInt}.${cents}` : formattedInt;
  return `$${base}`;
};

export const formatCurrencyValue = (
  value: number | string | null | undefined
): string => {
  if (value == null || isNaN(Number(value))) return '';
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Format negative values with parentheses for itemization
 * Positive: $2,500.00
 * Negative: ($2,500.00)
 */
export const formatNegativeParens = (value: number): string => {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`;
  }
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Format negative values with minus sign for general display
 * Positive: $2,500.00
 * Negative: -$2,500.00
 */
export const formatNegativeMinus = (value: number): string => {
  const formatted = `$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return value < 0 ? `-${formatted}` : formatted;
};

/**
 * Format currency with exact cents for itemization
 * Always shows 2 decimal places
 */
export const formatCurrencyExact = (value: number): string => {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Format currency rounded to nearest dollar for slider display
 * No decimal places
 */
export const formatCurrencyRounded = (value: number): string => {
  return `$${Math.round(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

/**
 * Format an ISO date string like 2025-03-01 into "Mar 1, 2025"
 */
export const formatEffectiveDate = (dateString?: string | null): string => {
  if (!dateString) return '';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
