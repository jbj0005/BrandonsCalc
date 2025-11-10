/**
 * Toast Messages Registry
 *
 * Centralizes all toast notification configurations and templates.
 */

import { Feature, ToastConfig } from './types';

/**
 * Toast message templates
 */
export const TOAST_MESSAGES = {
  // Auth
  SIGN_IN_SUCCESS: {
    kind: 'success' as const,
    title: 'Signed In',
    detail: 'Welcome back!',
  },
  SIGN_OUT_SUCCESS: {
    kind: 'success' as const,
    title: 'Signed Out',
    detail: 'You have been signed out',
  },
  AUTH_ERROR: {
    kind: 'error' as const,
    title: 'Authentication Error',
  },

  // Profile
  PROFILE_SAVED: {
    kind: 'success' as const,
    title: 'Profile saved successfully',
  },
  PROFILE_ERROR: {
    kind: 'error' as const,
    title: 'Failed to save profile',
  },

  // Vehicles
  VEHICLE_SELECTED: {
    kind: 'success' as const,
    title: 'Vehicle Selected',
  },
  VEHICLE_SAVED: {
    kind: 'success' as const,
    title: 'Vehicle Saved',
  },
  VEHICLE_DELETED: {
    kind: 'success' as const,
    title: 'Vehicle Deleted',
  },
  VEHICLE_ERROR: {
    kind: 'error' as const,
    title: 'Vehicle Operation Failed',
  },

  // VIN Lookup
  VIN_LOOKUP_SUCCESS: {
    kind: 'success' as const,
    title: 'VIN Lookup Complete',
  },
  VIN_QUOTA_ERROR: {
    kind: 'warning' as const,
    title: 'Lookup Temporarily Unavailable',
    detail: 'API quota exceeded - try again later',
  },
  VIN_NOT_FOUND: {
    kind: 'error' as const,
    title: 'VIN Not Found',
  },
  VIN_NETWORK_ERROR: {
    kind: 'error' as const,
    title: 'Network Error',
    detail: 'Could not connect to VIN lookup service',
  },

  // Rates
  RATES_ERROR: {
    kind: 'error' as const,
    title: 'Failed to Load Rates',
  },

  // Generic
  LOADING: {
    kind: 'info' as const,
    title: 'Loading...',
  },
  SUCCESS: {
    kind: 'success' as const,
    title: 'Success',
  },
  ERROR: {
    kind: 'error' as const,
    title: 'Error',
  },
};

export const toastFeatures: Feature[] = [
  {
    id: 'toast-system',
    name: 'Toast Notification System',
    description: 'Context-based toast notification system with auto-dismiss, deduplication, and max 3 visible at once.',
    category: 'toast',
    location: [
      { file: 'src/ui/components/Toast.tsx', lines: '1-150', function: 'ToastProvider, useToast' },
    ],
    dependencies: [],
    triggers: ['toast.push() called'],
    effects: [
      'Shows toast notification',
      'Auto-dismisses after TTL (except errors)',
      'Deduplicates within 2 seconds',
      'Max 3 toasts visible',
    ],
    config: {
      toast: {
        kind: 'info',
        title: '',
        ttl: 4000, // 4 seconds default
      },
    },
    examples: [
      `
// Basic toast
toast.push({ kind: 'success', title: 'Success!' });

// With detail
toast.push({
  kind: 'error',
  title: 'Failed to save',
  detail: error.message,
});

// Custom TTL
toast.push({
  kind: 'info',
  title: 'Loading...',
  ttl: 2000,
});
      `.trim(),
    ],
  },
];

/**
 * Get toast template by key
 */
export function getToastTemplate(key: keyof typeof TOAST_MESSAGES): ToastConfig {
  return TOAST_MESSAGES[key];
}

export function getToastFeature(id: string): Feature | undefined {
  return toastFeatures.find((f) => f.id === id);
}
