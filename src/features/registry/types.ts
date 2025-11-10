/**
 * Features Registry Types
 *
 * Defines the structure for all feature metadata in the application.
 * This centralized system makes it easier to find features, understand
 * dependencies, and debug behavioral conflicts.
 */

/**
 * Feature interaction categories
 */
export type InteractionType =
  | 'hover'          // Mouse hover interactions
  | 'click'          // Click handlers
  | 'keyboard'       // Keyboard shortcuts and handlers
  | 'form'           // Form validation and submission
  | 'auto-populate'  // Auto-fill behaviors
  | 'api'            // API calls and endpoints
  | 'cache'          // Caching strategies
  | 'toast'          // Toast notifications
  | 'modal'          // Modal triggers and management
  | 'realtime'       // Realtime subscriptions
  | 'navigation'     // Navigation and routing
  | 'state';         // State management

/**
 * Dependency types
 */
export type DependencyType =
  | 'google-maps'
  | 'supabase'
  | 'marketcheck'
  | 'feature'
  | 'hook'
  | 'service'
  | 'component';

/**
 * Code location reference
 */
export interface CodeLocation {
  file: string;
  lines?: string;      // e.g., "100-150" or "42"
  function?: string;   // Function or method name
}

/**
 * Feature dependency
 */
export interface Dependency {
  type: DependencyType;
  name: string;
  required: boolean;
  notes?: string;
}

/**
 * Feature metadata
 */
export interface Feature {
  /** Unique identifier (kebab-case) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Detailed description of what this feature does */
  description: string;

  /** Category of interaction */
  category: InteractionType;

  /** Where this feature is implemented */
  location: CodeLocation[];

  /** What this feature depends on */
  dependencies: Dependency[];

  /** What triggers this feature */
  triggers: string[];

  /** What effects this feature has */
  effects: string[];

  /** Executable configuration (optional) */
  config?: FeatureConfig;

  /** Code examples (optional) */
  examples?: string[];

  /** Debugging tips (optional) */
  debugging?: DebugTip[];
}

/**
 * Executable feature configuration
 */
export interface FeatureConfig {
  /** Delay in milliseconds (for hover, debounce, etc.) */
  delay?: number;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Validation rules */
  validation?: ValidationRule;

  /** API endpoint */
  endpoint?: string;

  /** Cache TTL in milliseconds */
  cacheTTL?: number;

  /** Toast configuration */
  toast?: ToastConfig;

  /** Custom configuration */
  [key: string]: any;
}

/**
 * Validation rule
 */
export interface ValidationRule {
  required?: boolean;
  pattern?: string | RegExp;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  custom?: (value: any) => boolean;
  message: string;
}

/**
 * Toast configuration
 */
export interface ToastConfig {
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
  ttl?: number;
}

/**
 * Debug tip
 */
export interface DebugTip {
  issue: string;
  solution: string;
}

/**
 * Feature registry - maps feature IDs to features
 */
export type FeatureRegistry = Map<string, Feature>;

/**
 * Feature query options
 */
export interface FeatureQuery {
  category?: InteractionType;
  dependency?: string;
  file?: string;
  search?: string;
}
