import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsScript } from '../../utils/loadGoogleMaps';

export interface LocationDetails {
  formatted_address?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
}

export interface LocationSearchPremiumProps {
  location: string;
  onLocationChange: (location: string) => void;
  onPlaceSelected?: (details: LocationDetails) => void;
  locationDetails?: LocationDetails | null;
  isLoading?: boolean;
  error?: string | null;
  placeholder?: string;
  mapsLoaded?: boolean;
}

export const LocationSearchPremium: React.FC<LocationSearchPremiumProps> = ({
  location,
  onLocationChange,
  onPlaceSelected,
  locationDetails,
  isLoading = false,
  error = null,
  placeholder = 'Enter dealer or customer location...',
  mapsLoaded = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // Load Google Maps (with key) if not already provided via mapsLoaded
  useEffect(() => {
    if (window.google?.maps?.places?.Autocomplete) {
      setMapsReady(true);
      return;
    }

    if (mapsLoaded) {
      // Parent says maps loaded, wait for API to be fully ready
      const checkReady = setInterval(() => {
        if (window.google?.maps?.places?.Autocomplete) {
          setMapsReady(true);
          clearInterval(checkReady);
        }
      }, 100);
      const timeout = setTimeout(() => clearInterval(checkReady), 5000);
      return () => {
        clearInterval(checkReady);
        clearTimeout(timeout);
      };
    }

    if (!apiKey) {
      console.error('Google Maps API key not configured');
      return;
    }
    loadGoogleMapsScript()
      .then(() => setMapsReady(true))
      .catch((err) => {
        console.error('Failed to load Google Maps', err);
      });
  }, [mapsLoaded, apiKey]);

  // Initialize Places Autocomplete (classic JS API) to keep suggestions while preserving focus
  useEffect(() => {
    if (!inputRef.current || autocompleteRef.current) return;

    // If API not ready yet, poll for it
    if (!window.google?.maps?.places?.Autocomplete) {
      if (!mapsReady && !mapsLoaded) return; // Haven't started loading

      const checkReady = setInterval(() => {
        if (window.google?.maps?.places?.Autocomplete && inputRef.current && !autocompleteRef.current) {
          clearInterval(checkReady);
          initAutocomplete();
        }
      }, 100);
      const timeout = setTimeout(() => clearInterval(checkReady), 10000);
      return () => {
        clearInterval(checkReady);
        clearTimeout(timeout);
      };
    }

    initAutocomplete();

    function initAutocomplete() {
      if (!inputRef.current || autocompleteRef.current) return;
      try {
        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          types: ['geocode'],
          componentRestrictions: { country: ['us'] },
          // Request the formatted address so we can mirror the exact string Google shows
          fields: ['formatted_address', 'address_components', 'geometry', 'name'],
        });
      autocompleteRef.current = autocomplete;

      const handlePlaceChange = () => {
        const place = autocomplete.getPlace();
        if (!place) return;

        let city = '';
        let state = '';
        let zip = '';
        let county = '';

        (place.address_components || []).forEach((component) => {
          const types = component.types || [];
          if (types.includes('locality')) city = component.long_name;
          if (types.includes('administrative_area_level_1')) state = component.short_name;
          if (types.includes('postal_code')) zip = component.long_name;
          if (types.includes('administrative_area_level_2')) county = component.long_name.replace(/ County$/i, '');
        });

        // Match the visible autocomplete text even when Google omits formatted_address
        const displayAddress =
          place.formatted_address ||
          place.name ||
          // @ts-expect-error: legacy typings omit description/inputValue
          place.description ||
          // @ts-expect-error: legacy typings omit inputValue
          place.inputValue ||
          inputRef.current?.value ||
          '';

        const lat = place.geometry?.location?.lat?.();
        const lng = place.geometry?.location?.lng?.();

        const details: LocationDetails = {
          formatted_address: displayAddress,
          city,
          state,
          zip,
          county,
          latitude: lat ?? undefined,
          longitude: lng ?? undefined,
        };

        onLocationChange(displayAddress);
        onPlaceSelected?.(details);
      };

      autocomplete.addListener('place_changed', handlePlaceChange);
    } catch (err) {
      console.error('Failed to init Places Autocomplete', err);
    }
    } // end initAutocomplete

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current.unbindAll?.();
        autocompleteRef.current = null;
      }
    };
  }, [mapsReady, onLocationChange, onPlaceSelected]);

  const hasLocation = locationDetails && locationDetails.city && locationDetails.state;

  return (
    <div className="location-search-premium">
      {/* Main Search Container */}
      <div className="relative">
        {/* Ambient Glow Effect */}
        <div
          className={`absolute -inset-0.5 rounded-2xl transition-all duration-500 ${
            hasLocation
              ? 'bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 opacity-20 blur-lg'
              : error
              ? 'bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 opacity-20 blur-lg'
              : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500 opacity-0 group-hover:opacity-20 blur-lg'
          }`}
        />

        {/* Input Container */}
        <div className="relative group">
          <div
            className={`
            relative overflow-hidden rounded-2xl transition-all duration-300
            ${hasLocation
              ? 'bg-gradient-to-br from-blue-950 to-cyan-950 border-2 border-blue-400/30'
              : error
              ? 'bg-gradient-to-br from-red-950 to-rose-950 border-2 border-red-400/30'
              : 'bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-white/10 hover:border-blue-400/30'
            }
          `}
          >
            {/* Animated Background Pattern */}
            <div className="absolute inset-0 opacity-5">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 2px 2px, rgba(255,255,255,.05) 1px, transparent 0)',
                  backgroundSize: '32px 32px',
                }}
              />
            </div>

            {/* Label */}
            <div className="relative px-4 pt-3 pb-1">
              <label className="block text-xs uppercase tracking-[0.2em] font-medium text-blue-300/70">
                Location
              </label>
            </div>

            {/* Input Field */}
            <div className="relative px-4 pb-4">
              <div className="relative flex items-center">
                {/* Location Icon */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                  {isLoading ? (
                    <div className="relative w-5 h-5">
                      <div className="absolute inset-0 rounded-full border-2 border-blue-400/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    </div>
                  ) : hasLocation ? (
                    <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5 text-blue-300/50 transition-colors group-hover:text-blue-300/70"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </div>

                {/* Input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={location}
                  onChange={(e) => onLocationChange(e.target.value)}
                  placeholder={placeholder}
                  className="w-full pl-12 pr-4 py-4 bg-black/20 text-white text-base
                             rounded-xl border border-white/10
                             focus:outline-none focus:border-blue-400/50 focus:bg-black/30
                             placeholder:text-white/20
                             transition-all duration-300"
                />

                {/* Success Checkmark */}
                {hasLocation && !isLoading && !error && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-400 rounded-full blur-md opacity-50 animate-pulse" />
                      <svg className="relative w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mt-2 flex items-start gap-2 text-red-400 text-xs animate-in slide-in-from-top-2 duration-300">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .location-search-premium {
          position: relative;
        }

        @keyframes slide-in-from-top-2 {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-in {
          animation-fill-mode: both;
        }

        .slide-in-from-top-2 {
          animation: slide-in-from-top-2 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};
