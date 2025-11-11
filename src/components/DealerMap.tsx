import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';
import { Card } from '../ui/components/Card';
import type { PlaceDetails } from '../hooks/useGoogleMapsAutocomplete';

export interface DealerMapProps {
  /** Dealer information */
  dealerName?: string;
  dealerAddress?: string;
  dealerCity?: string;
  dealerState?: string;
  dealerZip?: string;
  dealerLat?: number;
  dealerLng?: number;
  /** User's location */
  userLocation?: PlaceDetails;
  /** Show route from user to dealer */
  showRoute?: boolean;
}

export const DealerMap: React.FC<DealerMapProps> = ({
  dealerName,
  dealerAddress,
  dealerCity,
  dealerState,
  dealerZip,
  dealerLat,
  dealerLng,
  userLocation,
  showRoute = true,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const dealerMarker = useRef<google.maps.Marker | null>(null);

  // Load Google Maps
  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => setIsLoaded(true))
      .catch((err) => {
        console.error('[DealerMap] Failed to load Google Maps:', err);
        setError(err.message);
      });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || map) return;

    const newMap = new google.maps.Map(mapRef.current, {
      zoom: 10,
      center: { lat: 28.5383, lng: -81.3792 }, // Orlando, FL default
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    setMap(newMap);
  }, [isLoaded, map]);

  // Geocode dealer address and show marker
  useEffect(() => {
    if (!map || !isLoaded) return;

    // Clear existing marker
    if (dealerMarker.current) {
      dealerMarker.current.setMap(null);
      dealerMarker.current = null;
    }

    // If we have exact coordinates, use them
    if (dealerLat && dealerLng) {
      const position = { lat: dealerLat, lng: dealerLng };

      // NOTE: google.maps.Marker is deprecated as of February 2024
      // TODO: Migrate to google.maps.marker.AdvancedMarkerElement
      // Migration guide: https://developers.google.com/maps/documentation/javascript/advanced-markers/migration
      // Current API will continue to receive bug fixes; 12+ months notice before discontinuation
      dealerMarker.current = new google.maps.Marker({
        position,
        map,
        title: dealerName || 'Dealer Location',
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
        },
      });

      // Add info window
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding: 8px;">
          <h3 style="margin: 0 0 4px; font-weight: 600;">${dealerName || 'Dealer'}</h3>
          ${dealerAddress ? `<p style="margin: 0; font-size: 13px;">${dealerAddress}</p>` : ''}
          ${dealerCity && dealerState ? `<p style="margin: 0; font-size: 13px;">${dealerCity}, ${dealerState} ${dealerZip || ''}</p>` : ''}
        </div>`,
      });

      dealerMarker.current.addListener('click', () => {
        infoWindow.open(map, dealerMarker.current);
      });

      map.setCenter(position);
      map.setZoom(13);
      return;
    }

    // Otherwise, geocode the address
    const fullAddress = [dealerAddress, dealerCity, dealerState, dealerZip]
      .filter(Boolean)
      .join(', ');

    if (!fullAddress) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: fullAddress }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const position = results[0].geometry.location;

        // NOTE: google.maps.Marker is deprecated as of February 2024
        // TODO: Migrate to google.maps.marker.AdvancedMarkerElement
        dealerMarker.current = new google.maps.Marker({
          position,
          map,
          title: dealerName || 'Dealer Location',
          icon: {
            url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
          },
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="padding: 8px;">
            <h3 style="margin: 0 0 4px; font-weight: 600;">${dealerName || 'Dealer'}</h3>
            <p style="margin: 0; font-size: 13px;">${fullAddress}</p>
          </div>`,
        });

        dealerMarker.current.addListener('click', () => {
          infoWindow.open(map, dealerMarker.current);
        });

        map.setCenter(position);
        map.setZoom(13);
      } else {
        console.warn('[DealerMap] Geocoding failed:', status);
        setError('Unable to locate dealer address');
      }
    });
  }, [map, isLoaded, dealerName, dealerAddress, dealerCity, dealerState, dealerZip, dealerLat, dealerLng]);

  // Show route from user location to dealer
  useEffect(() => {
    if (!map || !isLoaded || !showRoute || !userLocation) return;

    // Clear existing directions
    if (directionsRenderer.current) {
      directionsRenderer.current.setMap(null);
      directionsRenderer.current = null;
    }

    // Need dealer location
    const dealerDestination =
      dealerLat && dealerLng
        ? { lat: dealerLat, lng: dealerLng }
        : [dealerAddress, dealerCity, dealerState, dealerZip].filter(Boolean).join(', ');

    if (!dealerDestination) return;

    const directionsService = new google.maps.DirectionsService();
    directionsRenderer.current = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: '#4F46E5',
        strokeWeight: 4,
      },
    });

    directionsService.route(
      {
        origin: { lat: userLocation.lat, lng: userLocation.lng },
        destination: dealerDestination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          directionsRenderer.current?.setDirections(result);

          // Extract distance and duration
          const route = result.routes[0];
          if (route && route.legs && route.legs[0]) {
            setDistance(route.legs[0].distance?.text || null);
            setDuration(route.legs[0].duration?.text || null);
          }
        } else {
          console.warn('[DealerMap] Directions request failed:', status);
          setError('Unable to calculate route');
        }
      }
    );
  }, [map, isLoaded, showRoute, userLocation, dealerAddress, dealerCity, dealerState, dealerZip, dealerLat, dealerLng]);

  if (error) {
    return (
      <Card padding="md">
        <div className="text-center text-gray-500 py-4">
          <svg className="mx-auto mb-2" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none">
      {/* Distance & Duration Banner */}
      {distance && duration && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs opacity-90">Distance</div>
              <div className="font-semibold">{distance}</div>
            </div>
            <div className="border-l border-blue-400 h-8"></div>
            <div>
              <div className="text-xs opacity-90">Drive Time</div>
              <div className="font-semibold">{duration}</div>
            </div>
          </div>
          <a
            href={`https://www.google.com/maps/dir/${userLocation?.lat},${userLocation?.lng}/${dealerLat || dealerAddress},${dealerCity},${dealerState}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:underline"
          >
            Open in Google Maps →
          </a>
        </div>
      )}

      {/* Map Container */}
      <div
        ref={mapRef}
        className="w-full h-96"
        style={{ minHeight: '384px' }}
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
    </Card>
  );
};
