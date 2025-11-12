// Extend Window interface
declare global {
  interface Window {
    google?: typeof google;
    __googleMapsLoaded?: boolean;
    __googleMapsWebComponentsLoaded?: boolean;
  }
}

/**
 * Check if browser supports web components (needed for new Google Maps APIs)
 */
const supportsWebComponents = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false; // SSR environment
  }

  try {
    const testElement = document.createElement('div');
    return !!(
      window.customElements &&
      typeof window.customElements.define === 'function' &&
      typeof testElement.attachShadow === 'function'
    );
  } catch {
    return false;
  }
};

/**
 * Dynamically loads the Google Maps JavaScript API with beta features
 * Includes support for new PlaceAutocompleteElement and AdvancedMarkerElement
 *
 * Migration notes:
 * - Using v=weekly for stable beta features (v=beta is too unstable for production)
 * - Loads extended-component-library for web component support
 * - PlaceAutocompleteElement replaces deprecated google.maps.places.Autocomplete
 * - AdvancedMarkerElement replaces deprecated google.maps.Marker
 */
export const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check for web component support
    if (!supportsWebComponents()) {
      console.error('[Google Maps] Browser does not support web components (Custom Elements, Shadow DOM)');
      reject(new Error('Browser does not support web components required for Google Maps'));
      return;
    }

    // Check if already loaded
    if (
      window.google &&
      window.google.maps &&
      window.google.maps.places &&
      window.__googleMapsWebComponentsLoaded
    ) {
      resolve();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for both legacy API and web components to be available
      const checkReady = setInterval(() => {
        if (
          window.google &&
          window.google.maps &&
          window.google.maps.places &&
          window.__googleMapsWebComponentsLoaded
        ) {
          clearInterval(checkReady);
          resolve();
        }
      }, 100);

      // Timeout after 15 seconds (longer because we need to load web components too)
      setTimeout(() => {
        clearInterval(checkReady);
        reject(new Error('Timeout waiting for Google Maps API and web components'));
      }, 15000);
      return;
    }

    // Get API key from environment
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
      console.warn('[Google Maps] API key not configured');
      reject(new Error('Google Maps API key not configured'));
      return;
    }

    // Create and load Google Maps script with beta features
    // Using v=weekly instead of v=beta for more stability while still getting new features
    // solutionChannel helps Google track usage of new web components
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&v=weekly&loading=async&solution_channel=GMP_modernization_autocomplete_marker`;
    script.async = true;
    script.defer = true;

    script.onload = async () => {
      // Wait for google.maps.places to be available
      const checkPlaces = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(checkPlaces);
          loadWebComponents();
        }
      }, 100);

      // Timeout after 10 seconds for legacy API
      setTimeout(() => {
        clearInterval(checkPlaces);
        reject(new Error('Timeout waiting for Google Maps Places API'));
      }, 10000);
    };

    script.onerror = () => {
      console.error('[Google Maps] Failed to load API');
      reject(new Error('Failed to load Google Maps API'));
    };

    // Load web components library after core API loads
    const loadWebComponents = async () => {
      try {
        // Load extended component library from CDN (npm package has build issues)
        // This provides PlaceAutocompleteElement and other web components
        const webComponentScript = document.createElement('script');
        webComponentScript.src = 'https://unpkg.com/@googlemaps/extended-component-library@0.6';
        webComponentScript.type = 'module';

        await new Promise<void>((resolveScript, rejectScript) => {
          webComponentScript.onload = () => resolveScript();
          webComponentScript.onerror = () => rejectScript(new Error('Failed to load web components script'));
          document.head.appendChild(webComponentScript);
        });

        // Mark as loaded
        window.__googleMapsWebComponentsLoaded = true;

        console.log('[Google Maps] API and web components loaded successfully');
        resolve();
      } catch (error) {
        console.error('[Google Maps] Failed to load web components library:', error);
        reject(new Error('Failed to load Google Maps web components'));
      }
    };

    document.head.appendChild(script);
  });
};
