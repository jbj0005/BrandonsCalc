# Fee Engine Activation Checklist

This checklist will guide you through activating the fee engine in your production app.

## ✅ Prerequisites (Already Complete)

- [x] Fee engine package built (`/packages/fee-engine/`)
- [x] Database migration applied
- [x] Florida fee rules migrated (14 rules)
- [x] Fee rules refined and tested
- [x] Calculator store integration complete
- [x] React hook created (`useFeeEngine`)
- [x] UI component created (`ScenarioDetectionPanel`)
- [x] Example component created (`FeeEngineExample`)

## 📋 Activation Steps

### Step 1: Identify Data Sources

You need to connect these data sources to the fee engine:

#### 1.1 User Profile (Required)
**Where does this data come from in your app?**

```typescript
// Example sources:
// - useAuth() hook
// - useUser() hook
// - Profile context
// - Supabase session

userProfile: {
  state_code: string,      // e.g., 'FL' ⭐ REQUIRED
  county_name: string,     // e.g., 'Brevard'
  city?: string,
  zip_code?: string,
}
```

**Action Required:**
- [ ] Find where user profile data is stored
- [ ] Verify it includes `state_code` and `county_name`
- [ ] If missing, add location fields to user profile

#### 1.2 Selected Vehicle (Optional but Recommended)
**Where does the selected vehicle come from?**

```typescript
// Example sources:
// - URL params from vehicle listing
// - Local state after VIN search
// - Context from vehicle selection flow

selectedVehicle: {
  vin?: string,
  year?: number,           // Used for fee rules
  make?: string,
  model?: string,
  condition?: 'new' | 'used',
  odometer?: number,
}
```

**Action Required:**
- [ ] Find where selected vehicle is stored
- [ ] Pass to fee engine hook

#### 1.3 Garage Vehicles (For Trade-ins)
**Where are garage vehicles stored?**

```typescript
// Example sources:
// - Supabase query (useQuery)
// - Context provider
// - Local state

garageVehicles: GarageVehicle[]
```

**Action Required:**
- [ ] Find where garage vehicles are fetched/stored
- [ ] Ensure `estimated_value` and `payoff_amount` are available

#### 1.4 Lender Information (Optional)
**Where does lender/financing info come from?**

```typescript
// Example sources:
// - Lender selection component
// - Rate calculator
// - Financing form

lenderInfo: {
  lenderName?: string,
  term: number,           // Used to determine if financed
  apr: number,
}
```

**Action Required:**
- [ ] Find where loan term and APR are stored
- [ ] Default to 0 if cash purchase

### Step 2: Choose Integration Point

**Where should the fee engine be integrated?**

Options:
1. **Main Calculator Component** (Recommended)
2. **FeesModal Component**
3. **Top-level App Component**
4. **Custom Fee Management Component**

**Recommended:** Integrate in the main calculator component that has access to all data sources.

**Action Required:**
- [ ] Choose integration point
- [ ] Verify component has access to:
  - Calculator store
  - User profile
  - Vehicle data
  - Garage vehicles

### Step 3: Wire Up the Hook

Add the `useFeeEngine` hook to your chosen component:

```typescript
import { useFeeEngine } from '../hooks/useFeeEngine';
import { useCalculatorStore } from '../stores/calculatorStore';

function YourMainCalculatorComponent() {
  // Get calculator state
  const sliders = useCalculatorStore(state => state.sliders);
  const selectedTradeInVehicles = useCalculatorStore(state => state.selectedTradeInVehicles);
  const applyFeeEngineResult = useCalculatorStore(state => state.applyFeeEngineResult);

  // Get your data sources
  const { userProfile } = useYourUserHook();  // REPLACE WITH YOUR HOOK
  const { selectedVehicle } = useYourVehicleHook();  // REPLACE WITH YOUR HOOK
  const { garageVehicles } = useYourGarageHook();  // REPLACE WITH YOUR HOOK
  const { lenderInfo } = useYourLenderHook();  // REPLACE WITH YOUR HOOK

  // Build trade-in vehicles array
  const selectedTradeIns = Array.from(selectedTradeInVehicles)
    .map(vehicleId => garageVehicles.find(v => v.id === vehicleId))
    .filter(Boolean)
    .map(v => ({
      id: v.id,
      estimated_value: v.estimated_value || 0,
      payoff_amount: v.payoff_amount || 0,
    }));

  // Use fee engine
  const { scenarioResult, isCalculating, error } = useFeeEngine({
    salePrice: sliders.salePrice.value,
    cashDown: sliders.cashDown.value,
    loanTerm: lenderInfo?.term || 0,
    apr: lenderInfo?.apr || 0,
    selectedTradeInVehicles: selectedTradeIns,
    userProfile,
    selectedVehicle,
    preferredLender: lenderInfo?.lenderName,
    enabled: Boolean(userProfile?.state_code),  // Only calculate if we have location
  });

  // Auto-apply result
  useEffect(() => {
    if (scenarioResult && !isCalculating) {
      applyFeeEngineResult(scenarioResult);
    }
  }, [scenarioResult, isCalculating]);

  // ... rest of your component
}
```

**Action Required:**
- [ ] Add imports
- [ ] Replace placeholder hooks with your actual hooks
- [ ] Wire up the fee engine hook
- [ ] Test that it receives correct data

### Step 4: Add UI Component

Add the `ScenarioDetectionPanel` to display the results:

```typescript
import { ScenarioDetectionPanel } from '../ui/components';

// In your render:
return (
  <div>
    {/* Existing calculator UI */}

    {/* Add this: Fee engine status panel */}
    <ScenarioDetectionPanel
      scenarioResult={useCalculatorStore(state => state.feeEngineResult)}
      isCalculating={isCalculating}
    />

    {/* Rest of your UI */}
  </div>
);
```

**Action Required:**
- [ ] Import `ScenarioDetectionPanel`
- [ ] Add to your UI
- [ ] Style/position as desired

### Step 5: Update FeesModal (Optional)

If you want government fees to be auto-calculated in the FeesModal:

```typescript
// In FeesModal.tsx
import { ScenarioDetectionPanel } from '../ui/components';
import { useCalculatorStore } from '../stores/calculatorStore';

export const FeesModal = ({ isOpen, onClose, ... }) => {
  const feeEngineResult = useCalculatorStore(state => state.feeEngineResult);
  const [autoModeEnabled, setAutoModeEnabled] = useState(true);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* Add scenario panel */}
      <ScenarioDetectionPanel
        scenarioResult={feeEngineResult}
        autoModeEnabled={autoModeEnabled}
        onToggleAutoMode={setAutoModeEnabled}
      />

      {/* Your existing fee entry UI */}
      {/* Make government fee rows read-only when autoModeEnabled */}
    </Modal>
  );
};
```

**Action Required:**
- [ ] Add `ScenarioDetectionPanel` to FeesModal
- [ ] Implement auto-mode toggle
- [ ] Make gov fees read-only in auto mode (optional)

### Step 6: Testing

Test the fee engine with different scenarios:

#### Test Case 1: Trade-in + Tag Transfer + Financing
- [ ] Add a garage vehicle with value > payoff
- [ ] Select it as trade-in
- [ ] Set loan term > 0
- [ ] Verify scenario: "Tag transfer from trade-in with financing"
- [ ] Verify fees: ~$100 government fees
- [ ] Verify title fee: Title Transfer ($75.25), NOT Title Fee

#### Test Case 2: No Trade-in + New Plate
- [ ] No trade-in selected
- [ ] Verify scenario: "Standard financed purchase" or similar
- [ ] Verify fees: ~$126 government fees
- [ ] Verify title fee: Title Fee Electronic ($77.25), NOT Title Transfer

#### Test Case 3: Cash Purchase
- [ ] Set loan term to 0
- [ ] Verify scenario mentions "cash"
- [ ] Verify NO lien filing fee ($2)

#### Test Case 4: Tax Calculation
- [ ] Sale price: $25,000
- [ ] Trade-in equity: $3,000
- [ ] Verify taxable base: $22,000
- [ ] Verify state tax (6%): $1,320
- [ ] Verify county tax (1% capped at $5k): $50
- [ ] Verify "capped" indicator shows

#### Test Case 5: Error Handling
- [ ] Test with missing user profile
- [ ] Verify friendly error message
- [ ] Test with invalid data
- [ ] Verify graceful fallback

**Action Required:**
- [ ] Run through all test cases
- [ ] Fix any issues
- [ ] Verify calculations match FL DMV

### Step 7: Production Deployment

Before deploying to production:

- [ ] Review all fee rules in database
- [ ] Verify tax rates are correct
- [ ] Test with real user data
- [ ] Add monitoring/logging for calculations
- [ ] Document any manual overrides needed
- [ ] Train support team on fee engine

## 🎯 Success Criteria

You'll know the fee engine is working when:

1. ✅ Scenario is automatically detected based on user input
2. ✅ Government fees auto-populate correctly
3. ✅ Tax rates are automatically set based on location
4. ✅ Title fee logic works (Transfer vs New - mutually exclusive)
5. ✅ Trade-in credit reduces taxable base
6. ✅ County tax cap applies correctly ($5k base limit)
7. ✅ Lien filing fee only appears when financed
8. ✅ Users can still manually override if needed
9. ✅ Calculations match FL DMV requirements

## 📊 Monitoring

After activation, monitor these metrics:

- Number of calculations per day
- Average calculation time
- Error rate
- Manual override rate
- User feedback on accuracy

## 🆘 Troubleshooting

### Fee engine not calculating
- Check if `userProfile.state_code` is set
- Verify `enabled: true` in hook params
- Check browser console for errors

### Wrong fees applied
- Verify scenario detection is correct
- Check database rules match FL DMV
- Review trade-in data (value vs payoff)

### Tax calculation incorrect
- Verify taxable base calculation
- Check if trade-in credit applied
- Confirm county tax cap logic

### Performance issues
- Check Supabase rule query performance
- Verify caching is working
- Consider reducing debounce time

## 📚 Resources

- [Complete System Summary](./fee-engine-summary.md)
- [Integration Guide](./fee-engine-integration.md)
- [Quick Reference](./fee-engine-quick-reference.md)
- [Example Component](../src/examples/FeeEngineExample.tsx)
- [FL DMV Fee Schedule](https://www.flhsmv.gov/)

## 🎉 You're Ready!

Once you've completed all steps in this checklist, your fee engine is live and automatically calculating fees for your users!

---

**Need Help?** Review the example component at `/src/examples/FeeEngineExample.tsx`
