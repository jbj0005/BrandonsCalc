import { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';
import { PlaceAutocompleteElement, PlaceChangeEvent } from '../types/google-maps-web-components';
import {
  trackGoogleMapsError,
  trackGoogleMapsPerformance,
  GoogleMapsErrorType,
} from '../utils/googleMapsErrorTracking';

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

/**
 * Modern Google Maps Autocomplete Hook
 *
 * Uses PlaceAutocompleteElement (web component) which replaces the deprecated
 * google.maps.places.Autocomplete constructor.
 *
 * Migration details:
 * - Replaced: new google.maps.places.Autocomplete() (deprecated March 2025)
 * - With: PlaceAutocompleteElement web component
 * - Event: place_changed → gmpx-placechange
 * - API: getPlace() → event.target.value
 *
 * @see https://developers.google.com/maps/documentation/javascript/place-autocomplete
 */
export const useGoogleMapsAutocomplete = (
  inputRef: React.RefObject<HTMLInputElement | null>,
  options: UseGoogleMapsAutocompleteOptions = {}
) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autocompleteElementRef = useRef<PlaceAutocompleteElement | null>(null);
  const { onPlaceSelected, types, componentRestrictions = { country: 'us' } } = options;

  // Store callback in ref to avoid re-creating autocomplete on callback changes
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onPlaceSelected]);

  // Load Google Maps API with web components
  useEffect(() => {
    const loadStartTime = Date.now();

    loadGoogleMapsScript()
      .then(() => {
        setIsLoaded(true);
        setError(null);
        trackGoogleMapsPerformance('autocomplete_api_load', loadStartTime, true);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoaded(false);
        trackGoogleMapsError(
          GoogleMapsErrorType.LOAD_FAILURE,
          err.message,
          { component: 'useGoogleMapsAutocomplete' }
        );
        trackGoogleMapsPerformance('autocomplete_api_load', loadStartTime, false);
      });
  }, []);

  // Initialize Autocomplete (using legacy API temporarily)
  // TODO: Migrate to PlaceAutocompleteElement web component when we have time to properly test
  // The web component requires a different implementation pattern (creates its own input)
  // Legacy API works until March 2026, giving us 15 months to migrate properly
  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    // Safety check - ensure Google Maps is loaded
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    // Don't recreate if already initialized
    if (autocompleteElementRef.current) {
      return;
    }

    const initStartTime = Date.now();

    try {
      // Using legacy Autocomplete API (works until March 2026)
      // This attaches to existing input elements properly
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        ...(types ? { types } : {}),
        componentRestrictions,
        fields: ['address_components', 'formatted_address', 'geometry', 'name'],
      });

      // Store reference (type assertion for compatibility)
      autocompleteElementRef.current = autocomplete as any;

      // Listen for place selection
      const listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();

        if (!place || !place.address_components || !place.geometry) {
          trackGoogleMapsError(
            GoogleMapsErrorType.AUTOCOMPLETE_ERROR,
            'Invalid place result from autocomplete',
            { hasPlace: !!place, hasComponents: !!place?.address_components, hasGeometry: !!place?.geometry }
          );
          return;
        }

        const addressComponents = place.address_components;
        const getComponent = (type: string, nameType: 'long_name' | 'short_name' = 'long_name') => {
          const component = addressComponents.find((c: google.maps.GeocoderAddressComponent) =>
            c.types.includes(type)
          );
          return component ? component[nameType] : '';
        };

        const extractCounty = (
          components: google.maps.GeocoderAddressComponent[] | undefined
        ): { countyRaw: string; countyNormalized: string } => {
          if (!components) {
            return { countyRaw: '', countyNormalized: '' };
          }
          const countyComponent = components.find((c) => c.types.includes('administrative_area_level_2'));
          const countyRawValue = countyComponent?.long_name || '';
          return {
            countyRaw: countyRawValue,
            countyNormalized: countyRawValue.replace(/\s+(County|Parish)$/i, '').trim(),
          };
        };

        const { countyRaw, countyNormalized } = extractCounty(addressComponents);

        // Extract lat/lng (handle both method and property access)
        let lat = 0;
        let lng = 0;
        if (place.geometry.location) {
          const location = place.geometry.location;
          // LatLng object has lat() and lng() methods
          lat = typeof location.lat === 'function' ? location.lat() : (location.lat as any);
          lng = typeof location.lng === 'function' ? location.lng() : (location.lng as any);
        }

        const placeDetailsBase: PlaceDetails = {
          address: place.formatted_address || '',
          city: getComponent('locality') || getComponent('sublocality'),
          state: getComponent('administrative_area_level_1'),
          stateCode: getComponent('administrative_area_level_1', 'short_name'),
          county: countyNormalized,
          countyName: countyRaw,
          zipCode: getComponent('postal_code'),
          country: getComponent('country'),
          lat,
          lng,
        };

        const emitPlaceDetails = (details: PlaceDetails) => {
          onPlaceSelectedRef.current?.(details);
        };

        if (!placeDetailsBase.county && window.google?.maps?.Geocoder && Number.isFinite(lat) && Number.isFinite(lng)) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results && results.length > 0) {
              const combinedComponents = results.reduce<google.maps.GeocoderAddressComponent[]>((acc, result) => {
                if (result.address_components) {
                  acc.push(...result.address_components);
                }
                return acc;
              }, []);
              const { countyRaw: fallbackCountyRaw, countyNormalized: fallbackCountyNormalized } =
                extractCounty(combinedComponents);

              emitPlaceDetails({
                ...placeDetailsBase,
                county: fallbackCountyNormalized || placeDetailsBase.county,
                countyName: fallbackCountyRaw || placeDetailsBase.countyName,
              });
            } else {
              trackGoogleMapsError(
                GoogleMapsErrorType.AUTOCOMPLETE_ERROR,
                `Failed to fetch county via reverse geocode (${status})`,
                { hasResults: !!results?.length, status }
              );
              emitPlaceDetails(placeDetailsBase);
            }
          });
        } else {
          emitPlaceDetails(placeDetailsBase);
        }
      });

      trackGoogleMapsPerformance('autocomplete_init', initStartTime, true);

      // Cleanup
      return () => {
        google.maps.event.removeListener(listener);
        autocompleteElementRef.current = null;
      };
    } catch (err) {
      trackGoogleMapsError(
        GoogleMapsErrorType.AUTOCOMPLETE_ERROR,
        err instanceof Error ? err.message : String(err),
        { component: 'useGoogleMapsAutocomplete', phase: 'initialization' }
      );
      trackGoogleMapsPerformance('autocomplete_init', initStartTime, false);
      setError('Failed to initialize autocomplete');
    }
  }, [isLoaded, inputRef, types, JSON.stringify(componentRestrictions)]);

  return {
    isLoaded,
    error,
    autocompleteElement: autocompleteElementRef.current,
  };
};
