import React, { useRef, useEffect } from 'react';

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
  placeholder = "Enter dealer or customer location...",
  mapsLoaded = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (!mapsLoaded || !inputRef.current || autocompleteRef.current) return;

    try {
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['geocode'],
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'address_components', 'geometry'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();

        if (!place.geometry?.location) {
          return;
        }

        let city = '';
        let state = '';
        let zip = '';
        let county = '';

        place.address_components?.forEach((component) => {
          const types = component.types;
          if (types.includes('locality')) {
            city = component.long_name;
          }
          if (types.includes('administrative_area_level_1')) {
            state = component.short_name;
          }
          if (types.includes('postal_code')) {
            zip = component.long_name;
          }
          if (types.includes('administrative_area_level_2')) {
            county = component.long_name.replace(' County', '');
          }
        });

        const details: LocationDetails = {
          formatted_address: place.formatted_address,
          city,
          state,
          zip,
          county,
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng(),
        };

        onPlaceSelected?.(details);
      });

      autocompleteRef.current = autocomplete;
    } catch (err) {
      console.error('Failed to initialize autocomplete:', err);
    }

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [mapsLoaded, onPlaceSelected]);

  const hasLocation = locationDetails && locationDetails.city && locationDetails.state;

  return (
    <div className="location-search-premium">
      {/* Main Search Container */}
      <div className="relative">
        {/* Ambient Glow Effect */}
        <div className={`absolute -inset-0.5 rounded-2xl transition-all duration-500 ${
          hasLocation
            ? 'bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 opacity-20 blur-lg'
            : error
            ? 'bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 opacity-20 blur-lg'
            : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500 opacity-0 group-hover:opacity-20 blur-lg'
        }`} />

        {/* Input Container */}
        <div className="relative group">
          <div className={`
            relative overflow-hidden rounded-2xl transition-all duration-300
            ${hasLocation
              ? 'bg-gradient-to-br from-blue-950 to-cyan-950 border-2 border-blue-400/30'
              : error
              ? 'bg-gradient-to-br from-red-950 to-rose-950 border-2 border-red-400/30'
              : 'bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-white/10 hover:border-blue-400/30'
            }
          `}>
            {/* Animated Background Pattern */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,.05) 1px, transparent 0)',
                backgroundSize: '32px 32px',
              }} />
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
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-blue-300/50 transition-colors group-hover:text-blue-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
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
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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

        /* Hide Google Places attribution */
        .pac-container {
          background-color: rgb(15, 23, 42) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 0.75rem !important;
          margin-top: 0.5rem !important;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5) !important;
          overflow: hidden;
        }

        .pac-item {
          background-color: transparent !important;
          color: rgba(255, 255, 255, 0.9) !important;
          border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
          padding: 0.75rem 1rem !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
        }

        .pac-item:hover {
          background-color: rgba(16, 185, 129, 0.1) !important;
        }

        .pac-item-query {
          color: rgba(255, 255, 255, 0.9) !important;
          font-size: 0.875rem !important;
        }

        .pac-matched {
          color: rgb(96, 165, 250) !important;
          font-weight: 600 !important;
        }

        .pac-icon {
          display: none !important;
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
