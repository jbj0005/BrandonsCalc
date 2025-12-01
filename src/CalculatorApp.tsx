import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Input,
  Select,
  Slider,
  Button,
  Modal,
  Card,
  Badge,
  VehicleEditorModal,
  AuthModal,
  EnhancedSlider,
  EnhancedControl,
  UserProfileDropdown,
  AprConfirmationModal,
  ItemizationCard,
  SubmissionProgressModal,
  MyOffersModal,
  PositiveEquityModal,
  Switch,
  VehicleCardPremium,
  VINSearchPremium,
  LocationSearchPremium,
  ScenarioDetectionPanel,
} from "./ui/components";
import type { VehicleOption, LocationDetails } from "./ui/components";
import { SectionHeader } from "./ui/components";
import { FeesModal } from "./ui/components/FeesModal";
import { FeeTemplateEditorModal } from "./ui/components/FeeTemplateEditorModal";
import { AddToLibraryModal, type LibraryDestination } from "./ui/components/AddToLibraryModal";
import { useToast } from "./ui/components/Toast";
import type { SelectOption } from "./ui/components/Select";
import type { PlaceDetails } from "./hooks/useGoogleMapsAutocomplete";
import { useProfile } from "./hooks/useProfile";
import { useFeeEngine } from "./hooks/useFeeEngine";
import { useTilBaselines, type TilDiff } from "./hooks/useTilBaselines";
import {
  fetchLenderRates,
  calculateAPR,
  creditScoreToValue,
  findBestLender,
  type LenderRate,
} from "./services/lenderRates";
import { DealerMap } from "./components/DealerMap";
import { OfferPreviewModal } from "./components/OfferPreviewModal";
import type { LeadData, SubmissionProgress } from "./services/leadSubmission";
import { submitOfferWithProgress } from "./services/leadSubmission";
import { lookupTaxRates, clearTaxRatesCache } from "./services/taxRatesService";
import type { EquityDecision, Vehicle, GarageVehicle } from "./types";
import type { GvwrEstimateDetail } from "./types/vehicleWeight";
import { useCalculatorStore } from "./stores/calculatorStore";
import { formatEffectiveDate } from "./utils/formatters";
// Stubbed hook removed in favor of web components; keep defined to avoid legacy references
const useGoogleMapsAutocomplete = () => ({ isLoaded: true, error: null });

// Import MarketCheck cache for VIN lookup
// @ts-ignore - JS module
import marketCheckCache from "./features/vehicles/marketcheck-cache.js";

// Import SavedVehiclesCache for saved vehicles
// @ts-ignore - JS module
import savedVehiclesCache from "./features/vehicles/saved-vehicles-cache.js";

// Import AuthManager and Supabase
// @ts-ignore - TS module
import authManager from "./features/auth/auth-manager";
// @ts-ignore - TS module
import {
  supabase,
  getAccessibleGarageVehicles,
  copyGarageVehicleToUser,
  acceptGarageInvite,
  getSharedGarageVehiclesByToken,
  createGarageShareLink,
  deleteSharedVehicle,
  getSharedVehicleById,
  addGarageVehicle,
} from "./lib/supabase";

const getLatestEffectiveDate = (rates: LenderRate[]): string | null => {
  if (!rates || rates.length === 0) return null;
  let latest: string | null = null;
  rates.forEach((rate) => {
    if (!rate.effective_date) return;
    const candidateTime = new Date(rate.effective_date).getTime();
    if (Number.isNaN(candidateTime)) return;
    if (latest === null) {
      latest = rate.effective_date;
      return;
    }
    const latestTime = new Date(latest).getTime();
    if (Number.isNaN(latestTime) || candidateTime > latestTime) {
      latest = rate.effective_date;
    }
  });
  return latest;
};

const DEFAULT_SALE_PRICE = 0;
const DEFAULT_CASH_DOWN = 0;

/**
 * Find the appropriate Florida weight bracket for a given weight
 * Returns the bracket's upper bound value for the fee schedule
 */
const findWeightBracket = (weight: number, bodyClass?: string): number => {
  const isTruck = bodyClass && (
    bodyClass.toLowerCase().includes('truck') ||
    bodyClass.toLowerCase().includes('pickup') ||
    bodyClass.toLowerCase().includes('van')
  );

  if (isTruck) {
    // Truck schedule brackets
    const truckBrackets = [
      { max: 1999, value: 1999 },
      { max: 3000, value: 3000 },
      { max: 5000, value: 5000 },
      { max: 5999, value: 5999 },
      { max: 7999, value: 7999 },
      { max: 9999, value: 9999 },
      { max: 14999, value: 14999 },
      { max: 19999, value: 19999 },
      { max: 26000, value: 26000 },
      { max: 34999, value: 34999 },
      { max: 43999, value: 43999 },
      { max: 54999, value: 54999 },
      { max: 61999, value: 61999 },
      { max: 71999, value: 71999 },
      { max: Infinity, value: 72000 },
    ];
    const bracket = truckBrackets.find(b => weight <= b.max);
    return bracket?.value ?? 72000;
  } else {
    // Auto schedule brackets
    const autoBrackets = [
      { max: 2499, value: 2499 },
      { max: 3499, value: 3499 },
      { max: Infinity, value: 3500 },
    ];
    const bracket = autoBrackets.find(b => weight <= b.max);
    return bracket?.value ?? 3500;
  }
};

/**
 * Extract weight data from a stored vehicle record and compute bracket
 * Returns { estimatedWeight, weightSource, vehicleWeightLbs, vehicleBodyType } or nulls
 */
const extractVehicleWeightData = (vehicle: any): {
  estimatedWeight: number | undefined;
  weightSource: string | undefined;
  vehicleWeightLbs: number | undefined;
  vehicleBodyType: 'auto' | 'truck';
} => {
  // Check various field names for stored weight
  const storedWeight = vehicle.curb_weight_lbs || vehicle.weight_lbs || vehicle.vehicle_weight_lbs;
  const storedWeightSource = vehicle.weight_source;
  const bodyClass = vehicle.body_class || vehicle.bodyClass || vehicle.vehicle_type;

  // Determine body type
  const isTruck = bodyClass && (
    bodyClass.toLowerCase().includes('truck') ||
    bodyClass.toLowerCase().includes('pickup') ||
    bodyClass.toLowerCase().includes('van')
  );
  const vehicleBodyType: 'auto' | 'truck' = isTruck ? 'truck' : 'auto';

  if (storedWeight && storedWeight > 0) {
    const bracket = findWeightBracket(storedWeight, bodyClass);
    return {
      estimatedWeight: storedWeight,
      weightSource: storedWeightSource || 'manual',
      vehicleWeightLbs: bracket,
      vehicleBodyType,
    };
  }

  return {
    estimatedWeight: undefined,
    weightSource: undefined,
    vehicleWeightLbs: undefined,
    vehicleBodyType,
  };
};

/**
 * Parse GVWR class string like "Class 1C: 4,001 - 5,000 lb" into estimated curb weight
 * Uses body-aware factors instead of a flat 70% to better match real payloads
 */
const parseGVWRToWeight = (
  gvwr: string,
  opts?: { bodyClass?: string; vehicleType?: string }
): { weight: number; detail: GvwrEstimateDetail } | null => {
  if (!gvwr) return null;

  const bodyClass = opts?.bodyClass || "";
  const vehicleType = opts?.vehicleType || "";

  const body = bodyClass.toLowerCase();
  const vType = vehicleType.toLowerCase();
  const isTruckLike =
    body.includes("pickup") ||
    body.includes("truck") ||
    body.includes("van") ||
    body.includes("cargo") ||
    vType === "truck";

  // Match patterns like "4,001 - 5,000 lb"
  const rangeMatch = gvwr.match(/([\d,]+)\s*-\s*([\d,]+)\s*lb/i);
  const singleMatch = gvwr.match(/([\d,]+)\s*lb/i);
  let lower: number | undefined;
  let upper: number | undefined;

  if (rangeMatch) {
    lower = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
    upper = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
  } else if (singleMatch) {
    upper = parseInt(singleMatch[1].replace(/,/g, ""), 10);
  } else {
    return null;
  }

  const midpoint = lower && upper ? Math.round((lower + upper) / 2) : upper;
  const classMatch = gvwr.match(/class\s*([0-9]+)\s*([a-z])?/i);
  const classNumber = classMatch ? parseInt(classMatch[1], 10) : undefined;
  const classLetter = classMatch?.[2]?.toLowerCase();
  const classCode =
    classNumber !== undefined
      ? `Class ${classNumber}${classLetter ? classLetter.toUpperCase() : ""}`
      : undefined;

  // Choose factor by body type + GVWR class, falling back to payload heuristics
  const gvwrAnchor = midpoint || upper || lower;
  let factor = 0.7;
  let factorReason = "Default GVWR-to-curb ratio";
  if (!isTruckLike) {
    factor = 0.8;
    factorReason = "Passenger car/crossover payload typically ~20% of GVWR";
  } else if ((classNumber && classNumber >= 3) || (gvwrAnchor && gvwrAnchor >= 10000)) {
    factor = 0.65;
    factorReason = "Class 3+ truck payload allowance";
  } else if (
    (classNumber === 2 && classLetter === "b") ||
    (gvwrAnchor && gvwrAnchor >= 8500)
  ) {
    factor = 0.68;
    factorReason = "Class 2B pickup/van payload allowance";
  } else {
    factor = 0.74;
    factorReason = "Light truck/van payload allowance";
  }

  if (!gvwrAnchor) return null;

  const estimatedWeight = Math.round(gvwrAnchor * factor);

  return {
    weight: estimatedWeight,
    detail: {
      factor,
      factorReason,
      bodyType: isTruckLike ? "truck" : "auto",
      classCode,
      gvwrLower: lower,
      gvwrUpper: upper,
      midpoint,
    },
  };
};

/**
 * Fetch vehicle weight data directly from NHTSA API (no server required)
 * NHTSA vPIC API is public and CORS-enabled
 */
const fetchNHTSAWeight = async (vin: string): Promise<{
  estimatedWeight: number | undefined;
  weightSource: string | undefined;
  bodyClass: string | undefined;
  gvwrClass: string | undefined;
  rawCurbWeight: number | undefined;
  usesTruckSchedule: boolean;
  gvwrEstimateDetail?: GvwrEstimateDetail;
} | null> => {
  if (!vin || vin.length < 11) {
    return null;
  }

  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`
    );
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const result = data?.Results?.[0];
    if (!result) {
      return null;
    }

    // Extract weight data
    const curbWeightLB = result.CurbWeightLB ? parseInt(result.CurbWeightLB, 10) : null;
    const gvwr = result.GVWR || null;
    const bodyClass = result.BodyClass || null;
    const vehicleType = result.VehicleType || null;

    // Determine weight and source
    let estimatedWeight: number | undefined;
    let weightSource: string | undefined;
    let gvwrEstimateDetail: GvwrEstimateDetail | undefined;

    if (curbWeightLB && !isNaN(curbWeightLB)) {
      estimatedWeight = curbWeightLB;
      weightSource = 'nhtsa_exact';
    } else if (gvwr) {
      const derivedWeight = parseGVWRToWeight(gvwr, { bodyClass, vehicleType });
      if (derivedWeight) {
        estimatedWeight = derivedWeight.weight;
        weightSource = 'gvwr_derived';
        gvwrEstimateDetail = derivedWeight.detail;
      }
    }

    if (!estimatedWeight) {
      return null;
    }

    // Determine if truck schedule applies
    const body = (bodyClass || '').toLowerCase();
    const type = (vehicleType || '').toLowerCase();
    const usesTruckSchedule =
      body.includes('pickup') ||
      body.includes('truck') ||
      body.includes('van') ||
      body.includes('cargo') ||
      type === 'truck';

    return {
      estimatedWeight,
      weightSource,
      bodyClass,
      gvwrClass: gvwr || undefined,
      rawCurbWeight: curbWeightLB || undefined,
      usesTruckSchedule,
      gvwrEstimateDetail,
    };
  } catch {
    return null;
  }
};

const normalizeDealerData = (vehicle: any) => {
  const dealer = vehicle?.dealer || {};

  const dealerLat =
    typeof vehicle?.dealer_lat === "number"
      ? vehicle.dealer_lat
      : typeof vehicle?.dealer_latitude === "number"
      ? vehicle.dealer_latitude
      : typeof dealer?.latitude === "number"
      ? dealer.latitude
      : null;

  const dealerLng =
    typeof vehicle?.dealer_lng === "number"
      ? vehicle.dealer_lng
      : typeof vehicle?.dealer_longitude === "number"
      ? vehicle.dealer_longitude
      : typeof dealer?.longitude === "number"
      ? dealer.longitude
      : null;

  const dealerAddress =
    vehicle?.dealer_address ||
    vehicle?.dealer_street ||
    dealer?.street ||
    dealer?.address ||
    "";

  return {
    ...vehicle,
    dealer_lat: dealerLat,
    dealer_lng: dealerLng,
    dealer_address: dealerAddress,
    dealer_name: vehicle?.dealer_name || dealer?.name || vehicle?.dealer || "",
    dealer_city: vehicle?.dealer_city || dealer?.city || "",
    dealer_state: vehicle?.dealer_state || dealer?.state || "",
    dealer_zip: vehicle?.dealer_zip || dealer?.zip || "",
    dealer_phone: vehicle?.dealer_phone || dealer?.phone || "",
  };
};

/**
 * CalculatorApp - Main auto loan calculator application
 *
 * This is a full React rewrite of the vanilla JS calculator,
 * using the component library we built.
 */
export const CalculatorApp: React.FC = () => {
  const toast = useToast();
  const { baselines, diffs, updateBaselines, resetBaselines, calculateDiffs } =
    useTilBaselines();

  // Refs
  const locationInputRef = useRef<HTMLInputElement>(null);
  const dropdownHoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastVehicleBaselineKeyRef = useRef<string | null>(null);
  const hasAppliedProfileCashDownRef = useRef<boolean>(false);

  // Location & Vehicle State
  const [location, setLocation] = useState("");
  const [locationDetails, setLocationDetails] = useState<PlaceDetails | null>(
    null
  );
  // Track if user has manually changed location (prevents profile auto-populate from overwriting)
  const locationManuallyChangedRef = useRef(false);
  const [vin, setVin] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [vehicleDiff, setVehicleDiff] = useState<{
    asking_price?: { was: number; now: number; change: number };
    mileage?: { was: number; now: number; change: number };
    photo_url?: { was: null; now: string };
  } | null>(null);
  const [isRefreshingVehicle, setIsRefreshingVehicle] = useState(false);
  const [vehicleWeightLbs, setVehicleWeightLbs] = useState<number | undefined>();
  const [vehicleBodyType, setVehicleBodyType] = useState<string>("auto");
  const [estimatedWeight, setEstimatedWeight] = useState<number | undefined>(); // Raw NHTSA/GVWR estimate
  const [weightSource, setWeightSource] = useState<string | undefined>();
  const [nhtsaBodyClass, setNhtsaBodyClass] = useState<string | undefined>(); // e.g., "Pickup"
  const [nhtsaGvwrClass, setNhtsaGvwrClass] = useState<string | undefined>(); // e.g., "Class 1C: 4,001 - 5,000 lb"
  const [nhtsaRawCurbWeight, setNhtsaRawCurbWeight] = useState<number | undefined>(); // Raw curb weight if available
  const [gvwrEstimateDetail, setGvwrEstimateDetail] = useState<GvwrEstimateDetail | undefined>(); // Details about GVWR-derived weight
  const [isLoadingVIN, setIsLoadingVIN] = useState(false);

  // Cash Down three-state toggle: 'zero' | 'current' | 'preference'
  const [cashDownToggleState, setCashDownToggleState] = useState<'zero' | 'current' | 'preference'>('preference');
  const [cashDownUserPreference, setCashDownUserPreference] = useState<number>(2000); // Default user preference
  const [vinError, setVinError] = useState("");

  // Google Maps Autocomplete
  const mapsLoaded = true;
  const mapsError = null;

  // Saved Vehicles State (marketplace vehicles from 'vehicles' table)
  const [savedVehicles, setSavedVehicles] = useState<any[]>([]);
  // Shared Vehicles imported from tokens
  const [sharedImportedVehicles, setSharedImportedVehicles] = useState<any[]>([]);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [isLoadingSavedVehicles, setIsLoadingSavedVehicles] = useState(false);
  const [isLoadingSharedImported, setIsLoadingSharedImported] = useState(false);
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

  // Clear tax rates cache on mount (to refresh with latest data)
  useEffect(() => {
    clearTaxRatesCache();
  }, []);

  // Parse share token and invite token from URL on load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalizedPath = window.location.pathname.replace(
      new RegExp(`^${basePath}`),
      ""
    );
    const url = new URL(window.location.href);
    const inviteParam =
      url.searchParams.get("invite") || url.searchParams.get("invite_token");
    if (inviteParam) {
      setPendingInviteToken(inviteParam);
    }

    const shareFromPath = normalizedPath.match(/^\/share\/([^/]+)/);
    const shareFromQuery =
      url.searchParams.get("share") || url.searchParams.get("share_token");
    const token = shareFromPath?.[1] || shareFromQuery;
    if (token) {
      setShareToken(token);
      // Extract the specific vehicle ID from the URL query param
      const vehicleParam = url.searchParams.get("vehicle");
      if (vehicleParam) {
        setSharedVehicleId(vehicleParam);
      }
    }
  }, []);

  // Handle Supabase recovery links: set session and prompt for new password
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(
      window.location.hash.replace("#", "")
    );
    const typeParam =
      url.searchParams.get("type") || hashParams.get("type") || "";
    const isRecovery = typeParam === "recovery";
    const code = url.searchParams.get("code");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!isRecovery) return;

    const clearRecoveryParams = () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("type");
      cleanUrl.searchParams.delete("code");
      cleanUrl.searchParams.delete("token");
      if (window.location.hash) {
        window.location.hash = "";
      }

      // Normalize to app root (handles gh-pages /BrandonsCalc/ or localhost /)
      const basePath = cleanUrl.pathname.includes("/BrandonsCalc")
        ? "/BrandonsCalc/"
        : "/";
      const normalized = `${cleanUrl.origin}${basePath}`;
      window.history.replaceState({}, document.title, normalized);
    };

    const hydrateSession = async () => {
      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else {
          return;
        }
        setAuthMode("reset");
        setShowAuthModal(true);
        toast.push({
          kind: "info",
          title: "Set a new password",
          detail: "Enter your new password to complete the reset.",
        });
        clearRecoveryParams();
      } catch (error: any) {
        toast.push({
          kind: "error",
          title: "Recovery link error",
          detail: error?.message || "Please request a new reset link.",
        });
      }
    };

    hydrateSession();
  }, [toast]);

  // Garage Vehicles State (user's owned vehicles from 'garage_vehicles' table)
  const [garageVehicles, setGarageVehicles] = useState<any[]>([]);
  const [isLoadingGarageVehicles, setIsLoadingGarageVehicles] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharedVehicleId, setSharedVehicleId] = useState<string | null>(null);
  const [sharedGarageVehicles, setSharedGarageVehicles] = useState<
    GarageVehicle[]
  >([]);
  const [sharedSavedVehicles, setSharedSavedVehicles] = useState<any[]>([]);
  const [isLoadingSharedGarage, setIsLoadingSharedGarage] = useState(false);
  const [sharedGarageError, setSharedGarageError] = useState<string | null>(
    null
  );
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(
    null
  );

  // Auth State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "reset">(
    "signin"
  );
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Add to Library Modal State
  const [showAddToLibraryModal, setShowAddToLibraryModal] = useState(false);
  const [vehicleToAddToLibrary, setVehicleToAddToLibrary] = useState<any>(null);

  const ensureSavedVehiclesCacheReady = useCallback(() => {
    if (!currentUser || !savedVehiclesCache) {
      return false;
    }

    try {
      const stats =
        typeof savedVehiclesCache.getStats === "function"
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
  const [leadDataForSubmission, setLeadDataForSubmission] = useState<LeadData>(
    {}
  );

  // Positive Equity Modal State
  const [showPositiveEquityModal, setShowPositiveEquityModal] = useState(false);
  const [equityDecision, setEquityDecision] = useState<EquityDecision>({
    action: "apply",
    appliedAmount: 0,
    cashoutAmount: 0,
  });

  // Submission Progress Modal State
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressStage, setProgressStage] =
    useState<SubmissionProgress["stage"]>("validating");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressError, setProgressError] = useState<string | undefined>(
    undefined
  );
  const [submittedOfferId, setSubmittedOfferId] = useState<string | undefined>(
    undefined
  );

  // My Offers Modal State
  const [showMyOffersModal, setShowMyOffersModal] = useState(false);
  const [highlightOfferId, setHighlightOfferId] = useState<string | undefined>(
    undefined
  );
  // Share Vehicle Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalTarget, setShareModalTarget] = useState<any | null>(null);
  const [shareModalLink, setShareModalLink] = useState<string>("");
  const [shareModalEmail, setShareModalEmail] = useState<string>("");
  const [shareModalListingUrl, setShareModalListingUrl] = useState<string>("");
  const [shareModalPhotoUrl, setShareModalPhotoUrl] = useState<string>("");
  const [shareModalLoading, setShareModalLoading] = useState(false);
  const [shareEmailSending, setShareEmailSending] = useState(false);
  const [shareModalError, setShareModalError] = useState<string | null>(null);
  const [shareModalSuccess, setShareModalSuccess] = useState<string | null>(
    null
  );
  const [shareSendStatus, setShareSendStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [shareSendDetail, setShareSendDetail] = useState<string | null>(null);
  const basePath =
    (import.meta.env.BASE_URL || "/")
      .replace(/\/+$/, "")
      .replace(/^\s*$/, "");
  const shareBaseEnv =
    (import.meta.env.VITE_SHARE_BASE_URL as string | undefined)?.replace(
      /\/+$/,
      ""
    ) || "";
  const lastImportedShareRef = useRef<string | null>(null);

  // APR Confirmation Modal State
  const [showAprConfirmModal, setShowAprConfirmModal] = useState(false);

  // Fees Modal State
  const [showFeesModal, setShowFeesModal] = useState(false);
  const [showFeeTemplateModal, setShowFeeTemplateModal] = useState(false);

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

  // Calculator Store (sliders, trade-in)
  const {
    sliders,
    selectedTradeInVehicles,
    tradePayoff,
    feeItems,
    stateTaxRate: storeTaxState,
    countyTaxRate: storeTaxCounty,
    userTaxOverride,
    autoLockTimerId,
    setSliderValue,
    setSliderValueWithSettling,
    setSliderValueWithAutoLock,
    setSliderBaseline,
    toggleSliderLock,
  getEffectiveBaseline,
  resetSlider,
  applyVehicle,
  applyGarageVehicle,
  applyProfilePreferences,
  toggleTradeInVehicle,
  resetTradeIn,
  setTradePayoff,
  setFeeItems,
  setTaxRates,
  syncFeeSliders,
  setFeeEngineResult,
  applyFeeEngineResult,
  feeEngineResult,
} = useCalculatorStore();

  // Extract slider values for convenient access
  const salePrice = sliders.salePrice.value;
  const cashDown = sliders.cashDown.value;
  const tradeAllowance = sliders.tradeAllowance.value;
  const dealerFees = sliders.dealerFees.value;
  const customerAddons = sliders.customerAddons.value;
  const govtFees = sliders.govtFees.value;

  // Financing State
  const [lender, setLender] = useState("nfcu");
  const [lenderOptions, setLenderOptions] = useState<SelectOption[]>([
    { value: "nfcu", label: "Navy Federal Credit Union" }, // Default fallback
  ]);
  const [bestLenderLongName, setBestLenderLongName] = useState<string | null>(
    null
  );
  const [bestLenderApr, setBestLenderApr] = useState<number | null>(null);
  const [isLoadingLenders, setIsLoadingLenders] = useState(true);
  const [loanTerm, setLoanTerm] = useState(72);
  const [creditScore, setCreditScore] = useState("excellent");
  const [vehicleCondition, setVehicleCondition] = useState<"new" | "used">(
    "new"
  );
  const [lenderRates, setLenderRates] = useState<LenderRate[]>([]);
  const [ratesEffectiveDate, setRatesEffectiveDate] = useState<string | null>(
    null
  );
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [useLowestApr, setUseLowestApr] = useState(false);
  const [isFindingBestLender, setIsFindingBestLender] = useState(false);

  // Calculated values
  const [isAprManuallySet, setIsAprManuallySet] = useState(false);
  const [apr, setApr] = useState(5.99);
  const [lenderBaselineApr, setLenderBaselineApr] = useState<number | null>(
    null
  );
  const [hasLenderAprLoaded, setHasLenderAprLoaded] = useState(false);
  const [hasShownDefaultAprWarning, setHasShownDefaultAprWarning] =
    useState(false);
  const [monthlyPayment, setMonthlyPayment] = useState(0);
  const [amountFinanced, setAmountFinanced] = useState(0);
  const [financeCharge, setFinanceCharge] = useState(0);
  const [totalOfPayments, setTotalOfPayments] = useState(0);
  // Manual APR change (from user input or arrows)
  const handleAprChange = useCallback(
    (nextApr: number) => {
      const rounded = parseFloat(nextApr.toFixed(2));
      setApr(rounded);
      setIsAprManuallySet(true);
      if (useLowestApr) {
        setUseLowestApr(false);
      }
    },
    [useLowestApr]
  );

  // Apply lender-driven APR updates (keeps manual overrides intact)
  const applyLenderApr = useCallback(
    (nextApr: number) => {
      const rounded = parseFloat(nextApr.toFixed(2));
      setApr(rounded);
      setIsAprManuallySet(false);
    },
    []
  );

  const commitAprInput = useCallback(
    (raw: string) => {
      const parsed = parseFloat(raw);
      const clamped = Number.isFinite(parsed)
        ? Math.min(99.99, Math.max(0, parsed))
        : apr;
      handleAprChange(clamped);
      setIsAprInputFocused(false);
    },
    [apr, handleAprChange]
  );

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
  const [taxableBase, setTaxableBase] = useState(0);
  const [stateName, setStateName] = useState<string>("Florida");
  const [countyName, setCountyName] = useState<string>("");
  const [isTaxRateManuallySet, setIsTaxRateManuallySet] = useState(false);

  // Additional calculated values
  const [unpaidBalance, setUnpaidBalance] = useState(0);
  const [cashDue, setCashDue] = useState(0);

  // Dynamic slider max ranges (115% of current value OR fallback maximum, whichever is greater)
  const saleMaxDynamic = Math.max(salePrice * 1.15, 150000);
  const cashDownMaxDynamic = Math.max(cashDown * 1.15, 50000);
  const tradeAllowanceMaxDynamic = Math.max(tradeAllowance * 1.15, 75000);

  // Fee modal handlers
  const handleFeesModalSave = (data: {
    dealerFees: Array<{ description: string; amount: number }>;
    customerAddons: Array<{ description: string; amount: number }>;
    govtFees: Array<{ description: string; amount: number }>;
    stateTaxRate: number;
    countyTaxRate: number;
    userTaxOverride: boolean;
  }) => {
    // Update fee items in store
    setFeeItems("dealer", data.dealerFees);
    setFeeItems("customer", data.customerAddons);
    setFeeItems("gov", data.govtFees);

    // Update tax rates
    setTaxRates(data.stateTaxRate, data.countyTaxRate, data.userTaxOverride);

    // Sync fee totals to sliders
    syncFeeSliders();

    // Close modal
    setShowFeesModal(false);

    toast.push({
      kind: "success",
      title: "Fees Updated",
      detail: "Totals refreshed with your latest amounts.",
    });
  };

  const handleOpenFeeTemplateEditor = () => {
    // Keep fees as-is; just toggle modals
    setShowFeesModal(false);
    setShowFeeTemplateModal(true);
  };

  const handleCloseFeeTemplateEditor = () => {
    // Restore the fees modal without resetting existing fee values
    setShowFeeTemplateModal(false);
    setShowFeesModal(true);
  };

  // Handler for editing "Cash to You" from itemization
  const handleEquityCashoutChange = (cashout: number) => {
    const positiveEquity = Math.max(0, tradeAllowance - tradePayoff);
    const validatedCashout = Math.max(0, Math.min(cashout, positiveEquity)); // Ensure within bounds
    const appliedAmount = Math.max(0, positiveEquity - validatedCashout);

    setEquityDecision({
      action: validatedCashout > 0 ? "split" : "apply",
      appliedAmount,
      cashoutAmount: validatedCashout,
    });
  };

  // Vehicle condition options
  const vehicleConditionOptions: SelectOption[] = [
    { value: "new", label: "New Vehicle" },
    { value: "used", label: "Used Vehicle" },
  ];

  // Loan term options
  const termOptions: SelectOption[] = [
    { value: "36", label: "36 months (3 years)" },
    { value: "48", label: "48 months (4 years)" },
    { value: "60", label: "60 months (5 years)" },
    { value: "72", label: "72 months (6 years)" },
    { value: "84", label: "84 months (7 years)" },
  ];

  // Credit score options
  const creditScoreOptions: SelectOption[] = [
    { value: "excellent", label: "Excellent (750+)" },
    { value: "good", label: "Good (700-749)" },
    { value: "fair", label: "Fair (650-699)" },
    { value: "poor", label: "Building Credit (< 650)" },
  ];

  const FEATURE_FLAGS = {
    autoPopulateSalePrice: true,
    useTradeValueForGarageSalePrice: true,
    defaultVehicleCondition: "new" as "new" | "used",
    rebaseTilOnVehicleSelection: true,
  };

  const parseNumericValue = (value: any): number | null => {
    if (value == null) return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const cleaned = String(value).replace(/[^0-9.-]/g, "");
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  };

  useEffect(() => {
    if (!FEATURE_FLAGS.rebaseTilOnVehicleSelection) {
      return;
    }

    const nextVehicleKey =
      selectedVehicle?.vin ||
      (typeof selectedVehicle?.id === "string" ? selectedVehicle.id : null);

    if (lastVehicleBaselineKeyRef.current === nextVehicleKey) {
      return;
    }

    resetBaselines();
    setHasLenderAprLoaded(false); // Reset flag so TIL baselines can be set fresh for new vehicle
    setHasShownDefaultAprWarning(false); // Reset warning flag for new vehicle
    lastVehicleBaselineKeyRef.current = nextVehicleKey ?? null;
  }, [selectedVehicle, resetBaselines]);

  // Fetch lenders list on component mount
  useEffect(() => {
    const loadLenders = async () => {
      try {
        // TODO: Replace with actual API endpoint once lenders table is created
        // For now, use expanded hardcoded list from database research
        const fallbackLenders: SelectOption[] = [
          { value: "nfcu", label: "Navy Federal Credit Union" },
          { value: "sccu", label: "Space Coast Credit Union" },
          { value: "penfed", label: "Pentagon Federal Credit Union" },
          { value: "dcu", label: "Digital Federal Credit Union" },
          { value: "launchcu", label: "Launch Federal Credit Union" },
          { value: "ngfcu", label: "Nightingale Federal Credit Union" },
          { value: "ccufl", label: "Community Credit Union of Florida" },
        ];

        // Try fetching from API (once lenders table exists)
        try {
          const response = await fetch("/api/lenders");
          if (response.ok) {
            const data = await response.json();
            const apiLenders = data
              .map((lender: any) => {
                const value =
                  lender.id ||
                  lender.source ||
                  lender.short_name ||
                  lender.shortName;
                const label =
                  lender.long_name ||
                  lender.longName ||
                  lender.short_name ||
                  lender.shortName ||
                  value;
                if (!value || !label) return null;
                return { value: String(value), label: String(label) };
              })
              .filter(Boolean);
            setLenderOptions(apiLenders.length ? apiLenders : fallbackLenders);
          } else {
            setLenderOptions(fallbackLenders);
          }
        } catch {
          setLenderOptions(fallbackLenders);
        }
      } catch {
        // Keep default fallback from initial state
      } finally {
        setIsLoadingLenders(false);
      }
    };

    loadLenders();
  }, []);

  // Fetch lender rates when lender changes
  useEffect(() => {
    const loadRates = async () => {
      if (!lender) return;

      setIsLoadingRates(true);
      setRatesEffectiveDate(null);
      setHasLenderAprLoaded(false); // Reset flag when lender changes
      setHasShownDefaultAprWarning(false); // Reset warning flag when lender changes
      try {
        const response = await fetchLenderRates(lender);
        setLenderRates(response.rates);
        setRatesEffectiveDate(getLatestEffectiveDate(response.rates));
      } catch (error: any) {
        setLenderRates([]);
        setRatesEffectiveDate(null);
        toast.push({
          kind: "warning",
          title: "Rates Unavailable",
          detail: "Using default APR. Rates may not be accurate.",
        });
      } finally {
        setIsLoadingRates(false);
      }
    };

    loadRates();
  }, [lender]);

  // Find best lender when "Use Lowest APR" is enabled
  useEffect(() => {
    if (!useLowestApr || lenderOptions.length === 0) {
      setBestLenderLongName(null);
      setBestLenderApr(null);
      return;
    }

    setBestLenderLongName(null);
    setBestLenderApr(null);

    const findBest = async () => {
      setIsFindingBestLender(true);
      try {
        const lenderSources = lenderOptions.map((opt) => opt.value);
        const creditScoreValue = creditScoreToValue(creditScore);
        const bestLender = await findBestLender(
          lenderSources,
          creditScoreValue,
          loanTerm,
          vehicleCondition
        );

        if (bestLender) {
          setLender(bestLender.lenderSource);
          setBestLenderLongName(bestLender.lenderName);
          setBestLenderApr(bestLender.apr);
          applyLenderApr(bestLender.apr); // Mirror winner APR immediately
          setLenderBaselineApr(bestLender.apr);
          const wasUsingDefault = !hasLenderAprLoaded;
          if (!hasLenderAprLoaded) {
            setHasLenderAprLoaded(true); // Mark as loaded when best rate is found
          }
          toast.push({
            kind: "success",
            title: wasUsingDefault ? "Best Rate Loaded" : "Best Rate Applied",
            detail: `${bestLender.lenderName} at ${bestLender.apr.toFixed(
              2
            )}% APR${
              wasUsingDefault ? " loaded and" : ""
            } is now applied to your payment.`,
          });
        }
      } catch (error) {
        toast.push({
          kind: "error",
          title: "Error Finding Best Rate",
          detail: "Could not compare lenders. Please select manually.",
        });
      } finally {
        setIsFindingBestLender(false);
      }
    };

    findBest();
  }, [
    useLowestApr,
    creditScore,
    loanTerm,
    vehicleCondition,
    lenderOptions,
    toast,
  ]);

  // Keep APR synced with the winner when using lowest APR
  useEffect(() => {
    if (useLowestApr && bestLenderApr != null) {
      const normalized = parseFloat(bestLenderApr.toFixed(2));
      applyLenderApr(normalized);
      setLenderBaselineApr(normalized);
      if (!hasLenderAprLoaded) {
        setHasLenderAprLoaded(true); // Mark as loaded when using lowest APR
      }
    }
  }, [useLowestApr, bestLenderApr, hasLenderAprLoaded, applyLenderApr]);

  // Show warning toast when using default APR
  useEffect(() => {
    // Don't show warning if rates are loading or if we've already shown it
    if (isLoadingRates || hasShownDefaultAprWarning || hasLenderAprLoaded) {
      return;
    }

    // Wait a short delay to allow rates to load first
    const warningTimer = setTimeout(() => {
      if (!hasLenderAprLoaded && selectedVehicle && monthlyPayment > 0) {
        toast.push({
          kind: "warning",
          title: "Using Default APR",
          detail: `Calculations are based on ${apr.toFixed(
            2
          )}% default rate. Waiting for lender rates to load for accurate pricing.`,
        });
        setHasShownDefaultAprWarning(true);
      }
    }, 1000); // 1 second delay

    return () => clearTimeout(warningTimer);
  }, [
    hasLenderAprLoaded,
    isLoadingRates,
    hasShownDefaultAprWarning,
    selectedVehicle,
    monthlyPayment,
    apr,
    toast,
  ]);

  // Calculate APR based on credit score, term, and vehicle condition
  useEffect(() => {
    if (lenderRates.length === 0) {
      // No rates available - keep default APR
      return;
    }

    const creditScoreValue = creditScoreToValue(creditScore);
    const calculatedAPR = calculateAPR(
      lenderRates,
      creditScoreValue,
      loanTerm,
      vehicleCondition
    );

    if (calculatedAPR !== null) {
      // Only overwrite APR if user has not manually set it, or if auto-following lowest APR
      if (!isAprManuallySet || useLowestApr) {
        applyLenderApr(calculatedAPR);
      }
      // Store lender's recommended APR as baseline for comparison
      setLenderBaselineApr(calculatedAPR);

      // Mark that lender APR has been loaded (used to prevent TIL baselines from being set with hard-coded default)
      if (!hasLenderAprLoaded) {
        setHasLenderAprLoaded(true);
        // Show success toast when real rates load (if we previously showed warning)
        if (hasShownDefaultAprWarning) {
          toast.push({
            kind: "success",
            title: "Lender Rates Loaded",
            detail: `Updated to ${calculatedAPR.toFixed(
              2
            )}% APR based on your credit profile and loan terms.`,
          });
        }
      }
    }
  }, [
    lenderRates,
    creditScore,
    loanTerm,
    vehicleCondition,
    hasLenderAprLoaded,
    hasShownDefaultAprWarning,
    toast,
    isAprManuallySet,
    useLowestApr,
    applyLenderApr,
  ]);

  // Calculate loan on any change (including equity decision)
  useEffect(() => {
    calculateLoan();
  }, [
    salePrice,
    cashDown,
    tradeAllowance,
    tradePayoff,
    dealerFees,
    customerAddons,
    loanTerm,
    apr,
    selectedVehicle,
    stateTaxRate,
    countyTaxRate,
    equityDecision,
  ]);

  // Auto-populate location from profile when profile loads
  useEffect(() => {
    if (!profile || !mapsLoaded) return;

    // Build address string from profile
    const street = (profile.street_address || "").trim();
    const city = (profile.city || "").trim();
    const stateCode = (profile.state_code || "").trim();
    const zip = (profile.zip_code || "").trim();

    // If street looks like a complete Google formatted address (contains "USA" or has 3+ commas),
    // use it directly without appending city/state/zip to avoid duplication
    const isCompleteAddress = street.includes("USA") || (street.match(/,/g) || []).length >= 3;

    let addressString: string;
    if (isCompleteAddress) {
      // Street already contains full formatted address from Google Places
      addressString = street;
    } else {
      // Need to build address from parts
      const streetLower = street.toLowerCase();
      const needsCity = city && !streetLower.includes(city.toLowerCase());
      const needsState = stateCode && !streetLower.includes(stateCode.toLowerCase());
      const needsZip = zip && !streetLower.includes(zip);

      const trailingParts: string[] = [];
      if (needsCity) trailingParts.push(city);
      if (needsState) trailingParts.push(stateCode);
      if (needsZip) trailingParts.push(zip);

      addressString =
        [street, trailingParts.join(", ")].filter(Boolean).join(", ").replace(/,\s*,+/g, ", ").trim() ||
        [city, stateCode, zip].filter(Boolean).join(", ");
    }

    if (!addressString) return;

    // Only auto-fill location string if field is empty AND user hasn't manually changed it
    if (!location && !locationManuallyChangedRef.current) {
      setLocation(addressString);
    }

    // Build locationDetails from profile data
    const profileLocation: PlaceDetails = {
      address: addressString,
      city: profile.city || "",
      state: profile.state || profile.state_code || "",
      stateCode: profile.state_code || "",
      zipCode: profile.zip_code || "",
      country: "United States",
      county: profile.county || "", // May be empty
      countyName: profile.county_name || profile.county || "",
      lat: 0,
      lng: 0,
    };

    // Geocode the profile address to get lat/lng for routing
    // This enables dealer directions to work with auto-loaded addresses
    if (window.google?.maps?.Geocoder && addressString) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: addressString }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const location = results[0].geometry.location;
          const lat =
            typeof location.lat === "function" ? location.lat() : location.lat;
          const lng =
            typeof location.lng === "function" ? location.lng() : location.lng;

          // Extract county from address components (same logic as autocomplete)
          const addressComponents = results[0].address_components || [];
          const getComponent = (
            type: string,
            nameType: "long_name" | "short_name" = "long_name"
          ) => {
            const component = addressComponents.find(
              (c: google.maps.GeocoderAddressComponent) =>
                c.types.includes(type)
            );
            return component ? component[nameType] : "";
          };

          const countyRaw = getComponent("administrative_area_level_2");
          const countyNormalized = countyRaw
            .replace(/\s+(County|Parish)$/i, "")
            .trim();

          // Update location details with real coordinates AND county data
          const geolocatedProfile: PlaceDetails = {
            ...profileLocation,
            county: countyNormalized || profileLocation.county,
            countyName: countyRaw || profileLocation.countyName,
            lat: lat as number,
            lng: lng as number,
          };

          setLocationDetails(geolocatedProfile);

          // Lookup tax rates with geocoded county data
          // Use countyNormalized (same as autocomplete) for database lookup
          if (profile.state_code && countyNormalized) {
            lookupTaxRates(
              profile.state_code,
              countyNormalized,
              profile.state || profile.state_code
            )
              .then((taxData) => {
                if (taxData && !isTaxRateManuallySet) {
                  setStateTaxRate(taxData.stateTaxRate);
                  setCountyTaxRate(taxData.countyTaxRate);
                  setStateName(taxData.stateName);
                  setCountyName(taxData.countyName);
                  toast.push({
                    kind: "success",
                    title: "Tax Rates Loaded",
                    detail: `Applied rates for ${taxData.stateName}, ${taxData.countyName}`,
                  });
                }
              })
              .catch((err) => {
                // Tax lookup failed
              });
          }
        } else {
          // Fallback to profile location without coordinates
          setLocationDetails(profileLocation);
        }
      });
    } else {
      // Google Maps not loaded yet or no address - use profile location without coordinates
      setLocationDetails(profileLocation);
    }

    // Load tax rates from profile location (only if county data is available)
    if (profile.state_code && profile.county && profile.state) {
      lookupTaxRates(profile.state_code, profile.county, profile.state)
        .then((taxData) => {
          if (taxData && !isTaxRateManuallySet) {
            setStateTaxRate(taxData.stateTaxRate);
            setCountyTaxRate(taxData.countyTaxRate);
            setStateName(taxData.stateName);
            setCountyName(taxData.countyName);
            toast.push({
              kind: "success",
              title: "Tax Rates Loaded",
              detail: `Applied rates for ${taxData.stateName}, ${taxData.countyName}`,
            });
          } else if (!taxData && !isTaxRateManuallySet) {
            // Set location names even if tax lookup fails
            setStateName(profile.state || "");
            setCountyName(profile.county_name || profile.county || "");
            toast.push({
              kind: "warning",
              title: "Tax Rates Not Found",
              detail: `No rates found for ${profile.state}, ${profile.county}. Using defaults.`,
            });
          }
        })
        .catch((err) => {
          // Tax lookup failed
        });
    }
  }, [profile, mapsLoaded, isTaxRateManuallySet]);

  // Reset profile cash-down auto-apply flag when vehicle or preference changes
  useEffect(() => {
    hasAppliedProfileCashDownRef.current = false;
  }, [selectedVehicle?.vin, selectedVehicle?.id, profile?.preferred_down_payment]);

  // Auto-populate down payment from profile when vehicle is selected
  useEffect(() => {
    if (!profile || !selectedVehicle || profile.preferred_down_payment == null)
      return;
    if (hasAppliedProfileCashDownRef.current) return;
    if (cashDownToggleState === "zero") return;

    const preferredDown = parseNumericValue(profile.preferred_down_payment);
    if (preferredDown == null) return;

    if (Math.abs(cashDown - DEFAULT_CASH_DOWN) < 1) {
      applyProfilePreferences(profile);
      setCashDownToggleState("preference");
      hasAppliedProfileCashDownRef.current = true;
    }
  }, [profile, selectedVehicle, cashDown, cashDownToggleState, applyProfilePreferences]);

  // Sync toggle preference with profile preference
  useEffect(() => {
    if (profile?.preferred_down_payment != null) {
      const preferredDown = parseNumericValue(profile.preferred_down_payment);
      if (preferredDown != null && preferredDown > 0) {
        setCashDownUserPreference(preferredDown);
      }
    }
  }, [profile?.preferred_down_payment]);

  // Listen for auth state changes
  useEffect(() => {
    // Check initial auth state
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
      }
    };
    checkAuth();

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        setCurrentUser(session.user);
        // Reload saved vehicles after sign in
        await reloadSavedVehicles();
        toast.push({
          kind: "success",
          title: "Welcome back!",
          detail: "You are now signed in",
        });
      } else if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setSavedVehicles([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Handle auth callback URLs (OAuth redirects, email verification, password recovery)
  useEffect(() => {
    const handleAuthCallback = async () => {
      // Check for auth params in URL hash (Supabase uses hash-based routing for auth)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get("type");
      const accessToken = hashParams.get("access_token");

      // If there's a recovery type, Supabase's onAuthStateChange will fire PASSWORD_RECOVERY
      // but we should clean up the URL regardless
      if (type || accessToken) {
        // Clear the hash after processing to clean up the URL
        window.history.replaceState(null, "", window.location.pathname);
      }
    };

    handleAuthCallback();
  }, []);

  // Initialize savedVehiclesCache with supabase and userId
  useEffect(() => {
    if (currentUser && supabase) {
      // Subscribe to saved vehicles for this user
      savedVehiclesCache.subscribe(currentUser.id, supabase);

      // Subscribe to cache change events to update React state immediately
      const unsubscribe = savedVehiclesCache.on('change', (updatedVehicles: any[]) => {
        setSavedVehicles(updatedVehicles || []);
      });

      return () => {
        unsubscribe();
      };
    }
  }, [currentUser]);

  // Load saved vehicles (marketplace) on mount and when user changes
  useEffect(() => {
    const loadSavedVehicles = async () => {
      if (!currentUser) {
        setSavedVehicles([]);
        setSharedImportedVehicles([]);
        return;
      }

      if (!ensureSavedVehiclesCacheReady()) {
        return;
      }

      setIsLoadingSavedVehicles(true);
      try {
        const vehicles = await savedVehiclesCache.getVehicles({
          forceRefresh: true,
        });
        setSavedVehicles(vehicles || []);
      } catch (error: any) {
        if (
          !error.message?.includes("No Supabase client") &&
          !error.message?.includes("user ID")
        ) {
          toast.push({
            kind: "error",
            title: "Failed to Load Vehicles",
            detail: "Could not load your saved vehicles",
          });
        }
      } finally {
        setIsLoadingSavedVehicles(false);
      }
    };
    loadSavedVehicles();
  }, [currentUser, ensureSavedVehiclesCacheReady]);

  // Load shared imported vehicles for current user
  useEffect(() => {
    if (!currentUser || !supabase) {
      setSharedImportedVehicles([]);
      return;
    }

    setIsLoadingSharedImported(true);
    supabase
      .from("shared_vehicles")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("inserted_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) {
          setSharedImportedVehicles(data || []);
        }
      })
      .finally(() => setIsLoadingSharedImported(false));
  }, [currentUser, supabase]);

  // Load garage vehicles on mount and when user changes
  useEffect(() => {
    const loadGarageVehicles = async () => {
      if (!currentUser || !supabase) {
        setGarageVehicles([]);
        return;
      }

      setIsLoadingGarageVehicles(true);
      try {
        const vehicles = await getAccessibleGarageVehicles();
        setGarageVehicles(vehicles || []);
      } catch (error: any) {
        toast.push({
          kind: "error",
          title: "Failed to Load Garage",
          detail: "Could not load your garage vehicles",
        });
      } finally {
        setIsLoadingGarageVehicles(false);
      }
    };
    loadGarageVehicles();
  }, [currentUser, supabase]);

  // Load shared garage vehicles if viewing via share token
  useEffect(() => {
    if (!shareToken) {
      setSharedGarageVehicles([]);
      setSharedSavedVehicles([]);
      setSharedGarageError(null);
      setIsLoadingSharedGarage(false);
      return;
    }
    setIsLoadingSharedGarage(true);
    setSharedGarageError(null);
    const controller = new AbortController();

    const loadSharedCollections = async () => {
      try {
        // Build URL with optional vehicle filter
        const shareUrl = sharedVehicleId
          ? `/api/share/${shareToken}/collections?vehicle=${sharedVehicleId}`
          : `/api/share/${shareToken}/collections`;
        const response = await fetch(shareUrl, { signal: controller.signal });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(
            payload?.error || `Unable to load shared vehicles (${response.status})`
          );
        }
        const payload = await response.json();
        setSharedGarageVehicles(payload?.garageVehicles || []);
        setSharedSavedVehicles(payload?.savedVehicles || []);
      } catch (error: any) {
        if (controller.signal.aborted) return;
        setSharedGarageError(
          error?.message || "Unable to load shared garage vehicles"
        );
        setSharedGarageVehicles([]);
        setSharedSavedVehicles([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSharedGarage(false);
        }
      }
    };

    loadSharedCollections();

    return () => controller.abort();
  }, [shareToken, sharedVehicleId]);

  // Auto-import shared vehicles into My Shared Vehicles for signed-in users
  useEffect(() => {
    const shouldImport =
      shareToken &&
      currentUser &&
      !isLoadingSharedGarage &&
      !sharedGarageError &&
      (sharedGarageVehicles.length > 0 || sharedSavedVehicles.length > 0);
    if (!shouldImport) return;

    const importKey = `${currentUser.id}:${shareToken}`;
    if (lastImportedShareRef.current === importKey) return;

    const runImport = async () => {
      try {
        // Clean up old shared vehicles from different share tokens to keep table tidy
        await supabase
          .from("shared_vehicles")
          .delete()
          .eq("user_id", currentUser.id)
          .neq("share_token", shareToken);
        const vehiclesToImport = [
          ...sharedGarageVehicles.map((v) => ({
            ...normalizeDealerData(v),
            source_type: "garage" as const,
            shared_from_vehicle_id: v.id,
            shared_from_owner_id: v.garage_owner_id || v.user_id || null,
          })),
          ...sharedSavedVehicles.map((v) => ({
            ...normalizeDealerData(v),
            source_type: "saved" as const,
            shared_from_vehicle_id: v.id,
            shared_from_owner_id: v.user_id || null,
          })),
        ];

        const uniqueByVin = new Map<string, any>();
        vehiclesToImport.forEach((v) => {
          if (v.vin) {
            uniqueByVin.set(v.vin, v);
          }
        });
        const importList =
          uniqueByVin.size > 0 ? Array.from(uniqueByVin.values()) : vehiclesToImport;

        // Fetch existing VINs across garage, saved, and shared to dedupe
        const [garageVins, savedVins, sharedVins] = await Promise.all([
          supabase
            .from("garage_vehicles")
            .select("vin")
            .eq("user_id", currentUser.id),
          supabase.from("vehicles").select("vin").eq("user_id", currentUser.id),
          supabase
            .from("shared_vehicles")
            .select("vin, shared_from_vehicle_id")
            .eq("user_id", currentUser.id),
        ]);

        const existingVins = new Set<string>();
        [garageVins?.data, savedVins?.data, sharedVins?.data].forEach((rows) => {
          rows?.forEach((r: any) => {
            if (r?.vin) existingVins.add(r.vin);
          });
        });
        const existingSharedIds = new Set<string>(
          (sharedVins?.data || [])
            .map((r: any) => r.shared_from_vehicle_id)
            .filter(Boolean)
        );

        const toInsert = importList.filter((v) => {
          if (v.shared_from_vehicle_id && existingSharedIds.has(v.shared_from_vehicle_id)) {
            return false;
          }
          if (v.vin && existingVins.has(v.vin)) {
            return false;
          }
          return true;
        });

        if (toInsert.length === 0) {
          // Still reload to ensure shared vehicles appear in dropdown
          const { data: refreshedData, error: refreshError } = await supabase
            .from("shared_vehicles")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("inserted_at", { ascending: false });

          if (refreshedData) {
            setSharedImportedVehicles(refreshedData);
          }

          toast.push({
            kind: "info",
            title: "Already in your account",
            detail: "This shared vehicle already exists in your library.",
          });
          lastImportedShareRef.current = importKey;
          return;
        }

        // Optional: attempt to hydrate via MarketCheck when VIN present
        const hydrated = await Promise.all(
          toInsert.map(async (v) => {
            if (!v.vin) return v;
            try {
              const resp = await fetch(`/api/mc/by-vin/${encodeURIComponent(v.vin)}`);
              if (!resp.ok) return v;
              const data = await resp.json();
              return {
                ...v,
                photo_url: v.photo_url || data?.summary?.photo_url || data?.photo_url,
                listing_url: v.listing_url || data?.mc_listing_url || data?.listing_url,
                dealer_name: v.dealer_name || data?.dealer?.name,
                dealer_city: v.dealer_city || data?.dealer?.city,
                dealer_state: v.dealer_state || data?.dealer?.state,
              };
            } catch {
              return v;
            }
          })
        );

        const payload = hydrated.map((v) => ({
          user_id: currentUser.id,
          shared_from_owner_id: v.shared_from_owner_id || null,
          shared_from_vehicle_id: v.shared_from_vehicle_id || null,
          share_token: shareToken,
          source_type: v.source_type || "garage",
          vehicle: v.vehicle || null,
          year: v.year || null,
          make: v.make || null,
          model: v.model || null,
          asking_price: v.asking_price || v.estimated_value || null,
          mileage: v.mileage || null,
          trim: v.trim || null,
          dealer_name: v.dealer_name || null,
          dealer_street: v.dealer_street || v.dealer_address || null,
          dealer_city: v.dealer_city || null,
          dealer_state: v.dealer_state || null,
          dealer_zip: v.dealer_zip || null,
          dealer_phone: v.dealer_phone || null,
          dealer_lat: v.dealer_lat || null,
          dealer_lng: v.dealer_lng || null,
          listing_id: v.listing_id || null,
          listing_source: v.listing_source || null,
          listing_url: v.listing_url || null,
          vin: v.vin || null,
          heading: v.heading || null,
          photo_url: v.photo_url || null,
          marketcheck_payload: v.marketcheck_payload || null,
          condition: v.condition || null,
          dealer_stock: v.dealer_stock || null,
        }));

        // Upsert by id when present, otherwise by (user_id, vin)
        const withVin = payload.filter((row) => row.vin);
        const withoutVin = payload.filter((row) => !row.vin);

        // Upsert rows with VIN using (user_id, vin)
        if (withVin.length) {
          const { error: insertError } = await supabase
            .from("shared_vehicles")
            .upsert(withVin, { onConflict: "user_id,vin" });
          if (insertError) {
            throw insertError;
          }
        }

        // Upsert rows without VIN but with shared_from_vehicle_id using (user_id, shared_from_vehicle_id)
        const withoutVinButSource = withoutVin.filter(
          (row) => row.shared_from_vehicle_id
        );
        if (withoutVinButSource.length) {
          const { error: insertError } = await supabase
            .from("shared_vehicles")
            .upsert(withoutVinButSource, { onConflict: "user_id,shared_from_vehicle_id" });
          if (insertError) {
            throw insertError;
          }
        }

        // Rows with neither VIN nor shared_from_vehicle_id: insert plain (no conflict target)
        const orphanRows = withoutVin.filter((row) => !row.shared_from_vehicle_id);
        if (orphanRows.length) {
          const { error: insertError } = await supabase
            .from("shared_vehicles")
            .insert(orphanRows);
          if (insertError) {
            throw insertError;
          }
        }

        lastImportedShareRef.current = importKey;

        // Reload shared imported vehicles to show the newly imported ones
        const { data: refreshedData } = await supabase
          .from("shared_vehicles")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("inserted_at", { ascending: false });
        if (refreshedData) {
          setSharedImportedVehicles(refreshedData);
        }

        toast.push({
          kind: "success",
          title: "Shared vehicle added",
          detail: `${payload.length} vehicle(s) imported to My Shared Vehicles.`,
        });
      } catch (error: any) {
        toast.push({
          kind: "error",
          title: "Shared vehicle not imported",
          detail: error?.message || "Try again after signing in.",
        });
      }
    };

    runImport();
  }, [
    shareToken,
    currentUser,
    isLoadingSharedGarage,
    sharedGarageError,
    sharedGarageVehicles,
    sharedSavedVehicles,
    toast,
  ]);

  // Accept invite token (if provided in URL) once user is signed in
  useEffect(() => {
    if (!pendingInviteToken) return;

    if (!currentUser) {
      setShowAuthModal(true);
      setAuthMode("signin");
      return;
    }

    const clearInviteParams = () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      url.searchParams.delete("invite_token");
      window.history.replaceState({}, document.title, url.toString());
    };

    const accept = async () => {
      try {
        await acceptGarageInvite(pendingInviteToken);
        toast.push({
          kind: "success",
          title: "Invite accepted",
          detail: "You now have access to the shared garage.",
        });
        setPendingInviteToken(null);
        clearInviteParams();
        // Refresh accessible garage vehicles after accepting
        const vehicles = await getAccessibleGarageVehicles();
        setGarageVehicles(vehicles || []);
      } catch (error: any) {
        toast.push({
          kind: "error",
          title: "Unable to accept invite",
          detail: error?.message || "Please try again.",
        });
      }
    };

    accept();
  }, [pendingInviteToken, currentUser, toast]);

  const equityAllocation = useMemo(() => {
    const netTradeEquity = tradeAllowance - tradePayoff;
    const positiveEquityAmount = Math.max(0, netTradeEquity);
    const negativeEquityAmount = Math.abs(Math.min(0, netTradeEquity));
    const hasManualDecision =
      equityDecision.appliedAmount > 0 || equityDecision.cashoutAmount > 0;

    if (positiveEquityAmount > 0) {
      if (hasManualDecision) {
        const applied = Math.min(
          equityDecision.appliedAmount,
          positiveEquityAmount
        );
        const remaining = Math.max(positiveEquityAmount - applied, 0);
        const cashout = Math.min(equityDecision.cashoutAmount, remaining);
        return {
          appliedToBalance: applied,
          cashoutAmount: cashout,
          positiveEquity: positiveEquityAmount,
          negativeEquity: negativeEquityAmount,
          netTradeEquity,
          hasManualDecision,
        };
      }
      return {
        appliedToBalance: positiveEquityAmount,
        cashoutAmount: 0,
        positiveEquity: positiveEquityAmount,
        negativeEquity: negativeEquityAmount,
        netTradeEquity,
        hasManualDecision,
      };
    }

    return {
      appliedToBalance: netTradeEquity < 0 ? -negativeEquityAmount : 0,
      cashoutAmount: 0,
      positiveEquity: positiveEquityAmount,
      negativeEquity: negativeEquityAmount,
      netTradeEquity,
      hasManualDecision,
    };
  }, [
    tradeAllowance,
    tradePayoff,
    equityDecision.appliedAmount,
    equityDecision.cashoutAmount,
  ]);

  // Auto-sync: Clear garage vehicle toggles when trade allowance reaches $0
  useEffect(() => {
    if (tradeAllowance === 0 && selectedTradeInVehicles.size > 0) {
      resetTradeIn();
    }
  }, [tradeAllowance, selectedTradeInVehicles, resetTradeIn]);

  const effectiveAppliedTrade =
    equityAllocation.appliedToBalance > 0
      ? equityAllocation.appliedToBalance
      : 0;
  const effectiveTradeCashout =
    equityAllocation.cashoutAmount > 0 ? equityAllocation.cashoutAmount : 0;
  const initialEquityDecision: EquityDecision =
    equityAllocation.hasManualDecision || equityAllocation.positiveEquity === 0
      ? equityDecision
      : {
          action: "apply",
          appliedAmount: Math.max(0, equityAllocation.appliedToBalance),
          cashoutAmount: 0,
        };

  // Helper function to calculate monthly payment given parameters
  const calculateMonthlyPaymentFor = (params: {
    salePrice: number;
    cashDown: number;
    dealerFees: number;
    customerAddons: number;
    govtFees: number;
    appliedToBalance: number;
    cashoutAmount: number;
    stateTaxRate: number;
    countyTaxRate: number;
    apr: number;
    loanTerm: number;
  }): number => {
    const {
      salePrice: sp,
      cashDown: cd,
      dealerFees: df,
      customerAddons: ca,
      govtFees: gf,
      appliedToBalance: atb,
      cashoutAmount: co,
      stateTaxRate: str,
      countyTaxRate: ctr,
      apr: a,
      loanTerm: lt,
    } = params;

    // Calculate taxes
    const taxableBase = sp - atb + df + ca + gf;
    const stateTax = taxableBase * (str / 100);
    const countyTax = Math.min(taxableBase, 5000) * (ctr / 100);
    const totalTax = stateTax + countyTax;

    // Calculate amount financed
    const totalPrice = sp + df + ca + gf + totalTax;
    const downPayment = cd + atb;
    const financed = totalPrice - downPayment + co;

    if (financed <= 0 || a <= 0 || lt <= 0) {
      return 0;
    }

    // Monthly interest rate
    const monthlyRate = a / 100 / 12;

    // Monthly payment formula: P * [r(1 + r)^n] / [(1 + r)^n - 1]
    const payment =
      (financed * (monthlyRate * Math.pow(1 + monthlyRate, lt))) /
      (Math.pow(1 + monthlyRate, lt) - 1);

    return payment;
  };

  const calculateLoan = () => {
    let appliedToBalance = equityAllocation.appliedToBalance;
    let cashoutAmount = equityAllocation.cashoutAmount;

    // Calculate unpaid balance (before fees/taxes)
    const unpaid = salePrice - cashDown - appliedToBalance;
    setUnpaidBalance(unpaid);

    // Calculate taxes (based on sale price minus applied trade-in equity)
    const taxableBase =
      salePrice - appliedToBalance + dealerFees + customerAddons + govtFees;
    const stateTax = taxableBase * (stateTaxRate / 100);
    const countyTax = Math.min(taxableBase, 5000) * (countyTaxRate / 100); // FL caps county tax at $5k
    const totalTax = stateTax + countyTax;

    setTaxableBase(taxableBase);
    setStateTaxAmount(stateTax);
    setCountyTaxAmount(countyTax);
    setTotalTaxes(totalTax);

    // Calculate amount financed (includes fees, taxes, and cashout)
    const totalPrice =
      salePrice + dealerFees + customerAddons + govtFees + totalTax;
    const downPayment = cashDown + appliedToBalance;
    const financed = totalPrice - downPayment + cashoutAmount; // Add cashout to loan

    setAmountFinanced(financed);

    // Calculate cash due at signing
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
    const payment =
      (financed * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm))) /
      (Math.pow(1 + monthlyRate, loanTerm) - 1);

    setMonthlyPayment(payment);

    const total = payment * loanTerm;
    setTotalOfPayments(total);
    setFinanceCharge(total - financed);

    // Only update TIL baselines after lender APR has loaded
    // This prevents baselines from being set with the hard-coded 5.99% default
    if (hasLenderAprLoaded) {
      // Update TIL baselines and calculate diffs
      const tilValues = {
        apr: apr / 100, // Convert to decimal for hook
        term: loanTerm,
        financeCharge: total - financed,
        amountFinanced: financed,
        totalPayments: total,
        monthlyFinanceCharge: loanTerm > 0 ? (total - financed) / loanTerm : 0,
        monthlyPayment: payment,
      };
      updateBaselines(tilValues);
      calculateDiffs(tilValues);
    }
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
      vehiclePrice: salePrice || undefined, // Customer's offer
      dealerAskingPrice: selectedVehicleSaleValue || undefined, // Dealer's original asking price
      stockNumber: (selectedVehicle as any)?.stock_number || undefined,
      vehiclePhotoUrl: selectedVehicle?.photo_url || undefined,

      // Dealer details
      dealerName: selectedVehicle?.dealer_name || undefined,
      dealerPhone: selectedVehicle?.dealer_phone || undefined,
      dealerAddress: selectedVehicle?.dealer_address
        ? `${selectedVehicle.dealer_address}, ${
            selectedVehicle.dealer_city || ""
          }, ${selectedVehicle.dealer_state || ""} ${
            selectedVehicle.dealer_zip || ""
          }`.trim()
        : undefined,
      dealerEmail: selectedVehicle?.dealer_email || undefined,

      // Financing details
      apr: apr,
      termMonths: loanTerm,
      monthlyPayment: monthlyPayment,
      downPayment: cashDown,
      ratesEffectiveDate: ratesEffectiveDate || undefined,

      // Trade-in
      tradeValue: tradeAllowance || undefined,
      tradePayoff: tradePayoff || undefined,

      // Fees
      dealerFees: dealerFees || undefined,
      customerAddons: customerAddons || undefined,
      govtFees: govtFees || undefined,

      // Fee items breakdown
      dealerFeeItems: feeItems.dealer.length > 0 ? feeItems.dealer : undefined,
      customerAddonItems:
        feeItems.customer.length > 0 ? feeItems.customer : undefined,
      govtFeeItems: feeItems.gov.length > 0 ? feeItems.gov : undefined,

      // Generate offer name
      offerName: selectedVehicle
        ? `${selectedVehicle.year || ""} ${selectedVehicle.make || ""} ${
            selectedVehicle.model || ""
          }`.trim()
        : "Vehicle Offer",
    };
  };

  const handleSubmit = () => {
    // Check if user is authenticated
    if (!currentUser) {
      toast.push({
        kind: "warning",
        title: "Sign In Required",
        detail: "Please sign in to save and submit your offer",
      });
      setAuthMode("signin");
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
    const hasDecision =
      equityDecision.appliedAmount > 0 || equityDecision.cashoutAmount > 0;

    if (hasPositiveEquity && !hasDecision) {
      // Show positive equity modal first
      setShowPositiveEquityModal(true);
      return;
    }

    // Check for APR override before showing offer preview
    if (
      lenderBaselineApr !== null &&
      Math.abs(apr - lenderBaselineApr) >= 0.01
    ) {
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
    if (
      lenderBaselineApr !== null &&
      Math.abs(apr - lenderBaselineApr) >= 0.01
    ) {
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
        kind: "info",
        title: "APR Reset",
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
  const handleOfferSubmitWithProgress = async (
    leadData: LeadData,
    devMode: boolean = false
  ) => {
    // Close preview modal, open progress modal
    setShowOfferPreviewModal(false);
    setShowProgressModal(true);
    setProgressError(undefined);
    setSubmittedOfferId(undefined);

    // Add devMode flag to leadData
    const submissionData = { ...leadData, devMode };

    // Submit with progress callbacks
    const result = await submitOfferWithProgress(
      submissionData,
      (update: SubmissionProgress) => {
        setProgressStage(update.stage);
        setProgressPercent(update.progress);
        if (update.error) {
          setProgressError(update.error);
        }
        if (update.offerId) {
          setSubmittedOfferId(update.offerId);
        }
      }
    );

    if (result.ok && result.offerId) {
      // Success - keep progress modal open to show complete state
      setSubmittedOfferId(result.offerId);
      setHighlightOfferId(result.offerId);
    } else {
      // Error - show error in progress modal
      setProgressError(result.error || "Failed to submit offer");
    }
  };

  // Handle "View My Offers" button from success modal
  const handleViewMyOffers = () => {
    setShowProgressModal(false);
    setShowMyOffersModal(true);
  };

  const filteredSavedVehicles = savedVehicles;
  // Filter shared vehicles to only show current session's share link vehicle(s)
  const filteredSharedImportedVehicles = useMemo(() => {
    // If no active share session, don't show any shared vehicles in dropdown
    if (!shareToken) return [];

    // Filter to vehicles from the current share token
    let filtered = sharedImportedVehicles.filter(
      (v) => v.share_token === shareToken
    );

    // If a specific vehicle was shared (single share), further filter to just that one
    if (sharedVehicleId && filtered.length > 0) {
      const singleVehicle = filtered.filter(
        (v) => v.shared_from_vehicle_id === sharedVehicleId
      );
      // Only use the filter if we found a match
      if (singleVehicle.length > 0) {
        filtered = singleVehicle;
      }
    }

    return filtered;
  }, [sharedImportedVehicles, shareToken, sharedVehicleId]);
  const normalizedSharedGarageVehicles = useMemo(
    () =>
      sharedGarageVehicles.map((v) => ({
        ...normalizeDealerData(v),
        __source: "garage",
        source: "garage" as const,
        access_role: v.access_role || "viewer",
        shared_from_garage_owner_id:
          v.shared_from_garage_owner_id || v.garage_owner_id || v.user_id,
        shared_from_vehicle_id: v.shared_from_vehicle_id || v.id,
      })),
    [sharedGarageVehicles]
  );
  const normalizedSharedSavedVehicles = useMemo(
    () =>
      sharedSavedVehicles.map((v) => ({
        ...normalizeDealerData(v),
        __source: "shared",
        source: "shared" as const,
      })),
    [sharedSavedVehicles]
  );

  const normalizedOwnedGarageVehicles = useMemo(
    () =>
      garageVehicles.map((v) => ({
        ...normalizeDealerData(v),
        __source: "garage",
        source: "garage" as const,
      })),
    [garageVehicles]
  );

  const filteredGarageVehicles = useMemo(() => {
    if (!shareToken) return normalizedOwnedGarageVehicles;
    const seen = new Set<string>();
    const combined: any[] = [];
    normalizedSharedGarageVehicles.forEach((v) => {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        combined.push(v);
      }
    });
    normalizedOwnedGarageVehicles.forEach((v) => {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        combined.push(v);
      }
    });
    return combined;
  }, [shareToken, normalizedOwnedGarageVehicles, normalizedSharedGarageVehicles]);

  const totalStoredVehicles = savedVehicles.length + filteredGarageVehicles.length;
  const filteredStoredCount = totalStoredVehicles;

  // Apply profile preferences immediately after a successful save so sliders reflect the new data.
  const handleProfileSave = useCallback(
    async (data: Partial<typeof profile>) => {
      await saveProfile(data);

      const mergedProfile = {
        ...(profile || {}),
        ...data,
      };

      if (
        mergedProfile.preferred_down_payment !== undefined &&
        mergedProfile.preferred_down_payment !== null
      ) {
        applyProfilePreferences(mergedProfile as any);
      }
    },
    [saveProfile, profile, applyProfilePreferences]
  );

  const isGarageSelectedVehicle = selectedVehicle?.__source === "garage";

  const getVehicleSalePrice = (vehicle: any): number | null => {
    if (!vehicle) return null;
    if (vehicle.__source === "garage") {
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

  const selectedVehicleSaleValue = useMemo(
    () => (selectedVehicle ? getVehicleSalePrice(selectedVehicle) : null),
    [selectedVehicle]
  );
  const selectedTradeIns = useMemo(
    () =>
      Array.from(selectedTradeInVehicles)
        .map((vehicleId) => garageVehicles.find((v) => v.id === vehicleId))
        .filter(Boolean)
        .map((v) => ({
          id: v!.id,
          vin: v!.vin,
          estimated_value: v!.estimated_value || v!.asking_price || 0,
          payoff_amount: v!.payoff_amount || 0,
        })),
    [selectedTradeInVehicles, garageVehicles]
  );
  const hasTradeInSelected = selectedTradeIns.length > 0;

  const feeEngineUserProfile = useMemo(() => {
    if (!profile) return undefined;
    return {
      state_code: profile.state_code || profile.state,
      county_name: profile.county_name || profile.county,
      city: profile.city || undefined,
      zip_code: profile.zip_code || undefined,
    };
  }, [profile]);

  // Reset vehicle meta only when selection is cleared (not when switching vehicles)
  // Weight is now handled by selection handlers + background NHTSA fetch
  useEffect(() => {
    if (!selectedVehicle) {
      // Only reset weight when vehicle is cleared, not when switching
      setEstimatedWeight(undefined);
      setVehicleWeightLbs(undefined);
      setWeightSource(undefined);
      setVehicleBodyType("auto");
      setNhtsaBodyClass(undefined);
      setNhtsaGvwrClass(undefined);
      setNhtsaRawCurbWeight(undefined);
      setGvwrEstimateDetail(undefined);
    }
    // Note: Weight and body type are now set by handleSelectSavedVehicle,
    // handleSelectSharedVehicle, and handleSelectGarageVehicle
  }, [selectedVehicle]);

  const feeEngineSelectedVehicle = useMemo(() => {
    if (!selectedVehicle) return undefined;

    const inferredBodyType =
      (selectedVehicle.body_type ||
        selectedVehicle.body_class ||
        selectedVehicle.vehicle_type ||
        '') as string;
    const normalizedBodyType =
      vehicleBodyType ||
      (typeof inferredBodyType === 'string' && inferredBodyType.toLowerCase().includes('truck')
        ? 'truck'
        : typeof inferredBodyType === 'string' && inferredBodyType.toLowerCase().includes('van')
        ? 'van'
        : 'sedan');

    const normalizedWeight =
      vehicleWeightLbs ||
      selectedVehicle.weight_lbs ||
      selectedVehicle.vehicle_weight_lbs ||
      undefined;

    const rawCondition =
      selectedVehicle.condition ||
      selectedVehicle.vehicle_condition ||
      selectedVehicle.usage ||
      "";
    const normalizedCondition =
      typeof rawCondition === "string"
        ? rawCondition.toLowerCase() === "new"
          ? "new"
          : rawCondition.toLowerCase() === "used"
          ? "used"
          : undefined
        : undefined;

    return {
      vin: selectedVehicle.vin,
      year: selectedVehicle.year,
      make: selectedVehicle.make,
      model: selectedVehicle.model,
      trim: selectedVehicle.trim,
      condition: normalizedCondition,
      odometer:
        selectedVehicle.mileage ||
        selectedVehicle.odometer ||
        selectedVehicle.odometer_reading ||
        undefined,
      bodyType: normalizedBodyType,
      weightLbs: normalizedWeight ? Number(normalizedWeight) : undefined,
    };
  }, [selectedVehicle, vehicleBodyType, vehicleWeightLbs]);

  const [scenarioOverrides, setScenarioOverrides] = useState<{
    cashPurchase?: boolean;
    includeTradeIn?: boolean;
    tagMode?: "new_plate" | "transfer_existing_plate" | "temp_tag";
    firstTimeRegistration?: boolean;
    enabled?: boolean;
  }>({});

  // Dev snapshot logger (disabled in production)
  const logScenarioSnapshot = useCallback(
    (_label: string, _extras: Record<string, any> = {}) => {
      // Logging disabled
    },
    []
  );

  useEffect(() => {
    if (scenarioOverrides?.enabled === false) {
      setFeeEngineResult(null);
      setFeeItems("gov", []);
      setSliderValue("govtFees", 0, true);
    }
  }, [scenarioOverrides?.enabled, setFeeEngineResult, setFeeItems, setSliderValue]);

  // Keep trade-in pill in sync with My Garage trade-in toggle
  useEffect(() => {
    setScenarioOverrides((prev) => {
      const includeTradeIn = hasTradeInSelected;
      const next: typeof prev = { ...prev };
      next.includeTradeIn = includeTradeIn;

      // When a trade-in is selected, assume plate transfer by default
      if (includeTradeIn) {
        next.tagMode = 'transfer_existing_plate';
      } else if (next.tagMode === 'transfer_existing_plate') {
        next.tagMode = undefined;
      }

      if (
        prev.includeTradeIn === next.includeTradeIn &&
        prev.tagMode === next.tagMode
      ) {
        return prev;
      }

      return next;
    });
  }, [hasTradeInSelected]);

  // Default tag mode to new plate when there is no trade selected
  useEffect(() => {
    if (!hasTradeInSelected) {
      setScenarioOverrides((prev) => {
        if (prev.tagMode === undefined) {
          return { ...prev, tagMode: "new_plate" };
        }
        return prev;
      });
    }
  }, [hasTradeInSelected]);

  const {
    scenarioResult: feeScenarioResult,
    isCalculating: isCalculatingFees,
    error: feeEngineError,
    recalculate: recalcFeeEngine,
  } = useFeeEngine({
    salePrice,
    cashDown,
    loanTerm,
    apr,
    selectedTradeInVehicles: selectedTradeIns,
    userProfile: feeEngineUserProfile,
    selectedVehicle: feeEngineSelectedVehicle
      ? {
          ...feeEngineSelectedVehicle,
          bodyType: vehicleBodyType || feeEngineSelectedVehicle.bodyType,
          weightLbs:
            vehicleWeightLbs ?? feeEngineSelectedVehicle.weightLbs,
        }
      : undefined,
    preferredLender:
      lenderOptions.find((opt) => opt.value === lender)?.label || lender,
    enabled: Boolean(feeEngineUserProfile?.state_code),
    scenarioOverrides,
  });

  const lastFeeEngineErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (feeScenarioResult && !isCalculatingFees) {
      applyFeeEngineResult(feeScenarioResult);
      lastFeeEngineErrorRef.current = null;
      logScenarioSnapshot("engine_result_applied", {
        govFees: feeScenarioResult.totals.governmentFees,
        salesTax: feeScenarioResult.totals.salesTax,
        totalFees: feeScenarioResult.totals.totalFees,
        tagMode: feeScenarioResult.detectedScenario.isTagTransfer
          ? "transfer_existing_plate"
          : scenarioOverrides.tagMode,
      });
    }
  }, [feeScenarioResult, isCalculatingFees, applyFeeEngineResult, logScenarioSnapshot, scenarioOverrides.tagMode]);

  useEffect(() => {
    if (feeEngineError && feeEngineError.message !== lastFeeEngineErrorRef.current) {
      lastFeeEngineErrorRef.current = feeEngineError.message;
      setFeeEngineResult(null);
      toast.push({
        kind: "error",
        title: "Fee engine error",
        detail: feeEngineError.message,
      });
    }
  }, [feeEngineError, setFeeEngineResult, toast]);
  const salePriceState1Baseline = useMemo(() => {
    if (
      selectedVehicleSaleValue != null &&
      Number.isFinite(Number(selectedVehicleSaleValue))
    ) {
      return Number(selectedVehicleSaleValue);
    }
    return null;
  }, [selectedVehicleSaleValue]);

  // Compute diff baseline using effective baseline (State 2 if locked, otherwise State 1)
  const salePriceDiffBaseline = useMemo(() => {
    const effectiveBaseline = getEffectiveBaseline("salePrice");
    return effectiveBaseline > 0 ? effectiveBaseline : null;
  }, [
    getEffectiveBaseline,
    sliders.salePrice.baseline,
    sliders.salePrice.lockedBaseline,
    sliders.salePrice.isLocked,
  ]);

  const [salePricePaymentBaseline, setSalePricePaymentBaseline] = useState<
    number | null
  >(null);
  const [salePricePaymentDiffOverride, setSalePricePaymentDiffOverride] =
    useState<number | null>(null);

  useEffect(() => {
    if (salePriceDiffBaseline == null) {
      if (salePricePaymentBaseline !== null) {
        setSalePricePaymentBaseline(null);
      }
      if (salePricePaymentDiffOverride !== null) {
        setSalePricePaymentDiffOverride(null);
      }
      return;
    }
    if (salePricePaymentBaseline == null && monthlyPayment > 0) {
      setSalePricePaymentBaseline(monthlyPayment);
    }
  }, [
    salePriceDiffBaseline,
    salePricePaymentBaseline,
    monthlyPayment,
    salePricePaymentDiffOverride,
  ]);

  useEffect(() => {
    if (
      salePriceDiffBaseline == null ||
      salePricePaymentBaseline == null ||
      monthlyPayment <= 0
    ) {
      if (salePricePaymentDiffOverride !== null) {
        setSalePricePaymentDiffOverride(null);
      }
      return;
    }

    // Recompute the baseline payment at the sale price baseline using current fees/taxes
    const baselinePayment = calculateMonthlyPaymentFor({
      salePrice: salePriceDiffBaseline,
      cashDown,
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });

    const valueDiff = salePrice - salePriceDiffBaseline;
    const atBaseline = Math.abs(valueDiff) < 0.01;

    if (atBaseline) {
      setSalePricePaymentDiffOverride(null);
      return;
    }
    setSalePricePaymentDiffOverride(monthlyPayment - baselinePayment);
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    equityAllocation.appliedToBalance,
    equityAllocation.cashoutAmount,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    salePriceDiffBaseline,
    salePricePaymentBaseline,
    monthlyPayment,
    salePricePaymentDiffOverride,
  ]);

  // Calculate APR baseline payment (for pure APR diff tooltip)
  // Uses baseline sale price to isolate APR impact from sale price changes
  const aprBaselinePayment = useMemo(() => {
    // Only show diff if user has deviated from lender APR
    if (
      lenderBaselineApr == null ||
      Math.abs(apr - lenderBaselineApr) < 0.001
    ) {
      return null;
    }

    // Use baseline sale price to isolate pure APR impact
    const baselineSalePriceValue = salePriceDiffBaseline ?? salePrice;

    return calculateMonthlyPaymentFor({
      salePrice: baselineSalePriceValue, // Use BASELINE sale price (key change)
      cashDown,
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr: lenderBaselineApr, // Use lender baseline APR
      loanTerm,
    });
  }, [
    lenderBaselineApr,
    apr,
    salePriceDiffBaseline,
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    loanTerm,
    equityAllocation,
  ]);

  const baselineSalePrice = sliders.salePrice.baseline;
  const hasCustomApr =
    lenderBaselineApr !== null &&
    Math.abs(apr - lenderBaselineApr) >= 0.001 &&
    !useLowestApr;

  // Calculate pure APR diff (isolates APR impact using baseline sale price for both calculations)
  // This is used in the tooltip breakdown
  const aprPaymentDiffPure = useMemo(() => {
    if (!hasCustomApr || lenderBaselineApr == null) return null;

    const baselineSalePriceValue = salePriceDiffBaseline ?? salePrice;

    // Payment with CURRENT APR + baseline sale price
    const paymentWithCurrentApr = calculateMonthlyPaymentFor({
      salePrice: baselineSalePriceValue,
      cashDown,
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr: apr, // Current APR
      loanTerm,
    });

    // Payment with LENDER APR + baseline sale price (already calculated as aprBaselinePayment)
    const paymentWithLenderApr = aprBaselinePayment;

    return paymentWithLenderApr != null
      ? paymentWithCurrentApr - paymentWithLenderApr
      : null;
  }, [
    hasCustomApr,
    lenderBaselineApr,
    salePriceDiffBaseline,
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    equityAllocation,
    aprBaselinePayment,
  ]);

  // Calculate total buyer perspective diff (current payment vs lender baseline with CURRENT sliders)
  // This shows the total monthly payment change the buyer experiences
  const aprPaymentDiffFromLender = useMemo(() => {
    if (!hasCustomApr || lenderBaselineApr == null) return null;

    // Calculate baseline payment with lender APR + CURRENT slider values
    const baselinePaymentWithCurrentSliders = calculateMonthlyPaymentFor({
      salePrice, // Use CURRENT sale price
      cashDown,
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr: lenderBaselineApr, // Use lender baseline APR
      loanTerm,
    });

    return monthlyPayment - baselinePaymentWithCurrentSliders;
  }, [
    hasCustomApr,
    lenderBaselineApr,
    monthlyPayment,
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    loanTerm,
    equityAllocation,
  ]);

  const handleResetSalePrice = useCallback(() => {
    resetSlider("salePrice");
  }, [resetSlider]);

  // Calculate baseline payments for all sliders (for payment diff tooltips)
  const cashDownBaselinePayment = useMemo(() => {
    const baseline = sliders.cashDown.baseline;
    if (baseline === cashDown || !Number.isFinite(baseline)) return null;

    return calculateMonthlyPaymentFor({
      salePrice,
      cashDown: baseline, // Use baseline cash down
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    sliders.cashDown.baseline,
    equityAllocation,
  ]);

  const tradeAllowanceBaselinePayment = useMemo(() => {
    const baseline = sliders.tradeAllowance.baseline;
    if (baseline === tradeAllowance || !Number.isFinite(baseline)) return null;

    // Trade allowance affects appliedToBalance in equityAllocation
    // Calculate baseline equity allocation with baseline trade allowance
    const baselineNetTradeEquity = baseline - tradePayoff;
    const baselinePositiveEquity = Math.max(0, baselineNetTradeEquity);
    const baselineNegativeEquity = Math.abs(
      Math.min(0, baselineNetTradeEquity)
    );
    const hasManualDecision =
      equityDecision.appliedAmount > 0 || equityDecision.cashoutAmount > 0;

    let baselineAppliedToBalance = 0;
    let baselineCashoutAmount = 0;

    if (baselinePositiveEquity > 0) {
      if (hasManualDecision) {
        baselineAppliedToBalance = Math.min(
          equityDecision.appliedAmount,
          baselinePositiveEquity
        );
        const remaining = Math.max(
          baselinePositiveEquity - baselineAppliedToBalance,
          0
        );
        baselineCashoutAmount = Math.min(
          equityDecision.cashoutAmount,
          remaining
        );
      } else {
        baselineAppliedToBalance = baselinePositiveEquity;
      }
    } else {
      baselineAppliedToBalance = baselineNegativeEquity;
    }

    return calculateMonthlyPaymentFor({
      salePrice,
      cashDown,
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: baselineAppliedToBalance,
      cashoutAmount: baselineCashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    sliders.tradeAllowance.baseline,
    tradeAllowance,
    tradePayoff,
    equityDecision,
  ]);

  const dealerFeesBaselinePayment = useMemo(() => {
    const baseline = sliders.dealerFees.baseline;
    if (baseline === dealerFees || !Number.isFinite(baseline)) return null;

    return calculateMonthlyPaymentFor({
      salePrice,
      cashDown,
      dealerFees: baseline, // Use baseline dealer fees
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    sliders.dealerFees.baseline,
    equityAllocation,
  ]);

  const customerAddonsBaselinePayment = useMemo(() => {
    const baseline = sliders.customerAddons.baseline;
    if (baseline === customerAddons || !Number.isFinite(baseline)) return null;

    return calculateMonthlyPaymentFor({
      salePrice,
      cashDown,
      dealerFees,
      customerAddons: baseline, // Use baseline customer add-ons
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    sliders.customerAddons.baseline,
    equityAllocation,
  ]);

  const govtFeesBaselinePayment = useMemo(() => {
    const baseline = sliders.govtFees.baseline;
    if (baseline === govtFees || !Number.isFinite(baseline)) return null;

    return calculateMonthlyPaymentFor({
      salePrice,
      cashDown,
      dealerFees,
      customerAddons,
      govtFees: baseline, // Use baseline gov't fees
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    sliders.govtFees.baseline,
    equityAllocation,
  ]);

  // Savings panel calculations - all expressed as MONTHLY savings
  // These use the actual monthly payment diffs that are calculated for the sliders
  const savingsFromSalePrice = useMemo(() => {
    // Sale price savings = reduction in monthly payment from baseline
    // salePricePaymentDiffOverride is positive when payment increases (bad)
    // So negate it to get savings (positive = good)
    if (salePricePaymentDiffOverride == null) return 0;
    const savings = -salePricePaymentDiffOverride;
    return savings > 0 ? savings : 0;
  }, [salePricePaymentDiffOverride]);

  const savingsFromTrade = useMemo(() => {
    // Trade allowance savings = monthly payment reduction from baseline trade allowance
    // This matches what the slider shows (diff from baseline)
    if (tradeAllowanceBaselinePayment == null) return 0;
    const savings = tradeAllowanceBaselinePayment - monthlyPayment;
    return savings > 0 ? savings : 0;
  }, [tradeAllowanceBaselinePayment, monthlyPayment]);

  const savingsFromApr = useMemo(() => {
    // APR savings = monthly payment reduction vs lender baseline APR
    // aprPaymentDiffFromLender is positive when payment increases (bad for customer)
    // So negate it to get savings (positive = good)
    if (aprPaymentDiffFromLender == null) return 0;
    const savings = -aprPaymentDiffFromLender;
    return savings > 0 ? savings : 0;
  }, [aprPaymentDiffFromLender]);

  const totalSavings = savingsFromSalePrice + savingsFromTrade + savingsFromApr;
  const savingsSaleBaseline =
    salePriceDiffBaseline ?? selectedVehicleSaleValue ?? salePrice;
  const savingsTradeBaseline = Number.isFinite(sliders.tradeAllowance.baseline)
    ? sliders.tradeAllowance.baseline
    : tradeAllowance;
  const savingsAprBaseline = lenderBaselineApr ?? apr;

  // Get current lender name for display
  const currentLenderName = useMemo(() => {
    if (useLowestApr && bestLenderLongName) {
      return bestLenderLongName;
    }
    const lenderOption = lenderOptions.find((opt) => opt.value === lender);
    return lenderOption?.label || "Lender";
  }, [useLowestApr, bestLenderLongName, lenderOptions, lender]);

  // Calculate State 0 (persistent) baseline payments for diff display
  // These always compare against the original/asking values, never update

  // Cash Down State 0: Always $0 down
  const cashDownState0Payment = useMemo(() => {
    if (cashDown === 0) return null; // Already at State 0

    return calculateMonthlyPaymentFor({
      salePrice,
      cashDown: 0, // State 0 = $0 down
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    equityAllocation,
  ]);

  // Sale Price State 0: Original asking price
  const salePriceState0Payment = useMemo(() => {
    const state0SalePrice = selectedVehicleSaleValue ?? salePrice;
    if (Math.abs(salePrice - state0SalePrice) < 0.01) return null; // At State 0

    return calculateMonthlyPaymentFor({
      salePrice: state0SalePrice, // Use original asking price
      cashDown,
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: equityAllocation.appliedToBalance,
      cashoutAmount: equityAllocation.cashoutAmount,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    selectedVehicleSaleValue,
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    equityAllocation,
  ]);

  // Calculate persistent Sale Price diff for APR control display
  const salePriceState0Diff = useMemo(() => {
    if (salePriceState0Payment == null) return null;
    return monthlyPayment - salePriceState0Payment;
  }, [monthlyPayment, salePriceState0Payment]);

  // Trade Allowance State 0: Always $0 trade-in
  const tradeAllowanceState0Payment = useMemo(() => {
    if (tradeAllowance === 0) return null; // Already at State 0

    // Calculate equity with NO trade-in (State 0)
    const state0NetEquity = 0 - tradePayoff; // Usually negative if there's a payoff
    const state0PositiveEquity = Math.max(0, state0NetEquity);
    const state0NegativeEquity = Math.abs(Math.min(0, state0NetEquity));

    // With no trade-in, negative equity (payoff) is rolled into loan
    const state0AppliedToBalance = state0NegativeEquity;

    return calculateMonthlyPaymentFor({
      salePrice,
      cashDown,
      dealerFees,
      customerAddons,
      govtFees,
      appliedToBalance: state0AppliedToBalance,
      cashoutAmount: 0,
      stateTaxRate,
      countyTaxRate,
      apr,
      loanTerm,
    });
  }, [
    salePrice,
    cashDown,
    dealerFees,
    customerAddons,
    govtFees,
    stateTaxRate,
    countyTaxRate,
    apr,
    loanTerm,
    tradeAllowance,
    tradePayoff,
  ]);

  const selectedVehicleSaleLabel = isGarageSelectedVehicle
    ? "Trade Value"
    : "Sale Price";

  const saleValueColor = isGarageSelectedVehicle
    ? "text-blue-600"
    : "text-green-600";

  const selectedVehicleMileage =
    selectedVehicle?.mileage ?? selectedVehicle?.miles ?? null;

  const selectedVehiclePayoff = isGarageSelectedVehicle
    ? parseNumericValue(selectedVehicle?.payoff_amount)
    : null;

  const formatCurrencyWithCents = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const renderTilStatCard = ({
    label,
    value,
    helper,
    diff,
  }: {
    label: string;
    value: string;
    helper: string;
    diff?: TilDiff | null;
  }) => (
    <div
      className="rounded-2xl border border-white/10 p-5 text-center bg-white/5 backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-emerald-400/30 focus:border-emerald-400/50 focus:outline-none cursor-default"
      tabIndex={0}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-300/70">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-white tracking-tight">
        {value}
      </div>
      {diff && diff.isSignificant && (
        <div
          className={`text-xs font-semibold mt-1 ${
            diff.isPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {diff.isPositive ? "↓" : "↑"} {diff.formatted}
        </div>
      )}
      <div className="mt-2 text-xs text-white/50">{helper}</div>
    </div>
  );

  // Handle selecting a saved vehicle from dropdown
  const handleSelectSavedVehicle = async (vehicle: any) => {
    // Clear previous diff
    setVehicleDiff(null);

    const normalized = { ...normalizeDealerData(vehicle), __source: "saved" };
    setNhtsaBodyClass(undefined);
    setNhtsaGvwrClass(undefined);
    setNhtsaRawCurbWeight(undefined);
    setGvwrEstimateDetail(undefined);
    setSelectedVehicle(normalized);
    const vehicleVin = vehicle.vin || "";
    setVin(vehicleVin);
    setShowVehicleDropdown(false);
    const condition =
      normalized.condition?.toLowerCase() === "new" ? "new" : "used";
    setVehicleCondition(condition as "new" | "used");

    const saleValue = getVehicleSalePrice(vehicle);
    if (saleValue != null) {
      setSliderValue("salePrice", saleValue, true);
    }

    // Auto-apply vehicle weight data for fee calculations
    const weightData = extractVehicleWeightData(vehicle);
    setEstimatedWeight(weightData.estimatedWeight);
    setWeightSource(weightData.weightSource);
    setVehicleWeightLbs(weightData.vehicleWeightLbs);
    setVehicleBodyType(weightData.vehicleBodyType);

    // Background NHTSA lookup if no stored weight and VIN available
    if (!weightData.estimatedWeight && vehicleVin.length >= 11) {
      fetchNHTSAWeight(vehicleVin).then((nhtsaData) => {
        if (nhtsaData?.estimatedWeight) {
          const bracket = findWeightBracket(nhtsaData.estimatedWeight, nhtsaData.bodyClass);
          setEstimatedWeight(nhtsaData.estimatedWeight);
          setWeightSource(nhtsaData.weightSource);
          setNhtsaBodyClass(nhtsaData.bodyClass);
          setNhtsaGvwrClass(nhtsaData.gvwrClass);
          setNhtsaRawCurbWeight(nhtsaData.rawCurbWeight);
          setGvwrEstimateDetail(nhtsaData.gvwrEstimateDetail);
          setVehicleWeightLbs(bracket);
          setVehicleBodyType(nhtsaData.usesTruckSchedule ? 'truck' : 'auto');
        }
      });
    }

    // Note: calculateLoan() will be called automatically by useEffect when salePrice updates

    toast.push({
      kind: "success",
      title: "Vehicle Selected!",
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });

    // Check if vehicle data needs refresh (stale or missing photo)
    const { needsRefresh, reason } = savedVehiclesCache.checkNeedsRefresh(vehicle, 7);

    console.log('[Smart Refresh] Vehicle:', vehicle.vin, {
      needsRefresh,
      reason,
      hasVin: vehicleVin.length >= 11,
      hasId: !!vehicle.id,
      photo_url: vehicle.photo_url,
      last_refreshed_at: vehicle.last_refreshed_at
    });

    if (needsRefresh && vehicleVin.length >= 11 && vehicle.id) {
      setIsRefreshingVehicle(true);

      try {
        console.log('[Smart Refresh] Starting refresh for vehicle ID:', vehicle.id);
        const refreshResult = await savedVehiclesCache.refreshVehicleFromMarketCheck(
          vehicle.id,
          marketCheckCache,
          { zip: locationDetails?.zipCode || undefined }
        );
        console.log('[Smart Refresh] Result:', refreshResult);

        if (refreshResult.listingUnavailable) {
          toast.push({
            kind: "warning",
            title: "Listing No Longer Available",
            detail: "This vehicle may have been sold or removed from the market.",
          });
        } else if (refreshResult.diff) {
          // Update selected vehicle with refreshed data
          const updatedVehicle = { ...normalizeDealerData(refreshResult.vehicle), __source: "saved" };
          setSelectedVehicle(updatedVehicle);
          setVehicleDiff(refreshResult.diff);

          // Update sale price if it changed
          if (refreshResult.diff.asking_price) {
            setSliderValue("salePrice", refreshResult.diff.asking_price.now, true);
          }

          // Build diff message
          const changes: string[] = [];
          if (refreshResult.diff.asking_price) {
            const priceChange = refreshResult.diff.asking_price.change;
            const direction = priceChange < 0 ? "dropped" : "increased";
            changes.push(`Price ${direction} by $${Math.abs(priceChange).toLocaleString()}`);
          }
          if (refreshResult.diff.mileage) {
            changes.push(`Mileage updated to ${refreshResult.diff.mileage.now.toLocaleString()}`);
          }
          if (refreshResult.diff.photo_url) {
            changes.push("Photo now available");
          }

          toast.push({
            kind: refreshResult.diff.asking_price?.change < 0 ? "success" : "info",
            title: "Vehicle Data Updated",
            detail: changes.join(", "),
          });
        } else if (reason === 'missing_photo') {
          // Update vehicle data regardless
          const updatedVehicle = { ...normalizeDealerData(refreshResult.vehicle), __source: "saved" };
          setSelectedVehicle(updatedVehicle);

          if (refreshResult.vehicle?.photo_url) {
            toast.push({
              kind: "success",
              title: "Photo Retrieved",
              detail: "Vehicle photo is now available.",
            });
          } else {
            toast.push({
              kind: "info",
              title: "Data Refreshed",
              detail: "No photo available for this vehicle in MarketCheck.",
            });
          }
        } else if (reason === 'never_refreshed' || reason === 'stale_data') {
          // Data was refreshed but no changes - update vehicle silently
          const updatedVehicle = { ...normalizeDealerData(refreshResult.vehicle), __source: "saved" };
          setSelectedVehicle(updatedVehicle);
        }
      } catch (error) {
        console.error("Failed to refresh vehicle:", error);
        // Don't show error toast - vehicle is still usable with cached data
      } finally {
        setIsRefreshingVehicle(false);
      }
    }
  };

  // Handle selecting a shared saved vehicle (read-only source)
  const handleSelectSharedVehicle = (vehicle: any) => {
    const normalized = { ...normalizeDealerData(vehicle), __source: "shared" };
    setNhtsaBodyClass(undefined);
    setNhtsaGvwrClass(undefined);
    setNhtsaRawCurbWeight(undefined);
    setGvwrEstimateDetail(undefined);
    setSelectedVehicle(normalized);
    const vehicleVin = vehicle.vin || "";
    setVin(vehicleVin);
    setShowVehicleDropdown(false);
    const condition =
      normalized.condition?.toLowerCase() === "new" ? "new" : "used";
    setVehicleCondition(condition as "new" | "used");

    const saleValue = getVehicleSalePrice(normalized);
    if (saleValue != null) {
      setSliderValue("salePrice", saleValue, true);
    }

    // Auto-apply vehicle weight data for fee calculations
    const weightData = extractVehicleWeightData(vehicle);
    setEstimatedWeight(weightData.estimatedWeight);
    setWeightSource(weightData.weightSource);
    setVehicleWeightLbs(weightData.vehicleWeightLbs);
    setVehicleBodyType(weightData.vehicleBodyType);

    // Background NHTSA lookup if no stored weight and VIN available
    if (!weightData.estimatedWeight && vehicleVin.length >= 11) {
      fetchNHTSAWeight(vehicleVin).then((nhtsaData) => {
        if (nhtsaData?.estimatedWeight) {
          const bracket = findWeightBracket(nhtsaData.estimatedWeight, nhtsaData.bodyClass);
          setEstimatedWeight(nhtsaData.estimatedWeight);
          setWeightSource(nhtsaData.weightSource);
          setNhtsaBodyClass(nhtsaData.bodyClass);
          setNhtsaGvwrClass(nhtsaData.gvwrClass);
          setNhtsaRawCurbWeight(nhtsaData.rawCurbWeight);
          setGvwrEstimateDetail(nhtsaData.gvwrEstimateDetail);
          setVehicleWeightLbs(bracket);
          setVehicleBodyType(nhtsaData.usesTruckSchedule ? 'truck' : 'auto');
        }
      });
    }

    toast.push({
      kind: "success",
      title: "Shared vehicle selected",
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  const handleSelectGarageVehicle = (vehicle: any) => {
    const normalized = { ...normalizeDealerData(vehicle), __source: "garage" };
    setNhtsaBodyClass(undefined);
    setNhtsaGvwrClass(undefined);
    setNhtsaRawCurbWeight(undefined);
    setGvwrEstimateDetail(undefined);
    setSelectedVehicle(normalized);
    const vehicleVin = vehicle.vin || "";
    setVin(vehicleVin);
    setShowVehicleDropdown(false);
    const condition =
      normalized.condition?.toLowerCase() === "new" ? "new" : "used";
    setVehicleCondition(condition as "new" | "used");

    // Use store action to apply garage vehicle (sets values + baselines)
    applyGarageVehicle(
      vehicle,
      FEATURE_FLAGS.autoPopulateSalePrice &&
        FEATURE_FLAGS.useTradeValueForGarageSalePrice
    );

    // Auto-apply vehicle weight data for fee calculations
    const weightData = extractVehicleWeightData(vehicle);
    setEstimatedWeight(weightData.estimatedWeight);
    setWeightSource(weightData.weightSource);
    setVehicleWeightLbs(weightData.vehicleWeightLbs);
    setVehicleBodyType(weightData.vehicleBodyType);

    // Background NHTSA lookup if no stored weight and VIN available
    if (!weightData.estimatedWeight && vehicleVin.length >= 11) {
      fetchNHTSAWeight(vehicleVin).then((nhtsaData) => {
        if (nhtsaData?.estimatedWeight) {
          const bracket = findWeightBracket(nhtsaData.estimatedWeight, nhtsaData.bodyClass);
          setEstimatedWeight(nhtsaData.estimatedWeight);
          setWeightSource(nhtsaData.weightSource);
          setNhtsaBodyClass(nhtsaData.bodyClass);
          setNhtsaGvwrClass(nhtsaData.gvwrClass);
          setNhtsaRawCurbWeight(nhtsaData.rawCurbWeight);
          setGvwrEstimateDetail(nhtsaData.gvwrEstimateDetail);
          setVehicleWeightLbs(bracket);
          setVehicleBodyType(nhtsaData.usesTruckSchedule ? 'truck' : 'auto');
        }
      });
    }

    // Note: calculateLoan() will be called automatically by useEffect when state updates

    toast.push({
      kind: "success",
      title: "Garage Vehicle Selected!",
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  const handleApplyGarageVehicleAsTrade = (vehicle: any) => {
    // Use store action to apply garage vehicle (sets values + baselines + toggles selection)
    applyGarageVehicle(
      vehicle,
      FEATURE_FLAGS.autoPopulateSalePrice &&
        FEATURE_FLAGS.useTradeValueForGarageSalePrice
    );
    setShowVehicleDropdown(false);

    setTimeout(() => calculateLoan(), 0);

    toast.push({
      kind: "success",
      title: "Trade Values Applied",
      detail: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    });
  };

  const handleCopySharedVehicleToGarage = async (vehicle: any) => {
    if (!currentUser) {
      toast.push({
        kind: "info",
        title: "Sign in required",
        detail: "Sign in to copy shared vehicles to your garage.",
      });
      setAuthMode("signin");
      setShowAuthModal(true);
      return;
    }
    try {
      const copied = await copyGarageVehicleToUser(vehicle.id, currentUser.id);
      if (copied) {
        setGarageVehicles((prev) => [copied, ...prev]);
        toast.push({
          kind: "success",
          title: "Vehicle copied",
          detail: `${vehicle.year} ${vehicle.make} added to your garage`,
        });
      }
    } catch (error: any) {
      toast.push({
        kind: "error",
        title: "Could not copy vehicle",
        detail: error?.message || "Please try again.",
      });
    }
  };

  // Share a single garage vehicle (per-link filter)
  const handleShareVehicle = async (vehicle: any) => {
    // Prevent opening when not signed in and no share token
    if (!currentUser && !shareToken) {
      toast.push({
        kind: "info",
        title: "Sign in required",
        detail: "Sign in to share a vehicle.",
      });
      setAuthMode("signin");
      setShowAuthModal(true);
      return;
    }

    setShareModalTarget(vehicle);
    setShareModalEmail("");
    setShareModalError(null);
    setShareModalLink("");
    setShareModalListingUrl(vehicle?.listing_url || "");
    setShareModalPhotoUrl(vehicle?.photo_url || "");
    setShareModalSuccess(null);
    setShareModalLoading(true);
    setShareModalOpen(true);

    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    const basePrefix =
      shareBaseEnv ||
      `${baseUrl}${basePath || ""}`;

    try {
      // If already viewing via share token, reuse it
      if (shareToken) {
        const shareUrl = `${basePrefix}/share/${shareToken}?vehicle=${vehicle.id}`;
        setShareModalLink(shareUrl);
        setShareModalLoading(false);
        return;
      }

      // Otherwise create a fresh link for the owner
      const link = await createGarageShareLink({
        garageOwnerId: currentUser?.id,
      });
      if (!link?.token) {
        throw new Error("Share link unavailable");
      }
      const shareUrl = `${basePrefix}/share/${link.token}?vehicle=${vehicle.id}`;
      setShareModalLink(shareUrl);
    } catch (error: any) {
      setShareModalError(error?.message || "Could not create share link.");
      toast.push({
        kind: "error",
        title: "Could not share vehicle",
        detail: error?.message || "Please try again.",
      });
    } finally {
      setShareModalLoading(false);
    }
  };

  // Check if a vehicle is already saved (by VIN)
  const isVehicleAlreadySaved = useCallback((vehicleVin: string | undefined) => {
    if (!vehicleVin) return false;
    return savedVehicles.some(v => v.vin?.toUpperCase() === vehicleVin.toUpperCase());
  }, [savedVehicles]);

  // Handle saving a newly looked-up vehicle to saved vehicles
  const handleSaveNewVehicle = async (vehicle: any) => {
    if (!currentUser) {
      toast.push({
        kind: "info",
        title: "Sign in required",
        detail: "Sign in to save vehicles.",
      });
      setAuthMode("signin");
      setShowAuthModal(true);
      return;
    }

    if (!vehicle) return;

    // Check if already saved
    if (isVehicleAlreadySaved(vehicle.vin)) {
      toast.push({
        kind: "info",
        title: "Already Saved",
        detail: "This vehicle is already in your saved vehicles.",
      });
      return;
    }

    try {
      const vehicleData = {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        vin: vehicle.vin,
        mileage: vehicle.mileage,
        condition: vehicle.condition,
        asking_price: vehicle.asking_price,
        heading: vehicle.heading,
        dealer_name: vehicle.dealer_name,
        dealer_street: vehicle.dealer_street,
        dealer_city: vehicle.dealer_city,
        dealer_state: vehicle.dealer_state,
        dealer_zip: vehicle.dealer_zip,
        dealer_phone: vehicle.dealer_phone,
        dealer_lat: vehicle.dealer_lat,
        dealer_lng: vehicle.dealer_lng,
        listing_id: vehicle.listing_id,
        listing_source: vehicle.listing_source || "MARKETCHECK",
        listing_url: vehicle.listing_url,
        photo_url: vehicle.photo_url,
        body_class: vehicle.body_class,
        vehicle_type: vehicle.vehicle_type,
        curb_weight_lbs: vehicle.curb_weight_lbs,
        weight_source: vehicle.weight_source,
        last_refreshed_at: new Date().toISOString(),
      };

      const savedVehicle = await savedVehiclesCache.addVehicle(vehicleData);
      await reloadSavedVehicles();

      // Update the selected vehicle with the saved ID
      if (savedVehicle?.id) {
        setSelectedVehicle((prev: any) => ({
          ...prev,
          id: savedVehicle.id,
          __source: "saved",
        }));
      }

      toast.push({
        kind: "success",
        title: "Vehicle Saved!",
        detail: `${vehicle.year} ${vehicle.make} ${vehicle.model} added to your library.`,
      });
    } catch (error: any) {
      console.error("Failed to save vehicle:", error);
      toast.push({
        kind: "error",
        title: "Could not save vehicle",
        detail: error?.message || "Please try again.",
      });
    }
  };

  // Handle opening the "Add to Library" modal for a shared vehicle
  const handleOpenAddToLibraryModal = (vehicle: any) => {
    if (!currentUser) {
      toast.push({
        kind: "info",
        title: "Sign in required",
        detail: "Sign in to save vehicles.",
      });
      setAuthMode("signin");
      setShowAuthModal(true);
      return;
    }

    if (!vehicle?.id) return;

    setVehicleToAddToLibrary(vehicle);
    setShowAddToLibraryModal(true);
  };

  // Handle adding a shared vehicle to the selected library destination
  const handleAddToLibrary = async (destination: LibraryDestination) => {
    if (!currentUser || !vehicleToAddToLibrary?.id) {
      setShowAddToLibraryModal(false);
      return;
    }

    try {
      // Get the shared vehicle data
      const sharedVehicle = await getSharedVehicleById(vehicleToAddToLibrary.id);
      if (!sharedVehicle) {
        throw new Error("Shared vehicle not found");
      }

      const vehicleName = `${sharedVehicle.year || ''} ${sharedVehicle.make || ''} ${sharedVehicle.model || ''}`.trim();

      if (destination === 'saved') {
        // Prepare vehicle data for saved vehicles table
        const vehicleData = {
          vin: sharedVehicle.vin,
          year: sharedVehicle.year,
          make: sharedVehicle.make,
          model: sharedVehicle.model,
          trim: sharedVehicle.trim,
          mileage: sharedVehicle.mileage,
          condition: sharedVehicle.condition,
          heading: sharedVehicle.heading,
          asking_price: sharedVehicle.asking_price,
          dealer_name: sharedVehicle.dealer_name,
          dealer_street: sharedVehicle.dealer_street,
          dealer_city: sharedVehicle.dealer_city,
          dealer_state: sharedVehicle.dealer_state,
          dealer_zip: sharedVehicle.dealer_zip,
          dealer_phone: sharedVehicle.dealer_phone,
          dealer_lat: sharedVehicle.dealer_lat,
          dealer_lng: sharedVehicle.dealer_lng,
          listing_id: sharedVehicle.listing_id,
          listing_source: sharedVehicle.listing_source,
          listing_url: sharedVehicle.listing_url,
          photo_url: sharedVehicle.photo_url,
        };

        // Add to saved vehicles using the cache
        await savedVehiclesCache.addVehicle(vehicleData);
        await reloadSavedVehicles();

        toast.push({
          kind: "success",
          title: "Added to Saved Vehicles",
          detail: `${vehicleName} has been added to your saved vehicles.`,
        });
      } else {
        // Normalize condition to valid garage_vehicles values: 'excellent' | 'good' | 'fair' | 'poor'
        const validConditions = ['excellent', 'good', 'fair', 'poor'];
        let normalizedCondition: string | undefined = undefined;
        if (sharedVehicle.condition) {
          const lowerCondition = String(sharedVehicle.condition).toLowerCase();
          if (validConditions.includes(lowerCondition)) {
            normalizedCondition = lowerCondition;
          } else if (lowerCondition.includes('new') || lowerCondition.includes('excellent')) {
            normalizedCondition = 'excellent';
          } else if (lowerCondition.includes('good')) {
            normalizedCondition = 'good';
          } else if (lowerCondition.includes('fair')) {
            normalizedCondition = 'fair';
          } else {
            normalizedCondition = 'good'; // Default fallback
          }
        }

        // Prepare vehicle data for garage
        const garageVehicleData = {
          year: sharedVehicle.year,
          make: sharedVehicle.make,
          model: sharedVehicle.model,
          trim: sharedVehicle.trim,
          vin: sharedVehicle.vin,
          mileage: sharedVehicle.mileage,
          condition: normalizedCondition,
          estimated_value: sharedVehicle.asking_price,
          photo_url: sharedVehicle.photo_url,
        };

        // Add to garage
        await addGarageVehicle(currentUser.id, garageVehicleData);

        // Reload garage vehicles
        const vehicles = await getAccessibleGarageVehicles();
        setGarageVehicles(vehicles || []);

        toast.push({
          kind: "success",
          title: "Added to Garage",
          detail: `${vehicleName} has been added to your garage.`,
        });
      }

      // Delete from shared_vehicles
      await deleteSharedVehicle(vehicleToAddToLibrary.id);

      // Update local state - remove from shared vehicles list
      setSharedImportedVehicles((prev) =>
        prev.filter((v) => v.id !== vehicleToAddToLibrary.id)
      );

      // Close modal and reset state
      setShowAddToLibraryModal(false);
      setVehicleToAddToLibrary(null);
    } catch (error: any) {
      toast.push({
        kind: "error",
        title: "Could not save vehicle",
        detail: error?.message || "Please try again.",
      });
    }
  };

  // Handle declining/removing a shared vehicle
  const handleDeclineSharedVehicle = async (vehicle: any) => {
    if (!vehicle?.id) return;

    const vehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'this vehicle';

    if (!window.confirm(`Decline ${vehicleName}? This will remove it from your shared vehicles.`)) {
      return;
    }

    try {
      await deleteSharedVehicle(vehicle.id);

      // Update local state
      setSharedImportedVehicles((prev) =>
        prev.filter((v) => v.id !== vehicle.id)
      );

      toast.push({
        kind: "success",
        title: "Shared vehicle removed",
        detail: `${vehicleName} has been declined.`,
      });
    } catch (error: any) {
      toast.push({
        kind: "error",
        title: "Could not remove vehicle",
        detail: error?.message || "Please try again.",
      });
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareModalLink) return;
    try {
      await navigator.clipboard.writeText(shareModalLink);
      toast.push({
        kind: "success",
        title: "Link copied",
        detail: "Paste it anywhere to share.",
      });
    } catch {
      const temp = document.createElement("textarea");
      temp.value = shareModalLink;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
      toast.push({
        kind: "success",
        title: "Link ready",
        detail: "Copied to clipboard.",
      });
    }
  };

  const handleSendShareEmail = async () => {
    if (!shareModalLink || !shareModalTarget) {
      setShareModalError("Share link not ready yet.");
      return;
    }
    if (!shareModalEmail.trim()) {
      setShareModalError("Enter an email to send the link.");
      return;
    }

    setShareModalError(null);
    setShareEmailSending(true);
    setShareSendStatus("sending");
    setShareSendDetail(null);

    const payload = {
      recipientEmail: shareModalEmail.trim(),
      shareUrl: shareModalLink,
      vehicleInfo: `${shareModalTarget.year || ""} ${shareModalTarget.make || ""} ${shareModalTarget.model || ""}`.trim(),
      senderName:
        (profile?.full_name && profile.full_name.trim()) ||
        currentUser?.email ||
        "",
      listingUrl: shareModalListingUrl || "",
      photoUrl: shareModalPhotoUrl || "",
    };

    try {
      const res = await fetch("/api/share/vehicle/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShareModalSuccess(`Sent to ${payload.recipientEmail}`);
        setShareModalEmail("");
        setShareSendStatus("success");
        setShareSendDetail(null);
        return;
      }

      // Fallback: try Supabase function if server route is unavailable (e.g., static hosting)
      if (res.status === 404 && supabase) {
        try {
          const fallbackOfferId =
            shareModalTarget?.id || `share-${Math.random().toString(36).slice(2)}`;
          const { error: fnError, data: fnData } = await supabase.functions.invoke("send-email", {
            body: {
              offerId: fallbackOfferId,
              recipientEmail: payload.recipientEmail,
              recipientName: payload.recipientEmail,
              vehicleInfo: payload.vehicleInfo,
              shareUrl: payload.shareUrl,
              listingUrl: payload.listingUrl,
              photoUrl: payload.photoUrl,
              share: true,
            },
          });
          if (fnError) {
            throw new Error((fnData as any)?.error || fnError.message);
          }
          setShareModalSuccess(`Sent to ${payload.recipientEmail}`);
          setShareModalEmail("");
          return;
        } catch (fallbackError: any) {
          throw new Error(
            fallbackError?.message ||
              "Backend email endpoint unavailable and fallback failed."
          );
        }
      }

      const data = await res.json().catch(() => ({}));
      throw new Error(
        data?.detail || data?.error || `Email failed (${res.status})`
      );
    } catch (error: any) {
      setShareModalError(error?.message || "Could not send email.");
      setShareSendStatus("error");
      setShareSendDetail(error?.message || null);
      toast.push({
        kind: "error",
        title: "Email failed",
        detail: error?.message || "Could not send email.",
      });
    } finally {
      setShareEmailSending(false);
      if (shareSendStatus === "sending") {
        setShareSendStatus("idle");
      }
    }
  };

  // Handle toggle garage vehicle as trade-in
  const handleToggleGarageTradeIn = (vehicleId: string, isChecked: boolean) => {
    toggleTradeInVehicle(vehicleId, garageVehicles || []);
  };

  // Handle edit vehicle from VIN dropdown
  const handleEditVehicle = (vehicle: any) => {
    setVehicleToEdit(vehicle);
    setShowManageVehiclesModal(true);
    setShowVehicleDropdown(false); // Close dropdown
  };

  // Handle delete vehicle from VIN dropdown
  const handleDeleteVehicle = async (vehicle: any) => {
    if (!currentUser || !supabase) {
      toast.push({
        kind: "error",
        title: "Not Authenticated",
        detail: "Please sign in to delete vehicles",
      });
      return;
    }

    // Confirm deletion
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    if (!window.confirm(`Are you sure you want to delete ${vehicleName}?`)) {
      return;
    }

    try {
      // Determine if this is a garage vehicle or saved vehicle
      const isGarageVehicle =
        vehicle.source === "garage" ||
        garageVehicles?.some((v) => v.id === vehicle.id);
      const table = isGarageVehicle ? "garage_vehicles" : "vehicles";

      // Delete from database
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", vehicle.id)
        .eq("user_id", currentUser.id);

      if (error) throw error;

      // Reload vehicles to reflect changes
      if (isGarageVehicle) {
        const { data: updatedVehicles, error: loadError } = await supabase
          .from("garage_vehicles")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false });

        if (loadError) throw loadError;
        setGarageVehicles(updatedVehicles || []);
      } else {
        const { data: updatedVehicles, error: loadError } = await supabase
          .from("vehicles")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("inserted_at", { ascending: false });

        if (loadError) throw loadError;
        setSavedVehicles(updatedVehicles || []);
      }

      toast.push({
        kind: "success",
        title: "Vehicle Deleted",
        detail: `${vehicleName} has been removed`,
      });
    } catch (error: any) {
      toast.push({
        kind: "error",
        title: "Delete Failed",
        detail: error.message || "Could not delete vehicle",
      });
    }
  };

  // Handle vehicle save/update from modal (garage, saved, shared)
  const handleVehicleSave = async (
    vehicleData: Partial<Vehicle | GarageVehicle>
  ) => {
    if (!currentUser || !supabase) {
      toast.push({
        kind: "error",
        title: "Cannot save vehicle",
        detail: "Please sign in to save vehicles",
      });
      return;
    }

    try {
      const source =
        (vehicleData as any)?.__source ||
        (vehicleToEdit as any)?.__source ||
        (vehicleData as any)?.source ||
        (vehicleToEdit as any)?.source ||
        "garage";

      const table =
        source === "saved"
          ? "vehicles"
          : source === "shared"
          ? "shared_vehicles"
          : "garage_vehicles";

      // Prepare the data for Supabase (ensure user_id is set)
      const dataToSave = {
        ...vehicleData,
        user_id: currentUser.id,
      };

      console.log('[VehicleSave] source:', source, 'table:', table);
      console.log('[VehicleSave] dataToSave:', dataToSave);
      console.log('[VehicleSave] photo_url:', dataToSave.photo_url);

      // Check if this is an update (has id) or new vehicle
      if (vehicleData.id) {
        // Update existing record
        const { id, ...updates } = dataToSave;
        console.log('[VehicleSave] Updating with:', updates);
        const { error } = await supabase
          .from(table)
          .update(updates)
          .eq("id", id)
          .eq("user_id", currentUser.id);

        if (error) throw error;
      } else {
        // Add new record
        const { error } = await supabase
          .from(table)
          .insert([dataToSave]);

        if (error) throw error;
      }

      // Reload relevant collections
      if (table === "garage_vehicles") {
        const { data: updatedVehicles, error: loadError } = await supabase
          .from("garage_vehicles")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false });

        if (loadError) throw loadError;
        setGarageVehicles(updatedVehicles || []);
      } else if (table === "vehicles") {
        if (ensureSavedVehiclesCacheReady()) {
          const refreshed = await savedVehiclesCache.getVehicles({
            forceRefresh: true,
          });
          console.log('[VehicleSave] Refreshed saved vehicles:', refreshed?.map((v: any) => ({ id: v.id, photo_url: v.photo_url })));
          setSavedVehicles(refreshed || []);
        }
      } else if (table === "shared_vehicles") {
        const { data: updatedShared, error: loadError } = await supabase
          .from("shared_vehicles")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("inserted_at", { ascending: false });

        if (loadError) throw loadError;
        setSharedImportedVehicles(updatedShared || []);
      }

      // Update selectedVehicle if it's the same vehicle that was just saved
      if (vehicleData.id && selectedVehicle?.id === vehicleData.id) {
        setSelectedVehicle((prev: any) => ({
          ...prev,
          ...vehicleData,
        }));
      }

      toast.push({
        kind: "success",
        title: vehicleData.id ? "Vehicle Updated!" : "Vehicle Added!",
        detail: `${vehicleData.year} ${vehicleData.make} ${vehicleData.model}`,
      });

      setShowManageVehiclesModal(false);
      setVehicleToEdit(null);
    } catch (error: any) {
      toast.push({
        kind: "error",
        title: "Failed to save vehicle",
        detail: error.message || "An error occurred",
      });
      throw error; // Re-throw so modal can handle it
    }
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

  const handleSignUp = async (
    email: string,
    password: string,
    fullName?: string,
    phone?: string
  ) => {
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
  const reloadSavedVehicles = async (
    options: { forceRefresh?: boolean } = {}
  ) => {
    if (!ensureSavedVehiclesCacheReady()) {
      return [];
    }

    try {
      const vehicles = await savedVehiclesCache.getVehicles({
        forceRefresh: options.forceRefresh || false,
      });
      setSavedVehicles(vehicles || []);
      return vehicles;
    } catch (error) {
      throw error;
    }
  };

  // VIN Lookup Handler
  const handleVINLookup = async (vinValue: string) => {
    // Clean and validate VIN
    const cleanVIN = vinValue.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");

    if (!cleanVIN) {
      setSelectedVehicle(null);
      setSliderValue("salePrice", 0, true);
      setVinError("");
      return;
    }

    // VIN must be 11-17 characters
    if (cleanVIN.length < 11) {
      setVinError("VIN must be at least 11 characters");
      setSelectedVehicle(null);
      setSliderValue("salePrice", 0, true);
      return;
    }

    if (cleanVIN.length > 17) {
      setVinError("VIN cannot be more than 17 characters");
      setSelectedVehicle(null);
      setSliderValue("salePrice", 0, true);
      return;
    }

    // Valid VIN - attempt lookup
    setIsLoadingVIN(true);
    setVinError("");

    try {
      const result = (await marketCheckCache.getVehicleData(cleanVIN, {
        forceRefresh: false,
        zip: location || "32901", // Use entered location or default
        radius: 100,
        pick: "all",
      })) as any;

      // Server returns 'payload', support both for backwards compatibility
      const listing = result?.listing || result?.payload;
      const vehicleSpecs = result?.vehicleSpecs;

      if (result && listing) {
        setNhtsaBodyClass(undefined);
        setNhtsaGvwrClass(undefined);
        setNhtsaRawCurbWeight(undefined);
        setGvwrEstimateDetail(undefined);
        setSelectedVehicle({
          ...normalizeDealerData(listing),
          __source: "market",
          // Include vehicleSpecs for weight-based fee calculations
          body_class: vehicleSpecs?.bodyClass ?? null,
          vehicle_type: vehicleSpecs?.vehicleType ?? null,
          curb_weight_lbs: vehicleSpecs?.estimatedWeight ?? null,
          weight_source: vehicleSpecs?.weightSource ?? null,
        });

        // Auto-set weight if available from NHTSA
        if (vehicleSpecs?.estimatedWeight) {
          const rawWeight = vehicleSpecs.estimatedWeight;
          setEstimatedWeight(rawWeight);
          setWeightSource(vehicleSpecs.weightSource || 'nhtsa_exact');
          setNhtsaBodyClass(vehicleSpecs.bodyClass);
          setNhtsaGvwrClass(vehicleSpecs.gvwrClass);
          setNhtsaRawCurbWeight(vehicleSpecs.rawCurbWeight);
          setGvwrEstimateDetail(vehicleSpecs?.gvwrEstimateDetail);
          // Auto-select bracket based on estimated weight
          const bracket = findWeightBracket(rawWeight, vehicleSpecs?.bodyClass);
          setVehicleWeightLbs(bracket);
        }
        // Auto-set body type based on NHTSA data
        if (vehicleSpecs?.usesTruckSchedule) {
          setVehicleBodyType("truck");
        } else if (vehicleSpecs?.bodyClass) {
          const bodyClass = vehicleSpecs.bodyClass.toLowerCase();
          if (bodyClass.includes("van")) {
            setVehicleBodyType("van");
          } else if (bodyClass.includes("pickup") || bodyClass.includes("truck")) {
            setVehicleBodyType("truck");
          } else {
            setVehicleBodyType("auto");
          }
        }

        const saleValue = getVehicleSalePrice(listing);
        if (saleValue != null) {
          setSliderValue("salePrice", saleValue, true);
        }
        setVehicleCondition(FEATURE_FLAGS.defaultVehicleCondition);

        toast.push({
          kind: "success",
          title: "Vehicle Found!",
          detail: `${listing.year} ${listing.make} ${listing.model}`,
        });
      } else {
        setVinError("No vehicle found for this VIN");
        setSelectedVehicle(null);
        setSliderValue("salePrice", 0, true);
      }
    } catch (error: any) {
      // Distinguish between API errors (quota, network) and "not found"
      const isQuotaError =
        error.message?.toLowerCase().includes("quota") ||
        error.message?.toLowerCase().includes("rate limit") ||
        error.message?.toLowerCase().includes("429");
      const isNetworkError =
        error.message?.toLowerCase().includes("network") ||
        error.message?.toLowerCase().includes("fetch");
      const isServerError =
        error.message?.toLowerCase().includes("server error") ||
        error.message?.toLowerCase().includes("500") ||
        error.message?.toLowerCase().includes("503");

      // For API/network/quota errors, don't clear selectedVehicle
      // This prevents saved vehicles from appearing to "disappear"
      if (isQuotaError) {
        setVinError("API quota exceeded - try again later");
        toast.push({
          kind: "warning",
          title: "Lookup Temporarily Unavailable",
          detail:
            "MarketCheck API quota exceeded. Saved vehicles are still available.",
        });
      } else if (isNetworkError || isServerError) {
        setVinError("Service temporarily unavailable");
        toast.push({
          kind: "warning",
          title: "Lookup Temporarily Unavailable",
          detail:
            "Unable to connect to vehicle lookup service. Try again in a moment.",
        });
      } else {
        // Other errors (like "not found") should clear selectedVehicle
        setVinError(error.message || "Failed to look up VIN");
        setSelectedVehicle(null);
        setSliderValue("salePrice", 0, true);
        toast.push({
          kind: "error",
          title: "VIN Lookup Failed",
          detail: error.message || "Could not find vehicle information",
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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const ratesEffectiveDateLabel = ratesEffectiveDate
    ? formatEffectiveDate(ratesEffectiveDate)
    : null;

  const lenderHelperText = isLoadingRates
    ? "Loading rates..."
    : lenderRates.length > 0
    ? ratesEffectiveDateLabel
      ? `Rates effective ${ratesEffectiveDateLabel} (${lenderRates.length} programs)`
      : `${lenderRates.length} programs loaded`
    : "No rates available";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dark Header */}
      <header className="bg-gray-900 shadow-lg sticky top-0 z-400">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">
            Brandon's Calculator
          </h1>
          <button
            onClick={() => {
              if (currentUser) {
                setShowProfileDropdown(!showProfileDropdown);
              } else {
                setShowAuthModal(true);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors text-white text-sm font-medium"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            {currentUser
              ? profile?.full_name ||
                currentUser.email?.split("@")[0] ||
                "Account"
              : "Sign In"}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-3">

        {/* Main Grid - Left column (inputs) + Right column (summary) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* LEFT COLUMN: Inputs (2/3 width) */}
          <div className="lg:col-span-2 space-y-3">
            {/* Location & Vehicle Section */}
            <Card
              variant="elevated"
              padding="md"
              className="overflow-visible transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:border-blue-200"
            >
              <div className="mb-4 pb-4 border-b border-white/10">
                <SectionHeader
                  title="Location & Vehicle"
                  subtitle="Set your location and vehicle details"
                  tone="light"
                  accent="emerald"
                />
              </div>

              <div className="space-y-3">
                <LocationSearchPremium
                  location={location}
                  onLocationChange={(loc) => {
                    locationManuallyChangedRef.current = true;
                    setLocation(loc);
                  }}
                  onPlaceSelected={(details) => {
                    // Mark as manually changed so profile address doesn't overwrite
                    locationManuallyChangedRef.current = true;
                    // Convert LocationDetails to PlaceDetails format for existing logic
                    const placeDetails: PlaceDetails = {
                      address: details.formatted_address || "",
                      city: details.city || "",
                      state: details.state || "",
                      stateCode: details.state || "",
                      county: details.county || "",
                      countyName: details.county || "",
                      zipCode: details.zip || "",
                      country: "US",
                      lat: details.latitude || 0,
                      lng: details.longitude || 0,
                    };
                    setLocation(placeDetails.address);
                    setLocationDetails(placeDetails);

                    // Lookup tax rates based on location (cached for 90 days)
                    if (
                      placeDetails.stateCode &&
                      placeDetails.county &&
                      placeDetails.state
                    ) {
                      lookupTaxRates(
                        placeDetails.stateCode,
                        placeDetails.county,
                        placeDetails.state
                      )
                        .then((taxData) => {
                          if (taxData) {
                            // Only update if tax rate wasn't manually set by user
                            if (!isTaxRateManuallySet) {
                              setStateTaxRate(taxData.stateTaxRate);
                              setCountyTaxRate(taxData.countyTaxRate);
                              setStateName(taxData.stateName);
                              setCountyName(taxData.countyName);

                              toast.push({
                                kind: "success",
                                title: "Tax Rates Updated",
                                detail: `${taxData.stateName}: ${(
                                  taxData.stateTaxRate * 100
                                ).toFixed(2)}% + ${taxData.countyName}: ${(
                                  taxData.countyTaxRate * 100
                                ).toFixed(2)}%`,
                              });
                            }
                          }
                        })
                        .catch(() => {});
                    }
                  }}
                  locationDetails={
                    locationDetails
                      ? {
                          formatted_address: locationDetails.address,
                          city: locationDetails.city,
                          state: locationDetails.state,
                          zip: locationDetails.zipCode,
                          county: locationDetails.county,
                          latitude: locationDetails.lat,
                          longitude: locationDetails.lng,
                        }
                      : null
                  }
                  isLoading={false}
                  error={mapsError}
                  mapsLoaded={mapsLoaded}
                  placeholder="Enter your address or ZIP code..."
                />

                <VINSearchPremium
                  vin={vin}
                  onVinChange={(value) => setVin(value.toUpperCase())}
                  onVinSubmit={handleManualVINLookup}
                  isLoading={isLoadingVIN}
                  error={vinError || null}
                  hasSelectedVehicle={!!selectedVehicle}
                  garageVehicles={filteredGarageVehicles.map((v) => ({
                    ...normalizeDealerData(v),
                    source: "garage" as const,
                  }))}
                  savedVehicles={filteredSavedVehicles.map((v) => ({
                    ...normalizeDealerData(v),
                    source: "saved" as const,
                  }))}
                  sharedVehicles={filteredSharedImportedVehicles.map((v) => ({
                    ...normalizeDealerData(v),
                    source: "shared" as const,
                  }))}
                  isLoadingVehicles={
                    isLoadingSavedVehicles || isLoadingGarageVehicles || isLoadingSharedImported
                  }
                  onSelectVehicle={(vehicle) => {
                    if (vehicle.source === "garage") {
                      handleSelectGarageVehicle(vehicle as any);
                    } else if (vehicle.source === "shared") {
                      handleSelectSharedVehicle(vehicle as any);
                    } else {
                      handleSelectSavedVehicle(vehicle as any);
                    }
                  }}
                  onEditVehicle={(vehicle) => {
                    handleEditVehicle(vehicle as any);
                  }}
                  onDeleteVehicle={(vehicle) => {
                    handleDeleteVehicle(vehicle as any);
                  }}
                  onShareVehicle={(vehicle) => handleShareVehicle(vehicle as any)}
                  onAddToGarage={(vehicle) => handleOpenAddToLibraryModal(vehicle as any)}
                  onDeclineSharedVehicle={(vehicle) => handleDeclineSharedVehicle(vehicle as any)}
                  placeholder="Paste VIN or select from your garage..."
                />

                {/* Lookup VIN Button - Only shown when VIN is entered but not selected */}
                {vin &&
                  !selectedVehicle &&
                  vin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").length >= 11 && (
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
                            <svg
                              className="animate-spin mr-2"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            Looking up VIN...
                          </>
                        ) : (
                          <>
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              className="mr-2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                              />
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
                  <div className="mt-4">
                    <VehicleCardPremium
                      vehicle={selectedVehicle}
                      salePrice={
                        selectedVehicleSaleValue ?? baselineSalePrice ?? 0
                      }
                      mileage={selectedVehicleMileage}
                      payoffAmount={
                        isGarageSelectedVehicle ? selectedVehiclePayoff : null
                      }
                      isGarageVehicle={isGarageSelectedVehicle}
                      salePriceLabel={selectedVehicleSaleLabel || "Sale Price"}
                      onClear={() => {
                        setSelectedVehicle(null);
                        setVin("");
                        setVehicleDiff(null);
                        setSliderValue("salePrice", 0, true);
                      }}
                      showSaveButton={
                        selectedVehicle.__source !== "saved" &&
                        selectedVehicle.__source !== "garage" &&
                        !isVehicleAlreadySaved(selectedVehicle.vin)
                      }
                      onSave={() => handleSaveNewVehicle(selectedVehicle)}
                      vehicleDiff={vehicleDiff}
                      isRefreshing={isRefreshingVehicle}
                    />
                  </div>
                )}

                {/* Dealer Map */}
                {selectedVehicle &&
                  (() => {
                    const dealerLat =
                      typeof selectedVehicle.dealer_lat === "number"
                        ? selectedVehicle.dealer_lat
                        : selectedVehicle.dealer_latitude ?? null;
                    const dealerLng =
                      typeof selectedVehicle.dealer_lng === "number"
                        ? selectedVehicle.dealer_lng
                        : selectedVehicle.dealer_longitude ?? null;
                    const hasCoordinates =
                      typeof dealerLat === "number" &&
                      typeof dealerLng === "number";
                    const hasAddressDetails = Boolean(
                      selectedVehicle.dealer_address ||
                        selectedVehicle.dealer_street ||
                        (selectedVehicle.dealer_city &&
                          selectedVehicle.dealer_state) ||
                        selectedVehicle.dealer_zip
                    );
                    const shouldShowDealerMap =
                      hasCoordinates || hasAddressDetails;
                    const showRoute = !!locationDetails;

                    if (!shouldShowDealerMap) {
                      return null;
                    }

                    return (
                      <div className="mt-4">
                        <DealerMap
                          dealerName={selectedVehicle.dealer_name}
                          dealerAddress={
                            selectedVehicle.dealer_address ||
                            selectedVehicle.dealer_street
                          }
                          dealerCity={selectedVehicle.dealer_city}
                          dealerState={selectedVehicle.dealer_state}
                          dealerZip={selectedVehicle.dealer_zip}
                          dealerLat={dealerLat ?? undefined}
                          dealerLng={dealerLng ?? undefined}
                          userLocation={locationDetails || undefined}
                          showRoute={showRoute}
                        />
                      </div>
                    );
                  })()}
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN: Summary (1/3 width, sticky) */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              {/* Premium Financing Card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950">
                {/* Ambient Background */}
                <div className="absolute inset-0 opacity-20">
                  <div
                    className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/30 rounded-full blur-3xl animate-pulse"
                    style={{ animationDuration: "8s" }}
                  />
                  <div
                    className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"
                    style={{ animationDuration: "10s", animationDelay: "2s" }}
                  />
                </div>

                {/* Content */}
                <div className="relative z-10 p-6">
                  {/* Card Header */}
                  <div className="mb-6 pb-4 border-b border-white/10">
                    <SectionHeader
                      title="Financing & Payment"
                      subtitle="Configure your loan details"
                      tone="light"
                      accent="emerald"
                    />
                  </div>

                  {/* Financing Details Inputs */}
                  <div className="space-y-3 mb-6 pb-6 border-b border-white/10">
                    {/* Use Lowest APR Toggle */}
                    <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-400/20 backdrop-blur-sm">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">
                          Use Lowest APR
                        </label>
                        <p className="text-xs text-white/60 mt-0.5">
                          {isFindingBestLender
                            ? "Comparing lenders..."
                            : "Automatically find the lender with the best rate"}
                        </p>
                      </div>
                      <Switch
                        checked={useLowestApr}
                        onChange={(e) => {
                          const nextValue = e.target.checked;
                          setUseLowestApr(nextValue);
                          if (nextValue && lenderBaselineApr !== null) {
                            setApr(lenderBaselineApr);
                          }
                        }}
                        disabled={isFindingBestLender}
                      />
                    </div>

                    <Select
                      label="Preferred Lender"
                      value={lender}
                      onChange={(e) => setLender(e.target.value)}
                      options={lenderOptions}
                      helperText={lenderHelperText}
                      fullWidth
                      disabled={useLowestApr || isFindingBestLender}
                    />

                    <Select
                      label="Vehicle Condition"
                      value={vehicleCondition}
                      onChange={(e) =>
                        setVehicleCondition(e.target.value as "new" | "used")
                      }
                      options={vehicleConditionOptions}
                      fullWidth
                    />

                          <Select
                            label="Loan Term"
                            value={loanTerm.toString()}
                            onChange={(e) => {
                              setLoanTerm(Number(e.target.value));
                              // If auto mode is on, let lender APR follow; otherwise keep manual APR intact
                              if (useLowestApr && bestLenderApr != null) {
                                applyLenderApr(bestLenderApr);
                              }
                            }}
                            options={termOptions}
                            fullWidth
                          />

                    <Select
                      label="Credit Score Range"
                      value={creditScore}
                      onChange={(e) => setCreditScore(e.target.value)}
                      options={creditScoreOptions}
                      fullWidth
                    />
                  </div>

                  {/* Monthly Payment Hero - Premium */}
                  <div className="text-center mb-6 p-6 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-2xl border border-emerald-400/30 backdrop-blur-sm">
                    <div className="text-xs font-medium text-emerald-300/80 mb-2 flex items-center justify-center gap-2 uppercase tracking-wider">
                      <span>Estimated Monthly Payment</span>
                    </div>
                    {useLowestApr &&
                      bestLenderLongName &&
                      bestLenderApr != null && (
                        <div className="text-xs font-semibold text-emerald-100 bg-emerald-500/30 px-3 py-1 rounded-full inline-flex items-center gap-2 mb-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]"></span>
                          <span>Best rate locked</span>
                          <span className="text-emerald-50/80">
                            • {bestLenderLongName}
                          </span>
                          <span className="text-emerald-50/80">
                            • {bestLenderApr.toFixed(2)}% APR
                          </span>
                        </div>
                      )}
                    {hasCustomApr && (
                      <div className="text-xs font-semibold text-amber-400 bg-amber-500/20 px-3 py-1 rounded-full inline-block mb-2">
                        User Rate Active
                      </div>
                    )}
                    <div
                      className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-200 to-cyan-200 mb-2"
                      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
                    >
                      {formatCurrency(monthlyPayment)}
                    </div>
                    <div className="text-sm text-white/70 font-medium">
                      {loanTerm} months • {apr.toFixed(2)}% APR
                    </div>
                    {ratesEffectiveDateLabel && (
                      <div className="text-xs text-white/40 mt-2">
                        Rates effective {ratesEffectiveDateLabel}
                      </div>
                    )}
                  </div>

                  {/* Truth-in-Lending Disclosures */}
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 p-4 backdrop-blur-sm">
                      <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80 mb-3">
                        Truth-in-Lending Disclosures
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-fr">
                        {/* APR with +/- controls */}
                          <div className="group rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm flex flex-col min-h-[180px] justify-between transition-all duration-300 hover:bg-white/10 hover:border-emerald-400/30 focus-within:border-emerald-400/50 focus-within:outline-none cursor-pointer">
                          <EnhancedControl
                            value={apr}
                            label="Annual Percentage Rate"
                            onChange={handleAprChange}
                            step={0.01}
                            min={0}
                            max={99.99}
                            formatValue={(val) => `${val.toFixed(2)}%`}
                            monthlyPayment={
                              aprPaymentDiffFromLender != null
                                ? monthlyPayment
                                : undefined
                            }
                            baselinePayment={aprBaselinePayment ?? undefined}
                            paymentDiffOverride={
                              aprPaymentDiffPure ?? undefined
                            }
                            className="w-full"
                            showKeyboardHint={true}
                            unstyled={true}
                          />
                          {aprPaymentDiffFromLender != null && (
                            <div
                              className={`text-xs font-semibold mt-2 ${
                                aprPaymentDiffFromLender < 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {aprPaymentDiffFromLender < 0 ? "↓" : "↑"}{" "}
                              {formatCurrency(
                                Math.abs(aprPaymentDiffFromLender)
                              )}{" "}
                              <span className="text-white/50">
                                vs {lenderBaselineApr?.toFixed(2)}% lender rate
                              </span>
                            </div>
                          )}
                          {salePriceState0Diff != null &&
                            selectedVehicleSaleValue != null && (
                              <div
                                className={`text-xs font-semibold mt-2 ${
                                  salePriceState0Diff < 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {salePriceState0Diff < 0 ? "↓" : "↑"}{" "}
                                {formatCurrency(Math.abs(salePriceState0Diff))}{" "}
                                <span className="text-white/50">
                                  from{" "}
                                  {formatCurrency(selectedVehicleSaleValue)}{" "}
                                  asking price
                                </span>
                              </div>
                            )}
                          <div className="mt-2 text-xs text-white/50">
                            Cost of credit as yearly rate
                          </div>
                        </div>

                        {/* Term with +/- controls */}
                        <div className="group rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm flex flex-col min-h-[180px] justify-between transition-all duration-300 hover:bg-white/10 hover:border-emerald-400/30 focus-within:border-emerald-400/50 focus-within:outline-none cursor-pointer">
                          <EnhancedControl
                            value={loanTerm}
                            label="Term (Months)"
                            onChange={(newTerm) => {
                              const terms = [36, 48, 60, 72, 84];
                              // Find closest term
                              const closest = terms.reduce((prev, curr) =>
                                Math.abs(curr - newTerm) <
                                Math.abs(prev - newTerm)
                                  ? curr
                                  : prev
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
                            <div
                              className={`text-xs font-semibold mt-2 ${
                                diffs.term.isPositive
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {diffs.term.isPositive ? "↓" : "↑"}{" "}
                              {diffs.term.formatted}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-white/50">
                            Length of loan agreement
                          </div>
                        </div>

                        {renderTilStatCard({
                          label: "Finance Charge",
                          value: formatCurrencyWithCents(financeCharge),
                          helper: "Dollar cost of credit",
                          diff: diffs.financeCharge,
                        })}

                        {renderTilStatCard({
                          label: "Amount Financed",
                          value: formatCurrencyWithCents(amountFinanced),
                          helper: "Credit provided to you",
                          diff: diffs.amountFinanced,
                        })}

                        {renderTilStatCard({
                          label: "Total of Payments",
                          value: formatCurrencyWithCents(totalOfPayments),
                          helper: "Total after all payments",
                        })}

                        {renderTilStatCard({
                          label: "Monthly Finance Charge",
                          value: formatCurrencyWithCents(
                            loanTerm > 0 ? financeCharge / loanTerm : 0
                          ),
                          helper: "Interest portion per month",
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sliders Section - Full Width Below */}
        <div className="mt-3 relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
          {/* Ambient Background */}
          <div className="absolute inset-0 opacity-20">
            <div
              className="absolute top-0 left-0 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse"
              style={{ animationDuration: "8s" }}
            />
            <div
              className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"
              style={{ animationDuration: "10s", animationDelay: "2s" }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 p-6">
            {/* Header */}
            <div className="mb-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 bg-gradient-to-b from-blue-400 to-cyan-500 rounded-full" />
                <div>
                  <h2
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
                  >
                    Adjust Pricing & Terms
                  </h2>
                  <p className="text-sm text-white/50">
                    Fine-tune your deal structure
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sale Price Slider */}
              <EnhancedSlider
                label="Sale Price"
                min={0}
                max={saleMaxDynamic}
                step={100}
                value={salePrice}
                onChange={(e) =>
                  setSliderValueWithAutoLock(
                    "salePrice",
                    Number(e.target.value)
                  )
                }
                formatValue={(val) => formatCurrency(val)}
                monthlyPayment={monthlyPayment}
                buyerPerspective="lower-is-better"
                showTooltip={true}
                showReset={true}
                toggleMode="spring"
                baselineValue={selectedVehicleSaleValue ?? salePrice}
                diffBaselineValue={selectedVehicleSaleValue ?? undefined}
                diffBaselinePayment={salePriceState0Payment ?? undefined}
                snapThreshold={100}
                onReset={handleResetSalePrice}
                showLock={true}
                isLocked={sliders.salePrice.isLocked}
                lockedBaseline={sliders.salePrice.lockedBaseline}
                onToggleLock={() => toggleSliderLock("salePrice")}
                isAutoLockPending={autoLockTimerId !== null}
                fullWidth
              />

              {/* Cash Down Slider */}
              <EnhancedSlider
                label="Cash Down"
                min={0}
                max={cashDownMaxDynamic}
                step={100}
                value={cashDown}
                onChange={(e) => {
                  const newValue = Number(e.target.value);
                  hasAppliedProfileCashDownRef.current = true; // User interacted; stop auto-applying profile pref
                  setSliderValueWithSettling("cashDown", newValue);
                  // Only switch to 'current' mode if value doesn't match $0 or preference
                  // This prevents toggle clicks from being overridden
                  const isZeroValue = newValue === 0;
                  const isPrefValue = Math.abs(newValue - cashDownUserPreference) < 1;
                  if (!isZeroValue && !isPrefValue && cashDownToggleState !== 'current') {
                    setCashDownToggleState('current');
                  }
                }}
                formatValue={(val) => formatCurrency(val)}
                monthlyPayment={monthlyPayment}
                buyerPerspective="higher-is-better"
                showTooltip={true}
                showReset={true}
                toggleMode="three-state"
                toggleState={cashDownToggleState}
                userPreferenceValue={cashDownUserPreference}
                onToggleStateChange={(state, value) => {
                  hasAppliedProfileCashDownRef.current = true; // Respect user toggle choice
                  setCashDownToggleState(state);
                  setSliderValueWithSettling("cashDown", value);
                }}
                baselineValue={0}
                diffBaselineValue={0}
                diffBaselinePayment={cashDownState0Payment ?? undefined}
                snapThreshold={100}
                onReset={() => resetSlider("cashDown")}
                fullWidth
              />

              {/* Trade-In Allowance Slider */}
              <EnhancedSlider
                label="Trade-In Allowance"
                min={0}
                max={tradeAllowanceMaxDynamic}
                step={100}
                value={tradeAllowance}
                onChange={(e) =>
                  setSliderValueWithSettling(
                    "tradeAllowance",
                    Number(e.target.value)
                  )
                }
                formatValue={(val) => formatCurrency(val)}
                monthlyPayment={monthlyPayment}
                buyerPerspective="higher-is-better"
                showTooltip={true}
                showReset={true}
                toggleMode="spring"
                baselineValue={sliders.tradeAllowance.baseline}
                diffBaselineValue={sliders.tradeAllowance.baseline}
                diffBaselinePayment={tradeAllowanceBaselinePayment ?? undefined}
                snapThreshold={100}
                onReset={() => {
                  resetTradeIn();
                  setSliderValueWithSettling("tradeAllowance", 0);
                }}
                fullWidth
              />
            </div>
          </div>
        </div>

        {/* Fees & Customer Add-ons Card */}
        <div className="mt-3 relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 border border-white/10">
          {/* Ambient Background */}
          <div className="absolute inset-0 opacity-20">
            <div
              className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/25 rounded-full blur-3xl animate-pulse"
              style={{ animationDuration: "8s" }}
            />
            <div
              className="absolute bottom-0 left-0 w-72 h-72 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"
              style={{ animationDuration: "10s", animationDelay: "2s" }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 p-6">
            {/* Header */}
            <div className="mb-4 pb-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 bg-gradient-to-b from-emerald-400 to-cyan-500 rounded-full" />
                <div>
                  <h2
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
                  >
                    Fees & Customer Add-ons
                  </h2>
                  <p className="text-sm text-white/50">
                    Dealer fees, add-ons, and government fees
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFeesModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl transition-all duration-200 border border-cyan-400/30 shadow-lg shadow-emerald-500/10"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Edit Fees
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60 mb-1">Dealer Fees</div>
                <div className="text-lg font-semibold text-white">
                  {formatCurrency(dealerFees)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60 mb-1">
                  Customer Add-ons
                </div>
                <div className="text-lg font-semibold text-white">
                  {formatCurrency(customerAddons)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60 mb-1">Gov't Fees</div>
                <div className="text-lg font-semibold text-white">
                  {formatCurrency(govtFees)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Savings Summary */}
        {totalSavings > 0 && (
          <div className="mt-3 relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-cyan-950 border border-emerald-500/20">
            <div className="absolute inset-0 opacity-25">
              <div
                className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/30 rounded-full blur-3xl animate-pulse"
                style={{ animationDuration: "9s" }}
              />
              <div
                className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"
                style={{ animationDuration: "11s", animationDelay: "2s" }}
              />
            </div>
            <div className="relative z-10 p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 bg-gradient-to-b from-emerald-400 to-cyan-400 rounded-full" />
                <div>
                  <h2
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
                  >
                    Your Monthly Savings Summary
                  </h2>
                  <p className="text-sm text-white/60">
                    Line-by-line savings you've secured
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {salePricePaymentDiffOverride !== null &&
                  savingsSaleBaseline !== null && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.15em] text-emerald-300/80">
                      Sale Price Savings
                    </div>
                    <div className="text-lg font-semibold text-white">
                      {formatCurrencyWithCents(savingsFromSalePrice)}
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      {formatCurrency(salePrice)} Negotiated Price vs.{" "}
                      {formatCurrency(savingsSaleBaseline)} Asking Price
                    </div>
                  </div>
                )}
                {savingsFromTrade > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.15em] text-emerald-300/80">
                      Trade-In
                    </div>
                    <div className="text-lg font-semibold text-white">
                      {formatCurrencyWithCents(savingsFromTrade)}
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      {formatCurrency(tradeAllowance)} Trade Allowance vs.{" "}
                      {formatCurrency(savingsTradeBaseline)} baseline trade
                    </div>
                  </div>
                )}
                {savingsFromApr > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.15em] text-emerald-300/80">
                      APR Savings
                    </div>
                    <div className="text-lg font-semibold text-white">
                      {formatCurrencyWithCents(savingsFromApr)}
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      {apr.toFixed(2)}% APR vs. {savingsAprBaseline?.toFixed(2)}
                      % {currentLenderName} rate
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-sm font-semibold text-white/80 uppercase tracking-[0.15em]">
                  Total Monthly Savings
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatCurrencyWithCents(totalSavings)}
                </div>
              </div>

              {/* Monthly Payment Comparison */}
              <div className="pt-3 border-t border-white/10">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.15em] text-white/60 mb-2">
                      Before Savings
                    </div>
                    <div className="text-2xl font-bold text-white/70">
                      {formatCurrencyWithCents(monthlyPayment + totalSavings)}
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                      Baseline monthly payment
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 p-4">
                    <div className="text-xs uppercase tracking-[0.15em] text-emerald-300/80 mb-2">
                      Current Payment
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {formatCurrencyWithCents(monthlyPayment)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Itemization of Costs - At the End */}
        <div className="mt-3 relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950">
          {/* Ambient Background */}
          <div className="absolute inset-0 opacity-20">
            <div
              className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/30 rounded-full blur-3xl animate-pulse"
              style={{ animationDuration: "8s" }}
            />
            <div
              className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"
              style={{ animationDuration: "10s", animationDelay: "2s" }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-10 bg-gradient-to-b from-emerald-400 to-cyan-400 rounded-full" />
              <div>
                <h2
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
                >
                  Itemization of Costs
                </h2>
                <p className="text-sm text-white/60">
                  You can adjust Sale Price, Fees etc. to update the deal
                  instantly.
                </p>
              </div>
            </div>

            <ItemizationCard
              salePrice={salePrice}
              cashDown={cashDown}
              tradeAllowance={tradeAllowance}
              tradePayoff={tradePayoff}
              dealerFees={dealerFees}
              customerAddons={customerAddons}
              govtFees={govtFees}
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
              tradeInApplied={effectiveAppliedTrade}
              tradeInCashout={effectiveTradeCashout}
              cashoutAmount={effectiveTradeCashout}
              onSalePriceChange={(value) =>
                setSliderValueWithSettling("salePrice", value)
              }
              onCashDownChange={(value) =>
                setSliderValueWithSettling("cashDown", value)
              }
              onTradeAllowanceChange={(value) =>
                setSliderValueWithSettling("tradeAllowance", value)
              }
              onTradePayoffChange={(value) => setTradePayoff(value)}
              apr={apr}
              loanTerm={loanTerm}
              monthlyPayment={monthlyPayment}
              baselineMonthlyPayment={baselineMonthlyPayment}
              onAprChange={handleAprChange}
              aprBaselinePayment={aprBaselinePayment ?? undefined}
              aprPaymentDiffOverride={aprPaymentDiffFromLender}
              onTermChange={setLoanTerm}
              onDealerFeesChange={(value) =>
                setSliderValueWithSettling("dealerFees", value)
              }
              onCustomerAddonsChange={(value) =>
                setSliderValueWithSettling("customerAddons", value)
              }
              onGovtFeesChange={(value) =>
                setSliderValueWithSettling("govtFees", value)
              }
              onTradeInCashoutChange={handleEquityCashoutChange}
              showHeader={false}
            />
          </div>
        </div>

        {/* Preview Offer CTA */}
        <div className="mt-4 relative group">
          {/* Glow effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition-opacity duration-500" />

          {/* Button */}
          <button
            onClick={handleSubmit}
            className="relative w-full px-8 py-5 bg-gradient-to-r from-emerald-600 via-cyan-600 to-blue-600 hover:from-emerald-500 hover:via-cyan-500 hover:to-blue-500 text-white text-xl font-bold rounded-2xl transition-all duration-300 shadow-2xl hover:shadow-emerald-500/50 border border-emerald-400/30"
          >
            <div className="flex items-center justify-center gap-3">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <span>Preview Offer</span>
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>
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
          vehicleType={
            vehicleToEdit?.source === "saved"
              ? "saved"
              : vehicleToEdit?.source === "shared"
              ? "shared"
              : "garage"
          }
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
          try {
            const basePath = window.location.pathname.includes("/BrandonsCalc")
              ? "/BrandonsCalc"
              : "";
            const redirectTo = `${window.location.origin}${basePath}/reset-password`;
            await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            toast.push({
              kind: "info",
              title: "Password Reset",
              detail: `Reset link sent to ${email}`,
            });
          } catch (error: any) {
            toast.push({
              kind: "error",
              title: "Reset failed",
              detail: error?.message || "Unable to send reset email.",
            });
          }
        }}
        onResetPassword={async (newPassword) => {
          try {
            await supabase.auth.updateUser({ password: newPassword });
            toast.push({
              kind: "success",
              title: "Password updated",
              detail: "You can now sign in with your new password.",
            });
            setAuthMode("signin");
            setShowAuthModal(false);
          } catch (error: any) {
            toast.push({
              kind: "error",
              title: "Update failed",
              detail: error?.message || "Please try again.",
            });
          }
        }}
        modeOverride={authMode}
      />

      {/* Add to Library Modal - for adding shared vehicles to Saved or Garage */}
      <AddToLibraryModal
        isOpen={showAddToLibraryModal}
        onClose={() => {
          setShowAddToLibraryModal(false);
          setVehicleToAddToLibrary(null);
        }}
        onSelect={handleAddToLibrary}
        vehicleName={
          vehicleToAddToLibrary
            ? `${vehicleToAddToLibrary.year || ''} ${vehicleToAddToLibrary.make || ''} ${vehicleToAddToLibrary.model || ''}`.trim()
            : undefined
        }
      />

      {/* Offer Preview Modal */}
      <OfferPreviewModal
        isOpen={showOfferPreviewModal}
        onClose={() => setShowOfferPreviewModal(false)}
        leadData={leadDataForSubmission}
        onSubmit={(data) => handleOfferSubmitWithProgress(data, false)}
        // ItemizationCard props - same as main app
        salePrice={salePrice}
        cashDown={cashDown}
        tradeAllowance={tradeAllowance}
        tradePayoff={tradePayoff}
        dealerFees={dealerFees}
        customerAddons={customerAddons}
        govtFees={govtFees}
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
        tradeInApplied={effectiveAppliedTrade}
        tradeInCashout={effectiveTradeCashout}
        cashoutAmount={effectiveTradeCashout}
        apr={apr}
        loanTerm={loanTerm}
        monthlyPayment={monthlyPayment}
        ratesEffectiveDate={ratesEffectiveDate}
        // onChange handlers - same as main app
        onSalePriceChange={(value) =>
          setSliderValueWithSettling("salePrice", value)
        }
        onCashDownChange={(value) =>
          setSliderValueWithSettling("cashDown", value)
        }
        onTradeAllowanceChange={(value) =>
          setSliderValueWithSettling("tradeAllowance", value)
        }
        onTradePayoffChange={(value) => setTradePayoff(value)}
        onDealerFeesChange={(value) =>
          setSliderValueWithSettling("dealerFees", value)
        }
        onCustomerAddonsChange={(value) =>
          setSliderValueWithSettling("customerAddons", value)
        }
        onGovtFeesChange={(value) =>
          setSliderValueWithSettling("govtFees", value)
        }
        onTradeInCashoutChange={handleEquityCashoutChange}
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
          isNewVehicle={vehicleCondition === "new"}
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
        initialDecision={initialEquityDecision}
        salePrice={salePrice}
        cashDown={cashDown}
        tradeAllowance={tradeAllowance}
        tradePayoff={tradePayoff}
        dealerFees={dealerFees}
        customerAddons={customerAddons}
        govtFees={govtFees}
        stateTaxRate={stateTaxRate}
        countyTaxRate={countyTaxRate}
        stateName={stateName}
        countyName={countyName}
      />

      {/* Fees Modal */}
      <FeesModal
        isOpen={showFeesModal}
        onClose={() => setShowFeesModal(false)}
        dealerFees={feeItems.dealer}
        customerAddons={feeItems.customer}
        govtFees={feeItems.gov}
        stateTaxRate={
          userTaxOverride ? storeTaxState || stateTaxRate : stateTaxRate
        }
        countyTaxRate={
          userTaxOverride ? storeTaxCounty || countyTaxRate : countyTaxRate
        }
        taxableBase={taxableBase}
        stateTaxAmount={stateTaxAmount}
        countyTaxAmount={countyTaxAmount}
        stateName={stateName}
        countyName={countyName}
        onSave={handleFeesModalSave}
        onEditTemplates={handleOpenFeeTemplateEditor}
        scenarioResult={feeEngineResult || feeScenarioResult}
        isCalculatingFees={isCalculatingFees}
        onRecalculateFees={recalcFeeEngine}
        scenarioOverrides={scenarioOverrides}
        hasTradeIn={hasTradeInSelected}
        vehicleWeightLbs={vehicleWeightLbs}
        vehicleBodyType={vehicleBodyType}
        estimatedWeight={estimatedWeight}
        weightSource={weightSource}
        nhtsaBodyClass={nhtsaBodyClass}
        nhtsaGvwrClass={nhtsaGvwrClass}
        nhtsaRawCurbWeight={nhtsaRawCurbWeight}
        gvwrEstimateDetail={gvwrEstimateDetail}
        onVehicleMetaChange={(meta) => {
          if (meta.weightLbs !== undefined) {
            setVehicleWeightLbs(meta.weightLbs);
            setWeightSource('manual'); // User manually entered/changed weight
          } else if (meta.weightLbs === undefined) {
            setVehicleWeightLbs(undefined);
            setWeightSource(undefined);
          }
          if (meta.bodyType) {
            setVehicleBodyType(meta.bodyType);
          }
        }}
        onScenarioOverridesChange={(next) => {
          setScenarioOverrides(next);
        }}
      />

      {/* Fee Template Editor Modal */}
      <FeeTemplateEditorModal
        isOpen={showFeeTemplateModal}
        onClose={handleCloseFeeTemplateEditor}
      />

      {/* Share Vehicle Modal */}
      <Modal
        isOpen={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setShareModalTarget(null);
          setShareModalLink("");
          setShareModalEmail("");
          setShareModalListingUrl("");
          setShareModalPhotoUrl("");
          setShareModalSuccess(null);
          setShareModalError(null);
          setShareModalLoading(false);
          setShareEmailSending(false);
        }}
        title="Share Vehicle"
        size="md"
        isNested
      >
        <div className="p-6 space-y-4">
          {shareModalTarget ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-white/60 mb-1">
                Vehicle
              </p>
              <p className="text-lg font-semibold text-white">
                {`${shareModalTarget.year || ""} ${shareModalTarget.make || ""} ${shareModalTarget.model || ""}`.trim()}
              </p>
              {shareModalTarget.vin && (
                <p className="text-xs text-white/50 font-mono uppercase mt-1">
                  {shareModalTarget.vin}
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium text-white/80">Share link</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <input
                  value={shareModalLink || (shareModalLoading ? "Building link..." : "")}
                  readOnly
                  className="w-full rounded-lg bg-black/30 border border-white/10 text-white/80 px-3 py-2 text-sm"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyShareLink}
                disabled={!shareModalLink || shareModalLoading}
                className="whitespace-nowrap"
              >
                Copy link
              </Button>
            </div>
          </div>

          {shareModalListingUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-white/80">Dealer URL</p>
              <div className="flex flex-col sm:flex-row gap-2 items-center">
                <a
                  href={shareModalListingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg bg-black/30 border border-white/10 text-blue-200 hover:text-blue-100 px-3 py-2 text-sm break-all underline underline-offset-2"
                >
                  {shareModalListingUrl}
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareModalListingUrl);
                      toast.push({
                        kind: "success",
                        title: "Dealer URL copied",
                        detail: "Paste it anywhere to share full details.",
                      });
                    } catch {
                      const temp = document.createElement("textarea");
                      temp.value = shareModalListingUrl;
                      document.body.appendChild(temp);
                      temp.select();
                      document.execCommand("copy");
                      document.body.removeChild(temp);
                      toast.push({
                        kind: "success",
                        title: "Dealer URL ready",
                        detail: "Copied to clipboard.",
                      });
                    }
                  }}
                  className="whitespace-nowrap"
                >
                  Copy link
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-white/80">Send via email</p>
            <Input
              type="email"
              placeholder="friend@example.com"
              value={shareModalEmail}
              onChange={(e) => setShareModalEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!shareModalLink || shareModalLoading || shareEmailSending) return;
                  handleSendShareEmail();
                }
              }}
              fullWidth
            />
            {shareModalSuccess && (
              <div className="text-sm text-emerald-300">{shareModalSuccess}</div>
            )}
            {shareSendStatus === "error" && shareSendDetail && (
              <div className="text-sm text-red-300">{shareSendDetail}</div>
            )}
          </div>

          {shareModalError && (
            <div className="text-sm text-red-300">{shareModalError}</div>
          )}

          <div className="flex items-center justify-between">
              <div className="text-xs text-white/50">
                {shareModalLoading
                  ? "Generating link..."
                  : shareSendStatus === "sending"
                  ? "Sending email..."
                  : "Copy or email the link to share this vehicle."}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                onClick={() => {
          setShareModalOpen(false);
          setShareModalTarget(null);
          setShareModalLink("");
          setShareModalEmail("");
          setShareModalListingUrl("");
          setShareModalError(null);
          setShareModalLoading(false);
          setShareEmailSending(false);
        }}
      >
                Close
              </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendShareEmail}
                  disabled={
                    !shareModalLink || shareModalLoading || shareEmailSending
                  }
                >
                  {shareEmailSending ? "Sending..." : "Send email"}
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="w-full h-2 rounded-full bg-white/5 border border-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    shareSendStatus === "success"
                      ? "bg-emerald-400"
                      : shareSendStatus === "error"
                      ? "bg-red-400"
                      : shareSendStatus === "sending"
                      ? "bg-blue-400 animate-pulse"
                      : "bg-white/10"
                  }`}
                  style={{
                    width:
                      shareSendStatus === "sending"
                        ? "60%"
                        : shareSendStatus === "success"
                        ? "100%"
                        : shareSendStatus === "error"
                        ? "100%"
                        : "10%",
                  }}
                />
              </div>
            </div>
        </div>
      </Modal>

      {/* User Profile Dropdown */}
      <UserProfileDropdown
        isOpen={showProfileDropdown}
        onClose={() => setShowProfileDropdown(false)}
        profile={profile}
        onSaveProfile={handleProfileSave}
        onUpdateField={updateProfileField}
        garageVehicles={garageVehicles}
        savedVehicles={savedVehicles}
        onSelectVehicle={handleSelectSavedVehicle}
        onEditGarageVehicle={(vehicle) => {
          setVehicleToEdit(vehicle);
          setShowManageVehiclesModal(true);
        }}
        onShareGarageVehicle={handleShareVehicle}
        onEditSavedVehicle={(vehicle) => {
          setVehicleToEdit(vehicle);
          setShowManageVehiclesModal(true);
        }}
        onDeleteGarageVehicle={async (vehicle) => {
          if (
            !confirm(`Delete ${vehicle.year} ${vehicle.make} ${vehicle.model}?`)
          )
            return;
          try {
            const { data, error } = await supabase
              .from("garage_vehicles")
              .delete()
              .eq("id", vehicle.id)
              .select("photo_storage_path")
              .single();
            if (error) throw error;
            if (data?.photo_storage_path) {
              await supabase.storage
                .from("garage-vehicle-photos")
                .remove([data.photo_storage_path]);
            }
            setGarageVehicles((prev) =>
              prev.filter((v) => v.id !== vehicle.id)
            );
            toast.push({ kind: "success", title: "Vehicle Deleted" });
          } catch (error) {
            toast.push({ kind: "error", title: "Failed to Delete Vehicle" });
          }
        }}
        onRemoveSavedVehicle={async (vehicle) => {
          if (
            !confirm(`Remove ${vehicle.year} ${vehicle.make} ${vehicle.model}?`)
          )
            return;
          // Optimistic update - remove from UI immediately
          setSavedVehicles((prev) =>
            prev.filter((v) => v.id !== vehicle.id)
          );
          try {
            await savedVehiclesCache.deleteVehicle(vehicle.id);
            toast.push({ kind: "success", title: "Vehicle Removed" });
          } catch (error) {
            // Rollback on failure - restore the vehicle
            setSavedVehicles((prev) => [...prev, vehicle]);
            toast.push({ kind: "error", title: "Failed to Remove Vehicle" });
          }
        }}
        onShareSavedVehicle={handleShareVehicle}
        onSignOut={currentUser ? handleSignOut : undefined}
        onSignIn={
          !currentUser
            ? () => {
                setAuthMode("signin");
                setShowAuthModal(true);
              }
            : undefined
        }
        onOpenMyOffers={() => {
          setShowProfileDropdown(false);
          setShowMyOffersModal(true);
        }}
        onCopySharedVehicle={async (vehicle) => {
          if (!currentUser) {
            toast.push({
              kind: "info",
              title: "Sign in required",
              detail: "Sign in to copy shared vehicles to your garage",
            });
            setShowAuthModal(true);
            setAuthMode("signin");
            return;
          }
          try {
            const copied = await copyGarageVehicleToUser(vehicle.id, currentUser.id);
            if (copied) {
              setGarageVehicles((prev) => [copied, ...prev]);
              toast.push({
                kind: "success",
                title: "Vehicle copied",
                detail: `${vehicle.year} ${vehicle.make} added to your garage`,
              });
            }
          } catch (error: any) {
            toast.push({
              kind: "error",
              title: "Could not copy vehicle",
              detail: error?.message || "Please try again",
            });
          }
        }}
        currentUserId={currentUser?.id ?? null}
        supabase={supabase}
        isDirty={isProfileDirty}
      />
    </div>
  );
};

export default CalculatorApp;
