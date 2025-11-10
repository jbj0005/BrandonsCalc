import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Select, Slider, Button, Card, Badge, VehicleEditorModal, AuthModal, EnhancedSlider, EnhancedControl, UserProfileDropdown } from './ui/components';
import { useToast } from './ui/components/Toast';
import type { SelectOption } from './ui/components/Select';
import { useGoogleMapsAutocomplete, type PlaceDetails } from './hooks/useGoogleMapsAutocomplete';
import { useProfile } from './hooks/useProfile';
import { fetchLenderRates, calculateAPR, creditScoreToValue, type LenderRate } from './services/lenderRates';
import { DealerMap } from './components/DealerMap';
import { OfferPreviewModal } from './components/OfferPreviewModal';
import type { LeadData } from './services/leadSubmission';

// Import MarketCheck cache for VIN lookup
// @ts-ignore - JS module
import marketCheckCache from './features/vehicles/marketcheck-cache.js';

// Import SavedVehiclesCache for saved vehicles
// @ts-ignore - JS module
import savedVehiclesCache from './features/vehicles/saved-vehicles-cache.js';

// Import AuthManager and Supabase
// @ts-ignore - TS module
import authManager from './features/auth/auth-manager';
// @ts-ignore - TS module
import { supabase } from './lib/supabase';

/**
 * CalculatorApp - Main auto loan calculator application
 *
 * This is a full React rewrite of the vanilla JS calculator,
 * using the component library we built.
 */
export const CalculatorApp: React.FC = () => {
  const toast = useToast();

  // Refs
  const locationInputRef = useRef<HTMLInputElement>(null);

  // Location & Vehicle State
  const [location, setLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState<PlaceDetails | null>(null);
  const [vin, setVin] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [isLoadingVIN, setIsLoadingVIN] = useState(false);
  const [vinError, setVinError] = useState('');

  // Google Maps Autocomplete
  const { isLoaded: mapsLoaded, error: mapsError } = useGoogleMapsAutocomplete(locationInputRef as React.RefObject<HTMLInputElement>, {
    onPlaceSelected: (place: PlaceDetails) => {
      setLocation(place.address);
      setLocationDetails(place);
    },
    types: ['address'],
    componentRestrictions: { country: 'us' },
  });

  // Saved Vehicles State (marketplace vehicles from 'vehicles' table)
  const [savedVehicles, setSavedVehicles] = useState<any[]>([]);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [isLoadingSavedVehicles, setIsLoadingSavedVehicles] = useState(false);
  const [showManageVehiclesModal, setShowManageVehiclesModal] = useState(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<any>(null);

  // Garage Vehicles State (user's owned vehicles from 'garage_vehicles' table)
  const [garageVehicles, setGarageVehicles] = useState<any[]>([]);
  const [isLoadingGarageVehicles, setIsLoadingGarageVehicles] = useState(false);

  // Auth State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [currentUser, setCurrentUser] = useState<any>(null);

  const ensureSavedVehiclesCacheReady = useCallback(() => {
    if (!currentUser || !savedVehiclesCache) {
      return false;
    }

    try {
      const stats =
        typeof savedVehiclesCache.getStats === 'function'
          ? savedVehiclesCache.getStats()
          : null;

      if (!stats || stats.userId !== currentUser.id || !stats.isSubscribed) {
        savedVehiclesCache.subscribe(currentUser.id, supabase);
      }
    } catch (error) {
      return false;
    }

    return true;
  }, [currentUser]);

  // Offer Preview Modal State
  const [showOfferPreviewModal, setShowOfferPreviewModal] = useState(false);
  const [leadDataForSubmission, setLeadDataForSubmission] = useState<LeadData>({});

  // User Profile Dropdown State
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // User Profile Management
  const {
    profile,
    isLoading: isLoadingProfile,
    error: profileError,
    loadProfile,
    saveProfile,
    updateField: updateProfileField,
    isDirty: isProfileDirty,
  } = useProfile({
    supabase,
    userId: currentUser?.id || null,
    userEmail: currentUser?.email || null,
    autoLoad: true,
  });

  // Financing State
  const [lender, setLender] = useState('nfcu');
  const [loanTerm, setLoanTerm] = useState(72);
  const [creditScore, setCreditScore] = useState('excellent');
  const [vehicleCondition, setVehicleCondition] = useState<'new' | 'used'>('used');
  const [lenderRates, setLenderRates] = useState<LenderRate[]>([]);
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Slider State (all in dollars except term)
  const [salePrice, setSalePrice] = useState(30000);
  const [cashDown, setCashDown] = useState(5000);
  const [tradeAllowance, setTradeAllowance] = useState(0);
  const [tradePayoff, setTradePayoff] = useState(0);
  const [dealerFees, setDealerFees] = useState(0);
  const [customerAddons, setCustomerAddons] = useState(0);

  // Calculated values
  const [apr, setApr] = useState(5.99);
  const [monthlyPayment, setMonthlyPayment] = useState(0);
  const [amountFinanced, setAmountFinanced] = useState(0);
  const [financeCharge, setFinanceCharge] = useState(0);
  const [totalOfPayments, setTotalOfPayments] = useState(0);

  // Lender options from config/lenders.json
  const lenderOptions: SelectOption[] = [
    { value: 'nfcu', label: 'Navy Federal Credit Union' },
    { value: 'sccu', label: 'Space Coast Credit Union' },
    { value: 'penfed', label: 'Pentagon Federal Credit Union' },
    { value: 'dcu', label: 'Digital Federal Credit Union' },
    { value: 'launchcu', label: 'Launch Federal Credit Union' },
  ];

  // Vehicle condition options
  const vehicleConditionOptions: SelectOption[] = [
    { value: 'new', label: 'New Vehicle' },
    { value: 'used', label: 'Used Vehicle' },
  ];

  // Loan term options
  const termOptions: SelectOption[] = [
    { value: '36', label: '36 months (3 years)' },
    { value: '48', label: '48 months (4 years)' },
    { value: '60', label: '60 months (5 years)' },
    { value: '72', label: '72 months (6 years)' },
    { value: '84', label: '84 months (7 years)' },
  ];

  // Credit score options
  const creditScoreOptions: SelectOption[] = [
    { value: 'excellent', label: 'Excellent (750+)' },
    { value: 'good', label: 'Good (700-749)' },
    { value: 'fair', label: 'Fair (650-699)' },
    { value: 'poor', label: 'Building Credit (< 650)' },
  ];

  // Fetch lender rates when lender changes
  useEffect(() => {
    const loadRates = async () => {
      if (!lender) return;

      setIsLoadingRates(true);
      try {
        const response = await fetchLenderRates(lender);
        setLenderRates(response.rates);
      } catch (error: any) {
        console.error('[Calculator] Failed to load rates:', error);
        setLenderRates([]);
        toast.push({
          kind: 'warning',
          title: 'Rates Unavailable',
          detail: 'Using default APR. Rates may not be accurate.',
        });
      } finally {
        setIsLoadingRates(false);
      }
    };

    loadRates();
  }, [lender]);

  // Calculate APR based on credit score, term, and vehicle condition
  useEffect(() => {
    if (lenderRates.length === 0) {
      // No rates available - keep default APR
      return;
    }

    const creditScoreValue = creditScoreToValue(creditScore);
    const calculatedAPR = calculateAPR(lenderRates, creditScoreValue, loanTerm, vehicleCondition);

    if (calculatedAPR !== null) {
      setApr(calculatedAPR);
    }
  }, [lenderRates, creditScore, loanTerm, vehicleCondition]);

  // Calculate loan on any change
  useEffect(() => {
    calculateLoan();
  }, [salePrice, cashDown, tradeAllowance, tradePayoff, dealerFees, customerAddons, loanTerm, apr]);

  // Auto-populate location from profile when profile loads
  useEffect(() => {
    if (!profile || !mapsLoaded) return;

    // Build address string from profile
    const addressParts = [
      profile.street_address,
      profile.city,
      profile.state_code,
      profile.zip_code,
    ].filter(Boolean);

    if (addressParts.length === 0) return;

    const addressString = addressParts.join(', ');

    // Only auto-fill if location field is empty
    if (!location) {
      setLocation(addressString);

      // Geocode if Google Maps is available
      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: addressString }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const place = results[0];
            setLocationDetails({
              address: addressString,
              city: profile.city || '',
              state: profile.state_code || '',
              zip: profile.zip_code || '',
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            } as PlaceDetails);
          }
        });
      }
    }
  }, [profile, mapsLoaded, location]);

  // Auto-populate down payment from profile when vehicle is selected
  useEffect(() => {
    if (!profile || !selectedVehicle || !profile.preferred_down_payment) return;

    // Only auto-fill if cash down is at default (5000 is the default)
    if (cashDown === 5000) {
      setCashDown(profile.preferred_down_payment);
    }
  }, [profile, selectedVehicle, cashDown]);

  // Listen for auth state changes
  useEffect(() => {
    // Check initial auth state
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
      }
    };
    checkAuth();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setCurrentUser(session.user);
        // Reload saved vehicles after sign in
        await reloadSavedVehicles();
        toast.push({
          kind: 'success',
          title: 'Welcome back!',
          detail: 'You are now signed in',
        });
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setSavedVehicles([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Initialize savedVehiclesCache with supabase and userId
  useEffect(() => {
    if (currentUser && supabase) {
      // Subscribe to saved vehicles for this user
      savedVehiclesCache.subscribe(currentUser.id, supabase);
    }
  }, [currentUser]);

  // Load saved vehicles (marketplace) on mount and when user changes
  useEffect(() => {
    const loadSavedVehicles = async () => {
      if (!currentUser) {
        setSavedVehicles([]);
        return;
      }

      if (!ensureSavedVehiclesCacheReady()) {
        return;
      }

      setIsLoadingSavedVehicles(true);
      try {
        const vehicles = await savedVehiclesCache.getVehicles({ forceRefresh: true });
        setSavedVehicles(vehicles || []);
      } catch (error: any) {
        console.error('Failed to load saved vehicles:', error);
        if (!error.message?.includes('No Supabase client') && !error.message?.includes('user ID')) {
          toast.push({
            kind: 'error',
            title: 'Failed to Load Vehicles',
            detail: 'Could not load your saved vehicles',
          });
        }
      } finally {
        setIsLoadingSavedVehicles(false);
      }
    };
    loadSavedVehicles();
  }, [currentUser, ensureSavedVehiclesCacheReady]);

  // Load garage vehicles on mount and when user changes
  useEffect(() => {
    const loadGarageVehicles = async () => {
      if (!currentUser || !supabase) {
        setGarageVehicles([]);
        return;
      }

      setIsLoadingGarageVehicles(true);
      try {
        const { data, error } = await supabase
          .from('garage_vehicles')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setGarageVehicles(data || []);
      } catch (error: any) {
        console.error('Failed to load garage vehicles:', error);
        toast.push({
          kind: 'error',
          title: 'Failed to Load Garage',
          detail: 'Could not load your garage vehicles',
        });
      } finally {
        setIsLoadingGarageVehicles(false);
      }
    };
    loadGarageVehicles();
  }, [currentUser, supabase]);

  const calculateLoan = () => {
    // Calculate amount financed
    const totalPrice = salePrice + dealerFees + customerAddons;
    const downPayment = cashDown + (tradeAllowance - tradePayoff);
    const financed = totalPrice - downPayment;
    setAmountFinanced(financed);

    if (financed <= 0 || apr <= 0 || loanTerm <= 0) {
      setMonthlyPayment(0);
      setFinanceCharge(0);
      setTotalOfPayments(0);
      return;
    }

    // Monthly interest rate
    const monthlyRate = apr / 100 / 12;

    // Monthly payment formula: P * [r(1 + r)^n] / [(1 + r)^n - 1]
    const payment = financed * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) /
                    (Math.pow(1 + monthlyRate, loanTerm) - 1);

    setMonthlyPayment(payment);

    const total = payment * loanTerm;
    setTotalOfPayments(total);
    setFinanceCharge(total - financed);
  };

  const handleSubmit = () => {
    // Check if user is authenticated
    if (!currentUser) {
      toast.push({
        kind: 'warning',
        title: 'Sign In Required',
        detail: 'Please sign in to save and submit your offer',
      });
      setAuthMode('signin');
      setShowAuthModal(true);
      return;
    }

    // Build lead data from current calculator state
    const leadData: LeadData = {
      // Vehicle details
      vehicleYear: selectedVehicle?.year || undefined,
      vehicleMake: selectedVehicle?.make || undefined,
      vehicleModel: selectedVehicle?.model || undefined,
      vehicleTrim: selectedVehicle?.trim || undefined,
      vehicleVIN: selectedVehicle?.vin || vin || undefined,
      vehicleMileage: selectedVehicle?.mileage || undefined,
      vehicleCondition: vehicleCondition,
      vehiclePrice: salePrice || undefined,

      // Dealer details
      dealerName: selectedVehicle?.dealer_name || undefined,
      dealerPhone: selectedVehicle?.dealer_phone || undefined,
      dealerAddress: selectedVehicle?.dealer_address
        ? `${selectedVehicle.dealer_address}, ${selectedVehicle.dealer_city || ''}, ${selectedVehicle.dealer_state || ''} ${selectedVehicle.dealer_zip || ''}`.trim()
        : undefined,

      // Financing details
      apr: apr,
      termMonths: loanTerm,
      monthlyPayment: monthlyPayment,
      downPayment: cashDown,

      // Trade-in
      tradeValue: tradeAllowance || undefined,
      tradePayoff: tradePayoff || undefined,

      // Fees
      dealerFees: dealerFees || undefined,
      customerAddons: customerAddons || undefined,

      // Generate offer name
      offerName: selectedVehicle
        ? `${selectedVehicle.year || ''} ${selectedVehicle.make || ''} ${selectedVehicle.model || ''}`.trim()
        : 'Vehicle Offer',
    };

    setLeadDataForSubmission(leadData);
    setShowOfferPreviewModal(true);
  };

  const filterBySearch = (vehicle: any) => {
    if (!vin) return true;
    const searchTerm = vin.toLowerCase();
    const vehicleText = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.trim || ''} ${vehicle.vin || ''}`.toLowerCase();
    return vehicleText.includes(searchTerm);
  };

  const filteredSavedVehicles = savedVehicles.filter(filterBySearch);
  const filteredGarageVehicles = garageVehicles.filter(filterBySearch);
  const totalStoredVehicles = savedVehicles.length + garageVehicles.length;
  const filteredStoredCount = filteredSavedVehicles.length + filteredGarageVehicles.length;

  // Handle selecting a saved vehicle from dropdown
  const handleSelectSavedVehicle = (vehicle: any) => {
    setSelectedVehicle(vehicle);
    setVin(vehicle.vin || '');
    setShowVehicleDropdown(false);

    // Populate form with vehicle data
    if (vehicle.estimated_value) {
      setSalePrice(vehicle.estimated_value);
    }
    if (vehicle.payoff_amount) {
      setTradePayoff(vehicle.payoff_amount);
    }

    toast.push({
      kind: 'success',
      title: 'Vehicle Selected!',
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  const handleSelectGarageVehicle = (vehicle: any) => {
    setSelectedVehicle(vehicle);
    setVin(vehicle.vin || '');
    setShowVehicleDropdown(false);

    if (vehicle.estimated_value != null) {
      setTradeAllowance(Number(vehicle.estimated_value) || 0);
    }
    if (vehicle.payoff_amount != null) {
      setTradePayoff(Number(vehicle.payoff_amount) || 0);
    }

    toast.push({
      kind: 'success',
      title: 'Garage Vehicle Selected!',
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  // Handle edit vehicle from VIN dropdown
  const handleEditVehicle = (e: React.MouseEvent, vehicle: any) => {
    e.stopPropagation(); // Prevent vehicle selection
    setVehicleToEdit(vehicle);
    setShowManageVehiclesModal(true);
    setShowVehicleDropdown(false); // Close dropdown
  };

  // Handle vehicle save/update from modal
  const handleVehicleSave = async () => {
    try {
      await reloadSavedVehicles();
      toast.push({
        kind: 'success',
        title: 'Vehicle Saved!',
        detail: 'Your saved vehicles have been updated',
      });
    } catch (error) {
      console.error('Failed to reload vehicles:', error);
    }
    setShowManageVehiclesModal(false);
    setVehicleToEdit(null);
  };

  // Authentication handlers
  const handleSignIn = async (email: string, password: string) => {
    await authManager.signIn({ email, password });
    // Reload saved vehicles after sign in
    try {
      await reloadSavedVehicles();
    } catch (error) {
      // Silent fail - not critical
    }
  };

  const handleSignUp = async (email: string, password: string, fullName?: string, phone?: string) => {
    await authManager.signUp({ email, password, fullName, phone });
    // Reload saved vehicles after sign up
    try {
      await reloadSavedVehicles();
    } catch (error) {
      // Silent fail - not critical
    }
  };

  const handleSignOut = async () => {
    await authManager.signOut();
    setSavedVehicles([]);
    setCurrentUser(null);
  };

  // Reload saved vehicles helper
  const reloadSavedVehicles = async (options: { forceRefresh?: boolean } = {}) => {
    if (!ensureSavedVehiclesCacheReady()) {
      return [];
    }

    try {
      const vehicles = await savedVehiclesCache.getVehicles({ forceRefresh: options.forceRefresh || false });
      setSavedVehicles(vehicles || []);
      return vehicles;
    } catch (error) {
      console.error('Failed to reload saved vehicles:', error);
      throw error;
    }
  };

  // VIN Lookup Handler
  const handleVINLookup = async (vinValue: string) => {
    // Clean and validate VIN
    const cleanVIN = vinValue.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');

    if (!cleanVIN) {
      setSelectedVehicle(null);
      setVinError('');
      return;
    }

    // VIN must be 11-17 characters
    if (cleanVIN.length < 11) {
      setVinError('VIN must be at least 11 characters');
      setSelectedVehicle(null);
      return;
    }

    if (cleanVIN.length > 17) {
      setVinError('VIN cannot be more than 17 characters');
      setSelectedVehicle(null);
      return;
    }

    // Valid VIN - attempt lookup
    setIsLoadingVIN(true);
    setVinError('');

    try {
      const result = await marketCheckCache.getVehicleData(cleanVIN, {
        forceRefresh: false,
        zip: location || '32901', // Use entered location or default
        radius: 100,
        pick: 'all',
      }) as any;

      if (result && result.listing) {
        setSelectedVehicle(result.listing);

        // Pre-fill sale price from vehicle
        if (result.listing.price) {
          setSalePrice(result.listing.price);
        }

        toast.push({
          kind: 'success',
          title: 'Vehicle Found!',
          detail: `${result.listing.year} ${result.listing.make} ${result.listing.model}`,
        });
      } else {
        setVinError('No vehicle found for this VIN');
        setSelectedVehicle(null);
      }
    } catch (error: any) {
      console.error('VIN lookup error:', error);

      // Distinguish between API errors (quota, network) and "not found"
      const isQuotaError = error.message?.toLowerCase().includes('quota') ||
                          error.message?.toLowerCase().includes('rate limit') ||
                          error.message?.toLowerCase().includes('429');
      const isNetworkError = error.message?.toLowerCase().includes('network') ||
                            error.message?.toLowerCase().includes('fetch');
      const isServerError = error.message?.toLowerCase().includes('server error') ||
                           error.message?.toLowerCase().includes('500') ||
                           error.message?.toLowerCase().includes('503');

      // For API/network/quota errors, don't clear selectedVehicle
      // This prevents saved vehicles from appearing to "disappear"
      if (isQuotaError) {
        setVinError('API quota exceeded - try again later');
        toast.push({
          kind: 'warning',
          title: 'Lookup Temporarily Unavailable',
          detail: 'MarketCheck API quota exceeded. Saved vehicles are still available.',
        });
      } else if (isNetworkError || isServerError) {
        setVinError('Service temporarily unavailable');
        toast.push({
          kind: 'warning',
          title: 'Lookup Temporarily Unavailable',
          detail: 'Unable to connect to vehicle lookup service. Try again in a moment.',
        });
      } else {
        // Other errors (like "not found") should clear selectedVehicle
        setVinError(error.message || 'Failed to look up VIN');
        setSelectedVehicle(null);
        toast.push({
          kind: 'error',
          title: 'VIN Lookup Failed',
          detail: error.message || 'Could not find vehicle information',
        });
      }
    } finally {
      setIsLoadingVIN(false);
    }
  };

  // Manual VIN lookup - only called when user explicitly requests it
  const handleManualVINLookup = () => {
    if (vin) {
      handleVINLookup(vin);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dark Header */}
      <header className="bg-gray-900 shadow-lg sticky top-0 z-400">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Brandon's Calculator</h1>
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors text-white text-sm font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            {currentUser ? (profile?.full_name || currentUser.email?.split('@')[0] || 'Account') : 'Sign In'}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Main Grid - Left column (inputs) + Right column (summary) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT COLUMN: Inputs (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Location & Vehicle Section */}
            <Card variant="elevated" padding="lg" className="overflow-visible">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                Location & Vehicle
              </h2>

              <div className="space-y-4">
                <Input
                  ref={locationInputRef}
                  label="Your Location"
                  type="text"
                  placeholder="Enter your address or ZIP code..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  }
                  helperText={mapsError ? 'Google Maps not available - manual entry only' : mapsLoaded ? 'Start typing for suggestions' : 'Loading location services...'}
                  fullWidth
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    VIN or Search Saved Vehicles
                  </label>
                  <div className="relative overflow-hidden">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      {isLoadingVIN ? (
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      )}
                    </div>
                    <input
                      type="text"
                      value={vin}
                      onChange={(e) => setVin(e.target.value.toUpperCase())}
                      onFocus={() => setShowVehicleDropdown(true)}
                      placeholder="Paste VIN or select saved vehicle..."
                      className={`w-full rounded-lg border py-2 pl-[2.75rem] pr-[2.75rem] bg-white text-gray-900 font-plexmono tracking-[0.04em] [text-indent:0.05em] box-border placeholder-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                        vinError
                          ? 'border-red-500 focus:ring-red-500'
                          : selectedVehicle && !isLoadingVIN
                          ? 'border-green-500 focus:ring-green-500'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                      maxLength={17}
                      aria-invalid={vinError ? 'true' : 'false'}
                    />
                    {selectedVehicle && !isLoadingVIN && !vinError && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {vinError ? (
                    <p className="mt-1.5 text-sm text-red-600">{vinError}</p>
                  ) : (
                    <p className="mt-1.5 text-sm text-gray-500">
                      {isLoadingVIN
                        ? 'Looking up VIN...'
                        : totalStoredVehicles > 0
                        ? `Search ${totalStoredVehicles} stored vehicles (My Garage + Saved) or enter a VIN manually`
                        : 'Enter a VIN or sign in to add vehicles to your library'}
                    </p>
                  )}

                  {/* Stored Vehicles Dropdown */}
                  {showVehicleDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                      <div className="p-2 border-b bg-gray-50 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">
                          {isLoadingSavedVehicles || isLoadingGarageVehicles
                            ? 'Loading...'
                            : filteredStoredCount > 0
                            ? `${filteredStoredCount} vehicle${filteredStoredCount === 1 ? '' : 's'}`
                            : totalStoredVehicles === 0
                            ? 'No stored vehicles yet'
                            : 'No vehicles match your search'}
                        </span>
                        <button
                          onClick={() => setShowVehicleDropdown(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {isLoadingSavedVehicles || isLoadingGarageVehicles ? (
                        <div className="p-4 text-center text-gray-500 text-sm">Loading stored vehicles...</div>
                      ) : filteredStoredCount === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          {totalStoredVehicles === 0
                            ? 'Sign in to build your garage and saved vehicle library.'
                            : 'No vehicles match your search'}
                        </div>
                      ) : (
                        <div className="divide-y">
                          {filteredGarageVehicles.length > 0 && (
                            <div>
                              <div className="px-3 py-2 text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                                My Garage
                              </div>
                              {filteredGarageVehicles.map((vehicle) => (
                                <button
                                  key={vehicle.id}
                                  onClick={() => handleSelectGarageVehicle(vehicle)}
                                  className="w-full p-3 text-left hover:bg-blue-50 transition-colors focus:bg-blue-50 focus:outline-none"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-semibold text-gray-900">
                                        {vehicle.year} {vehicle.make} {vehicle.model}
                                        {vehicle.trim && ` ${vehicle.trim}`}
                                      </div>
                                      {vehicle.vin && (
                                        <div className="text-xs text-gray-500 font-mono mt-1">
                                          VIN: {vehicle.vin}
                                        </div>
                                      )}
                                      <div className="text-xs text-gray-500 mt-1">
                                        Trade Estimate: {formatCurrency(vehicle.estimated_value || 0)}
                                        {vehicle.payoff_amount ? ` • Payoff: ${formatCurrency(vehicle.payoff_amount)}` : ''}
                                      </div>
                                    </div>
                                    <div
                                      onClick={(e) => handleEditVehicle(e, vehicle)}
                                      className="ml-2 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                                      title="Edit vehicle"
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          handleEditVehicle(e, vehicle);
                                        }
                                      }}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {filteredSavedVehicles.length > 0 && (
                            <div>
                              <div className="px-3 py-2 text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                                Saved Vehicles
                              </div>
                              {filteredSavedVehicles.map((vehicle) => (
                                <button
                                  key={vehicle.id}
                                  onClick={() => handleSelectSavedVehicle(vehicle)}
                                  className="w-full p-3 text-left hover:bg-blue-50 transition-colors focus:bg-blue-50 focus:outline-none"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="font-semibold text-gray-900">
                                        {vehicle.year} {vehicle.make} {vehicle.model}
                                        {vehicle.trim && ` ${vehicle.trim}`}
                                      </div>
                                      {vehicle.vin && (
                                        <div className="text-xs text-gray-500 font-mono mt-1">
                                          VIN: {vehicle.vin}
                                        </div>
                                      )}
                                      {vehicle.asking_price || vehicle.estimated_value ? (
                                        <div className="text-sm font-semibold text-green-600 mt-1">
                                          {formatCurrency(vehicle.asking_price || vehicle.estimated_value)}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div
                                      onClick={(e) => handleEditVehicle(e, vehicle)}
                                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                                      title="Edit vehicle"
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          handleEditVehicle(e, vehicle);
                                        }
                                      }}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Lookup VIN Button - Only shown when VIN is entered but not selected */}
                {vin && !selectedVehicle && vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').length >= 11 && (
                  <div>
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      onClick={handleManualVINLookup}
                      disabled={isLoadingVIN}
                    >
                      {isLoadingVIN ? (
                        <>
                          <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Looking up VIN...
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mr-2">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          Lookup VIN with MarketCheck
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-gray-500 mt-1 text-center">
                      Optional: Find vehicle details and pricing
                    </p>
                  </div>
                )}

                {/* Vehicle Display Card */}
                {selectedVehicle && (
                  <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="info">SELECTED VEHICLE</Badge>
                      <button
                        onClick={() => {
                          setSelectedVehicle(null);
                          setVin('');
                        }}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                    <h3 className="text-2xl font-bold text-blue-600 mb-2">
                      {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                      {selectedVehicle.trim && ` - ${selectedVehicle.trim}`}
                    </h3>
                    {selectedVehicle.price && (
                      <div className="text-3xl font-bold text-green-600 mb-3">
                        ${selectedVehicle.price.toLocaleString()}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {selectedVehicle.vin && (
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-gray-600 text-xs">VIN</div>
                          <div className="font-mono font-semibold">{selectedVehicle.vin}</div>
                        </div>
                      )}
                      {selectedVehicle.miles && (
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-gray-600 text-xs">MILEAGE</div>
                          <div className="font-semibold">{selectedVehicle.miles.toLocaleString()} miles</div>
                        </div>
                      )}
                      {selectedVehicle.dealer_name && (
                        <div className="bg-gray-50 p-2 rounded col-span-2">
                          <div className="text-gray-600 text-xs">DEALER</div>
                          <div className="font-semibold">{selectedVehicle.dealer_name}</div>
                          {selectedVehicle.dealer_city && selectedVehicle.dealer_state && (
                            <div className="text-gray-600 text-xs mt-1">
                              {selectedVehicle.dealer_city}, {selectedVehicle.dealer_state}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Dealer Map */}
                {selectedVehicle && (selectedVehicle.dealer_name || selectedVehicle.dealer_city) && (
                  <div className="mt-4">
                    <DealerMap
                      dealerName={selectedVehicle.dealer_name}
                      dealerAddress={selectedVehicle.dealer_address}
                      dealerCity={selectedVehicle.dealer_city}
                      dealerState={selectedVehicle.dealer_state}
                      dealerZip={selectedVehicle.dealer_zip}
                      dealerLat={selectedVehicle.dealer_latitude}
                      dealerLng={selectedVehicle.dealer_longitude}
                      userLocation={locationDetails || undefined}
                      showRoute={!!locationDetails}
                    />
                  </div>
                )}
              </div>
            </Card>

            {/* Financing Details Section */}
            <Card variant="elevated" padding="lg">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                Financing Details
              </h2>

              <div className="space-y-4">
                <Select
                  label="Preferred Lender"
                  value={lender}
                  onChange={(e) => setLender(e.target.value)}
                  options={lenderOptions}
                  helperText={isLoadingRates ? 'Loading rates...' : lenderRates.length > 0 ? `${lenderRates.length} rates loaded` : 'No rates available'}
                  fullWidth
                />

                <Select
                  label="Vehicle Condition"
                  value={vehicleCondition}
                  onChange={(e) => setVehicleCondition(e.target.value as 'new' | 'used')}
                  options={vehicleConditionOptions}
                  helperText="New vehicles may qualify for lower rates"
                  fullWidth
                />

                <Select
                  label="Loan Term"
                  value={loanTerm.toString()}
                  onChange={(e) => setLoanTerm(Number(e.target.value))}
                  options={termOptions}
                  fullWidth
                />

                <Select
                  label="Credit Score Range"
                  value={creditScore}
                  onChange={(e) => setCreditScore(e.target.value)}
                  options={creditScoreOptions}
                  helperText="Higher scores typically get better rates"
                  fullWidth
                />
              </div>
            </Card>

          </div>

          {/* RIGHT COLUMN: Summary (1/3 width, sticky) */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <Card variant="elevated" padding="lg">
                {/* Monthly Payment Hero */}
                <div className="text-center mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                  <div className="text-sm font-medium text-gray-600 mb-2">
                    Estimated Monthly Payment
                  </div>
                  <div className="text-5xl font-bold text-gray-900 mb-2">
                    {formatCurrency(monthlyPayment)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {loanTerm} months • {apr.toFixed(2)}% APR
                  </div>
                </div>

                {/* Truth-in-Lending Disclosures */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                    Truth-in-Lending Disclosures
                  </h3>

                  {/* APR with +/- controls */}
                  <EnhancedControl
                    value={apr}
                    label="Annual Percentage Rate"
                    onChange={(newApr) => setApr(parseFloat(newApr.toFixed(2)))}
                    step={0.01}
                    min={0}
                    max={99.99}
                    formatValue={(val) => `${val.toFixed(2)}%`}
                  />
                  <div className="text-xs text-gray-500 text-center mt-1">
                    Cost of credit as yearly rate
                  </div>

                  {/* Term with +/- controls */}
                  <EnhancedControl
                    value={loanTerm}
                    label="Term (Months)"
                    onChange={(newTerm) => {
                      const terms = [36, 48, 60, 72, 84];
                      // Find closest term
                      const closest = terms.reduce((prev, curr) =>
                        Math.abs(curr - newTerm) < Math.abs(prev - newTerm) ? curr : prev
                      );
                      setLoanTerm(closest);
                    }}
                    step={12}
                    min={36}
                    max={84}
                    formatValue={(val) => val.toString()}
                  />
                  <div className="text-xs text-gray-500 text-center mt-1">
                    Length of loan agreement
                  </div>

                  {/* Other TIL values */}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Finance Charge</span>
                      <span className="text-lg font-semibold text-gray-900">
                        {formatCurrency(financeCharge)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-600">Amount Financed</span>
                      <span className="text-lg font-semibold text-gray-900">
                        {formatCurrency(amountFinanced)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="text-sm font-medium text-blue-900">Total of Payments</span>
                      <span className="text-lg font-bold text-blue-900">
                        {formatCurrency(totalOfPayments)}
                      </span>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={handleSubmit}
                  >
                    Preview Offer
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Sliders Section - Full Width Below */}
        <div className="mt-6">
          <Card variant="elevated" padding="lg">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Adjust Pricing & Terms
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <EnhancedSlider
                label="Sale Price"
                min={0}
                max={150000}
                step={500}
                value={salePrice}
                onChange={(e) => setSalePrice(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                monthlyPayment={monthlyPayment}
                showTooltip={true}
                showReset={true}
                onReset={() => setSalePrice(selectedVehicle?.price || 30000)}
                fullWidth
              />

              <EnhancedSlider
                label="Cash Down"
                min={0}
                max={50000}
                step={500}
                value={cashDown}
                onChange={(e) => setCashDown(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                monthlyPayment={monthlyPayment}
                showTooltip={true}
                showReset={true}
                onReset={() => setCashDown(5000)}
                fullWidth
              />

              <EnhancedSlider
                label="Trade-In Allowance"
                min={0}
                max={75000}
                step={500}
                value={tradeAllowance}
                onChange={(e) => setTradeAllowance(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Value of your trade-in vehicle"
                monthlyPayment={monthlyPayment}
                showTooltip={true}
                showReset={true}
                onReset={() => setTradeAllowance(0)}
                fullWidth
              />

              <EnhancedSlider
                label="Trade-In Payoff"
                min={0}
                max={75000}
                step={500}
                value={tradePayoff}
                onChange={(e) => setTradePayoff(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Amount owed on trade-in"
                monthlyPayment={monthlyPayment}
                showTooltip={true}
                showReset={true}
                onReset={() => setTradePayoff(0)}
                fullWidth
              />

              <EnhancedSlider
                label="Total Dealer Fees"
                min={0}
                max={5000}
                step={50}
                value={dealerFees}
                onChange={(e) => setDealerFees(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Doc fees, title, registration"
                monthlyPayment={monthlyPayment}
                showTooltip={true}
                showReset={true}
                onReset={() => setDealerFees(0)}
                fullWidth
              />

              <EnhancedSlider
                label="Total Customer Add-ons"
                min={0}
                max={10000}
                step={100}
                value={customerAddons}
                onChange={(e) => setCustomerAddons(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Warranties, protection packages"
                monthlyPayment={monthlyPayment}
                showTooltip={true}
                showReset={true}
                onReset={() => setCustomerAddons(0)}
                fullWidth
              />
            </div>
          </Card>
        </div>

      </div>

      {/* Vehicle Editor Modal */}
      {showManageVehiclesModal && (
        <VehicleEditorModal
          isOpen={showManageVehiclesModal}
          onClose={() => {
            setShowManageVehiclesModal(false);
            setVehicleToEdit(null);
          }}
          onSave={handleVehicleSave}
          vehicle={vehicleToEdit}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onForgotPassword={async (email) => {
          toast.push({
            kind: 'info',
            title: 'Password Reset',
            detail: `Reset link sent to ${email}`,
          });
        }}
      />

      {/* Offer Preview Modal */}
      <OfferPreviewModal
        isOpen={showOfferPreviewModal}
        onClose={() => setShowOfferPreviewModal(false)}
        leadData={leadDataForSubmission}
        onSuccess={(offerId) => {
          toast.push({
            kind: 'success',
            title: 'Offer Saved!',
            detail: 'Your offer has been submitted and saved to your account',
          });
          setShowOfferPreviewModal(false);
        }}
      />

      {/* User Profile Dropdown */}
      <UserProfileDropdown
        isOpen={showProfileDropdown}
        onClose={() => setShowProfileDropdown(false)}
        profile={profile}
        onSaveProfile={saveProfile}
        onUpdateField={updateProfileField}
        garageVehicles={garageVehicles}
        savedVehicles={savedVehicles}
        onSelectVehicle={handleSelectSavedVehicle}
        onEditGarageVehicle={(vehicle) => {
          setVehicleToEdit(vehicle);
          setShowManageVehiclesModal(true);
        }}
        onEditSavedVehicle={(vehicle) => {
          setVehicleToEdit(vehicle);
          setShowManageVehiclesModal(true);
        }}
        onDeleteGarageVehicle={async (vehicle) => {
          if (!confirm(`Delete ${vehicle.year} ${vehicle.make} ${vehicle.model}?`)) return;
          try {
            const { data, error } = await supabase
              .from('garage_vehicles')
              .delete()
              .eq('id', vehicle.id)
              .select('photo_storage_path')
              .single();
            if (error) throw error;
            if (data?.photo_storage_path) {
              await supabase.storage.from('garage-vehicle-photos').remove([data.photo_storage_path]);
            }
            setGarageVehicles(garageVehicles.filter(v => v.id !== vehicle.id));
            toast.push({ kind: 'success', title: 'Vehicle Deleted' });
          } catch (error) {
            toast.push({ kind: 'error', title: 'Failed to Delete Vehicle' });
          }
        }}
        onRemoveSavedVehicle={async (vehicle) => {
          if (!confirm(`Remove ${vehicle.year} ${vehicle.make} ${vehicle.model}?`)) return;
          try {
            await savedVehiclesCache.deleteVehicle(vehicle.id);
            toast.push({ kind: 'success', title: 'Vehicle Removed' });
          } catch (error) {
            toast.push({ kind: 'error', title: 'Failed to Remove Vehicle' });
          }
        }}
        onSignOut={currentUser ? handleSignOut : undefined}
        onSignIn={!currentUser ? () => {
          setAuthMode('signin');
          setShowAuthModal(true);
        } : undefined}
        supabase={supabase}
        isDirty={isProfileDirty}
      />
    </div>
  );
};

export default CalculatorApp;
