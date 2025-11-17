import React from 'react';
import { Badge } from './Badge';
import { formatCurrencyValue } from '../../utils/formatters';

export interface VehicleCardPremiumProps {
  vehicle: {
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    vin?: string;
    photo_url?: string;
    listing_url?: string;
    dealer_name?: string;
    dealer_city?: string;
    dealer_state?: string;
  };
  salePrice?: number;
  mileage?: number;
  payoffAmount?: number | null;
  isGarageVehicle?: boolean;
  salePriceLabel?: string;
  onClear?: () => void;
}

export const VehicleCardPremium: React.FC<VehicleCardPremiumProps> = ({
  vehicle,
  salePrice = 0,
  mileage,
  payoffAmount,
  isGarageVehicle = false,
  salePriceLabel = 'Sale Price',
  onClear,
}) => {
  return (
    <div className="vehicle-card-premium group relative overflow-hidden">
      {/* Ambient Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 opacity-95" />

      {/* Animated Gradient Mesh Overlay */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse"
             style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"
             style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      {/* Content Container */}
      <div className="relative z-10">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-gradient-to-b from-blue-400 to-cyan-500 rounded-full" />
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-blue-300/70 font-medium">
                Selected Vehicle
              </div>
              <div className="text-sm text-white/60 font-light tracking-wide">
                Configuration Active
              </div>
            </div>
          </div>

          {onClear && (
            <button
              onClick={onClear}
              className="group/btn flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10
                         border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <svg
                className="w-4 h-4 text-white/60 group-hover/btn:text-white/90 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm text-white/60 group-hover/btn:text-white/90 transition-colors">
                Clear
              </span>
            </button>
          )}
        </div>

        {/* Main Content Grid */}
        <div className={`grid gap-4 p-4 ${vehicle.photo_url ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Left: Vehicle Image */}
          {vehicle.photo_url && (
            <div className="relative aspect-[4/3] lg:aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 group/image">
              <img
                src={vehicle.photo_url}
                alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                className="w-full h-full object-cover transition-transform duration-700 group-hover/image:scale-110"
                onClick={() => {
                  if (vehicle.listing_url) {
                    window.open(vehicle.listing_url, '_blank', 'noopener,noreferrer');
                  }
                }}
                style={{ cursor: vehicle.listing_url ? 'pointer' : 'default' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />

              {/* Image Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-500" />

              {/* View Listing Badge */}
              {vehicle.listing_url && (
                <div className="absolute bottom-4 right-4 opacity-0 group-hover/image:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/image:translate-y-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(vehicle.listing_url, '_blank', 'noopener,noreferrer');
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full text-slate-900 text-sm font-medium hover:bg-white hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
                  >
                    <span>View Full Listing</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Right: Vehicle Details */}
          <div className="flex flex-col justify-between">
            {/* Vehicle Name */}
            <div className="mb-6">
              <h2 className="text-4xl lg:text-5xl font-bold text-white leading-tight tracking-tight mb-2"
                  style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                {vehicle.year} {vehicle.make}
              </h2>
              <h3 className="text-2xl lg:text-3xl font-light text-blue-300 tracking-wide"
                  style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                {vehicle.model}
                {vehicle.trim && <span className="text-white/50"> · {vehicle.trim}</span>}
              </h3>
            </div>

            {/* Sale Price - Prominent Display */}
            <div className="mb-6 p-6 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-400/20">
              <div className="text-xs uppercase tracking-[0.25em] text-blue-300/70 font-medium mb-2">
                {salePriceLabel}
              </div>
              <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-white to-cyan-300"
                   style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                {formatCurrencyValue(salePrice)}
              </div>
            </div>

            {/* Spec Grid */}
            <div className="grid grid-cols-2 gap-3">
              {vehicle.vin && (
                <div className="p-4 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm
                                hover:bg-white/10 hover:border-white/20 transition-all duration-300 group/spec">
                  <div className="text-xs uppercase tracking-wider text-blue-300/60 mb-1.5
                                  group-hover/spec:text-blue-300/90 transition-colors">
                    VIN
                  </div>
                  <div className="font-mono text-white/90 font-semibold tracking-[0.05em] group-hover/spec:text-white transition-colors"
                       style={{ fontFamily: '"JetBrains Mono", "Courier New", monospace' }}>
                    {vehicle.vin}
                  </div>
                </div>
              )}

              {mileage != null && (
                <div className="p-4 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm
                                hover:bg-white/10 hover:border-white/20 transition-all duration-300 group/spec">
                  <div className="text-xs uppercase tracking-wider text-blue-300/60 mb-1.5
                                  group-hover/spec:text-blue-300/90 transition-colors">
                    Mileage
                  </div>
                  <div className="text-white/90 font-semibold group-hover/spec:text-white transition-colors">
                    {Number(mileage).toLocaleString()} mi
                  </div>
                </div>
              )}

              {isGarageVehicle && (
                <div className="p-4 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm
                                hover:bg-white/10 hover:border-white/20 transition-all duration-300 group/spec col-span-2">
                  <div className="text-xs uppercase tracking-wider text-blue-300/60 mb-1.5
                                  group-hover/spec:text-blue-300/90 transition-colors">
                    Payoff Amount
                  </div>
                  <div className="text-white/90 font-semibold group-hover/spec:text-white transition-colors">
                    {payoffAmount != null ? formatCurrencyValue(payoffAmount) : '—'}
                  </div>
                </div>
              )}

              {vehicle.dealer_name && (
                <div className="p-4 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm
                                hover:bg-white/10 hover:border-white/20 transition-all duration-300 group/spec col-span-2">
                  <div className="text-xs uppercase tracking-wider text-blue-300/60 mb-1.5
                                  group-hover/spec:text-blue-300/90 transition-colors">
                    Dealer
                  </div>
                  <div className="text-white/90 font-semibold group-hover/spec:text-white transition-colors">
                    {vehicle.dealer_name}
                  </div>
                  {vehicle.dealer_city && vehicle.dealer_state && (
                    <div className="text-white/50 text-sm mt-1">
                      {vehicle.dealer_city}, {vehicle.dealer_state}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&display=swap');

        .vehicle-card-premium {
          position: relative;
          border-radius: 1rem;
          overflow: hidden;
          box-shadow:
            0 20px 60px -15px rgba(0, 0, 0, 0.7),
            0 0 0 1px rgba(255, 255, 255, 0.05);
          transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .vehicle-card-premium:hover {
          box-shadow:
            0 30px 80px -20px rgba(59, 130, 246, 0.4),
            0 0 0 1px rgba(59, 130, 246, 0.2);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
};
