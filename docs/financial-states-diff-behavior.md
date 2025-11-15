## Financial State & Diff Mechanics

This document explains how pricing sliders, APR controls, and their diff indicators work so another engineer can rebuild the experience from scratch.

---

### 1. Terminology

| Term | Meaning |
| --- | --- |
| **State 0 (Sliders)** | The theoretical zero point ($0) before any vehicle or slider baseline is set. We never display diffs against State 0 once a real baseline exists. |
| **State 1 (Sliders)** | The baseline value we consider “the offer on the table.” For sale price this is the vehicle’s ask when a vehicle is selected, or the first settled slider value (after 2 s of inactivity) when no vehicle is loaded. |
| **State 2 (Sliders)** | The user’s live edits after State 1 is locked. Diffs shown under the sliders compare the current value (State 2) to State 1. |
| **State 0 (APR)** | The lender‑recommended APR loaded when the page/rates load. |
| **State 1 (APR)** | The first custom APR after the user stops adjusting for 2 s. |
| **State 2 (APR)** | Any subsequent APR change. The diff compares State 2 to State 1, while the confirmation modal compares State 2 to State 0. |

The term **“settling delay”** refers to the 2 s timer we reuse whenever we need to promote a value to State 1.

---

### 2. Slider Interaction Model

#### 2.1 Hover‑activated keyboard control
* Each `EnhancedSlider` registers itself with a global “active slider” store.
* On mouse enter or focus, the slider claims keyboard control; moving the mouse away or blurring releases control (unless another slider already claimed it).
* Arrow keys are handled only if the slider is active; this prevents previously selected sliders from reacting when the user hovers elsewhere.

#### 2.2 Rounding, snapping, and increments
* Every slider value change runs through `normalizeSliderValue`:
  * Snap to baseline (State 1) whenever the new value sits within the snap threshold.
  * Otherwise round to the slider’s configured step (`step` prop). If no step is provided, round to cents (0.01).
* Arrow keys inherit the same logic. To prevent “sticky” behavior, we temporarily disable snapping on the very first key press leaving the baseline.
* Dragging, arrow keys, and manual inputs all write back the rounded value before notifying React, so the UI and store always agree about the canonical number.

#### 2.3 Diff visibility
* The inline diff text and tooltips only render once a State 1 baseline exists.  
* Diffs never reference State 0; until we have State 1 we simply hide them.
* After a diff is visible, it stays visible even if the user steers back toward baseline. It only disappears when the value snaps exactly to the baseline.

#### 2.4 Baseline promotion (State 1)
* Vehicle selected → immediately sets sale price State 1 (`salePriceDiffBaseline`) plus its baseline payment snapshot.
* When no vehicle is selected:
  * The slider store constantly tracks user edits.
  * After 2 s of inactivity the store copies the current values into its internal baselines; `CalculatorApp` watches for “baseline == value > 0 and diff baseline is null” to capture State 1.
  * Once captured we also snapshot the current monthly payment (used by the tooltip).

#### 2.5 Reset link behavior
* “Reset” sets the slider back to State 1 when one exists (sale price uses `setSliderValue(..., true)` so both value and baseline stay aligned).  
* If State 1 does not exist yet, Reset falls back to the slider store baseline (which mirrors the last settled value).

#### 2.6 Tooltips & payment diffs
* Hovering reveals a tooltip that shows the current monthly payment plus the diff against the State 1 payment baseline.
* The tooltip diff remains hidden until the payment baseline is known (for sliders, that’s the first time we capture State 1).

---

### 3. APR & Term Baselines

#### 3.1 APR State 0 vs State 1
* State 0 is `lenderBaselineApr`, captured whenever lender rates load or change. The APR confirmation modal compares the current APR against this value.
* State 1 (`aprUserBaseline`) is captured via the same 2 s settling delay used for sliders:
  * Every APR change schedules a timeout.
  * If the user continues editing, the timeout is cleared/rescheduled.
  * When the timer fires we promote the current APR to State 1 and snapshot the current monthly payment.

#### 3.2 Payment baselines
* `aprInitialPayment` stores the monthly payment associated with State 0 (first time we compute a non‑zero payment after lender rates load).
* `aprUserBaselinePayment` stores the payment at the moment APR becomes State 1.
* Tooltips and inline diffs show `currentPayment – (State 1 payment if it exists, else State 0 payment)`.

#### 3.3 Reset logic
* Resetting to lender APR clears the settle timer, erases State 1, and restores APR to State 0 so the diff once again references the lender rate.
* Changing lenders also clears the timer and baselines so the new lender’s State 0 takes effect immediately.

---

### 4. Truth-in-Lending diffs

* `useTilBaselines` tracks the immutable baseline for APR/term/finance charge, etc. It only updates when we call `resetBaselines` (vehicle change) or when we first call `updateBaselines`.
* `calculateDiffs` compares the live calculator values to those baselines, applying thresholds (e.g., $1 for currency, 1 month for terms) so tiny differences stay hidden.
* Finance charge/amount financed diffs are suppressed unless APR or term actually changed, keeping the TIL readout focused on meaningful adjustments.

---

### 5. Settling Timer & Store Coordination

* The slider store keeps a single timer ID; every slider movement resets the 2 s delay. When the delay fires, all slider baselines are updated to the current values.
* A similar timer exists for APR; it’s managed directly inside `CalculatorApp` because APR isn’t part of the slider store.
* When timers are cleared (component unmount, vehicle change, lender change) we must always `clearTimeout` to avoid promoting stale values.

---

### 6. Key Gotchas

1. **Payment snapshots must be kept in sync.** Always update refs such as `latestAprPaymentRef` inside a `useEffect` on `monthlyPayment` before using them in timer callbacks.
2. **Diff baselines should reset on major state changes.** Selecting a vehicle, clearing a vehicle, changing lenders, or resetting to lender APR must null out the State 1 baselines so we don’t show old diffs.
3. **Keyboard focus vs hover.** Because sllders can be tabbed, we claim keyboard control both on focus and on hover. Remember to release control when either focus or hover ends.
4. **Rounding order matters.** Round before updating slider state to avoid mismatches between the UI thumb and the store value.
5. **Snap threshold interacts with step sizes.** For large steps (e.g., $100 increments) set the snap threshold to the same value so users can land on State 1 precisely even if the base value isn’t divisible by the step.
6. **APR confirmation depends on State 0 vs State 1.** Even if the diff display uses State 1, the confirmation modal should compare to State 0 so users are warned only when they deviated from the lender’s offer.

---

### 7. Testing Expectations

* `__tests__/enhanced-slider.test.ts` covers rounding/snap helpers (including disable‑snap for arrow keys).
* `__tests__/calculator-store.test.ts` ensures the slider store’s 2 s settling delay updates baselines for *all* sliders and resets timers correctly.
* Manual QA instructions should include:
  * Hover over a slider, use arrow keys, confirm only that slider moves.
  * Select a vehicle, tweak sale price, observe diff and payment tooltip show changes from vehicle ask.
  * Change APR, wait for 2 s, tweak again, confirm diff is relative to the previous settled APR.
  * Change lender, confirm APR diff resets and the confirmation modal references the new lender rate.

---

### 8. Recreating the Feature Set

When reimplementing, follow this sequence:

1. Implement baseline tracking hooks (`useTilBaselines`, slider store baselines).
2. Implement the hover/focus keyboard store so arrow keys affect the correct slider.
3. Implement the settling timers for sliders (already in the store) and APR (inside the calculator component).
4. Wire up diff baselines:
   * For sliders: `salePriceDiffBaseline`, `salePricePaymentBaseline`, etc.
   * For APR: `aprUserBaseline`, `aprInitialPayment`, `aprUserBaselinePayment`.
5. Add reset handlers that prefer State 1 when present.
6. Render diffs only when State 1 exists; keep tooltips and inline text in sync with the same baseline.

With these concepts captured, a new engineer should be able to rebuild the calculator’s negotiation UX without reading the existing implementation.
