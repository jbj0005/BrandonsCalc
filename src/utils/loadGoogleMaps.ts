// Extend Window interface
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

declare global {
  interface Window {
    google?: typeof google;
  }
}

// Shared loader instance to avoid multiple script injections
let loadPromise: Promise<void> | null = null;
let extendedComponentsPromise: Promise<void> | null = null;

/**
 * Load Google Maps JS API using the official Loader (supports vector maps / mapId).
 */
export const loadGoogleMapsScript = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;

  if (!apiKey || apiKey === "YOUR_GOOGLE_MAPS_API_KEY") {
    return Promise.reject(new Error("Google Maps API key not configured"));
  }

  // Configure loader options once BEFORE importing libraries
  // CRITICAL: Use 'key' not 'apiKey'
  setOptions({
    key: apiKey,
    v: "weekly",
    mapIds: mapId ? [mapId] : undefined,
  });

  loadPromise = Promise.all([
    importLibrary("maps"),
    importLibrary("places"),
    importLibrary("marker"),
    importLibrary("geocoding"),
    importLibrary("routes"),
  ])
    .then(() => loadExtendedComponentLibrary())
    .catch((err) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
};

// Load the extended component library for PlaceAutocompleteElement, etc.
const loadExtendedComponentLibrary = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.customElements?.get("gmpx-place-autocomplete")) {
    return Promise.resolve();
  }

  if (extendedComponentsPromise) {
    return extendedComponentsPromise;
  }

  extendedComponentsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src =
      "https://unpkg.com/@googlemaps/extended-component-library@0.6";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load extended component library"));
    document.head.appendChild(script);
  });

  return extendedComponentsPromise;
};
