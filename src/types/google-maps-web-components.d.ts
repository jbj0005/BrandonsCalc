/**
 * Type declarations for Google Maps Extended Web Components
 *
 * These types cover the new web component-based APIs that replace deprecated constructors:
 * - PlaceAutocompleteElement replaces google.maps.places.Autocomplete
 * - AdvancedMarkerElement replaces google.maps.Marker
 *
 * Official docs:
 * - https://developers.google.com/maps/documentation/javascript/place-autocomplete
 * - https://developers.google.com/maps/documentation/javascript/advanced-markers/overview
 */

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gmpx-place-autocomplete': PlaceAutocompleteElementAttributes;
    }
  }
}

/**
 * PlaceAutocompleteElement - Web component for place autocomplete
 * Custom element: <gmpx-place-autocomplete>
 */
export interface PlaceAutocompleteElement extends HTMLElement {
  /**
   * The input element to attach autocomplete to
   */
  inputElement: HTMLInputElement | null;

  /**
   * The selected place result
   */
  value: google.maps.places.PlaceResult | null;

  /**
   * Types of predictions to return (e.g., 'address', 'geocode', 'establishment')
   */
  types?: string[];

  /**
   * Restrict results to specific countries (e.g., ['us', 'ca'])
   */
  componentRestrictions?: google.maps.places.ComponentRestrictions;

  /**
   * Fields to request in place details
   */
  fields?: string[];

  /**
   * Placeholder text for the input
   */
  placeholder?: string;
}

/**
 * PlaceAutocompleteElement attributes for JSX/React
 */
export interface PlaceAutocompleteElementAttributes extends React.HTMLAttributes<PlaceAutocompleteElement> {
  types?: string[];
  placeholder?: string;
}

/**
 * Event fired when a place is selected
 */
export interface PlaceChangeEvent extends Event {
  target: PlaceAutocompleteElement & {
    value: google.maps.places.PlaceResult;
  };
}

/**
 * AdvancedMarkerElement - Replaces google.maps.Marker
 * Part of the Marker Library (requires libraries=marker)
 */
declare namespace google.maps.marker {
  interface AdvancedMarkerElementOptions {
    /**
     * The map on which to display the marker
     */
    map?: google.maps.Map | null;

    /**
     * The position of the marker
     */
    position?: google.maps.LatLng | google.maps.LatLngLiteral | null;

    /**
     * The content to display as the marker
     * Can be an HTMLElement or PinElement
     */
    content?: HTMLElement | PinElement | null;

    /**
     * The title of the marker (shown on hover)
     */
    title?: string;

    /**
     * Whether the marker can be dragged
     */
    gmpDraggable?: boolean;

    /**
     * Whether the marker should scale with zoom
     */
    collisionBehavior?: string;

    /**
     * The z-index of the marker
     */
    zIndex?: number;
  }

  class AdvancedMarkerElement {
    constructor(options?: AdvancedMarkerElementOptions);

    /**
     * The map on which to display the marker
     */
    map: google.maps.Map | null;

    /**
     * The position of the marker
     */
    position: google.maps.LatLng | google.maps.LatLngLiteral | null;

    /**
     * The content displayed as the marker
     */
    content: HTMLElement | PinElement | null;

    /**
     * The title of the marker
     */
    title: string;

    /**
     * Whether the marker can be dragged
     */
    gmpDraggable: boolean;

    /**
     * The z-index of the marker
     */
    zIndex: number | null;

    /**
     * Add an event listener to the marker
     */
    addListener(
      eventName: string,
      handler: (event: google.maps.MapMouseEvent) => void
    ): google.maps.MapsEventListener;
  }

  /**
   * PinElement - Default pin marker content
   */
  interface PinElementOptions {
    /**
     * Background color of the pin
     */
    background?: string;

    /**
     * Border color of the pin
     */
    borderColor?: string;

    /**
     * Glyph/icon to display on the pin
     */
    glyph?: string | HTMLElement;

    /**
     * Color of the glyph
     */
    glyphColor?: string;

    /**
     * Scale of the pin
     */
    scale?: number;
  }

  class PinElement {
    constructor(options?: PinElementOptions);

    /**
     * The HTMLElement representing the pin
     */
    element: HTMLElement;

    /**
     * Background color of the pin
     */
    background: string;

    /**
     * Border color of the pin
     */
    borderColor: string;

    /**
     * Glyph/icon displayed on the pin
     */
    glyph: string | HTMLElement | null;

    /**
     * Color of the glyph
     */
    glyphColor: string;

    /**
     * Scale of the pin
     */
    scale: number;
  }
}

/**
 * Extend the google.maps namespace to include marker library
 */
declare namespace google.maps {
  export import marker = google.maps.marker;
}

/**
 * React ref types for web components
 */
export type PlaceAutocompleteRef = React.RefObject<PlaceAutocompleteElement>;

/**
 * Helper type for components that use Google Maps
 */
export interface GoogleMapsLoadedState {
  loaded: boolean;
  error: Error | null;
}
