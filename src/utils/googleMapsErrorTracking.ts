/**
 * Google Maps Error Tracking Utility
 *
 * Centralizes error logging and monitoring for Google Maps API usage.
 * Helps track migration issues and API deprecation warnings.
 */

export enum GoogleMapsErrorType {
  LOAD_FAILURE = 'google_maps_load_failure',
  WEB_COMPONENT_UNSUPPORTED = 'google_maps_web_component_unsupported',
  AUTOCOMPLETE_ERROR = 'google_maps_autocomplete_error',
  GEOCODING_ERROR = 'google_maps_geocoding_error',
  MARKER_ERROR = 'google_maps_marker_error',
  MAP_ERROR = 'google_maps_map_error',
  DIRECTIONS_ERROR = 'google_maps_directions_error',
  API_QUOTA_EXCEEDED = 'google_maps_api_quota_exceeded',
  INVALID_API_KEY = 'google_maps_invalid_api_key',
  DEPRECATED_API_USAGE = 'google_maps_deprecated_api_usage',
}

export interface GoogleMapsError {
  type: GoogleMapsErrorType;
  message: string;
  context?: Record<string, any>;
  timestamp: number;
  userAgent: string;
}

/**
 * Error tracking configuration
 */
interface ErrorTrackingConfig {
  enableConsoleLogging: boolean;
  enableAnalytics: boolean;
  maxErrorsStored: number;
}

const defaultConfig: ErrorTrackingConfig = {
  enableConsoleLogging: true,
  enableAnalytics: false, // Set to true when analytics is integrated
  maxErrorsStored: 100,
};

// In-memory error storage for debugging
const errorLog: GoogleMapsError[] = [];

/**
 * Track a Google Maps error
 */
export function trackGoogleMapsError(
  type: GoogleMapsErrorType,
  message: string,
  context?: Record<string, any>
): void {
  const error: GoogleMapsError = {
    type,
    message,
    context,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  };

  // Store in memory (with limit)
  errorLog.push(error);
  if (errorLog.length > defaultConfig.maxErrorsStored) {
    errorLog.shift(); // Remove oldest error
  }

  // Console logging
  if (defaultConfig.enableConsoleLogging) {
    console.error(`[Google Maps] ${type}:`, message, context || '');
  }

  // Analytics tracking (extend this when you add Sentry/analytics)
  if (defaultConfig.enableAnalytics && typeof window !== 'undefined') {
    // Example: Send to analytics service
    // analytics.track(type, { message, ...context });

    // Example: Send to Sentry
    // Sentry.captureMessage(`Google Maps: ${message}`, {
    //   level: 'error',
    //   tags: { error_type: type },
    //   extra: context,
    // });
  }
}

/**
 * Get all tracked errors (for debugging)
 */
export function getGoogleMapsErrors(): GoogleMapsError[] {
  return [...errorLog];
}

/**
 * Clear error log
 */
export function clearGoogleMapsErrors(): void {
  errorLog.length = 0;
}

/**
 * Get errors by type
 */
export function getGoogleMapsErrorsByType(type: GoogleMapsErrorType): GoogleMapsError[] {
  return errorLog.filter((error) => error.type === type);
}

/**
 * Performance tracking for Google Maps operations
 */
export interface GoogleMapsPerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
}

const performanceLog: GoogleMapsPerformanceMetric[] = [];

/**
 * Track performance of Google Maps operations
 */
export function trackGoogleMapsPerformance(
  operation: string,
  startTime: number,
  success: boolean = true
): void {
  const metric: GoogleMapsPerformanceMetric = {
    operation,
    duration: Date.now() - startTime,
    timestamp: Date.now(),
    success,
  };

  performanceLog.push(metric);

  // Log slow operations
  if (metric.duration > 3000) {
    console.warn(`[Google Maps] Slow operation: ${operation} took ${metric.duration}ms`);
  }

  if (defaultConfig.enableConsoleLogging && import.meta.env.DEV) {
    console.log(`[Google Maps] ${operation}: ${metric.duration}ms`);
  }
}

/**
 * Get performance metrics
 */
export function getGoogleMapsPerformanceMetrics(): GoogleMapsPerformanceMetric[] {
  return [...performanceLog];
}

/**
 * Get average duration for an operation
 */
export function getAveragePerformance(operation: string): number {
  const metrics = performanceLog.filter((m) => m.operation === operation && m.success);
  if (metrics.length === 0) return 0;

  const total = metrics.reduce((sum, m) => sum + m.duration, 0);
  return total / metrics.length;
}

/**
 * Warning tracker for deprecated API usage
 */
export function trackDeprecatedApiUsage(apiName: string, replacementApi: string): void {
  trackGoogleMapsError(
    GoogleMapsErrorType.DEPRECATED_API_USAGE,
    `Using deprecated API: ${apiName}`,
    {
      deprecated_api: apiName,
      replacement_api: replacementApi,
      stack: new Error().stack,
    }
  );

  // Show console warning in development
  if (import.meta.env.DEV) {
    console.warn(
      `[Google Maps] DEPRECATED: ${apiName} is deprecated. Use ${replacementApi} instead.`
    );
  }
}

/**
 * Helper to wrap async Google Maps operations with error tracking
 */
export async function withErrorTracking<T>(
  operation: string,
  errorType: GoogleMapsErrorType,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    trackGoogleMapsPerformance(operation, startTime, true);
    return result;
  } catch (error) {
    trackGoogleMapsPerformance(operation, startTime, false);
    trackGoogleMapsError(errorType, error instanceof Error ? error.message : String(error), {
      operation,
      error: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Enable or disable console logging
 */
export function setConsoleLogging(enabled: boolean): void {
  defaultConfig.enableConsoleLogging = enabled;
}

/**
 * Enable or disable analytics tracking
 */
export function setAnalyticsTracking(enabled: boolean): void {
  defaultConfig.enableAnalytics = enabled;
}
