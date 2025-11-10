// Extend Window interface
declare global {
  interface Window {
    google?: typeof google;
    __googleMapsLoaded?: boolean;
  }
}

/**
 * Dynamically loads the Google Maps JavaScript API
 */
export const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.google && window.google.maps && window.google.maps.places) {
      resolve();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for google.maps.places to be available
      const checkPlaces = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(checkPlaces);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkPlaces);
        reject(new Error('Timeout waiting for Google Maps Places API'));
      }, 10000);
      return;
    }

    // Get API key from environment
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
      console.warn('[Google Maps] API key not configured');
      reject(new Error('Google Maps API key not configured'));
      return;
    }

    // Create and load script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log('[Google Maps] Script loaded, waiting for Places API...');

      // Wait for google.maps.places to be available
      const checkPlaces = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(checkPlaces);
          console.log('[Google Maps] Places API ready');
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkPlaces);
        reject(new Error('Timeout waiting for Google Maps Places API'));
      }, 10000);
    };

    script.onerror = () => {
      console.error('[Google Maps] Failed to load API');
      reject(new Error('Failed to load Google Maps API'));
    };

    document.head.appendChild(script);
  });
};
