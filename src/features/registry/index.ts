/**
 * Features Registry - Main Index
 *
 * Centralized registry of all application features and behaviors.
 * Organized by interaction type for easy discovery and debugging.
 *
 * Usage:
 *   import { getAllFeatures, findFeature, findByCategory } from '@/features/registry';
 *
 *   // Find all hover behaviors
 *   const hoverBehaviors = findByCategory('hover');
 *
 *   // Find features that depend on Google Maps
 *   const mapsFeatures = findByDependency('google-maps');
 *
 *   // Get specific feature
 *   const feature = findFeature('hover-profile-dropdown-open');
 */

import type { Feature, FeatureQuery, InteractionType } from './types';

// Import all feature registries
import { hoverFeatures, HOVER_CONFIGS } from './hover-behaviors';
import { clickFeatures } from './click-handlers';
import { formValidationFeatures, VALIDATION_RULES, VALIDATORS } from './form-validations';
import { apiCacheFeatures, API_ENDPOINTS, CACHE_TTL } from './api-cache';
import { keyboardFeatures } from './keyboard-shortcuts';
import { toastFeatures, TOAST_MESSAGES } from './toast-messages';
import { autoPopulateFeatures } from './auto-populate';
import { modalFeatures } from './modal-triggers';

// Re-export types
export * from './types';

// Re-export configurations and utilities
export { HOVER_CONFIGS } from './hover-behaviors';
export { VALIDATION_RULES, VALIDATORS } from './form-validations';
export { API_ENDPOINTS, CACHE_TTL } from './api-cache';
export { TOAST_MESSAGES } from './toast-messages';

/**
 * Complete feature registry
 */
const ALL_FEATURES: Feature[] = [
  ...hoverFeatures,
  ...clickFeatures,
  ...formValidationFeatures,
  ...apiCacheFeatures,
  ...keyboardFeatures,
  ...toastFeatures,
  ...autoPopulateFeatures,
  ...modalFeatures,
];

/**
 * Get all registered features
 */
export function getAllFeatures(): Feature[] {
  return ALL_FEATURES;
}

/**
 * Find a specific feature by ID
 */
export function findFeature(id: string): Feature | undefined {
  return ALL_FEATURES.find((f) => f.id === id);
}

/**
 * Find all features matching a query
 */
export function findFeatures(query: FeatureQuery): Feature[] {
  let results = ALL_FEATURES;

  if (query.category) {
    results = results.filter((f) => f.category === query.category);
  }

  if (query.dependency) {
    results = results.filter((f) =>
      f.dependencies.some((d) => d.name.includes(query.dependency!))
    );
  }

  if (query.file) {
    results = results.filter((f) =>
      f.location.some((loc) => loc.file.includes(query.file!))
    );
  }

  if (query.search) {
    const searchLower = query.search.toLowerCase();
    results = results.filter(
      (f) =>
        f.name.toLowerCase().includes(searchLower) ||
        f.description.toLowerCase().includes(searchLower) ||
        f.id.toLowerCase().includes(searchLower)
    );
  }

  return results;
}

/**
 * Find features by category
 */
export function findByCategory(category: InteractionType): Feature[] {
  return findFeatures({ category });
}

/**
 * Find features by dependency
 */
export function findByDependency(dependency: string): Feature[] {
  return findFeatures({ dependency });
}

/**
 * Find features by file
 */
export function findByFile(file: string): Feature[] {
  return findFeatures({ file });
}

/**
 * Search features
 */
export function searchFeatures(searchTerm: string): Feature[] {
  return findFeatures({ search: searchTerm });
}

/**
 * Get all features that have delays/timeouts
 */
export function getFeaturesWithDelays(): Feature[] {
  return ALL_FEATURES.filter(
    (f) => f.config && (f.config.delay !== undefined || f.config.timeout !== undefined)
  );
}

/**
 * Get feature dependencies as a graph
 */
export function getDependencyGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  ALL_FEATURES.forEach((feature) => {
    const featureDeps = feature.dependencies
      .filter((d) => d.type === 'feature')
      .map((d) => d.name);

    if (featureDeps.length > 0) {
      graph.set(feature.id, featureDeps);
    }
  });

  return graph;
}

/**
 * Get features by interaction category with counts
 */
export function getCategoryCounts(): Map<InteractionType, number> {
  const counts = new Map<InteractionType, number>();

  ALL_FEATURES.forEach((feature) => {
    const count = counts.get(feature.category) || 0;
    counts.set(feature.category, count + 1);
  });

  return counts;
}

/**
 * Print feature registry summary to console
 */
export function printRegistrySummary(): void {
  console.group('🔧 Features Registry Summary');
  console.log(`Total Features: ${ALL_FEATURES.length}`);
  console.log('');

  console.group('By Category:');
  const counts = getCategoryCounts();
  counts.forEach((count, category) => {
    console.log(`  ${category}: ${count}`);
  });
  console.groupEnd();

  console.log('');
  console.group('Features with Delays:');
  getFeaturesWithDelays().forEach((f) => {
    const delay = f.config?.delay || f.config?.timeout;
    console.log(`  ${f.name}: ${delay}ms`);
  });
  console.groupEnd();

  console.groupEnd();
}

/**
 * Validate feature registry (check for duplicate IDs, missing required fields)
 */
export function validateRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();

  ALL_FEATURES.forEach((feature, index) => {
    // Check for duplicate IDs
    if (ids.has(feature.id)) {
      errors.push(`Duplicate feature ID: ${feature.id}`);
    }
    ids.add(feature.id);

    // Check required fields
    if (!feature.name) {
      errors.push(`Feature at index ${index} missing name`);
    }
    if (!feature.description) {
      errors.push(`Feature ${feature.id} missing description`);
    }
    if (!feature.category) {
      errors.push(`Feature ${feature.id} missing category`);
    }
    if (!feature.location || feature.location.length === 0) {
      errors.push(`Feature ${feature.id} missing location`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Default export - main registry
 */
export default {
  getAllFeatures,
  findFeature,
  findFeatures,
  findByCategory,
  findByDependency,
  findByFile,
  searchFeatures,
  getFeaturesWithDelays,
  getDependencyGraph,
  getCategoryCounts,
  printRegistrySummary,
  validateRegistry,

  // Configurations
  HOVER_CONFIGS,
  VALIDATION_RULES,
  VALIDATORS,
  API_ENDPOINTS,
  CACHE_TTL,
  TOAST_MESSAGES,
};
