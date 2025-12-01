export interface GvwrEstimateDetail {
  factor: number; // Ratio applied to GVWR to estimate curb weight
  factorReason: string; // Human-readable reason for the factor (body type + class)
  bodyType: 'auto' | 'truck';
  classCode?: string; // e.g., "Class 2B"
  gvwrLower?: number;
  gvwrUpper?: number;
  midpoint?: number; // Midpoint used when a GVWR range is provided
}
