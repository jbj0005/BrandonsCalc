// Extend Window interface
import { Loader } from "@googlemaps/js-api-loader";

declare global {
  interface Window {
    google?: typeof google;
  }
}

// Shared loader instance to avoid multiple script injections
let loadPromise: Promise<void> | null = null;

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

  const loader = new Loader({
    apiKey,
    version: "weekly",
    libraries: ["places", "marker"],
    mapIds: mapId ? [mapId] : undefined,
  });

  loadPromise = loader
    .load()
    .then(() => {
      if (!window.google?.maps?.places) {
        throw new Error("Google Maps Places library failed to load");
      }
    })
    .catch((err) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
};
