/**
 * Type declarations for @googlemaps/extended-component-library
 *
 * This package provides web component definitions for Google Maps
 * Since it doesn't ship with TypeScript declarations, we declare it as a module
 */

declare module '@googlemaps/extended-component-library' {
  /**
   * Importing this module registers the web components globally
   * - gmpx-place-autocomplete
   * - Other Google Maps web components
   */
  const library: void;
  export default library;
}
