// @util formData
// @spec AGENTS.md
// @purpose Safe FormData extraction utilities

// =============================================================================
// @section:string-extraction
// =============================================================================

/**
 * Safely extracts a string value from FormData.
 * Returns trimmed string or default value if not a string.
 */
export function getFormString(data: FormData, key: string, defaultValue = ''): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : defaultValue;
}

/**
 * Extracts a required string, throws if missing or empty.
 */
export function getRequiredString(data: FormData, key: string): string {
  const value = getFormString(data, key);
  if (!value) {
    throw new FormValidationError(key, `${key} is required`);
  }
  return value;
}

// =============================================================================
// @section:number-extraction
// =============================================================================

/**
 * Safely extracts a number value from FormData.
 * Returns parsed number or default value if invalid.
 */
export function getFormNumber(data: FormData, key: string, defaultValue = 0): number {
  const value = data.get(key);
  if (typeof value !== 'string') return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Extracts a required positive number, throws if invalid.
 */
export function getRequiredPositiveNumber(data: FormData, key: string): number {
  const value = getFormNumber(data, key, NaN);
  if (isNaN(value) || value <= 0) {
    throw new FormValidationError(key, `${key} must be a positive number`);
  }
  return value;
}

// =============================================================================
// @section:boolean-extraction
// =============================================================================

/**
 * Extracts a boolean from checkbox input.
 * Checkbox sends 'on' when checked, nothing when unchecked.
 */
export function getFormBoolean(data: FormData, key: string): boolean {
  const value = data.get(key);
  return value === 'on' || value === 'true' || value === '1';
}

// =============================================================================
// @section:email-extraction
// =============================================================================

/**
 * Extracts and validates an email address.
 * Returns lowercase trimmed email.
 */
export function getFormEmail(data: FormData, key: string): string {
  const value = getFormString(data, key).toLowerCase();
  return value;
}

/**
 * Extracts a required valid email, throws if invalid.
 */
export function getRequiredEmail(data: FormData, key: string): string {
  const value = getFormEmail(data, key);
  if (!value) {
    throw new FormValidationError(key, 'Email is required');
  }
  if (!isValidEmail(value)) {
    throw new FormValidationError(key, 'Invalid email format');
  }
  return value;
}

/**
 * Simple email validation regex.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================================================
// @section:date-extraction
// =============================================================================

/**
 * Extracts a date string from input type="date".
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
export function getFormDate(data: FormData, key: string): string | null {
  const value = getFormString(data, key);
  if (!value) return null;
  // Validate it's a valid date
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return value;
}

// =============================================================================
// @section:select-extraction
// =============================================================================

/**
 * Extracts a value from a select input with type safety.
 * Returns the value if it's one of the allowed options.
 */
export function getFormSelect<T extends string>(
  data: FormData,
  key: string,
  allowedValues: readonly T[],
  defaultValue: T
): T {
  const value = getFormString(data, key);
  if (allowedValues.includes(value as T)) {
    return value as T;
  }
  return defaultValue;
}

// =============================================================================
// @section:validation-error
// =============================================================================

/**
 * Custom error for form validation failures.
 */
export class FormValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'FormValidationError';
    this.field = field;
  }
}

/**
 * Helper to build error object for form action fail response.
 */
export function buildFormErrors(errors: Array<{ field: string; message: string }>) {
  const result: Record<string, string> = {};
  for (const err of errors) {
    result[err.field] = err.message;
  }
  return result;
}

// =============================================================================
// @section:bulk-extraction
// =============================================================================

/**
 * Extract multiple string fields at once.
 */
export function extractStrings<K extends string>(
  data: FormData,
  keys: K[]
): Record<K, string> {
  const result = {} as Record<K, string>;
  for (const key of keys) {
    result[key] = getFormString(data, key);
  }
  return result;
}
