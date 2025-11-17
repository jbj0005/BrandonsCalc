## Financial State & Diff Mechanics

This document explains how pricing sliders, APR controls, and their diff indicators work so another engineer can rebuild the experience from scratch.

**Last Updated:** 2024-12-15 (includes persistent diff changes, APR dual-diff system, and State 0 payment baselines)

---

### 1. Terminology

| Term | Meaning |
| --- | --- |
| **State 0 (Sliders)** | The original/asking baseline value. For sale price, this is `selectedVehicleSaleValue` (dealer's asking price). For cash down/trade allowance, this is $0. This is used for PERSISTENT diffs that never update. |
| **State 1 (Sliders)** | The settled/baseline value after 2s of inactivity. Used for value diff display (the +/- number shown below slider). Updates dynamically when slider settles. |
| **State 2 (Sliders)** | The user's live edits after State 1 is locked. Current slider value during interaction. |
| **State 0 (APR)** | The lender-recommended APR (`lenderBaselineApr`) loaded when rates load. Used in APR confirmation modal. |
| **State 1 (APR)** | No longer captured. We removed `aprUserBaseline` in favor of dynamic calculations. |
| **State 2 (APR)** | Current APR value set by user. |

The term **"settling delay"** refers to the 2s timer we use for slider State 1 promotion.

**CRITICAL CHANGE**: We now maintain **State 0 payment calculations** that are persistent and never update, used for payment diff display.

---

### 2. State 0 Payment Baselines (NEW - Persistent Diffs)

These payment calculations are computed once and never update, ensuring diffs remain visible even after sliders settle:

#### 2.1 Cash Down State 0 Payment
```typescript
const cashDownState0Payment = useMemo(() => {
  if (cashDown === 0) return null; // Already at State 0

  return calculateMonthlyPaymentFor({
    ...currentSliders,
    cashDown: 0, // State 0 = $0 down
  });
}, [dependencies]);
```
- **Purpose**: Show monthly payment impact of having cash down vs $0 down
- **Baseline**: Always $0 cash down
- **Display**: "↓ $XX from $0 baseline"

#### 2.2 Sale Price State 0 Payment
```typescript
const salePriceState0Payment = useMemo(() => {
  const state0SalePrice = selectedVehicleSaleValue ?? salePrice;
  if (Math.abs(salePrice - state0SalePrice) < 0.01) return null;

  return calculateMonthlyPaymentFor({
    ...currentSliders,
    salePrice: state0SalePrice, // Use original asking price
  });
}, [dependencies]);
```
- **Purpose**: Show monthly payment savings from negotiating below asking price
- **Baseline**: Always original asking price (`selectedVehicleSaleValue`)
- **Display**: "↓ $XX from $XX,XXX asking price"

#### 2.3 Trade Allowance State 0 Payment
```typescript
const tradeAllowanceState0Payment = useMemo(() => {
  if (tradeAllowance === 0) return null;

  const state0NetEquity = 0 - tradePayoff;
  const state0AppliedToBalance = Math.abs(Math.min(0, state0NetEquity));

  return calculateMonthlyPaymentFor({
    ...currentSliders,
    appliedToBalance: state0AppliedToBalance,
    cashoutAmount: 0,
  });
}, [dependencies]);
```
- **Purpose**: Show monthly payment impact of trade-in vs no trade-in
- **Baseline**: Always $0 trade-in allowance
- **Handles**: Both positive equity (reduces payment) and negative equity (increases payment)

---

### 3. APR Baseline System (Updated)

#### 3.1 Removed Concepts
- ❌ `aprInitialPayment` (static snapshot) - REMOVED
- ❌ `aprUserBaseline` (State 1 tracking) - REMOVED
- ❌ `aprUserBaselinePayment` - REMOVED

#### 3.2 Current APR System (Dual-Diff Approach)

**Dynamic Baseline Payment:**
```typescript
const aprBaselinePayment = useMemo(() => {
  if (!hasCustomApr || lenderBaselineApr == null) return null;

  const baselineSalePriceValue = salePriceDiffBaseline ?? salePrice;

  return calculateMonthlyPaymentFor({
    salePrice: baselineSalePriceValue, // Use settled sale price
    apr: lenderBaselineApr, // Use lender APR
    ...otherCurrentSliders
  });
}, [dependencies]);
```

**Pure APR Diff (for tooltip breakdown):**
```typescript
const aprPaymentDiffPure = useMemo(() => {
  const baselineSalePriceValue = salePriceDiffBaseline ?? salePrice;

  const paymentWithCurrentApr = calculateMonthlyPaymentFor({
    salePrice: baselineSalePriceValue, // Baseline sale price
    apr: apr, // Current APR
    ...
  });

  return paymentWithCurrentApr - aprBaselinePayment;
}, [dependencies]);
```
- **Purpose**: Isolate the APR impact from sale price changes
- **Used in**: Tooltip breakdown showing pure APR vs sale price impact

**Buyer Perspective APR Diff:**
```typescript
const aprPaymentDiffFromLender = useMemo(() => {
  const baselinePaymentWithCurrentSliders = calculateMonthlyPaymentFor({
    salePrice, // CURRENT sale price
    apr: lenderBaselineApr, // Lender baseline APR
    ...
  });

  return monthlyPayment - baselinePaymentWithCurrentSliders;
}, [dependencies]);
```
- **Purpose**: Total impact from buyer's perspective with current sliders
- **Used in**: Static diff note below APR control

#### 3.3 Sale Price State 0 Diff (for APR control display)
```typescript
const salePriceState0Diff = useMemo(() => {
  const state0Price = selectedVehicleSaleValue;
  if (!state0Price || Math.abs(salePrice - state0Price) < 0.01) return null;

  return salePriceState0Payment != null
    ? monthlyPayment - salePriceState0Payment
    : null;
}, [dependencies]);
```
- **Purpose**: Show sale price impact as separate note below APR control
- **Display**: "↓ $XX from $XX,XXX asking price"

---

### 4. Slider Interaction Model

#### 4.1 Hover-activated keyboard control
* Each `EnhancedSlider` registers itself with a global "active slider" store.
* On mouse enter or focus, the slider claims keyboard control; moving the mouse away or blurring releases control.
* Arrow keys are handled only if the slider is active.

#### 4.2 Rounding, snapping, and increments
* Every slider value change runs through `normalizeSliderValue`:
  * Snap to baseline (State 1) whenever the new value sits within the snap threshold.
  * Otherwise round to the slider's configured step.
* Arrow keys inherit the same logic with temporary snap-disable on first keypress from baseline.

#### 4.3 Diff visibility - UPDATED
* **Value Diff**: Shows difference from State 1 (settled baseline) - updates when slider settles
* **Payment Diff**: Shows difference from State 0 (persistent baseline) - NEVER updates
* Both diffs remain visible even if user steers back toward baseline
* Only disappears when value snaps exactly to baseline

#### 4.4 Baseline promotion (State 1)
* Vehicle selected → immediately sets `selectedVehicleSaleValue` as State 0
* After 2s of inactivity:
  * Slider store updates State 1 baselines
  * `CalculatorApp` captures `salePriceDiffBaseline` when detected
  * Payment snapshots are NOT taken (we use State 0 payments instead)

#### 4.5 EnhancedSlider Props - UPDATED
```typescript
interface EnhancedSliderProps {
  baselineValue?: number;           // State 0 for reset and display
  diffBaselineValue?: number;        // State 1 for VALUE diff (+/- number)
  diffBaselinePayment?: number;      // State 0 PAYMENT for payment diff note
  monthlyPayment?: number;           // Current monthly payment
  // ... other props
}
```

**Key Distinction:**
- `diffBaselineValue`: Used for STATE 1 (dynamic, updates when slider settles)
- `diffBaselinePayment`: Used for STATE 0 (persistent, never updates)

**Example (Sale Price slider):**
```typescript
<EnhancedSlider
  label="Sale Price"
  value={salePrice}
  baselineValue={selectedVehicleSaleValue ?? salePrice}  // State 0
  diffBaselineValue={selectedVehicleSaleValue ?? undefined}  // State 0 (persistent)
  diffBaselinePayment={salePriceState0Payment ?? undefined}  // State 0 payment
  monthlyPayment={monthlyPayment}
/>
```

**Example (Cash Down slider):**
```typescript
<EnhancedSlider
  label="Cash Down"
  value={cashDown}
  baselineValue={0}  // State 0
  diffBaselineValue={0}  // State 0 (persistent)
  diffBaselinePayment={cashDownState0Payment ?? undefined}  // State 0 payment
  monthlyPayment={monthlyPayment}
/>
```

#### 4.6 Tooltips & payment diffs - UPDATED
* Hovering reveals tooltip showing current monthly payment
* Payment diff note (static, below slider) compares to State 0 payment (persistent)
* Format: "↓ $XX from $XX,XXX baseline"

---

### 5. Truth-in-Lending Diffs

* `useTilBaselines` tracks immutable baselines for TIL disclosures
* Updates only on `resetBaselines` (vehicle change) or first `updateBaselines`
* `calculateDiffs` compares live values to baselines with thresholds
* Finance charge/amount financed diffs suppressed unless APR or term changed

---

### 6. Settling Timer & Store Coordination

* Slider store keeps single timer for all sliders (2s delay)
* When timer fires, all slider baselines update to current values (State 1)
* APR has no settle timer anymore (we removed State 1 tracking)
* Always `clearTimeout` on unmount, vehicle change, lender change

---

### 7. Key Gotchas - UPDATED

1. **State 0 vs State 1 distinction is critical:**
   - State 0 = Persistent baseline for payment diffs (never updates)
   - State 1 = Dynamic baseline for value diffs (updates on settle)

2. **APR baseline must recalculate dynamically:**
   - No static snapshots
   - `aprBaselinePayment` uses current sale price with lender APR
   - Ensures APR diff updates when sale price changes

3. **Persistent diffs require State 0 calculations:**
   - Each slider with persistent diff needs its own State 0 payment calculation
   - Must handle edge cases (e.g., already at State 0)

4. **Sale Price has special State 0:**
   - State 0 is `selectedVehicleSaleValue` (dealer asking price)
   - NOT $0 like other sliders

5. **EnhancedSlider prop mapping:**
   - `diffBaselineValue` → State 1 (for value diff)
   - `diffBaselinePayment` → State 0 payment (for payment diff)
   - Don't confuse these!

6. **Trade allowance State 0 includes equity calculation:**
   - Must calculate equity with $0 trade-in
   - Handle negative equity (payoff with no trade becomes balance increase)

7. **APR confirmation depends on lender baseline:**
   - Modal compares to `lenderBaselineApr` (State 0)
   - Even though diff display uses dynamic calculation

---

### 8. Testing Expectations

* Slider persistence:
  * Select vehicle with asking price $30,000
  * Negotiate to $28,000
  * Wait 2s for settle
  * Payment diff should STILL show savings vs $30,000 asking
  * Value diff shows $0 (at State 1)

* Cash Down persistence:
  * Set cash down to $5,000
  * Wait 2s for settle
  * Payment diff should STILL show impact vs $0 down

* APR dynamic baseline:
  * Select vehicle, negotiate price down
  * Change APR
  * APR diff should reflect new negotiated price, not original asking

* Sale Price dual usage:
  * Sale Price slider uses State 0 for BOTH value and payment diffs
  * Ensures persistence for both types

---

### 9. Recreating the Feature Set

When reimplementing, follow this sequence:

1. **Implement State 0 payment calculations:**
   - `cashDownState0Payment`
   - `salePriceState0Payment`
   - `tradeAllowanceState0Payment`

2. **Implement dynamic APR baseline:**
   - `aprBaselinePayment` (recalculates with current sliders)
   - `aprPaymentDiffPure` (isolates APR impact)
   - `aprPaymentDiffFromLender` (buyer perspective)

3. **Wire up EnhancedSlider props correctly:**
   - `diffBaselineValue` = State 1 or State 0 (depending on slider)
   - `diffBaselinePayment` = State 0 payment calculation

4. **Implement dual-diff display:**
   - Tooltip: Shows current payment
   - Static note: Shows payment diff from State 0
   - Value diff: Shows value diff from State 1

5. **Handle edge cases:**
   - Null checks when already at State 0
   - Sale price special case (State 0 = asking price)
   - Trade allowance equity calculation

With these concepts captured, a new engineer should be able to rebuild the calculator's persistent diff system and understand why we have both State 0 and State 1 baselines.

---

## Appendix: Data Flow Diagram

```
Vehicle Selected
       ↓
selectedVehicleSaleValue = $30,000 (State 0)
       ↓
User negotiates to $28,000
       ↓
Wait 2s → Settle
       ↓
salePriceDiffBaseline = $28,000 (State 1)
       ↓
User continues to $27,500
       ↓
VALUE DIFF: $27,500 - $28,000 = -$500 (vs State 1)
PAYMENT DIFF: payment($27,500) - payment($30,000) = -$XX (vs State 0)
                                                      ↑
                                             PERSISTENT - never changes
```
