import React, { useEffect, useRef, useState, useMemo } from 'react';
import { loadGoogleMapsScript } from '../../utils/loadGoogleMaps';
import type { PlaceDetails } from '../../hooks/useGoogleMapsAutocomplete';

export interface LocationDetails {
  formatted_address?: string;
  street_address?: string;
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
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [mapsReady, setMapsReady] = useState(false);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isPredictionsOpen, setIsPredictionsOpen] = useState(false);
  const autocompleteSuggestionRef = useRef<typeof google.maps.places.AutocompleteSuggestion | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Local state to prevent focus loss during typing
  const [localValue, setLocalValue] = useState(location);

  // Track when input is mounted so autocomplete can initialize
  const [inputMounted, setInputMounted] = useState(false);

  // Set inputMounted after component mounts (allows inputRef.current to be set)
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    const raf = requestAnimationFrame(() => {
      if (inputRef.current) {
        setInputMounted(true);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sync local value when location prop changes externally (e.g., from place selection)
  useEffect(() => {
    setLocalValue(location);
  }, [location]);

  // Load Google Maps (with key) if not already provided via mapsLoaded
  useEffect(() => {
    if (!apiKey) {
      return;
    }
    loadGoogleMapsScript()
      .then(() => setMapsReady(true))
      .catch(() => setMapsReady(false));
  }, [apiKey]);

  // Memoize autocomplete options to prevent effect from re-running on every render
  // The types array and componentRestrictions object would otherwise be new references each time
  const autocompleteTypes = useMemo(() => ['geocode'], []);
  const autocompleteRestrictions = useMemo(() => ({ country: 'us' }), []);

  // Wire up Google Places services once Maps is ready
  useEffect(() => {
    if (!mapsReady || !window.google?.maps?.places) return;
    autocompleteSuggestionRef.current = google.maps.places.AutocompleteSuggestion;
  }, [mapsReady]);

  // Debounced prediction fetch
  useEffect(() => {
    if (!mapsReady || !autocompleteSuggestionRef.current || !hasInteracted) return;
    const trimmed = localValue.trim();
    if (trimmed.length < 3) {
      setPredictions([]);
      return;
    }

    const timer = setTimeout(() => {
      autocompleteSuggestionRef.current
        ?.fetchAutocompleteSuggestions({
          input: trimmed,
          region: autocompleteRestrictions.country,
        } as any)
        .then((res) => {
          const suggestions = res?.suggestions || [];
          setPredictions(suggestions);
          setIsPredictionsOpen(
            hasInteracted && isInputFocused && suggestions.length > 0
          );
        })
        .catch(() => {
          setPredictions([]);
          setIsPredictionsOpen(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [localValue, autocompleteRestrictions, autocompleteTypes, mapsReady, hasInteracted, isInputFocused]);

  const handlePredictionSelect = (prediction: google.maps.places.AutocompleteSuggestion) => {
    const text =
      prediction.placePrediction?.text?.toString() ||
      prediction.placePrediction?.structuredFormat?.mainText?.toString() ||
      '';

    const description = text || (prediction as any).description || '';

    setLocalValue(description);
    onLocationChange(description);
    setPredictions([]);
    setIsPredictionsOpen(false);
    setHasInteracted(false); // Prevent refetch after selection

    // State abbreviation lookup for fallback parsing
    const stateAbbrevs: Record<string, string> = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
      'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
      'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
      'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
      'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
      'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
      'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
      'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
      'district of columbia': 'DC'
    };

    // Immediately parse from autocomplete text to avoid race condition
    // Format: "Street, City, State" or "Street, City, State ZIP"
    const parts = description.split(',').map((p: string) => p.trim());
    let immediateStreet = parts[0] || '';
    let immediateCity = parts.length > 1 ? parts[1] : '';
    let immediateState = '';
    let immediateZip = '';

    if (parts.length > 2) {
      const stateZipPart = parts[2];
      // Try "FL 32054" format
      const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
      if (stateZipMatch) {
        immediateState = stateZipMatch[1];
        if (stateZipMatch[2]) immediateZip = stateZipMatch[2];
      } else {
        // Try full state name: "Florida" or "Florida 32904"
        const fullStateMatch = stateZipPart.match(/^([A-Za-z\s]+?)(?:\s+(\d{5}(?:-\d{4})?))?$/);
        if (fullStateMatch) {
          const stateName = fullStateMatch[1].trim().toLowerCase();
          immediateState = stateAbbrevs[stateName] || fullStateMatch[1].trim();
          if (fullStateMatch[2]) immediateZip = fullStateMatch[2];
        }
      }
    }

    // Call onPlaceSelected immediately with parsed data
    onPlaceSelected?.({
      formatted_address: description,
      street_address: immediateStreet,
      city: immediateCity || undefined,
      state: immediateState || undefined,
      zip: immediateZip || undefined,
    });

    const placePrediction = prediction.placePrediction;
    if (!placePrediction?.toPlace) return;

    const place = placePrediction.toPlace();
    place
      .fetchFields({
        fields: ['formattedAddress', 'addressComponents', 'location', 'displayName'],
      })
      .then((details) => {
        const getComponent = (
          type: string,
          nameType: 'longText' | 'shortText' = 'longText'
        ) => {
          const component = details.addressComponents?.find((c) => c.types?.includes(type));
          return component ? (nameType === 'shortText' ? component.shortText : component.longText) : '';
        };

        const countyRaw = getComponent('administrative_area_level_2');
        const countyName =
          countyRaw?.replace(/\s+(County|Parish)$/i, '').trim() || countyRaw || '';

        // Extract street address (street number + route)
        const streetNumber = getComponent('street_number');
        const route = getComponent('route');
        let streetAddress = [streetNumber, route].filter(Boolean).join(' ');

        // Extract city, state, zip from components
        let city = getComponent('locality') || getComponent('sublocality');
        let state = getComponent('administrative_area_level_1', 'shortText');
        let zip = getComponent('postal_code');

        // Fallback: if Google didn't give us components, parse from formatted address
        // Format: "Street, City, State ZIP, Country" or "Street, City, State, Country"
        if (details.formattedAddress) {
          const parts = details.formattedAddress.split(',').map(p => p.trim());

          if (!streetAddress && parts.length > 0) {
            streetAddress = parts[0];
          }
          if (!city && parts.length > 1) {
            city = parts[1];
          }
          if (parts.length > 2) {
            const stateZipPart = parts[2];
            // Try "FL 32054" format first
            const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
            if (stateZipMatch) {
              if (!state) state = stateZipMatch[1];
              if (!zip && stateZipMatch[2]) zip = stateZipMatch[2];
            } else {
              // Try full state name with optional zip: "Florida" or "Florida 32904"
              const fullStateMatch = stateZipPart.match(/^([A-Za-z\s]+?)(?:\s+(\d{5}(?:-\d{4})?))?$/);
              if (fullStateMatch && !state) {
                // Convert full state name to abbreviation
                const stateAbbrevs: Record<string, string> = {
                  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
                  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
                  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
                  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
                  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
                  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
                  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
                  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
                  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
                  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
                  'district of columbia': 'DC'
                };
                const stateName = fullStateMatch[1].trim().toLowerCase();
                state = stateAbbrevs[stateName] || fullStateMatch[1].trim();
                if (!zip && fullStateMatch[2]) zip = fullStateMatch[2];
              }
            }
          }
        }

        const lat =
          typeof details.location?.lat === 'function'
            ? details.location.lat()
            : (details.location as any)?.lat;
        const lng =
          typeof details.location?.lng === 'function'
            ? details.location.lng()
            : (details.location as any)?.lng;

        onPlaceSelected?.({
          formatted_address: details.formattedAddress || description,
          street_address: streetAddress || undefined,
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined,
          county: countyName,
          latitude: lat,
          longitude: lng,
        });
      })
      .catch(() => {});
  };

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
            relative rounded-2xl transition-all duration-300
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
                  value={localValue}
                  onChange={(e) => {
                    setHasInteracted(true);
                    setLocalValue(e.target.value);
                  }}
                  onBlur={() => {
                    // Only sync if value actually changed
                    if (localValue !== location) {
                      onLocationChange(localValue);
                    }
                    // Close dropdown after a short delay to allow click
                    setIsInputFocused(false);
                    setTimeout(() => setIsPredictionsOpen(false), 150);
                  }}
                  onFocus={() => {
                    setHasInteracted(true);
                    setIsInputFocused(true);
                    if (predictions.length > 0) {
                      setIsPredictionsOpen(true);
                    }
                  }}
                  placeholder={placeholder}
                  className="w-full pl-12 pr-4 py-4 bg-black/20 text-white text-base
                             rounded-xl border border-white/10
                             focus:outline-none focus:border-blue-400/50 focus:bg-black/30
                             placeholder:text-white/20
                             transition-all duration-300"
                />
                {isPredictionsOpen && predictions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-40">
                    <div className="bg-slate-900/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md">
                      <ul className="divide-y divide-white/5">
                        {predictions.map((p) => (
                          <li
                            key={p.placePrediction?.placeId || (p as any).place_id || p.placePrediction?.text?.toString() || p.placePrediction?.mainText?.toString() || (p as any).description}
                            data-testid="autocomplete-option"
                            className="px-4 py-3 hover:bg-white/5 cursor-pointer"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handlePredictionSelect(p)}
                          >
                            <div className="text-sm text-white font-semibold">
                              {p.placePrediction?.mainText?.toString?.() ||
                                p.placePrediction?.text?.toString?.() ||
                                (p as any).description}
                            </div>
                            {p.placePrediction?.secondaryText && (
                              <div className="text-xs text-white/60">
                                {p.placePrediction.secondaryText.toString()}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

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
        /* Allow autocomplete dropdown to render outside card bounds */
        .location-search-premium gmp-place-autocomplete {
          display: block;
          position: relative;
          overflow: visible;
          z-index: 30;
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
