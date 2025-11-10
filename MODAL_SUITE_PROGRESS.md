# BrandonsCalc Modal Suite - Rebuild Progress

## ✅ Completed Modals (6/17)

### 1. ✅ UnavailableVehicleModal
**Status**: Complete
**File**: `src/ui/components/UnavailableVehicleModal.tsx`
**Purpose**: Shows when MarketCheck reports a saved listing has vanished
**Features**:
- Displays vehicle details (year/make/model/trim/mileage/VIN)
- "Remove Vehicle" button deletes from Supabase `vehicles` table
- Reloads saved vehicles and shows toast notification
- Window exports: `window.closeUnavailableVehicleModal`, `window.removeUnavailableVehicle`

### 2. ✅ AprConfirmationModal
**Status**: Complete
**File**: `src/ui/components/AprConfirmationModal.tsx`
**Purpose**: Surfaces before review/submit when custom APR override exists
**Features**:
- Side-by-side comparison of lender APR vs custom APR
- Diff badges showing better/worse rates
- "Reset to Lender APR" or "Continue with Custom APR" actions
- Buyer-centric color coding (green = better, red = worse)
- Window exports: `window.closeAprConfirmationModal`

### 3. ✅ DuplicateVehicleModal
**Status**: Complete
**File**: `src/ui/components/DuplicateVehicleModal.tsx`
**Purpose**: Shows when saving a garage vehicle with VIN collision
**Features**:
- Side-by-side comparison of existing vs new vehicle data
- Highlights changed fields with yellow background
- "Keep Existing" vs "Overwrite with New Data" actions
- Compares all fields: nickname, year, make, model, trim, mileage, condition, value, payoff
- Window exports: `window.closeDuplicateVehicleModal`

### 4. ✅ ConflictResolutionModal
**Status**: Complete
**File**: `src/ui/components/ConflictResolutionModal.tsx`
**Purpose**: Shows when editing a saved vehicle if Supabase changed fields mid-edit
**Features**:
- Lists per-field diffs in a table (Field | Your Changes | Server Data)
- "Cancel My Edits" vs "Overwrite Server Data" actions
- Resolves via Promise pattern for blocking saves
- Custom formatters per field type (currency, mileage, etc.)
- Window exports: `window.closeConflictResolutionModal`

### 5. ✅ EmailHandshakeModal
**Status**: Complete
**File**: `src/ui/components/EmailHandshakeModal.tsx`
**Purpose**: Shows progress during email sending
**Features**:
- 4 stages: saving → sending → success → error
- Animated progress bar (33% → 66% → 100%)
- Stage-specific icons and messages
- Auto-closes on success after 2 seconds
- Retry button on error
- Window exports: `window.closeEmailHandshakeModal`, `window.setEmailHandshakeStage`

### 6. ✅ SendModeModal
**Status**: Complete
**File**: `src/ui/components/SendModeModal.tsx`
**Purpose**: Dev-only prompt for production vs dev simulation
**Features**:
- Side-by-side comparison of Production vs Dev mode
- Supports email and SMS channels
- "Remember my choice" checkbox
- Returns Promise with `{mode, remember}` result
- Window exports: `window.closeSendModeModal`, `window.promptSendMode`

---

## 🚧 Remaining Modals (11/17)

### 7. ⏳ FeesModal
**Status**: Not started
**Complexity**: High (complex fee management with categories)
**Source**: app.js:6109, 6173, 6201
**Features Needed**:
- Initialize from `FEE_CATEGORY_CONFIG` (Registration, Tax, Protection, Dealer, Other)
- Category containers with drag-drop line items
- Tax inputs with location-based labels
- "Manage Fees" button → opens EditFeeModal
- Suggestion datalists for common fees
- ESC-to-close and body scroll blocking
- Window exports: `window.openFeesModal`, `window.closeFeesModal`

### 8. ⏳ EditFeeModal
**Status**: Not started
**Complexity**: Medium
**Source**: app.js:12564, 12608
**Features Needed**:
- Triggered from FeesModal "Manage" button
- Category preselection
- Fee name/amount inputs with validation
- Form submission → updates fee list
- ESC to close, resets form state
- Window exports: `window.openEditFeeModal`, `window.closeEditFeeModal`

### 9. ⏳ CustomerProfileModal
**Status**: Not started
**Complexity**: High (Google Places integration)
**Source**: app.js:6583, 6617, 6639, 6660
**Features Needed**:
- Loads Supabase customer_profiles
- Google Places autocomplete for address
- Phone/email/name fields
- Preferred settings (credit score, down payment, lender, term)
- Body scroll disable and ESC/backdrop close
- `attachProfileMenuHook` for dropdown re-binding
- Window exports: `window.openCustomerProfileModal`, `window.closeCustomerProfileModal`

### 10. ⏳ ReviewContractModal
**Status**: Not started
**Complexity**: Very High (full TIL/contract review)
**Source**: app.js:6213, 6334, 6559
**Features Needed**:
- Calls `computeReviewData()` for all calculations
- Renders TIL cards: APR, Term, Finance Charge, Amount Financed, Total Payments, Monthly Finance Charge
- Trade-in section with garage vehicle cards (hides when none selected)
- Cash-to-close itemization: Sale Price, Down Payment, Trade Equity, Taxes, Fees, Cash Due
- Location-specific tax labels via `formatTaxLabelText`
- APR confirmation flow integration
- Window exports: `window.openReviewContractModal`, `window.closeReviewContractModal`, `window.proceedToReviewModal`

### 11. ⏳ SubmitOfferModal
**Status**: Not started
**Complexity**: Very High (offer submission with previews)
**Source**: app.js:10844, 10945, 10969
**Features Needed**:
- `verifyVehicleBeforeSubmit()` validation flow
- Customer/dealer fields from Supabase/wizardData
- Offer preview rendering with full calculations
- My Garage CTA if trade data missing
- Routes through APR confirmation when needed
- Share/Email/SMS button orchestration
- Window exports: `window.openSubmitOfferModal`, `window.closeSubmitOfferModal`, `window.openPreviewFlow`

### 12. ✅ My Garage Modal
**Status**: Partially complete (exists as UserProfileModal "garage" tab)
**File**: `src/components/UserProfileModal.tsx`
**Enhancement Needed**:
- Trade-in checkboxes beside each card (already integrated via useTradeInAutoPopulate)
- Just needs UI wiring to show checkboxes

### 13. ⏳ EditGarageVehicleModal
**Status**: Partially complete (exists as VehicleEditorModal)
**File**: `src/ui/components/VehicleEditorModal.tsx`
**Enhancement Needed**:
- Add `dataset.editingVehicleId` tracking
- Currency formatting for value/payoff inputs
- `saveEditedVehicle` validation and Supabase update
- Refresh trade totals if edited car was selected
- Window exports: `window.openEditVehicleModal`, `window.closeEditVehicleModal`

### 14. ✅ My Saved Vehicles Modal
**Status**: Complete (exists as UserProfileModal "garage" tab with vehicles table)
**File**: `src/components/UserProfileModal.tsx`
**Features**: Already implemented in UserProfileModal

### 15. ✅ My Offers Modal
**Status**: Placeholder (exists as UserProfileModal "offers" tab)
**File**: `src/components/UserProfileModal.tsx`
**Enhancement Needed**:
- Load saved offers from `customer_offers` table
- Render offer cards with Share/Email/SMS actions
- `attachSavedOffersMenuHook` for dropdown binding
- Window exports: `window.openMyOffersModal`, `window.closeMyOffersModal`

### 16. ⏳ Edit Saved Vehicle Modal
**Status**: Not started
**Complexity**: High
**Source**: app.js:9933, 10028, 10039
**Features Needed**:
- Opens from Saved Vehicles grid
- Loads `vehicles` table row
- Stores `originalVehicleData` for conflict detection
- Dealer/listing fields
- `saveSavedVehicleChanges` with conflict resolution flow
- Updates via `savedVehiclesCache.updateVehicle`
- Window exports: `window.openEditSavedVehicleModal`, `window.closeEditSavedVehicleModal`

### 17. ⏳ Add Vehicle to Garage Modal
**Status**: Not started
**Complexity**: Medium
**Features Needed**:
- Converts saved vehicle to garage vehicle
- Copies relevant fields from `vehicles` to `garage_vehicles`
- Prompts for nickname, estimated value, payoff amount
- Success toast and garage refresh

---

## Summary

**Completed**: 6/17 modals (35%)
**Remaining**: 11 modals
**Build Status**: ✅ Passing
**TypeScript**: ✅ No errors

### Complexity Breakdown (Remaining):
- **Very High**: 2 modals (ReviewContractModal, SubmitOfferModal)
- **High**: 3 modals (FeesModal, CustomerProfileModal, Edit Saved Vehicle Modal)
- **Medium**: 3 modals (EditFeeModal, EditGarageVehicleModal, Add Vehicle to Garage)
- **Low**: 3 modals (enhancements to existing UserProfileModal tabs)

### Next Steps:
1. Create medium-complexity modals (EditFeeModal, EditGarageVehicleModal)
2. Tackle high-complexity modals (FeesModal, CustomerProfileModal, Edit Saved Vehicle)
3. Build very high-complexity modals (ReviewContractModal, SubmitOfferModal)
4. Enhance UserProfileModal tabs (trade-in checkboxes, offers list)
5. Wire all window exports into CalculatorApp
6. Integration testing of full modal flows

### Files Modified:
- `src/ui/components/index.ts` - Added exports for 6 new modals
- All new modal files include window exports for legacy compatibility
- All modals use consistent base Modal component with ESC/backdrop support

---

## Integration Notes

All completed modals:
- ✅ Export to `window` for legacy HTML buttons
- ✅ Support ESC key to close
- ✅ Support backdrop click to close (configurable)
- ✅ Use consistent Modal base component
- ✅ Include TypeScript types
- ✅ Build without errors

Ready for integration into CalculatorApp.tsx with proper state management and callback wiring.
