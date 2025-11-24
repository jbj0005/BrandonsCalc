# @brandonscalc/fee-engine

Production-grade DMS-style fee calculation engine for automotive transactions.

## Features

- 🎯 **Automatic Scenario Detection** - Trade-in, new purchase, tag transfer, first-time registration
- 💰 **Government Fee Calculation** - JSONLogic-based conditional fee application
- 📊 **State-Specific Tax Logic** - FL tax rules with county cap support
- 🔒 **Type-Safe** - Full TypeScript with Zod validation
- ⚡ **Performant** - Efficient rule evaluation with caching support
- 📝 **Audit Trail** - Track applied rules and calculations
- 🔧 **Extensible** - Easy to add new states and rules

## Installation

```bash
# Install dependencies
npm install json-logic-js zod uuid

# Build the package
npm run build
```

## Quick Start

```typescript
import { FeeCalculator, CalculatorAdapter, type ScenarioInput } from '@brandonscalc/fee-engine';

// Initialize
const calculator = new FeeCalculator();
const adapter = new CalculatorAdapter();

// Prepare input
const calculatorState = {
  salePrice: 25000,
  cashDown: 5000,
  loanTerm: 60,
  apr: 5.99,
  selectedTradeInVehicles: [
    { estimated_value: 8000, payoff_amount: 5000 }
  ],
  userProfile: {
    state_code: 'FL',
    county_name: 'Brevard',
  },
  selectedVehicle: {
    year: 2020,
    condition: 'used',
  },
};

// Map to scenario input
const scenarioInput = adapter.mapToScenarioInput(calculatorState);

// Calculate
const result = await calculator.calculate(
  scenarioInput,
  jurisdictionRules,  // From database
  dealerConfig        // From database or defaults
);

// Use result
console.log(result.detectedScenario.description);
// "Tag transfer from trade-in with financing"

console.log(result.totals.governmentFees);
// 100.35

console.log(result.totals.salesTax);
// 1370.00
```

## Architecture

```
ScenarioInput
    ↓
FeeCalculator
    ├── ScenarioDetector
    ├── RulesEvaluator (JSONLogic)
    └── TaxCalculator
    ↓
ScenarioResult
```

## Core Classes

### FeeCalculator

Main orchestrator for fee calculations.

```typescript
const calculator = new FeeCalculator();
const result = await calculator.calculate(
  scenarioInput,
  jurisdictionRules,
  dealerConfig
);
```

### TaxCalculator

Calculates sales tax with state-specific rules.

```typescript
const taxCalculator = new TaxCalculator();
const taxBreakdown = taxCalculator.calculateTax(
  taxableBase,
  stateTaxRate,
  countyTaxRate,
  countyTaxCap
);
```

### RulesEvaluator

Evaluates JSONLogic conditions to determine applicable fees.

```typescript
const evaluator = new RulesEvaluator();
const applicableFees = evaluator.findApplicableGovernmentFees(
  jurisdictionRules,
  scenarioInput
);
```

### CalculatorAdapter

Maps calculator state to DMS ScenarioInput format.

```typescript
const adapter = new CalculatorAdapter();
const scenarioInput = adapter.mapToScenarioInput(calculatorState);
```

## Types

All types are exported from the main index:

```typescript
import type {
  ScenarioInput,
  ScenarioResult,
  JurisdictionRule,
  DealerConfig,
  CalculatorState,
} from '@brandonscalc/fee-engine';
```

## Scenario Detection

The engine automatically detects transaction scenarios:

- **Tag Transfer from Trade-in** - Has trade-in, transfers existing plate
- **New Tag Purchase** - No trade-in, needs new plate
- **First-Time FL Registration** - Out-of-state buyer
- **Cash vs Financed** - Based on loan term

## Fee Logic (Florida)

### Title Fees (Mutually Exclusive)
- **Title Transfer:** $75.25 - When has trade-in
- **Title Fee (Electronic):** $77.25 - When no trade-in

### Registration Fees
- **Initial Registration:** $225 - First-time FL registration only
- **New Plate:** $28 - New plate scenario
- **Registration Transfer:** $4.60 - Tag transfer scenario
- **Base Registration:** $14.50 - Always applies

### Always-Applied Fees
- Branch Processing: $0.50
- Air Pollution Control: $1.00
- Initial Additional Fee: $1.50
- Decal Fee: $1.00

### Conditional Fees
- **Lien Filing:** $2.00 - Only if financed

## Tax Calculation (Florida)

```typescript
// State Tax: 6%
const stateTax = taxableBase * 0.06;

// County Tax: 1% capped at $5,000 base
const countyTaxableBase = Math.min(taxableBase, 5000);
const countyTax = countyTaxableBase * 0.01;

// Total
const totalTax = stateTax + countyTax;
```

## JSONLogic Conditions

Rules use JSONLogic for flexible conditions:

```json
{
  "feeCode": "FL_TITLE_TRANSFER",
  "description": "Title Transfer",
  "amount": 75.25,
  "conditions": {
    ">": [{"var": "tradeIns.length"}, 0]
  }
}
```

Available variables:
- `tradeIns.length` - Number of trade-ins
- `deal.termMonths` - Loan term
- `registration.plateScenario` - Plate scenario
- `registration.firstTimeRegisteredInState` - First-time registration
- And more...

## Rule Management

Rules are stored in Supabase with this structure:

```typescript
{
  state_code: 'FL',
  county_name: null,  // State-wide
  rule_type: 'government_fee',
  rule_data: {
    feeCode: 'FL_TITLE_TRANSFER',
    description: 'Title Transfer',
    amount: 75.25,
    conditions: { ... },
    optional: false,
    autoApply: true,
    priority: 100
  }
}
```

## Testing

```bash
# Build the package
npm run build

# Run tests (from /scripts directory)
cd ../../scripts
npm run test-simple
npm run test-fee-engine
```

## Extending to New States

1. Add state tax logic to `TaxCalculator`
2. Create jurisdiction rules in database
3. Update scenario detection if needed
4. Test with state-specific scenarios

Example new state rule:

```typescript
{
  state_code: 'CA',
  rule_type: 'government_fee',
  rule_data: {
    feeCode: 'CA_TITLE_FEE',
    description: 'California Title Fee',
    amount: 60.00,
    conditions: null,  // Always applies
  }
}
```

## Performance

- **Calculation Time:** < 5ms typical
- **Rules Caching:** Supported via service layer
- **Concurrent Calculations:** Thread-safe

## Validation

All inputs are validated using Zod schemas:

```typescript
import { ScenarioInputSchema } from '@brandonscalc/fee-engine';

try {
  const validated = ScenarioInputSchema.parse(input);
  // Input is valid
} catch (error) {
  // Validation failed
}
```

## Error Handling

```typescript
try {
  const result = await calculator.calculate(
    scenarioInput,
    jurisdictionRules,
    dealerConfig
  );
} catch (error) {
  console.error('Calculation failed:', error);
  // Fallback to manual entry
}
```

## Dependencies

- `json-logic-js` - Rule evaluation engine
- `zod` - Runtime type validation
- `uuid` - Unique ID generation

## License

MIT

## Support

For issues and questions, see the main project repository.

---

**Version:** 1.0.0
**Built with:** TypeScript, JSONLogic, Zod
