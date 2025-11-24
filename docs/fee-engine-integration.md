# Fee Engine Integration Guide

The fee engine is now integrated with the calculator store. Here's how to use it in your components:

## 1. Basic Usage with `useFeeEngine` Hook

```typescript
import { useFeeEngine } from '../hooks/useFeeEngine';
import { useCalculatorStore } from '../stores/calculatorStore';

function YourComponent() {
  const sliders = useCalculatorStore((state) => state.sliders);
  const selectedTradeInVehicles = useCalculatorStore((state) => state.selectedTradeInVehicles);
  const applyFeeEngineResult = useCalculatorStore((state) => state.applyFeeEngineResult);

  // Assume you have these from context/props
  const { userProfile, selectedVehicle, garageVehicles, lenderInfo } = useYourData();

  // Auto-calculate fees
  const { scenarioResult, isCalculating, error } = useFeeEngine({
    // From calculator sliders
    salePrice: sliders.salePrice.value,
    cashDown: sliders.cashDown.value,
    loanTerm: lenderInfo?.term || 0,
    apr: lenderInfo?.apr || 0,

    // Trade-ins (convert from Set<id> to full vehicle objects)
    selectedTradeInVehicles: Array.from(selectedTradeInVehicles).map(id => {
      const vehicle = garageVehicles.find(v => v.id === id);
      return {
        id: vehicle.id,
        vin: vehicle.vin,
        estimated_value: vehicle.estimated_value,
        payoff_amount: vehicle.payoff_amount,
        lien_holder_name: vehicle.lien_holder_name,
      };
    }),

    // User/vehicle context
    userProfile,
    selectedVehicle,
    preferredLender: lenderInfo?.lenderName,

    // Optional: enable/disable auto-calculation
    enabled: true,
  });

  // Apply result to calculator store when available
  useEffect(() => {
    if (scenarioResult && !isCalculating) {
      applyFeeEngineResult(scenarioResult);
    }
  }, [scenarioResult, isCalculating, applyFeeEngineResult]);

  return (
    <div>
      {isCalculating && <LoadingSpinner />}
      {error && <ErrorMessage error={error} />}
      {scenarioResult && (
        <ScenarioInfo
          scenario={scenarioResult.detectedScenario}
          govFees={scenarioResult.totals.governmentFees}
          salesTax={scenarioResult.totals.salesTax}
        />
      )}
    </div>
  );
}
```

## 2. Accessing Fee Engine Result from Store

The scenario result is stored in the calculator store and can be accessed anywhere:

```typescript
import { useCalculatorStore } from '../stores/calculatorStore';

function ScenarioBadge() {
  const feeEngineResult = useCalculatorStore((state) => state.feeEngineResult);

  if (!feeEngineResult) {
    return null;
  }

  return (
    <div>
      <h3>{feeEngineResult.detectedScenario.description}</h3>
      <p>Government Fees: ${feeEngineResult.totals.governmentFees.toFixed(2)}</p>
      <p>Sales Tax: ${feeEngineResult.totals.salesTax.toFixed(2)}</p>

      {/* Show fee breakdown */}
      <ul>
        {feeEngineResult.lineItems
          .filter(item => item.category === 'government')
          .map((item, index) => (
            <li key={index}>
              {item.description}: ${item.amount.toFixed(2)}
            </li>
          ))}
      </ul>
    </div>
  );
}
```

## 3. Manual Recalculation

If you need to manually trigger a recalculation:

```typescript
function RecalculateButton() {
  const { recalculate, isCalculating } = useFeeEngine({
    // ... your params
  });

  return (
    <button onClick={recalculate} disabled={isCalculating}>
      {isCalculating ? 'Calculating...' : 'Recalculate Fees'}
    </button>
  );
}
```

## 4. Updating FeesModal to Show Auto-Calculated Fees

```typescript
// In your FeesModal component
function FeesModal() {
  const feeEngineResult = useCalculatorStore((state) => state.feeEngineResult);
  const govtFees = useCalculatorStore((state) => state.feeItems.gov);

  return (
    <Modal>
      {feeEngineResult && (
        <div className="scenario-info">
          <Badge>{feeEngineResult.detectedScenario.description}</Badge>
          <p>Auto-calculated based on your scenario</p>
        </div>
      )}

      {/* Government fees are now auto-populated */}
      <FeeSection title="Government Fees" fees={govtFees} readonly />

      {/* Dealer fees can still be edited */}
      <FeeSection title="Dealer Fees" fees={dealerFees} editable />
    </Modal>
  );
}
```

## 5. Data Flow

```
User Input (sliders, vehicle selection, etc.)
  ↓
useFeeEngine hook
  ↓
FeeEngineService.calculateFees()
  ↓
CalculatorAdapter.mapToScenarioInput()
  ↓
FeeCalculator.calculate() + Tax Calculator + Rules Evaluator
  ↓
ScenarioResult
  ↓
applyFeeEngineResult() updates calculator store
  ↓
Calculator UI updates automatically
```

## 6. Scenario Detection

The fee engine automatically detects the scenario based on your input:

- **Tag transfer from trade-in** - Has trade-in, transfers plate
- **New tag purchase** - No trade-in, needs new plate
- **First-time FL registration** - Out-of-state buyer
- **Cash vs Financed** - Based on loan term > 0

## 7. Fee Logic Summary

### Title Fees (Mutually Exclusive)
- **Title Transfer ($75.25)** - When has trade-in
- **Title Fee Electronic ($77.25)** - When NO trade-in

### Registration Fees
- **Initial Registration ($225)** - First-time FL registration only
- **New Plate ($28)** - When plateScenario = 'new_plate'
- **Registration Transfer ($4.60)** - When plateScenario = 'transfer_existing_plate'
- **Base Registration ($14.50)** - Always applies

### Other Fees
- **Lien Filing ($2)** - Only if financed
- **Branch Processing ($0.50)** - Always applies
- **Air Pollution Control ($1)** - Always applies
- **Initial Additional Fee ($1.50)** - Always applies
- **Decal Fee ($1)** - Always applies

### Tax Calculation
- **State Tax:** 6% of taxable base
- **County Tax:** 1% of taxable base, capped at $5,000 base (FL law)
- **Taxable Base:** Sale price - trade-in equity

## 8. Manual Overrides

Users can still manually edit fees if needed. Track overrides with the `userTaxOverride` flag:

```typescript
const userTaxOverride = useCalculatorStore((state) => state.userTaxOverride);

// When user manually edits fees
setTaxRates(newStateTax, newCountyTax, true); // true = user override

// Show indicator
{userTaxOverride && <Badge>Manual Override</Badge>}
```

## 9. Caching & Performance

- Jurisdiction rules cached for 5 minutes
- Dealer configs cached for 10 minutes
- Debounced recalculation (500ms) to avoid excessive API calls
- Params hashing to avoid redundant calculations

## 10. Error Handling

```typescript
const { error } = useFeeEngine({ /* params */ });

if (error) {
  console.error('Fee calculation error:', error);
  // Fallback to manual entry
  return <ManualFeeEntry />;
}
```

---

## Complete Example

See `/src/examples/FeeEngineExample.tsx` for a complete working example.
