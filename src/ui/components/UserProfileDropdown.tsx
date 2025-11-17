/**
 * UserProfileDropdown - Mobile-friendly dropdown with four sections
 *
 * Sections:
 * 1. My Profile - Contact info, address, credit preferences
 * 2. My Garage - Saved garage vehicles
 * 3. Saved Vehicles - Saved marketplace vehicles
 * 4. My Offers - Submitted offers
 */

import React, { useState, useRef, useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Input } from './Input';
import { Button } from './Button';
import { Badge } from './Badge';
import { Switch } from './Switch';
import { ProfileData } from '../../services/ProfileService';
import type { GarageVehicle } from '../../types';
import { formatPhoneNumber, formatCurrencyExact } from '../../utils/formatters';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice';
import { useGoogleMapsAutocomplete, PlaceDetails } from '../../hooks/useGoogleMapsAutocomplete';
import { useCalculatorStore } from '../../stores/calculatorStore';

export interface UserProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileData | null;
  onSaveProfile: (data: Partial<ProfileData>) => Promise<void>;
  onUpdateField: (field: keyof ProfileData, value: any) => void;
  garageVehicles: GarageVehicle[];
  savedVehicles: any[];
  onSelectVehicle?: (vehicle: any) => void;
  onEditGarageVehicle?: (vehicle: GarageVehicle) => void;
  onDeleteGarageVehicle?: (vehicle: GarageVehicle) => void;
  onEditSavedVehicle?: (vehicle: any) => void;
  onRemoveSavedVehicle?: (vehicle: any) => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
  onOpenDisplayPreferences?: () => void;
  onOpenMyOffers?: () => void;
  supabase: SupabaseClient | null;
  isDirty?: boolean;
}

type Section = 'profile' | 'garage' | 'saved' | 'offers';

const CREDIT_SCORE_OPTIONS = [
  { value: 'excellent', label: 'Excellent (750+)' },
  { value: 'good', label: 'Good (700-749)' },
  { value: 'fair', label: 'Fair (650-699)' },
  { value: 'poor', label: 'Poor (below 650)' },
];

/**
 * UserProfileDropdown Component
 */
export const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  onUpdateField,
  garageVehicles,
  savedVehicles,
  onSelectVehicle,
  onEditGarageVehicle,
  onDeleteGarageVehicle,
  onEditSavedVehicle,
  onRemoveSavedVehicle,
  onSignOut,
  onSignIn,
  onOpenDisplayPreferences,
  onOpenMyOffers,
  supabase,
  isDirty = false,
}) => {
  // Use calculator store for trade-in state
  const { selectedTradeInVehicles, sliders, tradePayoff, toggleTradeInVehicle } = useCalculatorStore();
  const tradeAllowance = sliders.tradeAllowance.value;

  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [hoveredSection, setHoveredSection] = useState<Section | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isTouchDevice = useIsTouchDevice();
  const addressInputRef = useRef<HTMLInputElement>(null);

  // Handle place selection from autocomplete
  const handlePlaceSelected = (placeDetails: PlaceDetails) => {
    // Extract street number and route for street_address
    // Note: hook doesn't provide street breakdown, so we'll use the full formatted address
    // and parse it if needed, or just use city/state/zip from the structured data
    onUpdateField('street_address', placeDetails.address);
    onUpdateField('city', placeDetails.city);
    onUpdateField('state', placeDetails.state);
    onUpdateField('state_code', placeDetails.stateCode);
    onUpdateField('zip_code', placeDetails.zipCode);
    onUpdateField('county', placeDetails.county);
    onUpdateField('county_name', placeDetails.countyName);
    // Note: google_place_id is not available in PlaceDetails - would need to extend hook if needed
  };

  // Setup Google Places autocomplete using modern hook
  useGoogleMapsAutocomplete(addressInputRef, {
    onPlaceSelected: handlePlaceSelected,
    types: ['address'],
    componentRestrictions: { country: 'us' },
  });

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleSaveProfile = async () => {
    if (!profile) return;

    await onSaveProfile({
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      street_address: profile.street_address,
      city: profile.city,
      state: profile.state,
      state_code: profile.state_code,
      zip_code: profile.zip_code,
      google_place_id: profile.google_place_id,
      preferred_credit_score: profile.preferred_credit_score,
      credit_score_range: profile.credit_score_range,
      preferred_down_payment: profile.preferred_down_payment,
    });
  };

  const formatCurrency = (value?: number) => {
    if (value == null) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const parseDownPayment = (value: string): number => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-20 backdrop-blur-sm z-500" onClick={onClose} />

      {/* Dropdown - Apple-esque Design */}
      <div
        ref={dropdownRef}
        className="fixed right-4 top-16 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 overflow-hidden z-600 flex flex-col"
        style={{
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 1px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200/50 bg-white/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight">My Account</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-gray-600">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Section List (when no section is active) */}
          {!activeSection && (
            <div className="divide-y">
              {/* My Profile Section */}
              <button
                onClick={() => setActiveSection('profile')}
                onMouseEnter={() => !isTouchDevice && setHoveredSection('profile')}
                onMouseLeave={() => !isTouchDevice && setHoveredSection(null)}
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group ${
                  hoveredSection === 'profile'
                    ? 'bg-blue-50 scale-[1.01]'
                    : 'hover:bg-gray-50/80 active:bg-gray-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm transition-all duration-200 ${
                    hoveredSection === 'profile' ? 'shadow-md scale-105' : ''
                  }`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className={`font-semibold text-sm transition-colors duration-200 ${
                      hoveredSection === 'profile' ? 'text-blue-700' : 'text-gray-900'
                    }`}>My Profile</div>
                    <div className="text-xs text-gray-500">Contact & preferences</div>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                  hoveredSection === 'profile' ? 'text-blue-600 translate-x-1' : 'text-gray-400 group-hover:text-gray-600'
                }`}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* My Garage Section */}
              <button
                onClick={() => setActiveSection('garage')}
                onMouseEnter={() => !isTouchDevice && setHoveredSection('garage')}
                onMouseLeave={() => !isTouchDevice && setHoveredSection(null)}
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group ${
                  hoveredSection === 'garage'
                    ? 'bg-green-50 scale-[1.01]'
                    : 'hover:bg-gray-50/80 active:bg-gray-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-sm transition-all duration-200 ${
                    hoveredSection === 'garage' ? 'shadow-md scale-105' : ''
                  }`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7-5l3-3m0 0l3 3m-3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <div className={`font-semibold text-sm transition-colors duration-200 ${
                      hoveredSection === 'garage' ? 'text-green-700' : 'text-gray-900'
                    }`}>My Garage</div>
                    <div className="text-xs text-gray-500">Your vehicles</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full transition-colors duration-200 ${
                    hoveredSection === 'garage' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'
                  }`}>{garageVehicles.length}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                    hoveredSection === 'garage' ? 'text-green-600 translate-x-1' : 'text-gray-400 group-hover:text-gray-600'
                  }`}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Saved Vehicles Section */}
              <button
                onClick={() => setActiveSection('saved')}
                onMouseEnter={() => !isTouchDevice && setHoveredSection('saved')}
                onMouseLeave={() => !isTouchDevice && setHoveredSection(null)}
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group ${
                  hoveredSection === 'saved'
                    ? 'bg-purple-50 scale-[1.01]'
                    : 'hover:bg-gray-50/80 active:bg-gray-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm transition-all duration-200 ${
                    hoveredSection === 'saved' ? 'shadow-md scale-105' : ''
                  }`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </div>
                  <div>
                    <div className={`font-semibold text-sm transition-colors duration-200 ${
                      hoveredSection === 'saved' ? 'text-purple-700' : 'text-gray-900'
                    }`}>Saved Vehicles</div>
                    <div className="text-xs text-gray-500">Marketplace listings</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full transition-colors duration-200 ${
                    hoveredSection === 'saved' ? 'bg-purple-200 text-purple-800' : 'bg-gray-200 text-gray-700'
                  }`}>{savedVehicles.length}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                    hoveredSection === 'saved' ? 'text-purple-600 translate-x-1' : 'text-gray-400 group-hover:text-gray-600'
                  }`}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* My Offers Section */}
              <button
                onClick={() => {
                  if (onOpenMyOffers) {
                    onOpenMyOffers();
                    onClose();
                  }
                }}
                onMouseEnter={() => !isTouchDevice && setHoveredSection('offers')}
                onMouseLeave={() => !isTouchDevice && setHoveredSection(null)}
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group ${
                  hoveredSection === 'offers'
                    ? 'bg-orange-50 scale-[1.01]'
                    : 'hover:bg-gray-50/80 active:bg-gray-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm transition-all duration-200 ${
                    hoveredSection === 'offers' ? 'shadow-md scale-105' : ''
                  }`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className={`font-semibold text-sm transition-colors duration-200 ${
                      hoveredSection === 'offers' ? 'text-orange-700' : 'text-gray-900'
                    }`}>My Offers</div>
                    <div className="text-xs text-gray-500">Submitted offers</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                    hoveredSection === 'offers' ? 'text-orange-600 translate-x-1' : 'text-gray-400 group-hover:text-gray-600'
                  }`}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Display Preferences Button */}
              {onOpenDisplayPreferences && (
                <button
                  onClick={() => {
                    onOpenDisplayPreferences();
                    onClose();
                  }}
                  className="w-full p-4 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50 transition-all duration-200 flex items-center gap-4 border-b border-gray-200/50"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-purple-600 flex items-center justify-center shadow-md">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Display Preferences</div>
                    <div className="text-xs text-gray-500">Customize what you see</div>
                  </div>
                  <svg className="ml-auto w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {/* Sign In/Out Button */}
              <div className="p-5 border-t border-gray-200/50 bg-white/50">
                {onSignOut ? (
                  <button
                    onClick={() => {
                      onSignOut();
                      onClose();
                    }}
                    className="w-full px-4 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                ) : onSignIn ? (
                  <button
                    onClick={() => {
                      onSignIn();
                      onClose();
                    }}
                    className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Sign In
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* My Profile Section Content */}
          {activeSection === 'profile' && (
            <div className="p-4 space-y-4">
              {/* Back Button */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h4 className="text-lg font-semibold text-gray-900">My Profile</h4>

              {/* Contact Information */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium text-gray-700">Contact Information</h5>

                <Input
                  label="Full Name"
                  type="text"
                  value={profile?.full_name || ''}
                  onChange={(e) => onUpdateField('full_name', e.target.value)}
                  placeholder="Enter your name"
                  fullWidth
                />

                <Input
                  label="Email"
                  type="email"
                  value={profile?.email || ''}
                  onChange={(e) => onUpdateField('email', e.target.value)}
                  placeholder="your@email.com"
                  fullWidth
                />

                <Input
                  label="Phone"
                  type="tel"
                  value={profile?.phone ? formatPhoneNumber(profile.phone) : ''}
                  onChange={(e) => onUpdateField('phone', formatPhoneNumber(e.target.value))}
                  placeholder="(555) 123-4567"
                  fullWidth
                />
              </div>

              {/* Address Information */}
              <div className="space-y-3 pt-3 border-t">
                <h5 className="text-sm font-medium text-gray-700">Address (Optional)</h5>

                <Input
                  label="Street Address"
                  type="text"
                  value={profile?.street_address || ''}
                  onChange={(e) => onUpdateField('street_address', e.target.value)}
                  placeholder="123 Main St"
                  ref={addressInputRef}
                  helperText="Start typing for suggestions"
                  fullWidth
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="City"
                    type="text"
                    value={profile?.city || ''}
                    onChange={(e) => onUpdateField('city', e.target.value)}
                    placeholder="City"
                    fullWidth
                  />

                  <Input
                    label="State"
                    type="text"
                    value={profile?.state_code || ''}
                    onChange={(e) => onUpdateField('state_code', e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="FL"
                    maxLength={2}
                    fullWidth
                  />
                </div>

                <Input
                  label="ZIP Code"
                  type="text"
                  value={profile?.zip_code || ''}
                  onChange={(e) => onUpdateField('zip_code', e.target.value.slice(0, 5))}
                  placeholder="12345"
                  maxLength={5}
                  fullWidth
                />
              </div>

              {/* Preferences */}
              <div className="space-y-3 pt-3 border-t">
                <h5 className="text-sm font-medium text-gray-700">Preferences</h5>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Credit Score Range
                  </label>
                  <select
                    value={profile?.preferred_credit_score || profile?.credit_score_range || ''}
                    onChange={(e) => onUpdateField('preferred_credit_score', e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-4 py-2 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select credit score range</option>
                    {CREDIT_SCORE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Preferred Down Payment"
                  type="text"
                  value={
                    profile?.preferred_down_payment != null
                      ? formatCurrency(profile.preferred_down_payment)
                      : ''
                  }
                  onChange={(e) => {
                    const value = parseDownPayment(e.target.value);
                    onUpdateField('preferred_down_payment', value);
                  }}
                  placeholder="$5,000"
                  helperText="Your typical down payment amount"
                  fullWidth
                />
              </div>

              {/* Save Button */}
              <div className="pt-3 border-t flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveProfile}
                  fullWidth
                  disabled={!isDirty}
                >
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveSection(null)}
                  fullWidth
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* My Garage Section Content */}
          {activeSection === 'garage' && (
            <div className="p-4 space-y-4">
              {/* Back Button */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h4 className="text-lg font-semibold text-gray-900">My Garage</h4>

              {garageVehicles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7-5l3-3m0 0l3 3m-3-3v12" />
                  </svg>
                  <p className="text-sm">No vehicles in your garage</p>
                </div>
              ) : (
                <>
                  {/* Trade-In Summary */}
                  {selectedTradeInVehicles.size > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="text-center">
                          <div className="text-xs text-blue-600 mb-1">Trade Value</div>
                          <div className="text-blue-900 font-bold">
                            {formatCurrencyExact(tradeAllowance)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-blue-600 mb-1">Payoff</div>
                          <div className="text-blue-900 font-bold">
                            {formatCurrencyExact(tradePayoff)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-blue-600 mb-1">Net Trade-in</div>
                          <div className={`font-bold ${tradeAllowance - tradePayoff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrencyExact(tradeAllowance - tradePayoff)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Vehicle Cards */}
                  <div className="space-y-2">
                    {garageVehicles.map((vehicle) => (
                      <div
                        key={vehicle.id}
                        className={`p-3 border rounded-lg transition-all ${
                          selectedTradeInVehicles.has(vehicle.id)
                            ? 'border-blue-400 bg-blue-50 shadow-md ring-2 ring-blue-200'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            {vehicle.nickname && (
                              <p className="text-xs font-semibold text-blue-600 mb-1 truncate">
                                {vehicle.nickname}
                              </p>
                            )}
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {vehicle.year} {vehicle.make} {vehicle.model}
                            </p>
                            {vehicle.vin && (
                              <p className="text-xs text-gray-500 font-mono mt-1 truncate uppercase">
                                {vehicle.vin}
                              </p>
                            )}
                            {vehicle.estimated_value != null && (
                              <p className="text-sm font-medium text-green-600 mt-1">
                                {formatCurrency(vehicle.estimated_value)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            {/* Trade-In Toggle */}
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={selectedTradeInVehicles.has(vehicle.id)}
                                onChange={(e) => toggleTradeInVehicle(vehicle.id, garageVehicles)}
                                size="sm"
                              />
                                <span className={`text-xs font-medium transition-colors ${
                                  selectedTradeInVehicles.has(vehicle.id)
                                    ? 'text-blue-600'
                                    : 'text-gray-500'
                                }`}>
                                Trade-In
                              </span>
                            </div>

                            {/* Edit Button */}
                            {onEditGarageVehicle && (
                              <button
                                onClick={() => onEditGarageVehicle(vehicle)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Edit"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}

                            {/* Delete Button */}
                            {onDeleteGarageVehicle && (
                              <button
                                onClick={() => onDeleteGarageVehicle(vehicle)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Saved Vehicles Section Content */}
          {activeSection === 'saved' && (
            <div className="p-4 space-y-4">
              {/* Back Button */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h4 className="text-lg font-semibold text-gray-900">Saved Vehicles</h4>

              {savedVehicles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-sm">No saved vehicles</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedVehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </p>
                          {vehicle.vin && (
                            <p className="text-xs text-gray-500 font-mono mt-1 truncate uppercase">
                              {vehicle.vin}
                            </p>
                          )}
                          {vehicle.asking_price != null && (
                            <p className="text-sm font-medium text-blue-600 mt-1">
                              {formatCurrency(vehicle.asking_price)}
                            </p>
                          )}
                          {vehicle.dealer_name && (
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {vehicle.dealer_name}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 ml-2">
                          {onSelectVehicle && (
                            <button
                              onClick={() => {
                                onSelectVehicle(vehicle);
                                onClose();
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Select"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                          {onEditSavedVehicle && (
                            <button
                              onClick={() => onEditSavedVehicle(vehicle)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {onRemoveSavedVehicle && (
                            <button
                              onClick={() => onRemoveSavedVehicle(vehicle)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Remove"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UserProfileDropdown;
