# Fee Engine - Quick Reference

## 📁 File Locations

### Core Package (`/packages/fee-engine/`)
```
packages/fee-engine/
├── src/
│   ├── types/
│   │   ├── scenario-input.ts           # Input schema
│   │   ├── scenario-result.ts          # Output schema
│   │   ├── jurisdiction-rules.ts       # Rule types
│   │   └── dealer-config.ts            # Dealer config
│   ├── engine/
│   │   ├── fee-calculator.ts           # Main calculator ⭐
│   │   ├── tax-calculator.ts           # FL tax logic
│   │   └── scenario-detector.ts        # Scenario detection
│   ├── rules/
│   │   └── evaluator.ts                # JSONLogic evaluator ⭐
│   ├── adapters/
│   │   └── calculator-adapter.ts       # State mapping ⭐
│   └── index.ts                        # Exports
├── dist/                                # Compiled output
├── package.json
└── tsconfig.json
```

### Integration Layer (`/src/`)
```
src/
├── services/
│   └── feeEngineService.ts             # Supabase integration ⭐
├── stores/
│   └── calculatorStore.ts              # Updated with fee engine ⭐
├── hooks/
│   └── useFeeEngine.ts                 # React hook ⭐
├── ui/components/
│   ├── ScenarioDetectionPanel.tsx      # UI component ⭐
│   └── index.ts                        # Updated exports
└── examples/
    └── FeeEngineExample.tsx            # Complete example ⭐
```

### Database (`/supabase/migrations/`)
```
supabase/migrations/
└── 20251123_create_fee_engine_tables.sql   # Tables ⭐
```

### Scripts (`/scripts/`)
```
scripts/
├── migrate-florida-fees.ts             # Data migration ⭐
├── refine-florida-fees.ts              # Fee refinement
├── fix-title-fee-condition.ts          # Fee logic fix
├── test-fee-engine.ts                  # E2E tests ⭐
├── test-fee-engine-simple.ts           # Quick test ⭐
└── test-no-tradein.ts                  # Scenario tests
```

### Documentation (`/docs/`)
```
docs/
├── fee-engine-summary.md               # Complete overview ⭐
├── fee-engine-integration.md           # Integration guide ⭐
├── fees-modal-integration.md           # UI integration
└── fee-engine-quick-reference.md       # This file
```

## 🎯 Key Components at a Glance

### 1. **FeeCalculator** (`/packages/fee-engine/src/engine/fee-calculator.ts`)
Main orchestrator that:
- Detects scenario
- Evaluates rules
- Calculates taxes
- Returns `ScenarioResult`

### 2. **RulesEvaluator** (`/packages/fee-engine/src/rules/evaluator.ts`)
Evaluates JSONLogic conditions to determine which fees apply:
```typescript
findApplicableGovernmentFees(rules, scenarioInput)
```

### 3. **CalculatorAdapter** (`/packages/fee-engine/src/adapters/calculator-adapter.ts`)
Maps calculator state to DMS format:
```typescript
mapToScenarioInput(calculatorState) → ScenarioInput
```

### 4. **FeeEngineService** (`/src/services/feeEngineService.ts`)
Supabase integration with caching:
```typescript
calculateFees(calculatorState, dealerId) → ScenarioResult
```

### 5. **useFeeEngine** (`/src/hooks/useFeeEngine.ts`)
React hook with auto-calculation:
```typescript
const { scenarioResult, isCalculating, error } = useFeeEngine({ ... })
```

### 6. **ScenarioDetectionPanel** (`/src/ui/components/ScenarioDetectionPanel.tsx`)
UI component showing scenario and fees

### 7. **Calculator Store** (`/src/stores/calculatorStore.ts`)
Updated with:
```typescript
feeEngineResult: ScenarioResult | null
applyFeeEngineResult(result: ScenarioResult)
```

## 🗄️ Database Tables

### `jurisdiction_rules`
Stores government fee rules with JSONLogic conditions:
```sql
{
  "state_code": "FL",
  "rule_type": "government_fee",
  "rule_data": {
    "feeCode": "FL_TITLE_TRANSFER",
    "amount": 75.25,
    "conditions": { ">": [{"var": "tradeIns.length"}, 0] }
  }
}
```

**Current data:** 14 FL fee rules + 2 tax rates

### `dealer_fee_configs`
Dealer-specific fee packages (currently using defaults)

### `scenario_calculations`
Audit log of calculations (optional)

## 🚀 How to Use

### Basic Integration
```typescript
import { useFeeEngine } from '../hooks/useFeeEngine';
import { useCalculatorStore } from '../stores/calculatorStore';
import { ScenarioDetectionPanel } from '../ui/components';

function MyComponent() {
  const sliders = useCalculatorStore(state => state.sliders);
  const applyFeeEngineResult = useCalculatorStore(state => state.applyFeeEngineResult);

  const { scenarioResult } = useFeeEngine({
    salePrice: sliders.salePrice.value,
    cashDown: sliders.cashDown.value,
    loanTerm: 60,
    apr: 5.99,
    userProfile: { state_code: 'FL', county_name: 'Brevard' },
    // ... more data
  });

  useEffect(() => {
    if (scenarioResult) {
      applyFeeEngineResult(scenarioResult);
    }
  }, [scenarioResult]);

  return <ScenarioDetectionPanel scenarioResult={scenarioResult} />;
}
```

## 📊 Fee Logic Summary

### Title Fees (Mutually Exclusive)
| Fee | Amount | Condition |
|-----|--------|-----------|
| Title Transfer | $75.25 | Has trade-in |
| Title Fee (Electronic) | $77.25 | No trade-in |

### Registration Fees
| Fee | Amount | Condition |
|-----|--------|-----------|
| Initial Registration | $225.00 | First-time FL registration |
| New Plate | $28.00 | New plate scenario |
| Registration Transfer | $4.60 | Tag transfer scenario |
| Base Registration | $14.50 | Always applies |

### Always-Applied Fees
| Fee | Amount |
|-----|--------|
| Branch Processing | $0.50 |
| Air Pollution Control | $1.00 |
| Initial Additional Fee | $1.50 |
| Decal Fee | $1.00 |
| **Total** | **$18.50** |

### Conditional Fees
| Fee | Amount | Condition |
|-----|--------|-----------|
| Lien Filing | $2.00 | Only if financed |

### Tax Calculation
```
Taxable Base = Sale Price - Trade-in Equity
State Tax = Taxable Base × 6%
County Tax = MIN(Taxable Base, $5,000) × 1%  // FL cap
Total Tax = State Tax + County Tax
```

## 🧪 Testing Commands

```bash
cd /Users/brandon/coding/BrandonsCalc/scripts

# Quick test
npm run test-simple

# Full E2E test
npm run test-fee-engine

# Specific scenarios
npx tsx test-no-tradein.ts

# Analyze current rules
npx tsx analyze-current-rules.ts

# Re-run refinement
npx tsx refine-florida-fees.ts
```

## ✅ What's Working

- ✅ Scenario detection (4 scenarios)
- ✅ Government fee calculation (14 rules)
- ✅ FL tax calculation (6% state + 1% county capped)
- ✅ Trade-in credit application
- ✅ Title fee logic (mutually exclusive)
- ✅ Lien filing (financed only)
- ✅ Supabase integration with caching
- ✅ React hook with debouncing
- ✅ Calculator store integration
- ✅ UI component (ScenarioDetectionPanel)

## 📝 Example Scenarios Tested

### Scenario 1: Trade-in + Tag Transfer + Financing
- Sale Price: $25,000
- Trade-in: $8,000 (payoff $5,000 = $3k equity)
- **Result:** $100.35 gov fees, $1,370 sales tax

### Scenario 2: No Trade-in + New Plate
- Sale Price: $25,000
- No trade-in
- **Result:** $125.75 gov fees, $1,750 sales tax

### Scenario 3: First-time FL Registration
- Sale Price: $25,000
- Out-of-state buyer
- **Result:** $348.75 gov fees, $1,750 sales tax

## 🎨 UI Components Available

1. **ScenarioDetectionPanel** - Full scenario display with badges
2. **FeeEngineExample** - Complete integration example

## 🔧 Configuration

### Cache Settings
- Jurisdiction rules: 5 minutes
- Dealer configs: 10 minutes

### Debounce
- Auto-calculation: 500ms delay

### Optional Features
- Auto-mode toggle
- Manual override support
- Scenario explanations
- Rule audit trail

## 📚 Full Documentation

- [Complete System Summary](./fee-engine-summary.md)
- [Integration Guide](./fee-engine-integration.md)
- [FeesModal Integration](./fees-modal-integration.md)

---

**Quick Start:** See `/src/examples/FeeEngineExample.tsx` for a complete working example!
