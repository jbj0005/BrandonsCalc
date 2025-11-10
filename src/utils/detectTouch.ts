/**
 * Touch Device Detection Utilities
 *
 * Detects whether the current device has touch capabilities.
 * Used to disable hover effects on mobile devices for better UX.
 */

/**
 * Detect if the device has touch capability
 *
 * Uses modern pointer media queries for accurate detection.
 * Falls back to ontouchstart check for older browsers.
 *
 * @returns true if device supports touch input
 */
export function isTouchDevice(): boolean {
  // Modern approach: check pointer media query
  // coarse = touch screen, fine = mouse/trackpad
  if (typeof window !== 'undefined' && window.matchMedia) {
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (hasCoarsePointer) {
      return true;
    }
  }

  // Fallback for older browsers
  if (typeof window !== 'undefined') {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  return false;
}

/**
 * Check if hover is available
 *
 * Returns true if the device can hover (has a fine pointer like mouse).
 * This is the inverse of touch-only devices.
 *
 * @returns true if hover is available
 */
export function hasHover(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  // Fallback: assume hover is available if not touch
  return !isTouchDevice();
}
