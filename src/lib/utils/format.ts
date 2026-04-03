// @util format
// @spec AGENTS.md @section:formatting
// @purpose Data formatting utilities (currency, numbers, dates)

// =============================================================================
// @section:currency
// =============================================================================

/**
 * Formats cents (integer) as USD currency string.
 * Always includes $ prefix and comma separators.
 *
 * @example
 * formatCurrency(123456) // "$1,234.56"
 * formatCurrency(1000)   // "$10.00"
 * formatCurrency(50)     // "$0.50"
 */
export function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Formats a dollar amount (float) as USD currency string.
 * Use formatCurrency(cents) when possible for precision.
 *
 * @example
 * formatDollars(1234.56) // "$1,234.56"
 */
export function formatDollars(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Parses a currency string or number to cents (integer).
 * Handles "$1,234.56", "1234.56", 1234.56
 *
 * @example
 * parseToCents("$1,234.56") // 123456
 * parseToCents(10.50)       // 1050
 */
export function parseToCents(value: string | number): number {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  // Remove $ and commas, parse as float, convert to cents
  const cleaned = value.replace(/[$,]/g, '');
  const dollars = parseFloat(cleaned);
  if (isNaN(dollars)) return 0;
  return Math.round(dollars * 100);
}

/**
 * Converts cents to dollars (for calculations, not display).
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Converts dollars to cents (for storage).
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// =============================================================================
// @section:numbers
// =============================================================================

/**
 * Formats a number with comma separators.
 *
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234.56) // "1,234.56"
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Formats a number as integer with comma separators.
 *
 * @example
 * formatInteger(1234.7) // "1,235"
 */
export function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

/**
 * Formats a percentage (0.125 → "12.5%").
 * One decimal place max, no trailing zeros.
 *
 * @example
 * formatPercent(0.125)  // "12.5%"
 * formatPercent(0.5)    // "50%"
 * formatPercent(1)      // "100%"
 */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

// =============================================================================
// @section:phone
// =============================================================================

/**
 * Formats a phone number as (555) 123-4567.
 * Handles 10-digit US numbers.
 *
 * @example
 * formatPhone("5551234567")    // "(555) 123-4567"
 * formatPhone("+15551234567")  // "(555) 123-4567"
 */
export function formatPhone(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '');

  // Handle 11-digit (with country code) or 10-digit
  const normalized = digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;

  if (normalized.length !== 10) {
    return phone; // Return original if not valid
  }

  const area = normalized.slice(0, 3);
  const prefix = normalized.slice(3, 6);
  const line = normalized.slice(6, 10);

  return `(${area}) ${prefix}-${line}`;
}

/**
 * Strips phone to digits only for storage/API calls.
 *
 * @example
 * normalizePhone("(555) 123-4567") // "5551234567"
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Remove leading 1 if present
  return digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;
}

// =============================================================================
// @section:dates
// =============================================================================

/**
 * Formats a date for display: "Jan 15, 2025"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats a date with time: "Jan 15, 2025 at 2:30 PM"
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Formats a date for input fields: "2025-01-15"
 */
export function formatDateISO(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Formats relative time: "2 days ago", "in 3 hours"
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.round(diffMs / (1000 * 60));
      return rtf.format(diffMinutes, 'minute');
    }
    return rtf.format(diffHours, 'hour');
  }

  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day');
  }

  const diffMonths = Math.round(diffDays / 30);
  return rtf.format(diffMonths, 'month');
}
