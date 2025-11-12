/**
 * useLocationAutoPopulate - Auto-populate user location from customer profile
 *
 * Loads customer_profiles from Supabase, geocodes the address using Google Maps,
 * and updates location state with lat/lng/zip/county/stateCode.
 */

import { useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

interface CustomerProfile {
  user_id: string;
  street_address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  zip_code?: string;
  county?: string;
  county_name?: string;
}

interface LocationData {
  formatted_address?: string;
  address?: string;
  city?: string;
  zip?: string;
  lat?: number | null;
  lng?: number | null;
  stateCode?: string;
  state?: string;
  county?: string;
  countyName?: string;
}

interface UseLocationAutoPopulateOptions {
  supabase: SupabaseClient | null;
  userId: string | null;
  isEnabled?: boolean;
  onLocationUpdate?: (location: LocationData) => void;
  onLocationFieldUpdate?: (locationString: string) => void;
}

export const useLocationAutoPopulate = ({
  supabase,
  userId,
  isEnabled = true,
  onLocationUpdate,
  onLocationFieldUpdate,
}: UseLocationAutoPopulateOptions) => {
  useEffect(() => {
    if (!isEnabled || !supabase || !userId) return;

    const autoPopulateLocation = async () => {
      try {
        // Fetch customer profile
        const { data: profile, error } = await supabase
          .from('customer_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error || !profile) {
          return;
        }

        const typedProfile = profile as CustomerProfile;

        // Need at least city and state
        if (!typedProfile.city || !typedProfile.state_code) {
          return;
        }

        // Build location string (full street address preferred for distance calculations)
        const locationString = typedProfile.street_address
          ? `${typedProfile.street_address}, ${typedProfile.city}, ${typedProfile.state_code}${
              typedProfile.zip_code ? ' ' + typedProfile.zip_code : ''
            }`
          : `${typedProfile.city}, ${typedProfile.state_code}${
              typedProfile.zip_code ? ' ' + typedProfile.zip_code : ''
            }`;

        // Notify about field update (for populating input if empty)
        if (onLocationFieldUpdate) {
          onLocationFieldUpdate(locationString);
        }

        // Always geocode to get lat/lng for distance calculations
        if (window.google?.maps?.Geocoder) {
          const geocoder = new google.maps.Geocoder();

          geocoder.geocode({ address: locationString }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const place = results[0];
              const zip = extractZipFromPlace(place) || typedProfile.zip_code || '';

              const latValue = place.geometry.location?.lat;
              const lat = typeof latValue === 'function' ? latValue() : (latValue as number) ?? null;

              const lngValue = place.geometry.location?.lng;
              const lng = typeof lngValue === 'function' ? lngValue() : (lngValue as number) ?? null;

              const locationData: LocationData = {
                formatted_address: place.formatted_address ?? locationString,
                address: place.formatted_address ?? locationString,
                city: typedProfile.city,
                zip: zip,
                lat: lat,
                lng: lng,
                stateCode: typedProfile.state_code,
                state: typedProfile.state,
                county: typedProfile.county,
                countyName: typedProfile.county_name,
              };

              if (onLocationUpdate) {
                onLocationUpdate(locationData);
              }
            } else {
              // Fallback: update without coordinates
              const locationData: LocationData = {
                formatted_address: locationString,
                address: locationString,
                city: typedProfile.city,
                zip: typedProfile.zip_code,
                stateCode: typedProfile.state_code,
                state: typedProfile.state,
                county: typedProfile.county,
                countyName: typedProfile.county_name,
              };

              if (onLocationUpdate) {
                onLocationUpdate(locationData);
              }
            }
          });
        } else {
          // Google Maps not available - update without geocoding
          const locationData: LocationData = {
            formatted_address: locationString,
            address: locationString,
            city: typedProfile.city,
            zip: typedProfile.zip_code,
            stateCode: typedProfile.state_code,
            state: typedProfile.state,
            county: typedProfile.county,
            countyName: typedProfile.county_name,
          };

          if (onLocationUpdate) {
            onLocationUpdate(locationData);
          }
        }
      } catch (error) {
        // Silent fail
      }
    };

    autoPopulateLocation();
  }, [supabase, userId, isEnabled, onLocationUpdate, onLocationFieldUpdate]);
};

/**
 * Extract ZIP code from Google Maps place result
 */
function extractZipFromPlace(place: google.maps.GeocoderResult): string | null {
  if (!place.address_components) return null;

  for (const component of place.address_components) {
    if (component.types.includes('postal_code')) {
      return component.long_name;
    }
  }

  return null;
}
