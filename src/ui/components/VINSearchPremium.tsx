import React, { useState } from 'react';
import { formatCurrencyValue } from '../../utils/formatters';

export interface VehicleOption {
  id: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  photo_url?: string;
  estimated_value?: number;
  asking_price?: number;
  payoff_amount?: number;
  source?: 'garage' | 'saved';
  // Dealer fields from Supabase
  dealer_name?: string;
  dealer_street?: string;
  dealer_address?: string;
  dealer_city?: string;
  dealer_state?: string;
  dealer_zip?: string;
  dealer_lat?: number;
  dealer_lng?: number;
  dealer_latitude?: number;
  dealer_longitude?: number;
  dealer_phone?: string;
  // Allow any additional fields
  [key: string]: any;
}

export interface VINSearchPremiumProps {
  vin: string;
  onVinChange: (vin: string) => void;
  onVinSubmit?: () => void;
  isLoading?: boolean;
  error?: string | null;
  hasSelectedVehicle?: boolean;
  garageVehicles?: VehicleOption[];
  savedVehicles?: VehicleOption[];
  sharedVehicles?: VehicleOption[];
  isLoadingVehicles?: boolean;
  onSelectVehicle?: (vehicle: VehicleOption) => void;
  onEditVehicle?: (vehicle: VehicleOption) => void;
  onDeleteVehicle?: (vehicle: VehicleOption) => void;
  onShareVehicle?: (vehicle: VehicleOption) => void;
  onAddToGarage?: (vehicle: VehicleOption) => void;
  onDeclineSharedVehicle?: (vehicle: VehicleOption) => void;
  placeholder?: string;
}

export const VINSearchPremium: React.FC<VINSearchPremiumProps> = ({
  vin,
  onVinChange,
  onVinSubmit,
  isLoading = false,
  error = null,
  hasSelectedVehicle = false,
  garageVehicles = [],
  savedVehicles = [],
  sharedVehicles = [],
  isLoadingVehicles = false,
  onSelectVehicle,
  onEditVehicle,
  onDeleteVehicle,
  onShareVehicle,
  onAddToGarage,
  onDeclineSharedVehicle,
  placeholder = "Paste VIN or select from your garage...",
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const totalVehicles = garageVehicles.length + savedVehicles.length + sharedVehicles.length;

  // Filter vehicles based on search query
  const filteredGarage = garageVehicles.filter(v =>
    `${v.year} ${v.make} ${v.model} ${v.trim} ${v.vin}`.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredSaved = savedVehicles.filter(v =>
    `${v.year} ${v.make} ${v.model} ${v.trim} ${v.vin}`.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredShared = sharedVehicles.filter(v =>
    `${v.year} ${v.make} ${v.model} ${v.trim} ${v.vin}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInputChange = (value: string) => {
    const upper = value.toUpperCase();
    setSearchQuery(value);
    onVinChange(upper);
    if (value.length > 0) {
      setIsDropdownOpen(true);
    }
  };

  const handleSelectVehicle = (vehicle: VehicleOption) => {
    onSelectVehicle?.(vehicle);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (vin.length >= 11 && onVinSubmit) {
        onVinSubmit();
        setIsDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  return (
    <div className="vin-search-premium">
      {/* Main Search Container */}
      <div className="relative">
        {/* Ambient Glow Effect */}
        <div className={`absolute -inset-0.5 rounded-2xl transition-all duration-500 ${
          hasSelectedVehicle
            ? 'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 opacity-20 blur-lg'
            : error
            ? 'bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 opacity-20 blur-lg'
            : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500 opacity-0 group-hover:opacity-20 blur-lg'
        }`} />

        {/* Input Container */}
        <div className="relative group">
          <div className={`
            relative overflow-hidden rounded-2xl transition-all duration-300
            ${hasSelectedVehicle
              ? 'bg-gradient-to-br from-emerald-950 to-green-950 border-2 border-emerald-400/30'
              : error
              ? 'bg-gradient-to-br from-red-950 to-rose-950 border-2 border-red-400/30'
              : 'bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-white/10 hover:border-blue-400/30'
            }
          `}>
            {/* Animated Background Pattern */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute inset-0" style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.03) 35px, rgba(255,255,255,.03) 70px)',
              }} />
            </div>

            {/* Label */}
            <div className="relative px-4 pt-3 pb-1">
              <label className="block text-xs uppercase tracking-[0.25em] font-medium text-blue-300/70 mb-1">
                Vehicle Identification
              </label>
              <div className="text-sm text-white/40 font-light">
                {totalVehicles > 0
                  ? `${totalVehicles} vehicle${totalVehicles === 1 ? '' : 's'} in your library`
                  : 'Enter VIN or sign in to access saved vehicles'
                }
              </div>
            </div>

            {/* Input Field */}
            <div className="relative px-4 pb-4">
              <div className="relative flex items-center">
                {/* Search/Loading Icon */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                  {isLoading ? (
                    <div className="relative w-5 h-5">
                      <div className="absolute inset-0 rounded-full border-2 border-blue-400/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    </div>
                  ) : (
                    <svg className="w-5 h-5 text-blue-300/50 transition-colors group-hover:text-blue-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </div>

                {/* Input */}
                <input
                  type="text"
                  value={vin || searchQuery}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={() => setIsDropdownOpen(true)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  maxLength={17}
                  className="w-full pl-12 pr-12 py-4 bg-black/20 text-white text-lg font-mono tracking-[0.05em]
                             rounded-xl border border-white/10
                             focus:outline-none focus:border-blue-400/50 focus:bg-black/30
                             placeholder:text-white/20 placeholder:font-sans placeholder:tracking-normal
                             transition-all duration-300"
                  style={{ fontFamily: '"JetBrains Mono", "Courier New", monospace' }}
                />

                {/* Success Checkmark */}
                {hasSelectedVehicle && !isLoading && !error && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="relative">
                      <div className="absolute inset-0 bg-emerald-400 rounded-full blur-md opacity-50 animate-pulse" />
                      <svg className="relative w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mt-3 flex items-start gap-2 text-red-400 text-sm animate-in slide-in-from-top-2 duration-300">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* VIN Lookup Button - Shown when valid VIN entered */}
              {vin && !hasSelectedVehicle && vin.length >= 11 && onVinSubmit && (
                <button
                  onClick={onVinSubmit}
                  disabled={isLoading}
                  className="mt-4 w-full py-3 px-6 rounded-xl font-medium text-white
                             bg-gradient-to-r from-blue-500 to-emerald-600
                             hover:from-blue-600 hover:to-emerald-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]
                             shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Looking up VIN...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Lookup VIN
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Dropdown - Saved Vehicles */}
        {isDropdownOpen && totalVehicles > 0 && (
          <div className="absolute z-50 w-full mt-2 animate-in slide-in-from-top-4 duration-300">
            <div className="rounded-xl overflow-hidden bg-slate-950 border border-white/10 shadow-2xl backdrop-blur-xl">
              {/* Dropdown Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-slate-900 to-slate-950">
                <span className="text-sm font-medium text-white/70">
                  {isLoadingVehicles ? (
                    'Loading...'
                  ) : (
                    `${filteredGarage.length + filteredSaved.length + filteredShared.length} vehicle${filteredGarage.length + filteredSaved.length + filteredShared.length === 1 ? '' : 's'} found`
                  )}
                </span>
                <button
                  onClick={() => setIsDropdownOpen(false)}
                  className="text-white/40 hover:text-white/70 transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Vehicle List */}
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {isLoadingVehicles ? (
                  <div className="p-8 text-center text-white/40">
                    <div className="inline-block w-8 h-8 border-3 border-blue-400/20 border-t-blue-400 rounded-full animate-spin mb-3" />
                    <p>Loading your vehicles...</p>
                  </div>
                ) : (
                  <>
                    {/* My Garage Section */}
                    {filteredGarage.length > 0 && (
                      <div>
                        <div className="sticky top-0 px-4 py-2 bg-gradient-to-r from-blue-950 to-emerald-950 border-b border-blue-400/20">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-4 bg-gradient-to-b from-blue-400 to-cyan-500 rounded-full" />
                            <span className="text-xs uppercase tracking-[0.2em] text-blue-300 font-semibold">
                              My Garage
                            </span>
                          </div>
                        </div>
                        {filteredGarage.map((vehicle) => (
                          <VehicleListItem
                            key={vehicle.id}
                            vehicle={vehicle}
                            onSelect={() => handleSelectVehicle(vehicle)}
                            onEdit={onEditVehicle ? () => onEditVehicle(vehicle) : undefined}
                            onDelete={onDeleteVehicle ? () => onDeleteVehicle(vehicle) : undefined}
                            onShare={onShareVehicle ? () => onShareVehicle(vehicle) : undefined}
                          />
                        ))}
                      </div>
                    )}

                    {/* Saved Vehicles Section */}
                    {filteredSaved.length > 0 && (
                      <div>
                        <div className="sticky top-0 px-4 py-2 bg-gradient-to-r from-slate-900 to-slate-950 border-b border-white/10">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-4 bg-gradient-to-b from-slate-400 to-slate-600 rounded-full" />
                            <span className="text-xs uppercase tracking-[0.2em] text-slate-300 font-semibold">
                              Saved Vehicles
                            </span>
                          </div>
                        </div>
                    {filteredSaved.map((vehicle) => (
                      <VehicleListItem
                        key={vehicle.id}
                        vehicle={vehicle}
                        onSelect={() => handleSelectVehicle(vehicle)}
                        onEdit={onEditVehicle ? () => onEditVehicle(vehicle) : undefined}
                        onDelete={onDeleteVehicle ? () => onDeleteVehicle(vehicle) : undefined}
                        onShare={onShareVehicle ? () => onShareVehicle(vehicle) : undefined}
                      />
                    ))}
                  </div>
                )}

                {/* Shared Vehicles Section */}
                {filteredShared.length > 0 && (
                  <div>
                    <div className="sticky top-0 px-4 py-2 bg-gradient-to-r from-emerald-900 to-slate-950 border-b border-emerald-300/30">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-full" />
                        <span className="text-xs uppercase tracking-[0.2em] text-emerald-200 font-semibold">
                          My Shared Vehicles
                        </span>
                      </div>
                    </div>
                {filteredShared.map((vehicle) => (
                  <VehicleListItem
                    key={vehicle.id}
                    vehicle={vehicle}
                    onSelect={() => handleSelectVehicle(vehicle)}
                    onEdit={onEditVehicle ? () => onEditVehicle(vehicle) : undefined}
                    onShare={onShareVehicle ? () => onShareVehicle(vehicle) : undefined}
                    onAddToGarage={onAddToGarage ? () => onAddToGarage(vehicle) : undefined}
                    onDelete={onDeclineSharedVehicle ? () => onDeclineSharedVehicle(vehicle) : undefined}
                    isShared={true}
                  />
                ))}
                  </div>
                )}

                    {filteredGarage.length === 0 && filteredSaved.length === 0 && filteredShared.length === 0 && (
                      <div className="p-8 text-center text-white/30">
                        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p>No vehicles match your search</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        .vin-search-premium {
          position: relative;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5);
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.3);
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.5);
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

        @keyframes slide-in-from-top-4 {
          from {
            opacity: 0;
            transform: translateY(-16px);
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

        .slide-in-from-top-4 {
          animation: slide-in-from-top-4 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

// Vehicle List Item Component
const VehicleListItem: React.FC<{
  vehicle: VehicleOption;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onAddToGarage?: () => void;
  isShared?: boolean;
}> = ({ vehicle, onSelect, onEdit, onDelete, onShare, onAddToGarage, isShared }) => {
  return (
    <div
      className={`group/item relative border-b border-white/5 hover:bg-white/5 transition-all duration-300 cursor-pointer ${
        isShared ? 'border-l-4 border-l-purple-500 bg-purple-500/5' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Vehicle Photo */}
        {vehicle.photo_url && (
          <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-slate-800 group-hover/item:ring-2 group-hover/item:ring-blue-400/30 transition-all duration-300">
            <img
              src={vehicle.photo_url}
              alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-500"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Vehicle Info */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white group-hover/item:text-blue-300 transition-colors flex items-center gap-2 flex-wrap">
            <span>
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.trim && <span className="text-white/50"> · {vehicle.trim}</span>}
            </span>
            {isShared && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Shared
              </span>
            )}
          </div>
          {vehicle.vin && (
            <div className="text-xs text-white/40 font-mono mt-1">
              {vehicle.vin}
            </div>
          )}
          {(vehicle.asking_price || vehicle.estimated_value) && (
            <div className="text-sm font-semibold text-emerald-400 mt-1">
              {formatCurrencyValue(vehicle.asking_price || vehicle.estimated_value || 0)}
            </div>
          )}
          {vehicle.payoff_amount && (
            <div className="text-xs text-white/40 mt-1">
              Payoff: {formatCurrencyValue(vehicle.payoff_amount)}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Edit Button */}
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-2 text-white/30 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all duration-300 opacity-0 group-hover/item:opacity-100"
              title="Edit vehicle"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {/* Share Button */}
          {onShare && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-emerald-200 hover:border-emerald-200/40 hover:bg-white/10 transition-all duration-300 opacity-0 group-hover/item:opacity-100"
              title="Share vehicle"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 6l-4-4-4 4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v14" />
              </svg>
            </button>
          )}

          {/* Add to Garage Button (for shared vehicles) */}
          {onAddToGarage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToGarage();
              }}
              className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:text-purple-200 hover:border-purple-400/50 hover:bg-purple-500/20 transition-all duration-300 opacity-0 group-hover/item:opacity-100"
              title="Add to My Library"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          )}

          {/* Delete Button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all duration-300 opacity-0 group-hover/item:opacity-100"
              title="Delete vehicle"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
