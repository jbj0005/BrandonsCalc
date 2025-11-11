import { useEffect, useRef, useState, useCallback } from 'react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';

export interface PlaceDetails {
  address: string;
  city: string;
  state: string;
  stateCode: string;
  county: string;
  countyName: string;
  zipCode: string;
  country: string;
  lat: number;
  lng: number;
}

interface UseGoogleMapsAutocompleteOptions {
  onPlaceSelected?: (place: PlaceDetails) => void;
  types?: string[];
  componentRestrictions?: { country: string | string[] };
}

export const useGoogleMapsAutocomplete = (
  inputRef: React.RefObject<HTMLInputElement>,
  options: UseGoogleMapsAutocompleteOptions = {}
) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const { onPlaceSelected, types = ['address'], componentRestrictions = { country: 'us' } } = options;

  // Store callback in ref to avoid re-creating autocomplete on callback changes
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onPlaceSelected]);

  useEffect(() => {
    // Load Google Maps API
    loadGoogleMapsScript()
      .then(() => {
        setIsLoaded(true);
        setError(null);
      })
      .catch((err) => {
        console.error('[Autocomplete] Failed to load Google Maps:', err);
        setError(err.message);
        setIsLoaded(false);
      });
  }, []);

  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    // Extra safety check - ensure google.maps.places is available
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      console.warn('[Autocomplete] Google Maps Places API not yet available');
      return;
    }

    // Cleanup previous instance if it exists
    if (listenerRef.current) {
      google.maps.event.removeListener(listenerRef.current);
      listenerRef.current = null;
    }

    // Don't recreate if already initialized on the same input
    if (autocompleteRef.current) return;

    // Initialize autocomplete
    // NOTE: google.maps.places.Autocomplete is deprecated as of March 2025
    // TODO: Migrate to google.maps.places.PlaceAutocompleteElement (web component)
    // Migration guide: https://developers.google.com/maps/documentation/javascript/places-migration-overview
    // Current API will continue to receive bug fixes; 12+ months notice before discontinuation
    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types,
      componentRestrictions,
      fields: ['address_components', 'formatted_address', 'geometry', 'name'],
    });

    // Listen for place selection
    listenerRef.current = autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();

      if (!place || !place.address_components || !place.geometry) {
        return;
      }

      // Extract address components
      const addressComponents = place.address_components;
      const getComponent = (type: string, nameType: 'long_name' | 'short_name' = 'long_name') => {
        const component = addressComponents.find((c) => c.types.includes(type));
        return component ? component[nameType] : '';
      };

      // Extract county name and normalize (remove "County" or "Parish" suffix for database lookup)
      const countyRaw = getComponent('administrative_area_level_2');
      const countyNormalized = countyRaw.replace(/\s+(County|Parish)$/i, '').trim();

      const placeDetails: PlaceDetails = {
        address: place.formatted_address || '',
        city: getComponent('locality') || getComponent('sublocality'),
        state: getComponent('administrative_area_level_1'),
        stateCode: getComponent('administrative_area_level_1', 'short_name'),
        county: countyNormalized,
        countyName: countyRaw,
        zipCode: getComponent('postal_code'),
        country: getComponent('country'),
        lat: place.geometry.location?.lat() || 0,
        lng: place.geometry.location?.lng() || 0,
      };

      onPlaceSelectedRef.current?.(placeDetails);
    });

    return () => {
      if (listenerRef.current) {
        google.maps.event.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [isLoaded, inputRef]);

  return {
    isLoaded,
    error,
    autocomplete: autocompleteRef.current,
  };
};
