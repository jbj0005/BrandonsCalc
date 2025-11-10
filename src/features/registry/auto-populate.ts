/**
 * Auto-Populate Behaviors Registry
 *
 * Centralizes all auto-fill/auto-populate behaviors in the application.
 */

import { Feature } from './types';

export const autoPopulateFeatures: Feature[] = [
  {
    id: 'auto-populate-location',
    name: 'Location Auto-Populate from Profile',
    description: 'Auto-fills location input from user profile address when signing in. Only if location is empty.',
    category: 'auto-populate',
    location: [
      { file: 'src/CalculatorApp.tsx', lines: '216-254', function: 'useEffect for location auto-fill' },
      { file: 'src/hooks/useLocationAutoPopulate.ts' },
    ],
    dependencies: [
      { type: 'google-maps', name: 'Geocoder', required: true, notes: 'For geocoding address' },
      { type: 'service', name: 'ProfileService', required: true },
    ],
    triggers: ['User signs in', 'Profile loads with address'],
    effects: [
      'Sets location field to profile address',
      'Geocodes address to get lat/lng',
      'Sets locationDetails state',
      'Blue flash animation on field',
    ],
    config: {},
    examples: [
      `
// Auto-populate location on profile load
useEffect(() => {
  if (!profile || !mapsLoaded || location) return;

  const address = [
    profile.street_address,
    profile.city,
    profile.state_code,
    profile.zip_code
  ].filter(Boolean).join(', ');

  if (address) {
    setLocation(address);
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK') {
        setLocationDetails(results[0]);
      }
    });
  }
}, [profile, mapsLoaded]);
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Location not auto-filling',
        solution: 'Check that profile has address fields and mapsLoaded is true',
      },
    ],
  },

  {
    id: 'auto-populate-down-payment',
    name: 'Down Payment Auto-Populate from Profile',
    description: 'Auto-fills preferred down payment when vehicle is selected. Only if at default value.',
    category: 'auto-populate',
    location: [
      { file: 'src/CalculatorApp.tsx', lines: '256-264', function: 'useEffect for down payment' },
      { file: 'src/hooks/useCashDownAutoPopulate.ts' },
    ],
    dependencies: [
      { type: 'service', name: 'ProfileService', required: true },
    ],
    triggers: ['Vehicle selected', 'Profile has preferred_down_payment'],
    effects: [
      'Sets cashDown to profile.preferred_down_payment',
      'Only if cashDown is at default (5000)',
      'Blue flash animation',
    ],
    config: {},
  },

  {
    id: 'auto-populate-trade-in',
    name: 'Trade-In Auto-Populate from Profile',
    description: 'Auto-fills trade-in value from garage vehicles. User modification tracking prevents overwriting.',
    category: 'auto-populate',
    location: [
      { file: 'src/hooks/useTradeInAutoPopulate.ts' },
    ],
    dependencies: [
      { type: 'feature', name: 'garage-vehicles', required: true },
    ],
    triggers: ['Selected vehicle changes', 'Garage vehicles available'],
    effects: [
      'Sets tradeAllowance and tradePayoff',
      'Tracks user modifications',
      'Blue flash animation',
    ],
    config: {},
  },

  {
    id: 'auto-populate-profile-fields',
    name: 'Profile Fields Auto-Populate on Sign In',
    description: 'Auto-fills calculator form fields from profile on sign in (name, email, phone, credit score).',
    category: 'auto-populate',
    location: [
      { file: 'src/features/auth/auth-manager.ts', lines: '231-310', function: 'Auto-populate on sign in' },
    ],
    dependencies: [
      { type: 'service', name: 'ProfileService', required: true },
    ],
    triggers: ['User signs in', 'Profile loads'],
    effects: [
      'Fills customer name, email, phone',
      'Sets credit score',
      'Sets location',
      'Blue flash animations',
      'Tracks user modifications',
    ],
    config: {},
    debugging: [
      {
        issue: 'Fields overwriting user edits',
        solution: 'Check user modification tracking flags. Should not overwrite if user has edited.',
      },
    ],
  },
];

export function getAutoPopulateFeature(id: string): Feature | undefined {
  return autoPopulateFeatures.find((f) => f.id === id);
}
