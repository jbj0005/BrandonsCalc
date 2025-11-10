/**
 * Form Validations Registry
 *
 * Centralizes all form validation rules in the application.
 * Makes it easy to reuse validations, maintain consistency, and debug form issues.
 */

import { Feature, ValidationRule } from './types';

/**
 * Validation patterns
 */
export const VALIDATION_PATTERNS = {
  /** Email validation */
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  /** VIN validation - 11-17 alphanumeric, excluding I, O, Q */
  VIN: /^[A-HJ-NPR-Z0-9]{11,17}$/i,

  /** Phone validation - US format */
  PHONE: /^\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,

  /** Zip code validation */
  ZIP: /^\d{5}(-\d{4})?$/,

  /** Year validation - 1900 to current+2 */
  YEAR: /^(19\d{2}|20\d{2})$/,
} as const;

/**
 * Validation functions
 */
export const VALIDATORS = {
  /**
   * Validate email address
   */
  email: (value: string): boolean => {
    return VALIDATION_PATTERNS.EMAIL.test(value);
  },

  /**
   * Validate VIN (Vehicle Identification Number)
   * - 11-17 characters
   * - Alphanumeric only
   * - Excludes I, O, Q (to avoid confusion with 1, 0)
   */
  vin: (value: string): boolean => {
    return VALIDATION_PATTERNS.VIN.test(value);
  },

  /**
   * Validate phone number
   */
  phone: (value: string): boolean => {
    return VALIDATION_PATTERNS.PHONE.test(value);
  },

  /**
   * Validate zip code
   */
  zip: (value: string): boolean => {
    return VALIDATION_PATTERNS.ZIP.test(value);
  },

  /**
   * Validate year
   */
  year: (value: number): boolean => {
    const currentYear = new Date().getFullYear();
    return value >= 1900 && value <= currentYear + 2;
  },

  /**
   * Validate password strength
   * Minimum 8 characters for signup
   */
  password: (value: string, mode: 'signin' | 'signup'): boolean => {
    if (mode === 'signup') {
      return value.length >= 8;
    }
    return value.length > 0;
  },

  /**
   * Validate password confirmation
   */
  passwordConfirm: (password: string, confirm: string): boolean => {
    return password === confirm;
  },
} as const;

/**
 * Validation rules for common fields
 */
export const VALIDATION_RULES: Record<string, ValidationRule> = {
  email: {
    required: true,
    pattern: VALIDATION_PATTERNS.EMAIL,
    message: 'Please enter a valid email address',
  },

  password: {
    required: true,
    minLength: 8,
    message: 'Password must be at least 8 characters',
  },

  passwordSignIn: {
    required: true,
    message: 'Password is required',
  },

  passwordConfirm: {
    required: true,
    message: 'Passwords must match',
  },

  fullName: {
    required: true,
    minLength: 2,
    message: 'Please enter your full name',
  },

  phone: {
    pattern: VALIDATION_PATTERNS.PHONE,
    message: 'Please enter a valid phone number',
  },

  vin: {
    pattern: VALIDATION_PATTERNS.VIN,
    minLength: 11,
    maxLength: 17,
    message: 'VIN must be 11-17 characters (letters and numbers only, no I, O, Q)',
  },

  year: {
    required: true,
    min: 1900,
    max: new Date().getFullYear() + 2,
    message: `Year must be between 1900 and ${new Date().getFullYear() + 2}`,
  },

  make: {
    required: true,
    minLength: 1,
    message: 'Vehicle make is required',
  },

  model: {
    required: true,
    minLength: 1,
    message: 'Vehicle model is required',
  },

  zip: {
    pattern: VALIDATION_PATTERNS.ZIP,
    message: 'Please enter a valid ZIP code',
  },
};

/**
 * Form validation features
 */
export const formValidationFeatures: Feature[] = [
  {
    id: 'validation-auth-email',
    name: 'Auth Email Validation',
    description: 'Validates email address format in authentication forms. Checks on blur and submit.',
    category: 'form',
    location: [
      {
        file: 'src/ui/components/AuthModal.tsx',
        lines: '65-76',
        function: 'validateEmail',
      },
      {
        file: 'src/ui/components/AuthModal.tsx',
        lines: '208',
        function: 'Email input onBlur',
      },
    ],
    dependencies: [],
    triggers: [
      'Email input blur',
      'Form submission',
    ],
    effects: [
      'Sets error message if invalid',
      'Clears error if valid',
      'Prevents form submission if invalid',
    ],
    config: {
      validation: VALIDATION_RULES.email,
    },
    examples: [
      `
const validateEmail = (email: string): string => {
  if (!email) return 'Email is required';
  if (!VALIDATORS.email(email)) return 'Please enter a valid email address';
  return '';
};
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Valid emails are rejected',
        solution: 'Check EMAIL pattern in VALIDATION_PATTERNS',
      },
    ],
  },

  {
    id: 'validation-auth-password',
    name: 'Auth Password Validation',
    description: 'Validates password strength. Sign-in requires any password, sign-up requires 8+ characters.',
    category: 'form',
    location: [
      {
        file: 'src/ui/components/AuthModal.tsx',
        lines: '78-90',
        function: 'validatePassword',
      },
      {
        file: 'src/ui/components/AuthModal.tsx',
        lines: '308',
        function: 'Password input onBlur',
      },
    ],
    dependencies: [],
    triggers: [
      'Password input blur',
      'Form submission',
    ],
    effects: [
      'Sets error message if invalid',
      'Different rules for signin/signup',
    ],
    config: {
      validation: VALIDATION_RULES.password,
    },
    examples: [
      `
const validatePassword = (password: string, mode: 'signin' | 'signup'): string => {
  if (!password) return 'Password is required';
  if (mode === 'signup' && password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  return '';
};
      `.trim(),
    ],
  },

  {
    id: 'validation-auth-password-confirm',
    name: 'Password Confirmation Validation',
    description: 'Validates that password and confirmation match during sign-up.',
    category: 'form',
    location: [
      {
        file: 'src/ui/components/AuthModal.tsx',
        lines: '93-104',
        function: 'validatePasswordConfirm',
      },
    ],
    dependencies: [
      {
        type: 'feature',
        name: 'validation-auth-password',
        required: true,
      },
    ],
    triggers: [
      'Confirm password input blur',
      'Form submission',
    ],
    effects: [
      'Compares with password field',
      'Shows error if mismatch',
    ],
    config: {
      validation: VALIDATION_RULES.passwordConfirm,
    },
  },

  {
    id: 'validation-vin',
    name: 'VIN Validation',
    description: 'Validates Vehicle Identification Number format. 11-17 alphanumeric characters, excluding I, O, Q.',
    category: 'form',
    location: [
      {
        file: 'src/CalculatorApp.tsx',
        lines: '554-565',
        function: 'handleVINLookup validation',
      },
      {
        file: 'src/ui/components/VehicleEditorModal.tsx',
        lines: '136-144',
        function: 'validateVin',
      },
    ],
    dependencies: [],
    triggers: [
      'VIN input change',
      'VIN lookup button click',
      'Form submission',
    ],
    effects: [
      'Shows error if invalid format',
      'Prevents lookup if invalid',
    ],
    config: {
      validation: VALIDATION_RULES.vin,
    },
    examples: [
      `
const validateVin = (vin: string): string => {
  if (!vin) return ''; // Optional field
  if (!VALIDATORS.vin(vin)) {
    return 'VIN must be 11-17 characters (letters and numbers only, no I, O, Q)';
  }
  return '';
};
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Valid VINs are rejected',
        solution: 'VINs cannot contain I, O, or Q. These letters are excluded to avoid confusion with 1 and 0.',
      },
    ],
  },

  {
    id: 'validation-vehicle-year',
    name: 'Vehicle Year Validation',
    description: 'Validates vehicle year is between 1900 and current year + 2.',
    category: 'form',
    location: [
      {
        file: 'src/ui/components/VehicleEditorModal.tsx',
        lines: '96-114',
        function: 'validateYear',
      },
    ],
    dependencies: [],
    triggers: [
      'Year input blur',
      'Form submission',
    ],
    effects: [
      'Shows error if out of range',
      'Shows error if not a number',
    ],
    config: {
      validation: VALIDATION_RULES.year,
    },
    examples: [
      `
const currentYear = new Date().getFullYear();
const validateYear = (year: number): string => {
  if (!year) return 'Year is required';
  if (year < 1900 || year > currentYear + 2) {
    return \`Year must be between 1900 and \${currentYear + 2}\`;
  }
  return '';
};
      `.trim(),
    ],
  },

  {
    id: 'validation-vehicle-make-model',
    name: 'Vehicle Make/Model Validation',
    description: 'Validates vehicle make and model are provided.',
    category: 'form',
    location: [
      {
        file: 'src/ui/components/VehicleEditorModal.tsx',
        lines: '116-134',
        function: 'validateMake, validateModel',
      },
    ],
    dependencies: [],
    triggers: [
      'Make/Model input blur',
      'Form submission',
    ],
    effects: [
      'Shows error if empty',
    ],
    config: {
      validation: VALIDATION_RULES.make,
    },
  },

  {
    id: 'validation-full-name',
    name: 'Full Name Validation',
    description: 'Validates user full name is provided (min 2 characters).',
    category: 'form',
    location: [
      {
        file: 'src/ui/components/AuthModal.tsx',
        lines: '106-114',
        function: 'validateFullName',
      },
    ],
    dependencies: [],
    triggers: [
      'Full name input blur',
      'Form submission',
    ],
    effects: [
      'Shows error if empty or too short',
    ],
    config: {
      validation: VALIDATION_RULES.fullName,
    },
  },
];

/**
 * Get validation feature by ID
 */
export function getValidationFeature(id: string): Feature | undefined {
  return formValidationFeatures.find((f) => f.id === id);
}

/**
 * Get validation rule by field name
 */
export function getValidationRule(field: string): ValidationRule | undefined {
  return VALIDATION_RULES[field];
}

/**
 * Validate a value against a rule
 */
export function validate(value: any, rule: ValidationRule): string {
  if (rule.required && !value) {
    return rule.message;
  }

  if (rule.pattern && value) {
    const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : rule.pattern;
    if (!pattern.test(value)) {
      return rule.message;
    }
  }

  if (rule.minLength && value && value.length < rule.minLength) {
    return rule.message;
  }

  if (rule.maxLength && value && value.length > rule.maxLength) {
    return rule.message;
  }

  if (rule.min !== undefined && value < rule.min) {
    return rule.message;
  }

  if (rule.max !== undefined && value > rule.max) {
    return rule.message;
  }

  if (rule.custom && !rule.custom(value)) {
    return rule.message;
  }

  return '';
}
