import { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';
import { PlaceAutocompleteElement } from '../types/google-maps-web-components';
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

  // Initialize Autocomplete using PlaceAutocompleteElement web component
  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    const inputEl = inputRef.current;
    const parent = inputEl.parentElement;

    if (!parent) return;

    // Don't recreate if already initialized
    if (autocompleteElementRef.current) return;

    const initStartTime = Date.now();

    try {
      const placeEl = document.createElement(
        'gmpx-place-autocomplete'
      ) as PlaceAutocompleteElement;

      // Configure restrictions/types if provided
      if (componentRestrictions?.country) {
        placeEl.country = Array.isArray(componentRestrictions.country)
          ? componentRestrictions.country
          : [componentRestrictions.country];
      }
      if (types && types.length > 0) {
        placeEl.types = types;
      }

      // Move the existing input into the web component (slot="input")
      inputEl.setAttribute('slot', 'input');
      placeEl.appendChild(inputEl);
      parent.appendChild(placeEl);

      const handlePlaceChange = () => {
        const place: any = (placeEl as any).value;
        if (!place) {
          return;
        }

        const addressComponents =
          place.address_components || place.addressComponents || [];
        const getComponent = (
          type: string,
          nameType: 'long_name' | 'short_name' = 'long_name'
        ) => {
          const component = addressComponents.find((c: google.maps.GeocoderAddressComponent) =>
            c.types?.includes(type)
          );
          return component ? component[nameType] : '';
        };

        const extractCounty = (
          components: google.maps.GeocoderAddressComponent[] | undefined
        ): { countyRaw: string; countyNormalized: string } => {
          if (!components) {
            return { countyRaw: '', countyNormalized: '' };
          }
          const countyComponent = components.find((c) =>
            c.types?.includes('administrative_area_level_2')
          );
          const countyRawValue = countyComponent?.long_name || '';
          return {
            countyRaw: countyRawValue,
            countyNormalized: countyRawValue.replace(/\s+(County|Parish)$/i, '').trim(),
          };
        };

        const { countyRaw, countyNormalized } = extractCounty(addressComponents);

        const lat = place.geometry?.location?.lat?.() ?? place.location?.lat ?? 0;
        const lng = place.geometry?.location?.lng?.() ?? place.location?.lng ?? 0;

        const placeDetailsBase: PlaceDetails = {
          address: place.formatted_address || place.displayName || '',
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

        if (
          !placeDetailsBase.county &&
          window.google?.maps?.Geocoder &&
          Number.isFinite(lat) &&
          Number.isFinite(lng)
        ) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results && results.length > 0) {
              const combinedComponents =
                results.reduce<google.maps.GeocoderAddressComponent[]>(
                  (acc, result) => {
                    if (result.address_components) {
                      acc.push(...result.address_components);
                    }
                    return acc;
                  },
                  []
                );
              const {
                countyRaw: fallbackCountyRaw,
                countyNormalized: fallbackCountyNormalized,
              } = extractCounty(combinedComponents);

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
      };

      placeEl.addEventListener('gmpx-placechange', handlePlaceChange);

      autocompleteElementRef.current = placeEl;

      trackGoogleMapsPerformance('autocomplete_init', initStartTime, true);

      // Cleanup: move input back out and remove element
      return () => {
        placeEl.removeEventListener('gmpx-placechange', handlePlaceChange);
        if (placeEl.parentElement) {
          placeEl.parentElement.removeChild(placeEl);
        }
        inputEl.removeAttribute('slot');
        parent.appendChild(inputEl);
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
