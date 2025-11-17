# Brandon's Calc - AI Agent Context File

**Version**: 2.0
**Last Updated**: 2024-12-15
**Purpose**: Complete reconstruction blueprint for AI agents

> This file contains ALL successfully tested features, architecture decisions, and implementation patterns. Use this to rebuild the app from scratch or recover from critical errors.

---

## 🎯 Application Overview

**Name**: Brandon's Calc
**Purpose**: Car financing calculator for dealerships and consumers
**Stack**: Vanilla JS + TypeScript + Vite + Supabase + Express
**Architecture**: Hybrid modernization (gradual TypeScript migration)

### Core Features (✅ = Tested & Working)

- ✅ User authentication (Supabase Auth)
- ✅ Vehicle financing calculations with State 0/1 diff system
- ✅ Multi-lender rate comparison
- ✅ Trade-in value calculations with equity allocation
- ✅ User profile management
- ✅ Garage (owned vehicles for trade-in)
- ✅ Customer offers (save/share calculations)
- ✅ Multi-format email system (customer/dealer/lender)
- ✅ Persistent payment diffs (State 0 baselines)
- ✅ APR dual-diff system (pure vs buyer perspective)
- ✅ Premium UI components (VIN search, location search, vehicle cards)
- ✅ Enhanced modal system (ItemizationCard, OfferPreview)
- ⏳ Saved vehicles (planned)

---

## 📁 Project Structure

```
BrandonsCalc/
├── .ai/                          # AI context files (this directory)
│   ├── AGENT_CONTEXT.md          # Main reconstruction blueprint (THIS FILE)
│   ├── FEATURES.md               # Detailed feature documentation
│   └── TROUBLESHOOTING.md        # Common issues & solutions
├── docs/                         # ✅ Technical documentation
│   ├── financial-states-diff-behavior.md  # ✅ State 0/1 system, persistent diffs
│   └── slider-polarity-system.md          # ✅ Buyer polarity & color coding
├── src/
│   ├── CalculatorApp.tsx         # ✅ Main React calculator (TypeScript)
│   ├── components/               # ✅ Feature components
│   │   ├── DealerMap.tsx         # ✅ Google Maps dealer locator
│   │   ├── OfferPreviewModal.tsx # ✅ Offer preview with vehicle details
│   │   └── UserProfileModal.tsx  # ✅ User profile editor
│   ├── core/                     # Core utilities
│   ├── features/
│   │   ├── auth/                 # Authentication
│   │   │   ├── auth-manager.ts   # ✅ Main auth controller
│   │   │   └── auth-modal.ts     # ✅ Auth UI
│   │   └── garage/               # Vehicle garage
│   ├── hooks/                    # ✅ React hooks
│   │   ├── useProfile.ts         # ✅ Profile data loading
│   │   ├── useSliderBaseline.ts  # ✅ Slider baseline tracking
│   │   └── useTilBaselines.ts    # ✅ Truth-in-Lending baselines
│   ├── lib/
│   │   └── supabase.ts           # ✅ Supabase client & helpers
│   ├── services/
│   │   └── leadSubmission.ts     # ✅ Offer submission, multi-format emails
│   ├── stores/
│   │   ├── auth.ts               # ✅ Zustand auth store
│   │   ├── calculatorStore.ts    # ✅ Zustand calculator store (sliders)
│   │   └── garage.ts             # ✅ Zustand garage store
│   ├── types/
│   │   ├── index.ts              # ✅ Main type definitions
│   │   └── database.types.ts     # ✅ Supabase generated types
│   └── ui/components/            # ✅ Reusable UI components
│       ├── EnhancedControl.tsx   # ✅ APR/Term controls with tooltips
│       ├── EnhancedSlider.tsx    # ✅ Slider with persistent diffs
│       ├── ItemizationCard.tsx   # ✅ Cost breakdown with payment controls
│       ├── SectionHeader.tsx     # ✅ Premium section headers
│       ├── VehicleCardPremium.tsx    # ✅ Premium vehicle listing cards
│       ├── VINSearchPremium.tsx      # ✅ Premium VIN decoder
│       ├── LocationSearchPremium.tsx # ✅ Premium location autocomplete
│       └── index.ts              # ✅ Component exports
├── server/
│   └── server.js                 # ✅ Express API (rates, SMS)
├── supabase/
│   └── migrations/               # Database migrations
├── EMAIL_FORMATS.md              # ✅ Email format documentation
├── PREMIUM_COMPONENTS_GUIDE.md   # ✅ Premium component usage guide
├── app.js                        # ✅ Main application (legacy, 8000+ lines)
├── index.html                    # ✅ Main entry point
├── offer.html                    # ✅ Offer sharing page
└── vite.config.js                # ✅ Build configuration
```

---

## 🗄️ Database Schema

### ✅ Tables (Supabase)

#### 1. `customer_profiles`

**Purpose**: User profile information
**Foreign Key**: `user_id` → `auth.users(id)`

```sql
CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  state_code TEXT,
  zip_code TEXT,
  county TEXT,
  county_name TEXT,
  google_place_id TEXT,
  preferred_credit_score TEXT CHECK (preferred_credit_score IN ('excellent', 'good', 'fair', 'poor')),
  preferred_down_payment NUMERIC(10, 2) DEFAULT 0,
  preferred_trade_value NUMERIC(10, 2) DEFAULT 0,
  preferred_trade_payoff NUMERIC(10, 2) DEFAULT 0,
  preferred_lender_id TEXT,
  preferred_term INTEGER,
  credit_score_range TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
```

**RLS Policies**:

- Users can view/update/insert their own profile only
- Uses `auth.uid() = user_id`

#### 2. `garage_vehicles`

**Purpose**: Vehicles user OWNS (for trade-in)
**Foreign Key**: `user_id` → `auth.users(id)`

```sql
CREATE TABLE garage_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  vin TEXT,
  mileage INTEGER,
  condition TEXT CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  estimated_value NUMERIC(10, 2),
  payoff_amount NUMERIC(10, 2) DEFAULT 0,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**RLS Policies**:

- Users can CRUD their own vehicles only
- Uses `auth.uid() = user_id`

#### 3. `vehicles`

**Purpose**: Vehicles user wants to BUY (saved from searches)
**Foreign Key**: `user_id` → `auth.users(id)`

```sql
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle TEXT,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  asking_price NUMERIC(10, 2),
  mileage INTEGER,
  vin TEXT,
  heading TEXT,
  photo_url TEXT,
  dealer_name TEXT,
  dealer_street TEXT,
  dealer_city TEXT,
  dealer_state TEXT,
  dealer_zip TEXT,
  dealer_phone TEXT,
  dealer_lat NUMERIC,
  dealer_lng NUMERIC,
  listing_id TEXT,
  listing_source TEXT,
  listing_url TEXT,
  marketcheck_payload JSONB,
  condition TEXT,
  estimated_value NUMERIC(10, 2),
  payoff_amount NUMERIC(10, 2),
  inserted_at TIMESTAMPTZ DEFAULT NOW()
);
```

**⚠️ CRITICAL DISTINCTION**:

- `garage_vehicles` = vehicles you OWN (trade-in)
- `vehicles` = vehicles you want to BUY (saved searches)

#### 4. `customer_offers`

**Purpose**: Saved financing offers
**Foreign Key**: `user_id` → `auth.users(id)`

```sql
CREATE TABLE customer_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_year INTEGER NOT NULL,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_trim TEXT,
  vehicle_price NUMERIC(10, 2) NOT NULL,
  down_payment NUMERIC(10, 2) DEFAULT 0,
  trade_value NUMERIC(10, 2) DEFAULT 0,
  trade_payoff NUMERIC(10, 2) DEFAULT 0,
  apr NUMERIC(5, 3) NOT NULL,
  term_months INTEGER NOT NULL,
  monthly_payment NUMERIC(10, 2) NOT NULL,
  dealer_fees NUMERIC(10, 2) DEFAULT 0,
  customer_addons NUMERIC(10, 2) DEFAULT 0,
  state_tax_rate NUMERIC(5, 3) DEFAULT 0,
  county_tax_rate NUMERIC(5, 3) DEFAULT 0,
  total_tax NUMERIC(10, 2) DEFAULT 0,
  amount_financed NUMERIC(10, 2) NOT NULL,
  finance_charge NUMERIC(10, 2) NOT NULL,
  total_of_payments NUMERIC(10, 2) NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_location TEXT,
  dealer_name TEXT,
  dealer_phone TEXT,
  dealer_address TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected')),
  share_token TEXT UNIQUE,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**RLS Policies**:

- Users can view their own offers
- Anyone can view offers with `share_token` (for sharing)
- Uses `auth.uid() = user_id`

#### 5. `auto_rates`

**Purpose**: Lender interest rates
**Access**: Public read, admin write

```sql
CREATE TABLE auto_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_url TEXT,
  loan_type TEXT,
  term_label TEXT,
  term_range_min INTEGER,
  term_range_max INTEGER,
  term_months_min INTEGER,
  term_months_max INTEGER,
  credit_tier TEXT,
  credit_tier_label TEXT,
  credit_score_min INTEGER,
  credit_score_max INTEGER,
  base_apr_percent NUMERIC,
  apr_adjustment NUMERIC,
  apr_percent NUMERIC NOT NULL,
  vehicle_condition TEXT,
  effective_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 6. `sms_logs`

**Purpose**: Track SMS messages sent via Twilio
**Foreign Key**: `offer_id` → `customer_offers(id)`

```sql
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES customer_offers(id) ON DELETE SET NULL,
  message_sid TEXT NOT NULL UNIQUE,
  to_phone TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  dealer_name TEXT,
  customer_name TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔐 Authentication System (✅ Working)

### Architecture

**Store**: Zustand (`src/stores/auth.ts`)
**Manager**: `src/features/auth/auth-manager.ts`
**Modal**: `src/features/auth/auth-modal.ts`

### Key Implementation Pattern

```typescript
// 1. Auth Store (Zustand)
import { create } from "zustand";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  session: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setSession: (session) => set({ session }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// 2. Initialize in app.js
import { AuthManager } from "./src/features/auth/auth-manager";

// CRITICAL: Set up event listeners BEFORE initializing auth
window.addEventListener("profile-loaded", (e) => {
  const { profile } = e.detail;
  // Handle profile loaded
});

// Then initialize
await AuthManager.initialize();

// 3. Access auth state anywhere
const authStore = useAuthStore.getState();
if (authStore.user) {
  console.log("User ID:", authStore.user.id);
}
```

### ⚠️ CRITICAL Rules

1. **NEVER use `localStorage.getItem("customerProfileId")`** - use `useAuthStore.getState().user.id`
2. **Event listeners MUST be set up BEFORE `AuthManager.initialize()`**
3. **All queries use `user_id` column, not `customer_profile_id`**

---

## 🚗 Garage System (✅ Working)

### Store Pattern

```typescript
// src/stores/garage.ts
import { create } from "zustand";

interface GarageState {
  vehicles: GarageVehicle[];
  isLoading: boolean;
  setVehicles: (vehicles: GarageVehicle[]) => void;
  addVehicle: (vehicle: GarageVehicle) => void;
  updateVehicle: (id: string, updates: Partial<GarageVehicle>) => void;
  removeVehicle: (id: string) => void;
}

export const useGarageStore = create<GarageState>((set) => ({
  vehicles: [],
  isLoading: false,
  setVehicles: (vehicles) => set({ vehicles }),
  addVehicle: (vehicle) =>
    set((state) => ({
      vehicles: [vehicle, ...state.vehicles],
    })),
  updateVehicle: (id, updates) =>
    set((state) => ({
      vehicles: state.vehicles.map((v) =>
        v.id === id ? { ...v, ...updates } : v
      ),
    })),
  removeVehicle: (id) =>
    set((state) => ({
      vehicles: state.vehicles.filter((v) => v.id !== id),
    })),
}));
```

### Loading Pattern

```javascript
// app.js
async function loadGarageVehicles() {
  const authStore = useAuthStore.getState();
  if (!authStore.user) return;

  const { data: vehicles, error } = await supabase
    .from("garage_vehicles")
    .select("*")
    .eq("user_id", authStore.user.id)
    .order("created_at", { ascending: false });

  if (!error && vehicles) {
    useGarageStore.getState().setVehicles(vehicles);
  }
}
```

---

## 🔧 Express API Server (✅ Working)

**Location**: `server/server.js`
**Port**: 3002
**Purpose**: Rate data fetching, SMS sending

### Endpoints

```javascript
// GET /api/rates/:lender
// Returns rates for specific lender from Supabase
app.get("/api/rates/:lender", async (req, res) => {
  const { lender } = req.params;
  const { data } = await supabase
    .from("auto_rates")
    .select("*")
    .eq("source", lender.toUpperCase())
    .order("effective_at", { ascending: false });
  res.json(data);
});
```

### Vite Proxy Configuration

```javascript
// vite.config.js
export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
});
```

---

## 🎨 Modal System Pattern

### ✅ Working Pattern

```javascript
// 1. Modal HTML Structure
<div id="my-modal" class="modal" style="display: none;">
  <div class="modal-content">
    <span class="close" onclick="closeMyModal()">
      &times;
    </span>
    <h2>Modal Title</h2>
    <div id="modal-body"></div>
  </div>
</div>;

// 2. Open Function
async function openMyModal() {
  console.log("🔍 Opening modal...");
  const modal = document.getElementById("my-modal");
  if (!modal) {
    console.error("❌ Modal element not found!");
    return;
  }
  modal.style.display = "flex";
  await loadModalData();
}

// 3. Close Function
function closeMyModal() {
  const modal = document.getElementById("my-modal");
  if (modal) modal.style.display = "none";
}

// 4. Export to window (CRITICAL!)
window.openMyModal = openMyModal;
window.closeMyModal = closeMyModal;
```

---

## 📊 Data Flow Patterns

### ✅ Querying User Data

```javascript
// CORRECT - Use auth store
const authStore = useAuthStore.getState();
const { data } = await supabase
  .from("table_name")
  .select("*")
  .eq("user_id", authStore.user.id);

// WRONG - Don't use localStorage
const profileId = localStorage.getItem("customerProfileId"); // ❌ NO!
```

### ✅ Inserting User Data

```javascript
const authStore = useAuthStore.getState();
const { data } = await supabase.from("table_name").insert({
  user_id: authStore.user.id,
  // other fields...
});
```

### ✅ Supabase Query Ordering

```javascript
// CORRECT
.order("created_at", { ascending: false })

// WRONG - causes 400 errors
.order("created_at", { ascending: false, nullsFirst: false })
```

---

## 🚨 Common Pitfalls & Solutions

### 1. localStorage vs Auth Store

**Problem**: Using `localStorage.getItem("customerProfileId")`
**Solution**: Use `useAuthStore.getState().user.id`

### 2. Wrong Table Names

**Problem**: Querying `vehicles` for garage data
**Solution**:

- Owned vehicles (trade-in) → `garage_vehicles`
- Saved vehicles (to buy) → `vehicles`

### 3. Event Timing

**Problem**: Events fire before listeners are set up
**Solution**: Set up listeners BEFORE `AuthManager.initialize()`

### 4. Modal Functions Not Found

**Problem**: `window.openMyModal is not a function`
**Solution**: Export function to window: `window.openMyModal = openMyModal;`

### 5. Supabase 400 Errors

**Problem**: Invalid query parameters like `limit=1:1`
**Solution**: Use `.limit(1)` not `.limit(1:1)`

### 6. RLS Policy Errors

**Problem**: Can't read/write data even when authenticated
**Solution**: Check RLS policies use `auth.uid() = user_id` (not `customer_profile_id`)

---

## 🧪 Testing Checklist

### After Any Major Change

- [ ] Can user sign in?
- [ ] Does profile dropdown show user name?
- [ ] Can open My Garage modal?
- [ ] Can open My Profile modal?
- [ ] Can open My Offers modal?
- [ ] Does vehicle selection populate form?
- [ ] Does payment calculation work?
- [ ] Can save/share offers?

### Browser Console Checks

- [ ] No 400 errors from Supabase
- [ ] Auth store has valid user object
- [ ] Modal functions exist on window
- [ ] Debugging logs appear (🚗 🔍 ✅ symbols)

---

## 🔄 How to Update This File

**When to Update**:

- ✅ Feature is fully implemented AND tested
- ✅ Bug is fixed AND root cause documented
- ✅ New pattern/convention is established

**What to Include**:

- Code examples that work
- File paths and line numbers
- "Why" behind decisions
- Common mistakes to avoid

**Format**:

- Use ✅ for working features
- Use 🚧 for in-progress
- Use ⏳ for planned
- Use ⚠️ for critical warnings
- Use 📝 for important notes

---

---

## 💰 Financial State System (✅ Working)

### State 0/1/2 Architecture

**Purpose**: Persistent payment diffs that remain visible even after sliders settle

#### State Definitions

| State | Sliders | APR | Purpose |
|-------|---------|-----|---------|
| **State 0** | Original/asking value | Lender baseline APR | Persistent baseline (NEVER updates) |
| **State 1** | Settled value (after 2s) | N/A (removed) | Dynamic baseline (updates on settle) |
| **State 2** | Current value | Current APR | Live edits during interaction |

#### Key Components

**State 0 Payment Calculations** (Persistent Diffs):
```typescript
// Cash Down: Compare to $0 down
const cashDownState0Payment = calculateMonthlyPaymentFor({
  ...currentSliders,
  cashDown: 0, // State 0
});

// Sale Price: Compare to dealer asking price
const salePriceState0Payment = calculateMonthlyPaymentFor({
  ...currentSliders,
  salePrice: selectedVehicleSaleValue, // State 0
});

// Trade Allowance: Compare to $0 trade-in
const tradeAllowanceState0Payment = calculateMonthlyPaymentFor({
  ...currentSliders,
  tradeAllowance: 0,
  appliedToBalance: calculateEquityWithNoTrade(),
});
```

**APR Dual-Diff System**:
```typescript
// Dynamic baseline (recalculates with current sliders)
const aprBaselinePayment = calculateMonthlyPaymentFor({
  salePrice: salePriceDiffBaseline ?? salePrice, // Use settled price
  apr: lenderBaselineApr, // Use lender APR
  ...otherCurrentSliders
});

// Pure APR impact (isolates APR from sale price changes)
const aprPaymentDiffPure = paymentWithCurrentApr - aprBaselinePayment;

// Buyer perspective (total impact with current sliders)
const aprPaymentDiffFromLender = monthlyPayment - paymentWithLenderApr;
```

#### EnhancedSlider Props

```typescript
interface EnhancedSliderProps {
  baselineValue?: number;           // State 0 for reset & display
  diffBaselineValue?: number;        // State 1 for VALUE diff (+/- number)
  diffBaselinePayment?: number;      // State 0 PAYMENT for payment diff note
  monthlyPayment?: number;           // Current monthly payment
}
```

**CRITICAL**: Don't confuse `diffBaselineValue` (State 1, dynamic) with `diffBaselinePayment` (State 0, persistent)

### Testing Pattern

```javascript
// 1. Select vehicle with asking price $30,000 (State 0 set)
// 2. Negotiate to $28,000
// 3. Wait 2s for settle (State 1 set to $28,000)
// 4. Payment diff should STILL show savings vs $30,000 asking ✅
// 5. Value diff shows $0 (at State 1) ✅
```

**Documentation**: See `docs/financial-states-diff-behavior.md` for complete details

---

## 📧 Multi-Format Email System (✅ Working)

### Email Formats

**Customer Format** (default):
- Full details including financing, fees, trade-in financials
- Shows savings if negotiated below asking
- Includes all sections

**Dealer Format**:
- Vehicle details + trade-in VEHICLE info (not financials)
- Customer contact info
- NO financing details, NO fees, NO savings shown
- Shows dealer asking price vs customer offer

**Lender Format** (TBD):
- Placeholder for future implementation

### Usage

```typescript
import { generateOfferText, EmailFormat } from './services/leadSubmission';

// Customer email
const customerEmail = generateOfferText(leadData, 'customer');

// Dealer email
const dealerEmail = generateOfferText(leadData, 'dealer');
```

### Lead Data Interface

```typescript
interface LeadData {
  vehiclePrice?: number;        // Customer's offer
  dealerAskingPrice?: number;   // Dealer's original asking

  // Trade-in financial details
  tradeValue?: number;
  tradePayoff?: number;

  // Trade-in vehicle details (for dealer format)
  tradeVehicleYear?: number;
  tradeVehicleMake?: string;
  tradeVehicleModel?: string;
  tradeVehicleTrim?: string;
  tradeVehicleVIN?: string;
  tradeVehicleMileage?: number;
  tradeVehicleCondition?: string;
}
```

**Documentation**: See `EMAIL_FORMATS.md` for structure examples

---

## 🎨 Premium UI Components (✅ Working)

### New Components

**VehicleCardPremium**: Enhanced vehicle listing cards
- Gradient backgrounds, hover effects
- Dealer distance display
- Vehicle photos
- Price formatting
- Located: `src/ui/components/VehicleCardPremium.tsx`

**VINSearchPremium**: VIN decoder with live feedback
- Real-time validation
- NHTSA API integration
- Loading states
- Located: `src/ui/components/VINSearchPremium.tsx`

**LocationSearchPremium**: Google Places autocomplete
- Maps integration
- County detection
- Tax rate lookup
- Located: `src/ui/components/LocationSearchPremium.tsx`

**SectionHeader**: Consistent section headers
- Multiple tones (light/dark/accent)
- Size variants
- Icon support
- Located: `src/ui/components/SectionHeader.tsx`

**ItemizationCard**: Enhanced cost breakdown
- APR/Term payment controls
- Aligned card layouts
- Trade-in equity breakdown
- Cash advance tracking
- Located: `src/ui/components/ItemizationCard.tsx`

**Documentation**: See `PREMIUM_COMPONENTS_GUIDE.md` for usage examples

---

## 📚 Related Documentation

**Core Documentation**:
- `FEATURES.md` - Detailed feature specifications
- `TROUBLESHOOTING.md` - Common issues and solutions
- `README.md` - Project overview and setup

**Technical Documentation**:
- `docs/financial-states-diff-behavior.md` - State 0/1 system, persistent diffs
- `docs/slider-polarity-system.md` - Buyer polarity & color coding
- `EMAIL_FORMATS.md` - Multi-format email structure
- `PREMIUM_COMPONENTS_GUIDE.md` - Premium component usage

**Setup & Configuration**:
- `GOOGLE_MAPS_SETUP.md` - Google Maps integration
- `SETUP_AND_TEST.md` - Development setup guide

---

**Last Verified Working**: 2024-12-15
**Version**: 2.0
**Major Updates**: State 0/1 system, multi-format emails, premium components
