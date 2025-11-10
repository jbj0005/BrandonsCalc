/**
 * API Endpoints & Cache Strategies Registry
 *
 * Centralizes all API endpoints and caching configurations.
 * Makes it easy to find endpoints, understand caching, and debug API issues.
 */

import { Feature } from './types';

/**
 * API endpoint configurations
 */
export const API_ENDPOINTS = {
  /** Lender rates API */
  LENDER_RATES: '/api/rates',

  /** MarketCheck VIN lookup */
  MARKETCHECK_VIN: '/api/mc/by-vin',

  /** Lead submission */
  LEAD_SUBMISSION: 'customer_offers', // Supabase table

  /** Profile management */
  PROFILE: 'customer_profiles', // Supabase table

  /** Saved vehicles */
  SAVED_VEHICLES: 'vehicles', // Supabase table

  /** Garage vehicles */
  GARAGE_VEHICLES: 'garage_vehicles', // Supabase table

  /** MarketCheck cache */
  MARKETCHECK_CACHE: 'marketcheck_cache', // Supabase table
} as const;

/**
 * Cache TTL configurations (in milliseconds)
 */
export const CACHE_TTL = {
  /** Lender rates - 5 minutes */
  LENDER_RATES: 5 * 60 * 1000,

  /** MarketCheck client cache - 5 minutes */
  MARKETCHECK_CLIENT: 5 * 60 * 1000,

  /** MarketCheck server cache - 7-30 days */
  MARKETCHECK_SERVER_MIN: 7 * 24 * 60 * 60 * 1000,
  MARKETCHECK_SERVER_MAX: 30 * 24 * 60 * 60 * 1000,

  /** Profile - Infinite (realtime) */
  PROFILE: Infinity,

  /** Saved vehicles - Infinite (realtime) */
  SAVED_VEHICLES: Infinity,
} as const;

/**
 * API and caching features
 */
export const apiCacheFeatures: Feature[] = [
  {
    id: 'api-lender-rates',
    name: 'Lender Rates API',
    description: 'Fetches APR rates from lender-specific endpoints. Uses 5-minute in-memory cache to reduce API calls.',
    category: 'api',
    location: [
      {
        file: 'src/services/lenderRates.ts',
        lines: '28-90',
        function: 'fetchLenderRates, calculateAPR',
      },
    ],
    dependencies: [
      {
        type: 'supabase',
        name: 'lender_rates table',
        required: true,
        notes: 'Backend queries this table',
      },
    ],
    triggers: [
      'Lender selection change',
      'Credit score change',
      'Vehicle condition change',
      'Loan term change',
    ],
    effects: [
      'Fetches rate data from /api/rates?source={lender}',
      'Caches in memory for 5 minutes',
      'Calculates APR based on credit score, term, condition',
    ],
    config: {
      endpoint: API_ENDPOINTS.LENDER_RATES,
      cacheTTL: CACHE_TTL.LENDER_RATES,
    },
    examples: [
      `
// Fetch rates with caching
const rates = await fetchLenderRates('nfcu');

// Calculate APR
const apr = calculateAPR(rates, 'excellent', 72, 'used');
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Rates not updating',
        solution: 'Check if cache TTL has expired (5 min). Clear cache if needed.',
      },
      {
        issue: 'Wrong APR returned',
        solution: 'Verify credit score mapping in creditScoreToValue()',
      },
    ],
  },

  {
    id: 'api-marketcheck-vin',
    name: 'MarketCheck VIN Lookup',
    description: '3-layer caching strategy: client (5 min), server memory, database (7-30 days). Fetches vehicle data by VIN.',
    category: 'api',
    location: [
      {
        file: 'src/features/vehicles/marketcheck-cache.js',
        lines: '35-170',
        function: 'lookupByVIN',
      },
      {
        file: 'server/marketcheck-endpoints.js',
        lines: '1-200',
        function: 'Server-side caching and API proxy',
      },
    ],
    dependencies: [
      {
        type: 'marketcheck',
        name: 'MarketCheck API',
        required: true,
        notes: 'External paid API with rate limits',
      },
      {
        type: 'supabase',
        name: 'marketcheck_cache table',
        required: true,
        notes: 'Long-term storage for VIN data',
      },
    ],
    triggers: [
      'Manual VIN lookup button click',
    ],
    effects: [
      'Checks client cache first (5 min TTL)',
      'Falls back to server /api/mc/by-vin/{vin}',
      'Server checks memory cache, then database, then MarketCheck API',
      'Stores result in all cache layers',
      'Emits change event',
    ],
    config: {
      endpoint: API_ENDPOINTS.MARKETCHECK_VIN,
      cacheTTL: CACHE_TTL.MARKETCHECK_CLIENT,
    },
    examples: [
      `
// Lookup VIN with caching
const vehicle = await marketCheckCache.lookupByVIN('1HGBH41JXMN109186');

// Listen for updates
marketCheckCache.on('change', (vin, data) => {
  console.log('VIN data updated:', vin, data);
});
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Quota exceeded errors',
        solution: 'Cache hit rate is low. Check cache TTLs and database storage.',
      },
      {
        issue: 'Stale data returned',
        solution: 'Client cache may be serving old data. Force refresh with forceRefresh: true.',
      },
      {
        issue: 'VIN not found but exists',
        solution: 'MarketCheck may not have this VIN. Try different VIN or check MarketCheck coverage.',
      },
    ],
  },

  {
    id: 'cache-saved-vehicles',
    name: 'Saved Vehicles Realtime Cache',
    description: 'Realtime Supabase subscription with optimistic updates. Infinite TTL since realtime keeps it fresh.',
    category: 'cache',
    location: [
      {
        file: 'src/features/vehicles/saved-vehicles-cache.js',
        lines: '1-450',
        function: 'SavedVehiclesCache class',
      },
    ],
    dependencies: [
      {
        type: 'supabase',
        name: 'vehicles table',
        required: true,
        notes: 'Stores saved marketplace vehicles',
      },
    ],
    triggers: [
      'User signs in (subscribes)',
      'Realtime INSERT/UPDATE/DELETE events',
      'CRUD operations (add, update, delete)',
    ],
    effects: [
      'Maintains local cache of user vehicles',
      'Subscribes to realtime changes',
      'Optimistic updates with rollback on failure',
      'Cross-tab synchronization',
      'Pending mutations tracking',
    ],
    config: {
      cacheTTL: CACHE_TTL.SAVED_VEHICLES,
    },
    examples: [
      `
// Subscribe to realtime updates
savedVehiclesCache.subscribe(userId, supabase);

// Add vehicle with optimistic update
await savedVehiclesCache.addVehicle(vehicleData);

// Listen for changes
savedVehiclesCache.on('change', (vehicles) => {
  console.log('Vehicles updated:', vehicles);
});
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Changes not syncing across tabs',
        solution: 'Check Supabase realtime subscription is active. Verify RLS policies.',
      },
      {
        issue: 'Optimistic update not rolling back',
        solution: 'Check pending mutations tracking. Ensure error handling calls rollback.',
      },
    ],
  },

  {
    id: 'api-profile-management',
    name: 'Profile Management API',
    description: 'CRUD operations for customer profiles via Supabase. Realtime subscription for cross-tab sync.',
    category: 'api',
    location: [
      {
        file: 'src/services/ProfileService.ts',
        lines: '1-185',
        function: 'ProfileService class',
      },
      {
        file: 'src/hooks/useProfile.ts',
        lines: '1-148',
        function: 'useProfile hook',
      },
    ],
    dependencies: [
      {
        type: 'supabase',
        name: 'customer_profiles table',
        required: true,
      },
    ],
    triggers: [
      'User signs in',
      'Profile form submission',
      'Auto-population on sign in',
    ],
    effects: [
      'Loads profile from database',
      'Initializes profile if not exists',
      'Saves/updates profile with UPSERT',
      'Touches last_used_at timestamp',
      'Emits profile-loaded and profile-updated events',
    ],
    config: {
      endpoint: API_ENDPOINTS.PROFILE,
    },
    examples: [
      `
// Load profile
const profile = await profileService.loadProfile(userId);

// Save profile
const updated = await profileService.saveProfile(userId, {
  full_name: 'John Doe',
  preferred_down_payment: 5000,
});
      `.trim(),
    ],
  },

  {
    id: 'api-lead-submission',
    name: 'Lead Submission API',
    description: 'Submits customer offers to Supabase customer_offers table.',
    category: 'api',
    location: [
      {
        file: 'src/services/leadSubmission.ts',
        lines: '1-150',
        function: 'submitLead',
      },
    ],
    dependencies: [
      {
        type: 'supabase',
        name: 'customer_offers table',
        required: true,
      },
    ],
    triggers: [
      'Offer preview modal submission',
    ],
    effects: [
      'Validates user is authenticated',
      'Formats offer data',
      'Inserts into customer_offers table',
      'Returns offer ID',
    ],
    config: {
      endpoint: API_ENDPOINTS.LEAD_SUBMISSION,
    },
  },
];

/**
 * Get API/cache feature by ID
 */
export function getApiCacheFeature(id: string): Feature | undefined {
  return apiCacheFeatures.find((f) => f.id === id);
}

/**
 * Get all features that use caching
 */
export function getCachedFeatures(): Feature[] {
  return apiCacheFeatures.filter((f) => f.config?.cacheTTL !== undefined);
}

/**
 * Get cache TTL for a specific endpoint
 */
export function getCacheTTL(endpoint: string): number | undefined {
  switch (endpoint) {
    case API_ENDPOINTS.LENDER_RATES:
      return CACHE_TTL.LENDER_RATES;
    case API_ENDPOINTS.MARKETCHECK_VIN:
      return CACHE_TTL.MARKETCHECK_CLIENT;
    case API_ENDPOINTS.SAVED_VEHICLES:
      return CACHE_TTL.SAVED_VEHICLES;
    default:
      return undefined;
  }
}
