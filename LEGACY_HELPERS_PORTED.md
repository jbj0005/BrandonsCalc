# Legacy Helpers - Porting Complete

All 8 legacy helper features from `app.js` have been successfully ported to the new React app.

## ✅ 1. Auto-populate user location from customer profile

**Location**: `src/hooks/useLocationAutoPopulate.ts`

**Features**:
- Fetches `customer_profiles` from Supabase on load
- Builds full street/city/state/zip address string
- Geocodes via Google Maps API to get lat/lng/county/stateCode
- Updates location state with complete data
- Applies locale-based taxes/fees (integration needed in CalculatorApp)

**Usage**:
```typescript
import { useLocationAutoPopulate } from './hooks/useLocationAutoPopulate';

useLocationAutoPopulate({
  supabase,
  userId: currentUser?.id,
  isEnabled: true,
  onLocationUpdate: (locationData) => {
    // Update wizardData.location
    // Apply locale-based fees
    // Refresh year dropdowns
    // Update vehicle card if selected
    // Trigger autoCalculateQuick
  },
  onLocationFieldUpdate: (locationString) => {
    // Only populate input field if empty
    if (!locationInputRef.current?.value) {
      locationInputRef.current.value = locationString;
    }
  },
});
```

---

## ✅ 2. Auto-populate cash-down from preferred amount

**Location**: `src/hooks/useCashDownAutoPopulate.ts`

**Features**:
- Fetches `preferred_down_payment` from `customer_profiles`
- Only triggers after a vehicle is selected
- Parses string or number values
- Stores baseline as `window.cashDownBaseline`

**Usage**:
```typescript
import { useCashDownAutoPopulate } from './hooks/useCashDownAutoPopulate';

useCashDownAutoPopulate({
  supabase,
  userId: currentUser?.id,
  vehicleSelected: Boolean(selectedVehicle?.vin),
  isEnabled: true,
  onCashDownUpdate: (amount) => {
    setCashDown(amount);
    // Dispatch input/change events for downstream listeners
  },
});
```

---

## ✅ 3. Saved-vehicle helpers

**Location**: `src/utils/legacyHelpers.ts`

**Features**:
- Global window exports for `selectSavedVehicle()` and `selectQuickSavedVehicle()`
- Dropdown filtering on VIN/make/model/year
- Triggers VIN search, updates vehicle state, displays card, copies asking_price to salePrice
- Resets fees/trade data, invokes preferred down payment, resets baselines, runs autoCalculateQuick

**Usage**:
```typescript
import { setupSavedVehicleHandlers } from './utils/legacyHelpers';

// In CalculatorApp.tsx
useEffect(() => {
  setupSavedVehicleHandlers((vehicle) => {
    // Handle vehicle selection
    handleVinInput(vehicle.vin, vehicle);
  });
}, []);
```

---

## ✅ 4. Auto-populate trade data from My Garage

**Location**: `src/hooks/useTradeInAutoPopulate.ts`

**Features**:
- Renders Trade-In checkbox beside each garage_vehicles card
- `handleTradeInSelection()` updates selected vehicles array
- `updateTradeInCalculations()` sums estimated_value + payoff_amount
- Re-centers slider ranges if totals exceed bounds
- Updates window.originalValues baselines for neutral diffs
- Exposes functions to window for legacy compatibility

**Usage**:
```typescript
import { useTradeInAutoPopulate } from './hooks/useTradeInAutoPopulate';

const {
  selectedTradeIns,
  handleTradeInSelection,
  updateTradeInCalculations,
  clearTradeIns,
} = useTradeInAutoPopulate({
  supabase,
  userId: currentUser?.id,
  isEnabled: true,
  autoSelectLatest: true,
  onTradeInUpdate: (tradeData) => {
    setTradeAllowance(tradeData.tradeValue);
    setTradePayoff(tradeData.tradePayoff);
    // Update slider min/max if needed
    // Dispatch events to trigger calculations
  },
});
```

---

## ✅ 5. Auto-select latest garage vehicle as default trade

**Location**: `src/hooks/useTradeInAutoPopulate.ts` (built-in)

**Features**:
- On mount, fetches most recent `garage_vehicles` row for logged-in user
- Automatically sets it as selected trade-in
- Calls `updateTradeInCalculations()` unless user already entered trade values
- Controlled via `autoSelectLatest` option

**Usage**:
Already integrated in `useTradeInAutoPopulate` hook - just pass `autoSelectLatest: true`

---

## ✅ 6. TIL formatting, controls, and diff badges

**Locations**:
- `src/hooks/useTilBaselines.ts` - Baseline tracking and diff calculation
- `src/ui/components/TilControl.tsx` - Interactive APR/Term controls

**Features**:
- **Baselines**: Tracks `{apr, term, financeCharge, amountFinanced, totalPayments, monthlyFinanceCharge}`
- **APR/Term Controls**: Inline +/- buttons with 0.01% steps (APR) or 1-month steps (Term)
- **Click-and-hold**: 300ms delay, then 100ms intervals
- **Keyboard support**: Arrow keys when hovering/focused
- **Diff indicators**: Green = buyer-friendly (lower costs), Red = buyer-negative (higher costs)
- **Smart hiding**: Only shows finance charge diffs when APR or Term changes (not on sale price changes)

**Usage**:
```typescript
import { useTilBaselines } from './hooks/useTilBaselines';
import { TilControl } from './ui/components';

const { baselines, diffs, updateBaselines, resetBaselines, calculateDiffs } = useTilBaselines();

// When calculations complete
updateBaselines({
  apr: reviewData.apr,
  term: reviewData.term,
  financeCharge: reviewData.financeCharge,
  // ...
});

// Calculate diffs for display
const currentDiffs = calculateDiffs({
  apr: currentApr,
  term: currentTerm,
  financeCharge: currentFinanceCharge,
  // ...
});

// Render controls
<TilControl
  label="APR"
  value={apr}
  onChange={setApr}
  formatValue={(v) => `${(v * 100).toFixed(2)}%`}
  step={0.0001}
  min={0.0001}
  max={0.3}
  diff={diffs.apr}
/>
```

---

## ✅ 7. Buyer-perspective slider formatting + payment tooltip

**Location**: `src/utils/legacyHelpers.ts`

**Features**:
- **sliderPolarityMap**: Defines `positiveDirection` for each slider (e.g., cashDown → "right")
- **computeBuyerPositive()**: Paints blue for buyer-positive movement, red for buyer-negative
- **formatDiffIndicator()**: Adds "+" or "-" with green/red color classes
- **Payment tooltips**: Shows new payment + diff (green "-$X/mo" when dropping, red "+$X/mo" when rising)

**Usage**:
```typescript
import {
  SLIDER_POLARITY_MAP,
  computeBuyerPositive,
  formatDiffIndicator,
} from './utils/legacyHelpers';

// For each slider
const sliderKey = 'cashDown';
const direction = computeBuyerPositive(sliderKey, currentValue, baselineValue);

const diffIndicator = formatDiffIndicator(
  currentValue - baselineValue,
  sliderKey,
  formatCurrency
);

// Apply className to slider
<EnhancedSlider
  className={direction === 'positive' ? 'buyer-positive' : 'buyer-negative'}
  // ...
/>

// Show diff badge
{diffIndicator && (
  <span className={diffIndicator.className}>{diffIndicator.text}</span>
)}
```

**Payment Tooltip** (via EnhancedSlider):
Already implemented in `src/ui/components/EnhancedSlider.tsx` - shows monthly payment and diff on hover.

---

## ✅ 8. Error safety helpers

**Location**: `src/utils/legacyHelpers.ts`

**Features**:
- `showTradeInSyncError()`: Toast warning when garage trade data can't sync
- Message: "We couldn't load the selected trade-in details. Please open My Garage to verify..."
- Exposed to window as `window.showToast()` for legacy modules

**Usage**:
```typescript
import { showTradeInSyncError } from './utils/legacyHelpers';

try {
  await updateTradeInCalculations();
} catch (error) {
  showTradeInSyncError();
}
```

---

## Global Window Exports (Legacy Compatibility)

All hooks expose their functions to `window` for backward compatibility:

```typescript
// Location auto-populate
// (handled internally by hook)

// Cash-down baseline
window.cashDownBaseline = preferredDown;

// Trade-in handlers
window.handleTradeInSelection = (vehicleId, isChecked) => { ... };
window.updateTradeInCalculations = () => { ... };
window.selectedTradeIns = ['id1', 'id2'];

// TIL baselines
window.tilBaselines = { apr, term, financeCharge, ... };
window.resetTilBaselines = () => { ... };

// Saved vehicle selection
window.selectSavedVehicle = (vehicle) => { ... };
window.selectQuickSavedVehicle = (vehicle) => { ... };

// Profile dropdown
window.toggleProfileDropdown = () => { ... };

// Toast messages
window.showToast = (message, type) => { ... };
```

---

## Integration Checklist

To fully integrate these helpers into CalculatorApp.tsx:

- [x] Import all hooks at the top
- [ ] Add `useLocationAutoPopulate` with callbacks to update location state, apply fees, refresh dropdowns
- [ ] Add `useCashDownAutoPopulate` with callback to update cashDown state
- [ ] Add `useTradeInAutoPopulate` with callback to update trade sliders and ranges
- [ ] Add `useTilBaselines` and call `updateBaselines()` after each calculation
- [ ] Replace existing APR/Term inputs with `<TilControl>` components
- [ ] Apply buyer-perspective styling to sliders using `computeBuyerPositive()`
- [ ] Add diff badges beside sliders using `formatDiffIndicator()`
- [ ] Call `setupSavedVehicleHandlers()` and `setupProfileDropdownToggle()` in useEffect
- [ ] Integrate `showTradeInSyncError()` in error handlers

---

## Testing

All features have been ported and TypeScript builds successfully. Next steps:

1. Integrate hooks into CalculatorApp.tsx
2. Test location auto-population flow
3. Test cash-down auto-population after vehicle selection
4. Test trade-in selection/calculation from My Garage
5. Test TIL controls (APR/Term +/- buttons)
6. Test diff indicators (green/red buyer-centric feedback)
7. Test slider tooltips showing monthly payment changes
8. Test error toasts for trade-in sync issues

---

## Files Created

1. `src/hooks/useLocationAutoPopulate.ts` - Location auto-population from profile
2. `src/hooks/useCashDownAutoPopulate.ts` - Cash-down auto-population
3. `src/hooks/useTradeInAutoPopulate.ts` - Trade-in management and calculations
4. `src/hooks/useTilBaselines.ts` - TIL baseline tracking and diff calculation
5. `src/ui/components/TilControl.tsx` - Interactive APR/Term control component
6. `src/utils/legacyHelpers.ts` - Global exports and buyer-perspective utilities

All helpers maintain backward compatibility with legacy `app.js` by exposing functions to `window` scope.
