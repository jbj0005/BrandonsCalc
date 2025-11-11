import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Select, Slider, Button, Card, Badge, VehicleEditorModal, AuthModal, EnhancedSlider, EnhancedControl, UserProfileDropdown, AprConfirmationModal, ItemizationCard, SubmissionProgressModal, MyOffersModal, PositiveEquityModal } from './ui/components';
import { useToast } from './ui/components/Toast';
import type { SelectOption } from './ui/components/Select';
import { useGoogleMapsAutocomplete, type PlaceDetails } from './hooks/useGoogleMapsAutocomplete';
import { useProfile } from './hooks/useProfile';
import { useTilBaselines, type TilDiff } from './hooks/useTilBaselines';
import { fetchLenderRates, calculateAPR, creditScoreToValue, type LenderRate } from './services/lenderRates';
import { DealerMap } from './components/DealerMap';
import { OfferPreviewModal } from './components/OfferPreviewModal';
import type { LeadData, SubmissionProgress } from './services/leadSubmission';
import { submitOfferWithProgress } from './services/leadSubmission';
import { lookupTaxRates } from './services/taxRatesService';
import type { EquityDecision } from './types';

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

type SliderBaselineKey =
  | 'salePrice'
  | 'cashDown'
  | 'tradeAllowance'
  | 'tradePayoff'
  | 'dealerFees'
  | 'customerAddons';

const DEFAULT_SALE_PRICE = 0;
const DEFAULT_CASH_DOWN = 0;

const DEFAULT_SLIDER_BASELINES: Record<SliderBaselineKey, number> = {
  salePrice: DEFAULT_SALE_PRICE,
  cashDown: DEFAULT_CASH_DOWN,
  tradeAllowance: 0,
  tradePayoff: 0,
  dealerFees: 0,
  customerAddons: 0,
};

declare global {
  interface Window {
    sliderOriginalValues?: Partial<Record<SliderBaselineKey, number>>;
  }
}

/**
 * CalculatorApp - Main auto loan calculator application
 *
 * This is a full React rewrite of the vanilla JS calculator,
 * using the component library we built.
 */
export const CalculatorApp: React.FC = () => {
  const toast = useToast();
  const { baselines, diffs, updateBaselines, resetBaselines, calculateDiffs } = useTilBaselines();

  // Refs
  const locationInputRef = useRef<HTMLInputElement>(null);
  const dropdownHoverTimeout = useRef<NodeJS.Timeout | null>(null);

  // Location & Vehicle State
  const [location, setLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState<PlaceDetails | null>(null);
  const [vin, setVin] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [isLoadingVIN, setIsLoadingVIN] = useState(false);
  const [vinError, setVinError] = useState('');

  // Google Maps Autocomplete
  const { isLoaded: mapsLoaded, error: mapsError } = useGoogleMapsAutocomplete(locationInputRef as React.RefObject<HTMLInputElement>, {
    onPlaceSelected: async (place: PlaceDetails) => {
      setLocation(place.address);
      setLocationDetails(place);

      // Lookup tax rates based on location (cached for 90 days)
      if (place.stateCode && place.county && place.state) {
        console.log(`[CalculatorApp] Looking up tax rates for ${place.stateCode}/${place.county}`);

        try {
          const taxData = await lookupTaxRates(place.stateCode, place.county, place.state);

          if (taxData) {
            // Only update if tax rate wasn't manually set by user
            if (!isTaxRateManuallySet) {
              setStateTaxRate(taxData.stateTaxRate);
              setCountyTaxRate(taxData.countyTaxRate);
              setStateName(taxData.stateName);
              setCountyName(taxData.countyName);

              toast.push({
                kind: 'success',
                title: 'Tax Rates Updated',
                detail: `Applied rates for ${taxData.stateName}, ${taxData.countyName}`,
              });
            }
          } else {
            // No tax data found
            console.warn(`[CalculatorApp] No tax rates found for ${place.stateCode}/${place.county}`);

            toast.push({
              kind: 'warning',
              title: 'Tax Rates Not Found',
              detail: `No tax data available for ${place.state}, ${place.countyName}. Using current rates. You can adjust manually below.`,
            });

            // Still update the location names for display (use full names)
            setStateName(place.state);
            setCountyName(place.countyName);
          }
        } catch (error) {
          console.error('[CalculatorApp] Error looking up tax rates:', error);

          toast.push({
            kind: 'error',
            title: 'Tax Lookup Error',
            detail: 'Failed to retrieve tax rates. Using current rates.',
          });
        }
      }
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

  const openVehicleDropdown = useCallback(() => {
    if (dropdownHoverTimeout.current) {
      clearTimeout(dropdownHoverTimeout.current);
      dropdownHoverTimeout.current = null;
    }
    setShowVehicleDropdown(true);
  }, []);

  const scheduleCloseVehicleDropdown = useCallback(() => {
    if (dropdownHoverTimeout.current) {
      clearTimeout(dropdownHoverTimeout.current);
    }
    dropdownHoverTimeout.current = setTimeout(() => {
      setShowVehicleDropdown(false);
      dropdownHoverTimeout.current = null;
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (dropdownHoverTimeout.current) {
        clearTimeout(dropdownHoverTimeout.current);
      }
    };
  }, []);

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

  // Positive Equity Modal State
  const [showPositiveEquityModal, setShowPositiveEquityModal] = useState(false);
  const [equityDecision, setEquityDecision] = useState<EquityDecision>({
    action: 'apply',
    appliedAmount: 0,
    cashoutAmount: 0,
  });

  // Submission Progress Modal State
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressStage, setProgressStage] = useState<SubmissionProgress['stage']>('validating');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressError, setProgressError] = useState<string | undefined>(undefined);
  const [submittedOfferId, setSubmittedOfferId] = useState<string | undefined>(undefined);

  // My Offers Modal State
  const [showMyOffersModal, setShowMyOffersModal] = useState(false);
  const [highlightOfferId, setHighlightOfferId] = useState<string | undefined>(undefined);

  // APR Confirmation Modal State
  const [showAprConfirmModal, setShowAprConfirmModal] = useState(false);

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
  const [vehicleCondition, setVehicleCondition] = useState<'new' | 'used'>('new');
  const [lenderRates, setLenderRates] = useState<LenderRate[]>([]);
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Slider State (all in dollars except term)
  const [salePrice, setSalePrice] = useState(DEFAULT_SALE_PRICE);
  const [cashDown, setCashDown] = useState(DEFAULT_CASH_DOWN);
  const [tradeAllowance, setTradeAllowance] = useState(0);
  const [tradePayoff, setTradePayoff] = useState(0);
  const [dealerFees, setDealerFees] = useState(0);
  const [customerAddons, setCustomerAddons] = useState(0);
  const [sliderBaselines, setSliderBaselines] = useState<Record<SliderBaselineKey, number>>(DEFAULT_SLIDER_BASELINES);
  const updateSliderBaseline = useCallback((key: SliderBaselineKey, value: number) => {
    setSliderBaselines((prev) => {
      const previousValue = prev[key];
      if (Math.abs(previousValue - value) < 0.0001) {
        return prev;
      }
      const next = { ...prev, [key]: value };
      return next;
    });
    if (typeof window !== 'undefined') {
      window.sliderOriginalValues = {
        ...(window.sliderOriginalValues || {}),
        [key]: value,
      };
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sliderOriginalValues = { ...sliderBaselines };
    }
  }, [sliderBaselines]);

  // Calculated values
  const [apr, setApr] = useState(5.99);
  const [lenderBaselineApr, setLenderBaselineApr] = useState<number | null>(null);
  const [monthlyPayment, setMonthlyPayment] = useState(0);
  const [amountFinanced, setAmountFinanced] = useState(0);
  const [financeCharge, setFinanceCharge] = useState(0);
  const [totalOfPayments, setTotalOfPayments] = useState(0);
  const baselineMonthlyPayment =
    baselines.totalPayments != null &&
    baselines.term != null &&
    baselines.term > 0
      ? baselines.totalPayments / baselines.term
      : undefined;

  // Tax State (FL defaults)
  const [stateTaxRate, setStateTaxRate] = useState(6.0); // 6% FL state tax
  const [countyTaxRate, setCountyTaxRate] = useState(1.0); // 1% FL surtax
  const [stateTaxAmount, setStateTaxAmount] = useState(0);
  const [countyTaxAmount, setCountyTaxAmount] = useState(0);
  const [totalTaxes, setTotalTaxes] = useState(0);
  const [stateName, setStateName] = useState<string>('Florida');
  const [countyName, setCountyName] = useState<string>('');
  const [isTaxRateManuallySet, setIsTaxRateManuallySet] = useState(false);

  // Additional calculated values
  const [unpaidBalance, setUnpaidBalance] = useState(0);
  const [cashDue, setCashDue] = useState(0);

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

  const FEATURE_FLAGS = {
    autoPopulateSalePrice: true,
    useTradeValueForGarageSalePrice: true,
    defaultVehicleCondition: 'new' as 'new' | 'used',
    rebaseTilOnVehicleSelection: true,
  };

  const parseNumericValue = (value: any): number | null => {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const rebaseTilBaselines = () => {
    resetBaselines();
  };

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
      // Store lender's recommended APR as baseline for comparison
      setLenderBaselineApr(calculatedAPR);
    }
  }, [lenderRates, creditScore, loanTerm, vehicleCondition]);

  // Calculate loan on any change (including equity decision)
  useEffect(() => {
    calculateLoan();
  }, [salePrice, cashDown, tradeAllowance, tradePayoff, dealerFees, customerAddons, loanTerm, apr, selectedVehicle, stateTaxRate, countyTaxRate, equityDecision]);

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
            const inferredPlace: PlaceDetails = {
              address: addressString,
              city: profile.city || '',
              state: profile.state || profile.state_code || '',
              stateCode: profile.state_code || '',
              zipCode: profile.zip_code || '',
              country: 'United States',
              county: profile.county || '',
              countyName: profile.county_name || '',
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            };
            setLocationDetails(inferredPlace);

            // Load tax rates from profile location
            if (profile.state_code && profile.county && profile.state) {
              lookupTaxRates(profile.state_code, profile.county, profile.state)
                .then((taxData) => {
                  if (taxData && !isTaxRateManuallySet) {
                    setStateTaxRate(taxData.stateTaxRate);
                    setCountyTaxRate(taxData.countyTaxRate);
                    setStateName(taxData.stateName);
                    setCountyName(taxData.countyName);
                    toast.push({
                      kind: 'success',
                      title: 'Tax Rates Loaded',
                      detail: `Applied rates for ${taxData.stateName}, ${taxData.countyName}`
                    });
                  } else if (!taxData && !isTaxRateManuallySet) {
                    toast.push({
                      kind: 'warning',
                      title: 'Tax Rates Not Found',
                      detail: `No rates found for ${profile.state}, ${profile.county}. Using defaults.`
                    });
                  }
                })
                .catch((err) => {
                  console.error('[CalculatorApp] Tax lookup error from profile:', err);
                });
            }
          }
        });
      }
    }
  }, [profile, mapsLoaded, location, isTaxRateManuallySet]);

  // Auto-populate down payment from profile when vehicle is selected
  useEffect(() => {
    if (!profile || !selectedVehicle || profile.preferred_down_payment == null) return;
    const preferredDown = parseNumericValue(profile.preferred_down_payment);
    if (preferredDown == null) return;

    if (Math.abs(cashDown - DEFAULT_CASH_DOWN) < 1) {
      setCashDown(preferredDown);
      updateSliderBaseline('cashDown', preferredDown);
    }
  }, [profile, selectedVehicle, cashDown, updateSliderBaseline]);

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
    // Calculate net trade equity
    const netTradeEquity = tradeAllowance - tradePayoff;
    const positiveEquity = Math.max(0, netTradeEquity);
    const negativeEquity = Math.abs(Math.min(0, netTradeEquity));

    // Determine how much equity is applied to balance vs cashed out
    let appliedToBalance = 0;
    let cashoutAmount = 0;

    if (positiveEquity > 0) {
      // Use equity decision if positive equity exists
      appliedToBalance = equityDecision.appliedAmount;
      cashoutAmount = equityDecision.cashoutAmount;
    } else {
      // Negative equity: all goes to unpaid balance (increases loan)
      appliedToBalance = -negativeEquity;
      cashoutAmount = 0;
    }

    // Calculate unpaid balance (before fees/taxes)
    const unpaid = salePrice - cashDown - appliedToBalance;
    setUnpaidBalance(unpaid);

    // Calculate taxes (based on sale price minus applied trade-in equity)
    const taxableBase = (salePrice - appliedToBalance) + dealerFees + customerAddons;
    const stateTax = taxableBase * (stateTaxRate / 100);
    const countyTax = Math.min(taxableBase, 5000) * (countyTaxRate / 100); // FL caps county tax at $5k
    const totalTax = stateTax + countyTax;

    setStateTaxAmount(stateTax);
    setCountyTaxAmount(countyTax);
    setTotalTaxes(totalTax);

    // Calculate amount financed (includes fees, taxes, and cashout)
    const totalPrice = salePrice + dealerFees + customerAddons + totalTax;
    const downPayment = cashDown + appliedToBalance;
    const financed = totalPrice - downPayment + cashoutAmount; // Add cashout to loan
    setAmountFinanced(financed);

    // Calculate cash due at signing (for now, just cash down - will expand later)
    setCashDue(cashDown);

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

    // Update TIL baselines and calculate diffs
    const tilValues = {
      apr: apr / 100, // Convert to decimal for hook
      term: loanTerm,
      financeCharge: total - financed,
      amountFinanced: financed,
      totalPayments: total,
      monthlyFinanceCharge: loanTerm > 0 ? (total - financed) / loanTerm : 0,
    };
    updateBaselines(tilValues);
    calculateDiffs(tilValues);
  };

  // Helper to prepare lead data from calculator state
  const prepareLeadData = (): LeadData => {
    return {
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

    const leadData = prepareLeadData();
    setLeadDataForSubmission(leadData);

    // Calculate positive equity
    const netTradeEquity = tradeAllowance - tradePayoff;
    const positiveEquity = Math.max(0, netTradeEquity);

    // Check if positive equity exists and user hasn't made a decision yet
    // (i.e., equity decision has default values)
    const hasPositiveEquity = positiveEquity > 0;
    const hasDecision = equityDecision.appliedAmount > 0 || equityDecision.cashoutAmount > 0;

    if (hasPositiveEquity && !hasDecision) {
      // Show positive equity modal first
      setShowPositiveEquityModal(true);
      return;
    }

    // Check for APR override before showing offer preview
    if (lenderBaselineApr !== null && Math.abs(apr - lenderBaselineApr) >= 0.01) {
      // User has overridden the APR - show confirmation modal
      setShowAprConfirmModal(true);
    } else {
      // No override or no baseline - proceed directly to offer preview
      setShowOfferPreviewModal(true);
    }
  };

  // Positive Equity Modal handler
  const handleEquityDecision = (decision: EquityDecision) => {
    // Update equity decision
    setEquityDecision(decision);

    // Close positive equity modal
    setShowPositiveEquityModal(false);

    // Continue with the offer preview flow
    // Check for APR override before showing offer preview
    if (lenderBaselineApr !== null && Math.abs(apr - lenderBaselineApr) >= 0.01) {
      // User has overridden the APR - show confirmation modal
      setShowAprConfirmModal(true);
    } else {
      // No override or no baseline - proceed directly to offer preview
      setShowOfferPreviewModal(true);
    }
  };

  // APR Confirmation Modal handlers
  const handleResetToLenderApr = () => {
    if (lenderBaselineApr !== null) {
      setApr(lenderBaselineApr);
      toast.push({
        kind: 'info',
        title: 'APR Reset',
        detail: `Reset to lender rate: ${lenderBaselineApr.toFixed(2)}%`,
      });
    }
    setShowAprConfirmModal(false);
    setShowOfferPreviewModal(true);
  };

  const handleKeepCustomApr = () => {
    setShowAprConfirmModal(false);
    setShowOfferPreviewModal(true);
  };

  // Handle offer submission with progress tracking
  const handleOfferSubmitWithProgress = async (leadData: LeadData, devMode: boolean = false) => {
    // Close preview modal, open progress modal
    setShowOfferPreviewModal(false);
    setShowProgressModal(true);
    setProgressError(undefined);
    setSubmittedOfferId(undefined);

    // Add devMode flag to leadData
    const submissionData = { ...leadData, devMode };

    // Submit with progress callbacks
    const result = await submitOfferWithProgress(submissionData, (update: SubmissionProgress) => {
      setProgressStage(update.stage);
      setProgressPercent(update.progress);
      if (update.error) {
        setProgressError(update.error);
      }
      if (update.offerId) {
        setSubmittedOfferId(update.offerId);
      }
    });

    if (result.ok && result.offerId) {
      // Success - keep progress modal open to show complete state
      setSubmittedOfferId(result.offerId);
      setHighlightOfferId(result.offerId);
    } else {
      // Error - show error in progress modal
      setProgressError(result.error || 'Failed to submit offer');
    }
  };

  // Handle "View My Offers" button from success modal
  const handleViewMyOffers = () => {
    setShowProgressModal(false);
    setShowMyOffersModal(true);
  };

  const filteredSavedVehicles = savedVehicles;
  const filteredGarageVehicles = garageVehicles;
  const totalStoredVehicles = savedVehicles.length + garageVehicles.length;
  const filteredStoredCount = totalStoredVehicles;

  const isGarageSelectedVehicle =
    selectedVehicle?.__source === 'garage';

  const getVehicleSalePrice = (vehicle: any): number | null => {
    if (!vehicle) return null;
    if (vehicle.__source === 'garage') {
      return parseNumericValue(vehicle.estimated_value) ?? null;
    }
    return (
      parseNumericValue(vehicle.price) ??
      parseNumericValue(vehicle.asking_price) ??
      parseNumericValue(vehicle.list_price) ??
      parseNumericValue(vehicle.sale_price) ??
      parseNumericValue(vehicle.msrp) ??
      parseNumericValue(vehicle.estimated_value) ??
      null
    );
  };

  const selectedVehicleSaleValue = selectedVehicle ? getVehicleSalePrice(selectedVehicle) : null;

  const baselineSalePrice = sliderBaselines.salePrice;

  const selectedVehicleSaleLabel =
    isGarageSelectedVehicle
      ? 'Trade Value'
      : 'Sale Price';

  const saleValueColor = isGarageSelectedVehicle
    ? 'text-blue-600'
    : 'text-green-600';

  const selectedVehicleMileage =
    selectedVehicle?.mileage ?? selectedVehicle?.miles ?? null;

  const selectedVehiclePayoff = isGarageSelectedVehicle
    ? parseNumericValue(selectedVehicle?.payoff_amount)
    : null;

  const formatCurrencyWithCents = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const renderTilStatCard = ({
    label,
    value,
    helper,
    diff,
    highlight = false,
  }: {
    label: string;
    value: string;
    helper: string;
    diff?: TilDiff | null;
    highlight?: boolean;
  }) => (
    <div
      className={`rounded-2xl border p-5 text-center shadow-[0_10px_25px_rgba(15,23,42,0.05)] transition-all duration-200 ${
        highlight ? 'bg-blue-50 border-blue-100' : 'bg-white border-blue-50'
      } hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200 focus:shadow-[0_0_24px_rgba(59,130,246,0.4)] focus:border-blue-300 focus:outline-none cursor-default`}
      tabIndex={0}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-blue-600 tracking-tight">{value}</div>
      {diff && diff.isSignificant && (
        <div className={`text-xs font-semibold mt-1 ${diff.isPositive ? 'text-green-600' : 'text-red-500'}`}>
          {diff.isPositive ? '↓' : '↑'} {diff.formatted}
        </div>
      )}
      <div className="mt-2 text-xs text-slate-500">{helper}</div>
    </div>
  );

  // Handle selecting a saved vehicle from dropdown
  const handleSelectSavedVehicle = (vehicle: any) => {
    setSelectedVehicle({ ...vehicle, __source: 'saved' });
    setVin(vehicle.vin || '');
    setShowVehicleDropdown(false);
    setVehicleCondition(FEATURE_FLAGS.defaultVehicleCondition);
    rebaseTilBaselines();

    const saleValue = getVehicleSalePrice(vehicle);
    if (saleValue != null) {
      setSalePrice(saleValue);
      updateSliderBaseline('salePrice', saleValue);
    }

    const payoffValue = parseNumericValue(vehicle.payoff_amount) ?? null;
    if (payoffValue !== null) {
      setTradePayoff(payoffValue);
      updateSliderBaseline('tradePayoff', payoffValue);
    }

    // Note: calculateLoan() will be called automatically by useEffect when salePrice updates

    toast.push({
      kind: 'success',
      title: 'Vehicle Selected!',
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  const handleSelectGarageVehicle = (vehicle: any) => {
    setSelectedVehicle({ ...vehicle, __source: 'garage' });
    setVin(vehicle.vin || '');
    setShowVehicleDropdown(false);
    setVehicleCondition(FEATURE_FLAGS.defaultVehicleCondition);
    rebaseTilBaselines();

    const tradeValue = parseNumericValue(vehicle.estimated_value) ?? 0;
    const payoffValue = parseNumericValue(vehicle.payoff_amount) ?? 0;

    if (FEATURE_FLAGS.autoPopulateSalePrice && FEATURE_FLAGS.useTradeValueForGarageSalePrice) {
      setSalePrice(tradeValue);
      updateSliderBaseline('salePrice', tradeValue);
    }

    setTradeAllowance(tradeValue);
    updateSliderBaseline('tradeAllowance', tradeValue);

    setTradePayoff(payoffValue);
    updateSliderBaseline('tradePayoff', payoffValue);

    // Note: calculateLoan() will be called automatically by useEffect when state updates

    toast.push({
      kind: 'success',
      title: 'Garage Vehicle Selected!',
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  const handleApplyGarageVehicleAsTrade = (vehicle: any) => {
    const tradeValue = parseNumericValue(vehicle.estimated_value) ?? 0;
    const payoffValue = parseNumericValue(vehicle.payoff_amount) ?? 0;

    setTradeAllowance(tradeValue);
    setTradePayoff(payoffValue);
    updateSliderBaseline('tradeAllowance', tradeValue);
    updateSliderBaseline('tradePayoff', payoffValue);
    setShowVehicleDropdown(false);

    setTimeout(() => calculateLoan(), 0);

    toast.push({
      kind: 'success',
      title: 'Trade Values Applied',
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  // Handle edit vehicle from VIN dropdown
  const handleEditVehicle = (e: React.MouseEvent | React.KeyboardEvent, vehicle: any) => {
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
      setSalePrice(0);
      updateSliderBaseline('salePrice', 0);
      setVinError('');
      return;
    }

    // VIN must be 11-17 characters
    if (cleanVIN.length < 11) {
      setVinError('VIN must be at least 11 characters');
      setSelectedVehicle(null);
      setSalePrice(0);
      updateSliderBaseline('salePrice', 0);
      return;
    }

    if (cleanVIN.length > 17) {
      setVinError('VIN cannot be more than 17 characters');
      setSelectedVehicle(null);
      setSalePrice(0);
      updateSliderBaseline('salePrice', 0);
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
        setSelectedVehicle({ ...result.listing, __source: 'market' });
        rebaseTilBaselines();

        const saleValue = getVehicleSalePrice(result.listing);
        if (saleValue != null) {
          setSalePrice(saleValue);
          updateSliderBaseline('salePrice', saleValue);
        }
        setVehicleCondition(FEATURE_FLAGS.defaultVehicleCondition);

        toast.push({
          kind: 'success',
          title: 'Vehicle Found!',
          detail: `${result.listing.year} ${result.listing.make} ${result.listing.model}`,
        });
      } else {
        setVinError('No vehicle found for this VIN');
        setSelectedVehicle(null);
        setSalePrice(0);
        updateSliderBaseline('salePrice', 0);
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
        setSalePrice(0);
        updateSliderBaseline('salePrice', 0);
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

      <div className="max-w-7xl mx-auto px-4 py-4">

        {/* Main Grid - Left column (inputs) + Right column (summary) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* LEFT COLUMN: Inputs (2/3 width) */}
          <div className="lg:col-span-2 space-y-4">

            {/* Location & Vehicle Section */}
            <Card variant="elevated" padding="md" className="overflow-visible transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
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

                <div
                  className="relative"
                  onMouseEnter={openVehicleDropdown}
                  onMouseLeave={scheduleCloseVehicleDropdown}
                >
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
                      onFocus={openVehicleDropdown}
                      placeholder="Paste VIN or select saved vehicle..."
                      className={`w-full rounded-lg border py-2 pr-2 pl-12 bg-white text-gray-900 font-plexmono tracking-[0.04em] [text-indent:0.05em] box-border placeholder-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
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
                    <div
                      className="absolute z-50 w-full top-full mt-0.5 bg-white border border-gray-300 rounded-lg shadow-lg max-h-72 overflow-y-auto"
                      onMouseEnter={openVehicleDropdown}
                      onMouseLeave={scheduleCloseVehicleDropdown}
                    >
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
                              <div className="px-3 py-2 text-xs uppercase tracking-wide text-blue-900 bg-blue-50 font-semibold">
                                My Garage
                              </div>
                              {filteredGarageVehicles.map((vehicle) => (
                                <div
                                  key={vehicle.id}
                                  className="p-3 hover:bg-blue-50 focus-within:ring-2 focus-within:ring-blue-200 focus-within:ring-offset-2 focus-within:ring-offset-white rounded-lg transition-colors cursor-pointer"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => handleSelectGarageVehicle(vehicle)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleSelectGarageVehicle(vehicle);
                                    }
                                  }}
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
                                      <div className="text-xs text-gray-500 mt-1">
                                        Trade Estimate: {formatCurrency(vehicle.estimated_value || 0)}
                                        {vehicle.payoff_amount ? ` • Payoff: ${formatCurrency(vehicle.payoff_amount)}` : ''}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleApplyGarageVehicleAsTrade(vehicle);
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                                        title="Use as trade-in"
                                      >
                                        Trade-In
                                      </button>
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
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {filteredSavedVehicles.length > 0 && (
                            <div>
                              <div className="px-3 py-2 text-xs uppercase tracking-wide text-blue-900 bg-blue-50 font-semibold">
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
                          setSalePrice(0);
                          updateSliderBaseline('salePrice', 0);
                          rebaseTilBaselines();
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
                    <div className="mb-3">
                      <div className="text-xs font-semibold uppercase text-gray-500 tracking-wide">
                        {selectedVehicleSaleLabel || 'Sale Price'}
                      </div>
                      <div className={`text-3xl font-bold ${saleValueColor}`}>
                        {formatCurrency(selectedVehicleSaleValue ?? baselineSalePrice ?? 0)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {selectedVehicle.vin && (
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-gray-600 text-xs">VIN</div>
                          <div className="font-mono font-semibold">{selectedVehicle.vin}</div>
                        </div>
                      )}
                      {selectedVehicleMileage != null && (
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-gray-600 text-xs">MILEAGE</div>
                          <div className="font-semibold">
                            {Number(selectedVehicleMileage).toLocaleString()} miles
                          </div>
                        </div>
                      )}
                      {isGarageSelectedVehicle && (
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-gray-600 text-xs">Payoff Amount</div>
                          <div className="font-semibold">
                            {selectedVehiclePayoff != null
                              ? formatCurrency(selectedVehiclePayoff)
                              : '—'}
                          </div>
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
            <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
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
              <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
                {/* Monthly Payment Hero */}
                <div className="text-center mb-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
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
                <div className="space-y-3">
                  <div className="rounded-[32px] border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-4 shadow-inner transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
                    <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-600 mb-3">
                      Truth-in-Lending Disclosures
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-fr">
                      {/* APR with +/- controls */}
                      <div className="group rounded-2xl border bg-white border-blue-50 p-5 text-center shadow-[0_10px_25px_rgba(15,23,42,0.05)] flex flex-col transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200 focus-within:shadow-[0_0_24px_rgba(59,130,246,0.4)] focus-within:border-blue-300 focus-within:outline-none cursor-pointer">
                        <EnhancedControl
                          value={apr}
                          label="Annual Percentage Rate"
                          onChange={(newApr) => setApr(parseFloat(newApr.toFixed(2)))}
                          step={0.01}
                          min={0}
                          max={99.99}
                          formatValue={(val) => `${val.toFixed(2)}%`}
                          monthlyPayment={monthlyPayment}
                          baselinePayment={baselineMonthlyPayment}
                          className="w-full"
                          showKeyboardHint={true}
                          unstyled={true}
                        />
                        {baselineMonthlyPayment != null && (
                          <div
                            className={`text-xs font-semibold mt-2 ${
                              monthlyPayment - baselineMonthlyPayment < 0 ? 'text-green-600' : 'text-red-500'
                            }`}
                          >
                            {monthlyPayment - baselineMonthlyPayment < 0 ? '↓' : '↑'}{' '}
                            {formatCurrency(Math.abs(monthlyPayment - baselineMonthlyPayment))} vs baseline payment
                          </div>
                        )}
                        <div className="mt-2 text-xs text-slate-500">Cost of credit as yearly rate</div>
                      </div>

                      {/* Term with +/- controls */}
                      <div className="group rounded-2xl border bg-white border-blue-50 p-5 text-center shadow-[0_10px_25px_rgba(15,23,42,0.05)] flex flex-col transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200 focus-within:shadow-[0_0_24px_rgba(59,130,246,0.4)] focus-within:border-blue-300 focus-within:outline-none cursor-pointer">
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
                          monthlyPayment={monthlyPayment}
                          baselinePayment={baselineMonthlyPayment}
                          className="w-full"
                          showKeyboardHint={true}
                          unstyled={true}
                        />
                        {diffs.term && diffs.term.isSignificant && (
                          <div className={`text-xs font-semibold mt-2 ${diffs.term.isPositive ? 'text-green-600' : 'text-red-500'}`}>
                            {diffs.term.isPositive ? '↓' : '↑'} {diffs.term.formatted}
                          </div>
                        )}
                        <div className="mt-2 text-xs text-slate-500">Length of loan agreement</div>
                      </div>

                      {renderTilStatCard({
                        label: 'Finance Charge',
                        value: formatCurrencyWithCents(financeCharge),
                        helper: 'Dollar cost of credit',
                        diff: diffs.financeCharge,
                      })}

                      {renderTilStatCard({
                        label: 'Amount Financed',
                        value: formatCurrencyWithCents(amountFinanced),
                        helper: 'Credit provided to you',
                        diff: diffs.amountFinanced,
                      })}

                      {renderTilStatCard({
                        label: 'Total of Payments',
                        value: formatCurrencyWithCents(totalOfPayments),
                        helper: 'Total after all payments',
                        diff: diffs.totalPayments,
                        highlight: true,
                      })}

                      {renderTilStatCard({
                        label: 'Monthly Finance Charge',
                        value: formatCurrencyWithCents(loanTerm > 0 ? financeCharge / loanTerm : 0),
                        helper: 'Interest portion per month',
                        diff: diffs.monthlyFinanceCharge,
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Sliders Section - Full Width Below */}
        <div className="mt-4 space-y-3">
          <h2 className="text-2xl font-semibold text-gray-900">
            Adjust Pricing & Terms
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sale Price Slider Card */}
            <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <EnhancedSlider
                label="Sale Price"
                min={0}
                max={150000}
                step={100}
                value={salePrice}
                onChange={(e) => setSalePrice(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                monthlyPayment={monthlyPayment}
                buyerPerspective="lower-is-better"
                showTooltip={true}
                showReset={true}
                baselineValue={sliderBaselines.salePrice}
                snapThreshold={100}
                onReset={() => setSalePrice(sliderBaselines.salePrice)}
                fullWidth
              />
            </Card>

            {/* Cash Down Slider Card */}
            <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <EnhancedSlider
                label="Cash Down"
                min={0}
                max={50000}
                step={100}
                value={cashDown}
                onChange={(e) => setCashDown(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                monthlyPayment={monthlyPayment}
                buyerPerspective="higher-is-better"
                showTooltip={true}
                showReset={true}
                baselineValue={sliderBaselines.cashDown}
                snapThreshold={100}
                onReset={() => setCashDown(sliderBaselines.cashDown)}
                fullWidth
              />
            </Card>

            {/* Trade-In Allowance Slider Card */}
            <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <EnhancedSlider
                label="Trade-In Allowance"
                min={0}
                max={75000}
                step={100}
                value={tradeAllowance}
                onChange={(e) => setTradeAllowance(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Value of your trade-in vehicle"
                monthlyPayment={monthlyPayment}
                buyerPerspective="higher-is-better"
                showTooltip={true}
                showReset={true}
                baselineValue={sliderBaselines.tradeAllowance}
                snapThreshold={100}
                onReset={() => setTradeAllowance(sliderBaselines.tradeAllowance)}
                fullWidth
              />
            </Card>

            {/* Trade-In Payoff Slider Card */}
            <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <EnhancedSlider
                label="Trade-In Payoff"
                min={0}
                max={75000}
                step={100}
                value={tradePayoff}
                onChange={(e) => setTradePayoff(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Amount owed on trade-in"
                monthlyPayment={monthlyPayment}
                buyerPerspective="lower-is-better"
                showTooltip={true}
                showReset={true}
                baselineValue={sliderBaselines.tradePayoff}
                snapThreshold={100}
                onReset={() => setTradePayoff(sliderBaselines.tradePayoff)}
                fullWidth
              />
            </Card>

            {/* Dealer Fees Slider Card */}
            <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <EnhancedSlider
                label="Total Dealer Fees"
                min={0}
                max={5000}
                step={10}
                value={dealerFees}
                onChange={(e) => setDealerFees(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Doc fees, title, registration"
                monthlyPayment={monthlyPayment}
                buyerPerspective="lower-is-better"
                showTooltip={true}
                showReset={true}
                baselineValue={sliderBaselines.dealerFees}
                snapThreshold={10}
                onReset={() => setDealerFees(sliderBaselines.dealerFees)}
                fullWidth
              />
            </Card>

            {/* Customer Add-ons Slider Card */}
            <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
              <EnhancedSlider
                label="Total Customer Add-ons"
                min={0}
                max={10000}
                step={10}
                value={customerAddons}
                onChange={(e) => setCustomerAddons(Number(e.target.value))}
                formatValue={(val) => formatCurrency(val)}
                helperText="Warranties, protection packages"
                monthlyPayment={monthlyPayment}
                buyerPerspective="lower-is-better"
                showTooltip={true}
                showReset={true}
                baselineValue={sliderBaselines.customerAddons}
                snapThreshold={10}
                onReset={() => setCustomerAddons(sliderBaselines.customerAddons)}
                fullWidth
              />
            </Card>
          </div>
        </div>

        {/* Itemization of Costs - At the End */}
        <div className="mt-4">
          <Card variant="elevated" padding="md" className="transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200">
            <ItemizationCard
              salePrice={salePrice}
              cashDown={cashDown}
              tradeAllowance={tradeAllowance}
              tradePayoff={tradePayoff}
              dealerFees={dealerFees}
              customerAddons={customerAddons}
              stateTaxRate={stateTaxRate}
              countyTaxRate={countyTaxRate}
              stateTaxAmount={stateTaxAmount}
              countyTaxAmount={countyTaxAmount}
              totalTaxes={totalTaxes}
              unpaidBalance={unpaidBalance}
              amountFinanced={amountFinanced}
              cashDue={cashDue}
              stateName={stateName}
              countyName={countyName}
              tradeInApplied={equityDecision.appliedAmount}
              tradeInCashout={equityDecision.cashoutAmount}
              cashoutAmount={equityDecision.cashoutAmount}
            />
          </Card>
        </div>

        {/* Preview Offer CTA */}
        <div className="mt-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            className="text-lg py-4 w-full"
          >
            Preview Offer
          </Button>
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
          onUseAsTradeIn={handleSelectGarageVehicle}
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
        onSubmit={(data) => handleOfferSubmitWithProgress(data, false)}
        onDevSubmit={(data) => handleOfferSubmitWithProgress(data, true)}
      />

      {/* Submission Progress Modal */}
      <SubmissionProgressModal
        isOpen={showProgressModal}
        stage={progressStage}
        progress={progressPercent}
        error={progressError}
        onClose={() => setShowProgressModal(false)}
        onViewOffers={handleViewMyOffers}
      />

      {/* My Offers Modal */}
      <MyOffersModal
        isOpen={showMyOffersModal}
        onClose={() => setShowMyOffersModal(false)}
        highlightOfferId={highlightOfferId}
      />

      {/* APR Confirmation Modal */}
      {lenderBaselineApr !== null && (
        <AprConfirmationModal
          isOpen={showAprConfirmModal}
          onClose={() => setShowAprConfirmModal(false)}
          lenderApr={lenderBaselineApr / 100}
          customApr={apr / 100}
          isNewVehicle={vehicleCondition === 'new'}
          onResetApr={handleResetToLenderApr}
          onConfirm={handleKeepCustomApr}
        />
      )}

      {/* Positive Equity Modal */}
      <PositiveEquityModal
        isOpen={showPositiveEquityModal}
        onClose={() => setShowPositiveEquityModal(false)}
        positiveEquity={Math.max(0, tradeAllowance - tradePayoff)}
        onApply={handleEquityDecision}
        initialDecision={equityDecision}
        salePrice={salePrice}
        cashDown={cashDown}
        tradeAllowance={tradeAllowance}
        tradePayoff={tradePayoff}
        dealerFees={dealerFees}
        customerAddons={customerAddons}
        stateTaxRate={stateTaxRate}
        countyTaxRate={countyTaxRate}
        stateName={stateName}
        countyName={countyName}
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
        onOpenMyOffers={() => {
          setShowProfileDropdown(false);
          setShowMyOffersModal(true);
        }}
        supabase={supabase}
        isDirty={isProfileDirty}
      />
    </div>
  );
};

export default CalculatorApp;
