/**
 * UserProfileDropdown - Mobile-friendly dropdown with four sections
 *
 * Sections:
 * 1. My Profile - Contact info, address, credit preferences
 * 2. My Garage - Saved garage vehicles
 * 3. Saved Vehicles - Saved marketplace vehicles
 * 4. My Offers - Submitted offers
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Input } from './Input';
import { Button } from './Button';
import { Badge } from './Badge';
import { Switch } from './Switch';
import { ProfileData } from '../../services/ProfileService';
import type { GarageVehicle } from '../../types';
import { formatPhoneNumber, formatCurrencyExact } from '../../utils/formatters';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice';
import { useCalculatorStore } from '../../stores/calculatorStore';
import { useToast } from './Toast';
import { LocationSearchPremium } from './LocationSearchPremium';
import { GarageSharingModal } from './GarageSharingModal';

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
  onShareGarageVehicle?: (vehicle: GarageVehicle) => void;
  onShareSavedVehicle?: (vehicle: any) => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
  onOpenDisplayPreferences?: () => void;
  onOpenMyOffers?: () => void;
  onCopySharedVehicle?: (vehicle: GarageVehicle) => void | Promise<void>;
  currentUserId?: string | null;
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
  onShareGarageVehicle,
  onShareSavedVehicle,
  onSignOut,
  onSignIn,
  onOpenDisplayPreferences,
  onOpenMyOffers,
  onCopySharedVehicle,
  currentUserId,
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
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(currentUserId ?? null);
  const [showSharingModal, setShowSharingModal] = useState(false);

  // Local state for form fields to prevent focus loss during typing
  // These sync FROM profile on mount/profile change, and TO profile on blur
  const [localFullName, setLocalFullName] = useState(profile?.full_name || '');
  const [localEmail, setLocalEmail] = useState(profile?.email || '');
  const [localPhone, setLocalPhone] = useState(profile?.phone || '');
  const [localDownPayment, setLocalDownPayment] = useState(
    profile?.preferred_down_payment != null ? profile.preferred_down_payment : 0
  );

  // Track if local values differ from profile (for enabling Save button)
  const localIsDirty = useMemo(() => {
    if (!profile) return false;
    return (
      localFullName !== (profile.full_name || '') ||
      localEmail !== (profile.email || '') ||
      localPhone !== (profile.phone || '') ||
      localDownPayment !== (profile.preferred_down_payment ?? 0)
    );
  }, [localFullName, localEmail, localPhone, localDownPayment, profile]);

  // Sync local state when profile changes (e.g., on load)
  useEffect(() => {
    setLocalFullName(profile?.full_name || '');
    setLocalEmail(profile?.email || '');
    setLocalPhone(profile?.phone || '');
    setLocalDownPayment(profile?.preferred_down_payment ?? 0);
  }, [profile?.full_name, profile?.email, profile?.phone, profile?.preferred_down_payment]);

  // Store onUpdateField in a ref to avoid effect re-runs
  const onUpdateFieldRef = useRef(onUpdateField);
  useEffect(() => {
    onUpdateFieldRef.current = onUpdateField;
  }, [onUpdateField]);

  // Track user id changes (for sharing)
  useEffect(() => {
    setActiveUserId(currentUserId ?? null);
  }, [currentUserId]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Keep dropdown open while nested share modal is shown
      if (showSharingModal) return;

      const target = event.target as HTMLElement | null;

      // If the click originated from the Google Places suggestions dropdown (which
      // renders outside of our container), do not close the modal. This prevents
      // the modal from dismissing when the user picks an address suggestion.
      const clickedGoogleAutocomplete =
        target?.closest('.pac-container') ||
        target?.closest('gmpx-place-autocomplete') ||
        target?.closest('gmpx-dropdown');

      if (clickedGoogleAutocomplete) return;

      if (dropdownRef.current && !dropdownRef.current.contains(target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, showSharingModal]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showSharingModal) return;
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, showSharingModal]);

  const handleSaveProfile = async () => {
    if (!profile || isSaving) return;

    try {
      setIsSaving(true);
      // Use local state values for fields managed locally, profile for others
      await onSaveProfile({
        full_name: localFullName,
        email: localEmail,
        phone: localPhone,
        street_address: profile.street_address,
        city: profile.city,
        state: profile.state,
        state_code: profile.state_code,
        zip_code: profile.zip_code,
        county: profile.county,
        county_name: profile.county_name,
        google_place_id: profile.google_place_id,
        credit_score_range: profile.credit_score_range,
        preferred_down_payment: localDownPayment,
      });
      toast.push({
        kind: 'success',
        title: 'Profile saved',
        detail: 'Your info has been updated.',
      });
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Failed to save profile',
        detail: error?.message || 'Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-500" onClick={onClose} />

      {/* Dropdown - Apple-esque Design */}
      <div
        ref={dropdownRef}
        className="fixed right-4 top-16 w-[clamp(360px,85vw,960px)] max-h-[calc(100vh-5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-600 flex flex-col"
        style={{
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.45), 0 0 1px rgba(255, 255, 255, 0.08)'
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white tracking-tight">My Account</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center border border-white/10"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Section List (when no section is active) */}
          {!activeSection && (
            <div className="space-y-3 px-3 py-3">
              {/* My Profile Section */}
              <button
                onClick={() => setActiveSection('profile')}
                onMouseEnter={() => !isTouchDevice && setHoveredSection('profile')}
                onMouseLeave={() => !isTouchDevice && setHoveredSection(null)}
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group rounded-xl backdrop-blur-sm border ${
                  hoveredSection === 'profile'
                    ? 'bg-emerald-500/10 border-emerald-400/30 shadow-lg shadow-emerald-500/15'
                    : 'border-white/5 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm transition-all duration-200 ${
                    hoveredSection === 'profile' ? 'shadow-md scale-105' : ''
                  }`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className={`font-semibold text-sm transition-colors duration-200 ${
                      hoveredSection === 'profile' ? 'text-emerald-100' : 'text-white'
                    }`}>My Profile</div>
                    <div className="text-xs text-white/60">Contact & preferences</div>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                  hoveredSection === 'profile' ? 'text-emerald-200 translate-x-1' : 'text-white/40 group-hover:text-white/60'
                }`}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* My Garage Section */}
              <button
                onClick={() => setActiveSection('garage')}
                onMouseEnter={() => !isTouchDevice && setHoveredSection('garage')}
                onMouseLeave={() => !isTouchDevice && setHoveredSection(null)}
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group rounded-xl backdrop-blur-sm border ${
                  hoveredSection === 'garage'
                    ? 'bg-green-500/10 border-green-400/30 shadow-lg shadow-green-500/15'
                    : 'border-white/5 hover:bg-white/5'
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
                      hoveredSection === 'garage' ? 'text-green-100' : 'text-white'
                    }`}>My Garage</div>
                    <div className="text-xs text-white/60">Your vehicles</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full transition-colors duration-200 ${
                    hoveredSection === 'garage' ? 'bg-green-500/20 text-green-100 border border-green-500/40' : 'bg-white/5 text-white/80 border border-white/10'
                  }`}>{garageVehicles.length}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                    hoveredSection === 'garage' ? 'text-green-200 translate-x-1' : 'text-white/40 group-hover:text-white/60'
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
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group rounded-xl backdrop-blur-sm border ${
                  hoveredSection === 'saved'
                    ? 'bg-purple-500/10 border-purple-400/30 shadow-lg shadow-purple-500/15'
                    : 'border-white/5 hover:bg-white/5'
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
                      hoveredSection === 'saved' ? 'text-purple-100' : 'text-white'
                    }`}>Saved Vehicles</div>
                    <div className="text-xs text-white/60">Marketplace listings</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full transition-colors duration-200 ${
                    hoveredSection === 'saved' ? 'bg-purple-500/20 text-purple-100 border border-purple-500/40' : 'bg-white/5 text-white/80 border border-white/10'
                  }`}>{savedVehicles.length}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                    hoveredSection === 'saved' ? 'text-purple-200 translate-x-1' : 'text-white/40 group-hover:text-white/60'
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
                className={`w-full px-5 py-4 text-left transition-all duration-200 flex items-center justify-between group rounded-xl backdrop-blur-sm border ${
                  hoveredSection === 'offers'
                    ? 'bg-orange-500/10 border-orange-400/30 shadow-lg shadow-orange-500/15'
                    : 'border-white/5 hover:bg-white/5'
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
                      hoveredSection === 'offers' ? 'text-orange-100' : 'text-white'
                    }`}>My Offers</div>
                    <div className="text-xs text-white/60">Submitted offers</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`transition-all duration-200 ${
                    hoveredSection === 'offers' ? 'text-orange-200 translate-x-1' : 'text-white/40 group-hover:text-white/60'
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
                  className="w-full p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-gradient-to-r hover:from-emerald-500/10 hover:to-purple-500/10 transition-all duration-200 flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white">Display Preferences</div>
                    <div className="text-xs text-white/60">Customize what you see</div>
                  </div>
                  <svg className="ml-auto w-5 h-5 text-white/50 group-hover:text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {/* Sign In/Out Button */}
              <div className="p-5 border border-white/5 bg-white/5 rounded-xl shadow-inner shadow-black/20">
                {onSignOut ? (
                  <button
                    onClick={() => {
                      onSignOut();
                      onClose();
                    }}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-red-500/25 flex items-center justify-center gap-2"
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
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
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
            <div className="p-5 space-y-4">
              {/* Back Button */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-2 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h4 className="text-lg font-semibold text-white">My Profile</h4>

              {/* Contact Information */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium text-white/70">Contact Information</h5>

                <Input
                  label="Full Name"
                  type="text"
                  value={localFullName}
                  onChange={(e) => setLocalFullName(e.target.value)}
                  onBlur={() => onUpdateField('full_name', localFullName)}
                  placeholder="Enter your name"
                  fullWidth
                />

                <Input
                  label="Email"
                  type="email"
                  value={localEmail}
                  onChange={(e) => setLocalEmail(e.target.value)}
                  onBlur={() => onUpdateField('email', localEmail)}
                  placeholder="your@email.com"
                  fullWidth
                />

                <Input
                  label="Phone"
                  type="tel"
                  value={formatPhoneNumber(localPhone)}
                  onChange={(e) => setLocalPhone(formatPhoneNumber(e.target.value))}
                  onBlur={() => onUpdateField('phone', localPhone)}
                  placeholder="(555) 123-4567"
                  fullWidth
                />
              </div>

              {/* Address Information */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <h5 className="text-sm font-medium text-white/70">Address (Optional)</h5>

                <LocationSearchPremium
                  location={activeSection === 'profile' ? profile?.street_address || '' : ''}
                  onLocationChange={(value) => onUpdateField('street_address', value)}
                  onPlaceSelected={(details) => {
                    onUpdateField('street_address', details.formatted_address || details.city || '');
                    onUpdateField('city', details.city || '');
                    onUpdateField('state', details.state || '');
                    onUpdateField('state_code', details.state || '');
                    onUpdateField('zip_code', details.zip || '');
                    onUpdateField('county', details.county || '');
                    onUpdateField('county_name', details.county ? `${details.county} County` : '');
                  }}
                  placeholder="Start typing your address..."
                />
              </div>

              {/* Preferences */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <h5 className="text-sm font-medium text-white/70">Preferences</h5>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">
                    Credit Score Range
                  </label>
                  <select
                    value={profile?.credit_score_range || ''}
                    onChange={(e) => onUpdateField('credit_score_range', e.target.value)}
                    className="block w-full rounded-lg border border-white/15 px-4 py-2 text-base bg-black/30 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40"
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
                  value={localDownPayment > 0 ? formatCurrency(localDownPayment) : ''}
                  onChange={(e) => {
                    const value = parseDownPayment(e.target.value);
                    setLocalDownPayment(value);
                  }}
                  onBlur={() => onUpdateField('preferred_down_payment', localDownPayment)}
                  placeholder="$5,000"
                  helperText="Your typical down payment amount"
                  fullWidth
                />
              </div>

              {/* Save Button */}
              <div className="pt-3 border-t border-white/10 flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveProfile}
                  fullWidth
                  disabled={!(isDirty || localIsDirty) || isSaving}
                  loading={isSaving}
                  className="shadow-lg shadow-blue-500/25"
                >
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveSection(null)}
                  fullWidth
                  className="!border-white/25 !text-white hover:!bg-white/10 hover:!text-white"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* My Garage Section Content */}
          {activeSection === 'garage' && (
            <div className="p-5 space-y-4">
              {/* Back Button */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-2 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <div className="flex items-center justify-between mb-2">
                <h4 className="text-lg font-semibold text-white">My Garage</h4>
                {activeUserId && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowSharingModal(true)}
                    className="flex items-center gap-1.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share
                  </Button>
                )}
              </div>

              {garageVehicles.length === 0 ? (
                <div className="text-center py-8 text-white/60">
                  <svg className="w-16 h-16 mx-auto mb-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7-5l3-3m0 0l3 3m-3-3v12" />
                  </svg>
                  <p className="text-sm text-white/70">No vehicles in your garage</p>
                </div>
              ) : (
                <>
                  {/* Trade-In Summary */}
                  {selectedTradeInVehicles.size > 0 && (
                    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="text-center">
                          <div className="text-xs text-blue-200 mb-1">Trade Value</div>
                          <div className="text-blue-100 font-bold">
                            {formatCurrencyExact(tradeAllowance)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-blue-200 mb-1">Payoff</div>
                          <div className="text-blue-100 font-bold">
                            {formatCurrencyExact(tradePayoff)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-blue-200 mb-1">Net Trade-in</div>
                          <div className={`font-bold ${tradeAllowance - tradePayoff >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                            {formatCurrencyExact(tradeAllowance - tradePayoff)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Vehicle Cards */}
                  <div className="space-y-2">
                    {garageVehicles.map((vehicle) => {
                      const isSharedVehicle =
                        vehicle.source === 'shared' || (!!activeUserId && vehicle.user_id !== activeUserId);
                      const accessRole = vehicle.access_role || (isSharedVehicle ? 'viewer' : 'owner');
                      const canManageVehicle = !isSharedVehicle || accessRole === 'owner' || accessRole === 'manager';

                      return (
                        <div
                          key={vehicle.id}
                          className={`p-3 border rounded-lg transition-all group ${
                            selectedTradeInVehicles.has(vehicle.id)
                              ? 'border-emerald-400/50 bg-white/5 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-400/20'
                              : 'border-white/10 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-20 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 relative">
                              {vehicle.photo_url ? (
                                <img
                                  src={vehicle.photo_url}
                                  alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-white/30">
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7-5l3-3m0 0l3 3m-3-3v12" />
                                  </svg>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {vehicle.nickname && (
                                  <p className="text-xs font-semibold text-emerald-200 mb-1 truncate">
                                    {vehicle.nickname}
                                  </p>
                                )}
                                {isSharedVehicle && (
                                  <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-amber-500/15 text-amber-100 border border-amber-400/30">
                                    Shared · {accessRole}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-white truncate">
                                {vehicle.year} {vehicle.make} {vehicle.model}
                              </p>
                              {vehicle.vin && (
                                <p className="text-xs text-white/50 font-mono mt-1 truncate uppercase">
                                  {vehicle.vin}
                                </p>
                              )}
                              {vehicle.estimated_value != null && (
                                <p className="text-sm font-medium text-emerald-200 mt-1">
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
                                    ? 'text-emerald-200'
                                    : 'text-white/60'
                                }`}>
                                  Trade-In
                                </span>
                              </div>

                              {/* Edit Button */}
                              {onEditGarageVehicle && canManageVehicle && (
                                <button
                                  onClick={() => onEditGarageVehicle(vehicle)}
                                  className="p-1.5 text-white/50 hover:text-emerald-200 hover:bg-white/10 rounded transition-colors"
                                  title="Edit"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}

                              {/* Delete Button */}
                              {onDeleteGarageVehicle && canManageVehicle && (
                                <button
                                  onClick={() => onDeleteGarageVehicle(vehicle)}
                                  className="p-1.5 text-white/50 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                  title="Delete"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}

                              {/* Share Button */}
                              {onShareGarageVehicle && canManageVehicle && (
                                <button
                                  onClick={() => onShareGarageVehicle(vehicle)}
                                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-emerald-200 hover:border-emerald-200/40 hover:bg-white/10 transition-colors"
                                  title="Share vehicle"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 6l-4-4-4 4" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v14" />
                                  </svg>
                                </button>
                              )}

                              {isSharedVehicle && onCopySharedVehicle && (
                                <button
                                  onClick={() => onCopySharedVehicle(vehicle)}
                                  className="p-1.5 text-emerald-100 hover:text-white hover:bg-emerald-500/20 rounded transition-colors border border-emerald-400/40"
                                  title="Copy to my garage"
                                >
                                  Copy
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Saved Vehicles Section Content */}
          {activeSection === 'saved' && (
            <div className="p-5 space-y-4">
              {/* Back Button */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-2 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h4 className="text-lg font-semibold text-white">Saved Vehicles</h4>

              {savedVehicles.length === 0 ? (
                <div className="text-center py-8 text-white/60">
                  <svg className="w-16 h-16 mx-auto mb-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-sm text-white/70">No saved vehicles</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedVehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="p-3 border border-white/10 rounded-lg hover:bg-white/5 transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-20 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 relative">
                            {vehicle.photo_url ? (
                              <img
                                src={vehicle.photo_url}
                                alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-white/30">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17a5 5 0 01-.916-9.916 5.002 5.002 0 019.832 0A5.002 5.002 0 0116 17m-7-5l3-3m0 0l3 3m-3-3v12" />
                                </svg>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {vehicle.year} {vehicle.make} {vehicle.model}
                            </p>
                            {vehicle.vin && (
                              <p className="text-xs text-white/50 font-mono mt-1 truncate uppercase">
                                {vehicle.vin}
                              </p>
                            )}
                            {vehicle.asking_price != null && (
                              <p className="text-sm font-medium text-blue-200 mt-1">
                                {formatCurrency(vehicle.asking_price)}
                              </p>
                            )}
                            {vehicle.dealer_name && (
                              <p className="text-xs text-white/60 mt-1 truncate">
                                {vehicle.dealer_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          {onSelectVehicle && (
                            <button
                              onClick={() => {
                                onSelectVehicle(vehicle);
                                onClose();
                              }}
                              className="p-1.5 text-white/50 hover:text-emerald-200 hover:bg-white/10 rounded transition-colors"
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
                              className="p-1.5 text-white/50 hover:text-emerald-200 hover:bg-white/10 rounded transition-colors"
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
                              className="p-1.5 text-white/50 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                              title="Remove"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                          {onShareSavedVehicle && (
                            <button
                              onClick={() => onShareSavedVehicle(vehicle)}
                              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-emerald-200 hover:border-emerald-200/40 hover:bg-white/10 transition-colors"
                              title="Share"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 6l-4-4-4 4" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v14" />
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

      {/* Garage Sharing Modal */}
      {activeUserId && (
        <GarageSharingModal
          isOpen={showSharingModal}
          onClose={() => setShowSharingModal(false)}
          userId={activeUserId}
        />
      )}
    </>
  );
};

export default UserProfileDropdown;
