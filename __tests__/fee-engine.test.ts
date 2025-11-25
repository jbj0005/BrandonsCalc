/**
 * Fee Engine Test Suite
 *
 * Tests all 6 buying scenarios and validates fee calculations:
 * 1. trade_in_tag_transfer_financed
 * 2. trade_in_tag_transfer_cash
 * 3. new_tag_financed
 * 4. new_tag_cash
 * 5. standard_financed
 * 6. standard_cash
 */

import { FeeCalculator } from '../packages/fee-engine/src/engine/fee-calculator';
import { TaxCalculator } from '../packages/fee-engine/src/engine/tax-calculator';
import { RulesEvaluator } from '../packages/fee-engine/src/rules/evaluator';
import type { ScenarioInput } from '../packages/fee-engine/src/types/scenario-input';
import type { JurisdictionRule, GovernmentFeeRule } from '../packages/fee-engine/src/types/jurisdiction-rules';
import type { DealerConfig } from '../packages/fee-engine/src/types/dealer-config';
import type { LineItem } from '../packages/fee-engine/src/types/scenario-result';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Base scenario input factory - creates a valid ScenarioInput with sensible defaults
 */
function createBaseScenarioInput(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  const base: ScenarioInput = {
    scenarioId: '550e8400-e29b-41d4-a716-446655440000',
    timestampUtc: new Date().toISOString(),
    jurisdiction: {
      countryCode: 'US',
      stateCode: 'FL',
      countyName: 'Miami-Dade',
      postalCode: '33101',
    },
    dealerContext: {
      dealerId: 'dealer-001',
      configVersion: 'v1',
      feePackageId: 'standard',
    },
    deal: {
      dealType: 'retail',
      sellingPrice: 30000,
      msrp: 32000,
      cashDown: 3000,
      termMonths: 60,
      apr: 5.99,
      lenderType: 'bank',
    },
    vehicle: {
      vin: '1HGBH41JXMN109186',
      year: 2024,
      make: 'Honda',
      model: 'Accord',
      bodyType: 'Sedan',
      newOrUsed: 'new',
      useType: 'personal',
    },
    tradeIns: [],
    registration: {
      plateScenario: 'new_plate',
      firstTimeRegisteredInState: false,
    },
    customer: {
      residentStatus: 'resident',
    },
  };

  return { ...base, ...overrides };
}

/**
 * Mock Florida jurisdiction rules for testing
 */
function createFloridaJurisdictionRules(): JurisdictionRule[] {
  const now = new Date().toISOString();

  return [
    // Title Transfer Fee - always applies to retail
    {
      id: '00000000-0000-0000-0000-000000000001',
      stateCode: 'FL',
      ruleType: 'government_fee',
      ruleData: {
        feeCode: 'TITLE_TRANSFER',
        description: 'Title Transfer Fee',
        amount: 75.25,
        conditions: { '==': [{ var: 'deal.dealType' }, 'retail'] },
        taxable: false,
        priority: 10,
      },
      version: 'v1',
      effectiveDate: now,
    },
    // Lien Filing Fee - applies when financed
    {
      id: '00000000-0000-0000-0000-000000000002',
      stateCode: 'FL',
      ruleType: 'government_fee',
      ruleData: {
        feeCode: 'LIEN_FILING',
        description: 'Lien Filing Fee',
        amount: 2.00,
        conditions: { '>': [{ var: 'deal.termMonths' }, 0] },
        taxable: false,
        priority: 5,
      },
      version: 'v1',
      effectiveDate: now,
    },
    // Initial Registration Fee - applies to first-time registration
    {
      id: '00000000-0000-0000-0000-000000000003',
      stateCode: 'FL',
      ruleType: 'government_fee',
      ruleData: {
        feeCode: 'INITIAL_REGISTRATION',
        description: 'Initial Registration Fee',
        amount: 225.00,
        conditions: { '==': [{ var: 'registration.firstTimeRegisteredInState' }, true] },
        taxable: false,
        priority: 8,
      },
      version: 'v1',
      effectiveDate: now,
    },
    // Registration Transfer Fee - applies to tag transfer
    {
      id: '00000000-0000-0000-0000-000000000004',
      stateCode: 'FL',
      ruleType: 'government_fee',
      ruleData: {
        feeCode: 'REGISTRATION_TRANSFER',
        description: 'Registration Transfer Fee',
        amount: 4.60,
        conditions: { '==': [{ var: 'registration.plateScenario' }, 'transfer_existing_plate'] },
        taxable: false,
        priority: 7,
      },
      version: 'v1',
      effectiveDate: now,
    },
    // New Plate Fee - applies when getting new plate
    {
      id: '00000000-0000-0000-0000-000000000005',
      stateCode: 'FL',
      ruleType: 'government_fee',
      ruleData: {
        feeCode: 'NEW_PLATE',
        description: 'New License Plate Fee',
        amount: 28.00,
        conditions: { '==': [{ var: 'registration.plateScenario' }, 'new_plate'] },
        taxable: false,
        priority: 6,
      },
      version: 'v1',
      effectiveDate: now,
    },
    // State Tax Rate
    {
      id: '00000000-0000-0000-0000-000000000010',
      stateCode: 'FL',
      ruleType: 'tax_calculation',
      ruleData: {
        rateType: 'state',
        ratePercent: 6.0,
        conditions: {},
        effectiveDate: now,
      },
      version: 'v1',
      effectiveDate: now,
    },
    // County Tax Rate (Miami-Dade with cap)
    {
      id: '00000000-0000-0000-0000-000000000011',
      stateCode: 'FL',
      countyName: 'Miami-Dade',
      ruleType: 'tax_calculation',
      ruleData: {
        rateType: 'county',
        ratePercent: 1.0,
        capAmount: 5000,
        conditions: {},
        effectiveDate: now,
      },
      version: 'v1',
      effectiveDate: now,
    },
  ];
}

/**
 * Mock dealer configuration
 */
function createDealerConfig(): DealerConfig {
  return {
    id: '00000000-0000-0000-0000-000000000100',
    dealerId: 'dealer-001',
    configVersion: 'v1',
    configData: {
      packages: [
        {
          packageId: 'standard',
          packageName: 'Standard Fee Package',
          fees: [
            {
              code: 'DOC_FEE',
              description: 'Documentation Fee',
              amount: 799.00,
              taxable: false,
              required: true,
            },
            {
              code: 'ELECTRONIC_FILING',
              description: 'Electronic Filing Fee',
              amount: 199.00,
              taxable: false,
              required: true,
            },
          ],
        },
      ],
      defaultPackageId: 'standard',
    },
    isActive: true,
  };
}

// ============================================================================
// Scenario Detection Tests
// ============================================================================

describe('FeeCalculator - Scenario Detection', () => {
  let calculator: FeeCalculator;
  const jurisdictionRules = createFloridaJurisdictionRules();
  const dealerConfig = createDealerConfig();

  beforeEach(() => {
    calculator = new FeeCalculator();
  });

  describe('trade_in_tag_transfer_financed', () => {
    it('should detect scenario with trade-in, tag transfer, and financing', async () => {
      const scenario = createBaseScenarioInput({
        deal: {
          dealType: 'retail',
          sellingPrice: 35000,
          termMonths: 72,
          apr: 4.99,
          lenderType: 'bank',
        },
        tradeIns: [
          {
            vin: '2HGBH41JXMN109187',
            estimatedValue: 12000,
            payoffAmount: 5000,
          },
        ],
        registration: {
          plateScenario: 'transfer_existing_plate',
          existingPlateNumber: 'ABC123',
          firstTimeRegisteredInState: false,
        },
      });

      const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

      expect(result.detectedScenario.type).toBe('trade_in_tag_transfer_financed');
      expect(result.detectedScenario.hasTradeIn).toBe(true);
      expect(result.detectedScenario.isFinanced).toBe(true);
      expect(result.detectedScenario.isTagTransfer).toBe(true);
      expect(result.detectedScenario.isFirstTimeRegistration).toBe(false);
    });
  });

  describe('trade_in_tag_transfer_cash', () => {
    it('should detect scenario with trade-in, tag transfer, no financing', async () => {
      const scenario = createBaseScenarioInput({
        deal: {
          dealType: 'retail',
          sellingPrice: 25000,
          termMonths: 0, // Cash purchase
          lenderType: 'other',
        },
        tradeIns: [
          {
            estimatedValue: 15000,
            payoffAmount: 0,
          },
        ],
        registration: {
          plateScenario: 'transfer_existing_plate',
          firstTimeRegisteredInState: false,
        },
      });

      const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

      expect(result.detectedScenario.type).toBe('trade_in_tag_transfer_cash');
      expect(result.detectedScenario.hasTradeIn).toBe(true);
      expect(result.detectedScenario.isFinanced).toBe(false);
      expect(result.detectedScenario.isTagTransfer).toBe(true);
    });
  });

  describe('new_tag_financed', () => {
    it('should detect first-time registration with financing', async () => {
      const scenario = createBaseScenarioInput({
        deal: {
          dealType: 'retail',
          sellingPrice: 40000,
          termMonths: 60,
          apr: 5.49,
          lenderType: 'captive',
        },
        tradeIns: [],
        registration: {
          plateScenario: 'new_plate',
          firstTimeRegisteredInState: true,
        },
      });

      const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

      expect(result.detectedScenario.type).toBe('new_tag_financed');
      expect(result.detectedScenario.hasTradeIn).toBe(false);
      expect(result.detectedScenario.isFinanced).toBe(true);
      expect(result.detectedScenario.isTagTransfer).toBe(false);
      expect(result.detectedScenario.isFirstTimeRegistration).toBe(true);
    });
  });

  describe('new_tag_cash', () => {
    it('should detect first-time registration without financing', async () => {
      const scenario = createBaseScenarioInput({
        deal: {
          dealType: 'retail',
          sellingPrice: 28000,
          termMonths: 0,
          lenderType: 'other',
        },
        tradeIns: [],
        registration: {
          plateScenario: 'new_plate',
          firstTimeRegisteredInState: true,
        },
      });

      const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

      expect(result.detectedScenario.type).toBe('new_tag_cash');
      expect(result.detectedScenario.hasTradeIn).toBe(false);
      expect(result.detectedScenario.isFinanced).toBe(false);
      expect(result.detectedScenario.isFirstTimeRegistration).toBe(true);
    });
  });

  describe('standard_financed', () => {
    it('should detect standard financed purchase (no trade-in, not first-time)', async () => {
      const scenario = createBaseScenarioInput({
        deal: {
          dealType: 'retail',
          sellingPrice: 32000,
          termMonths: 48,
          apr: 6.99,
          lenderType: 'credit_union',
        },
        tradeIns: [],
        registration: {
          plateScenario: 'new_plate',
          firstTimeRegisteredInState: false,
        },
      });

      const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

      expect(result.detectedScenario.type).toBe('standard_financed');
      expect(result.detectedScenario.hasTradeIn).toBe(false);
      expect(result.detectedScenario.isFinanced).toBe(true);
      expect(result.detectedScenario.isTagTransfer).toBe(false);
      expect(result.detectedScenario.isFirstTimeRegistration).toBe(false);
    });
  });

  describe('standard_cash', () => {
    it('should detect standard cash purchase', async () => {
      const scenario = createBaseScenarioInput({
        deal: {
          dealType: 'retail',
          sellingPrice: 22000,
          termMonths: 0,
          lenderType: 'other',
        },
        tradeIns: [],
        registration: {
          plateScenario: 'new_plate',
          firstTimeRegisteredInState: false,
        },
      });

      const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

      expect(result.detectedScenario.type).toBe('standard_cash');
      expect(result.detectedScenario.hasTradeIn).toBe(false);
      expect(result.detectedScenario.isFinanced).toBe(false);
      expect(result.detectedScenario.isTagTransfer).toBe(false);
      expect(result.detectedScenario.isFirstTimeRegistration).toBe(false);
    });
  });
});

// ============================================================================
// Government Fee Tests
// ============================================================================

describe('FeeCalculator - Government Fees', () => {
  let calculator: FeeCalculator;
  const jurisdictionRules = createFloridaJurisdictionRules();
  const dealerConfig = createDealerConfig();

  beforeEach(() => {
    calculator = new FeeCalculator();
  });

  it('should include title transfer fee for retail deals', async () => {
    const scenario = createBaseScenarioInput();
    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const titleFee = result.lineItems.find((item) => item.code === 'TITLE_TRANSFER');
    expect(titleFee).toBeDefined();
    expect(titleFee?.amount).toBe(75.25);
    expect(titleFee?.category).toBe('government');
    expect(titleFee?.taxable).toBe(false);
  });

  it('should include lien filing fee for financed purchases', async () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const lienFee = result.lineItems.find((item) => item.code === 'LIEN_FILING');
    expect(lienFee).toBeDefined();
    expect(lienFee?.amount).toBe(2.00);
  });

  it('should NOT include lien filing fee for cash purchases', async () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 0, // Cash
        lenderType: 'other',
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const lienFee = result.lineItems.find((item) => item.code === 'LIEN_FILING');
    expect(lienFee).toBeUndefined();
  });

  it('should include initial registration fee for first-time registration', async () => {
    const scenario = createBaseScenarioInput({
      registration: {
        plateScenario: 'new_plate',
        firstTimeRegisteredInState: true,
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const initRegFee = result.lineItems.find((item) => item.code === 'INITIAL_REGISTRATION');
    expect(initRegFee).toBeDefined();
    expect(initRegFee?.amount).toBe(225.00);
  });

  it('should include registration transfer fee for tag transfers', async () => {
    const scenario = createBaseScenarioInput({
      registration: {
        plateScenario: 'transfer_existing_plate',
        existingPlateNumber: 'XYZ789',
        firstTimeRegisteredInState: false,
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const transferFee = result.lineItems.find((item) => item.code === 'REGISTRATION_TRANSFER');
    expect(transferFee).toBeDefined();
    expect(transferFee?.amount).toBe(4.60);
  });

  it('should include new plate fee for new plate purchases', async () => {
    const scenario = createBaseScenarioInput({
      registration: {
        plateScenario: 'new_plate',
        firstTimeRegisteredInState: false,
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const plateFee = result.lineItems.find((item) => item.code === 'NEW_PLATE');
    expect(plateFee).toBeDefined();
    expect(plateFee?.amount).toBe(28.00);
  });

  it('should NOT include new plate fee for tag transfers', async () => {
    const scenario = createBaseScenarioInput({
      registration: {
        plateScenario: 'transfer_existing_plate',
        firstTimeRegisteredInState: false,
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const plateFee = result.lineItems.find((item) => item.code === 'NEW_PLATE');
    expect(plateFee).toBeUndefined();
  });

  it('should calculate correct government fees total', async () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
      registration: {
        plateScenario: 'new_plate',
        firstTimeRegisteredInState: false,
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    // Expected: Title ($75.25) + Lien ($2.00) + New Plate ($28.00)
    const expectedGovFees = 75.25 + 2.00 + 28.00;
    expect(result.totals.governmentFees).toBeCloseTo(expectedGovFees, 2);
  });
});

// ============================================================================
// Tax Calculation Tests
// ============================================================================

describe('TaxCalculator', () => {
  let taxCalculator: TaxCalculator;
  const jurisdictionRules = createFloridaJurisdictionRules();

  beforeEach(() => {
    taxCalculator = new TaxCalculator();
  });

  it('should calculate state tax at 6% for Florida', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const govFees: LineItem[] = [];
    const dealerFees: LineItem[] = [];

    const result = taxCalculator.calculate(scenario, govFees, dealerFees, jurisdictionRules);

    expect(result.stateTaxRate).toBeCloseTo(0.06, 4);
    expect(result.stateTax).toBeCloseTo(30000 * 0.06, 2);
  });

  it('should calculate county tax at 1% for Miami-Dade', () => {
    const scenario = createBaseScenarioInput({
      jurisdiction: {
        countryCode: 'US',
        stateCode: 'FL',
        countyName: 'Miami-Dade',
        postalCode: '33101',
      },
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const result = taxCalculator.calculate(scenario, [], [], jurisdictionRules);

    expect(result.countyTaxRate).toBeCloseTo(0.01, 4);
  });

  it('should cap county tax at $5,000 base for Florida', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 50000, // Above $5,000 cap
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const result = taxCalculator.calculate(scenario, [], [], jurisdictionRules);

    // County tax should be on max $5,000: $5,000 * 0.01 = $50
    expect(result.countyTax).toBeCloseTo(50, 2);
    expect(result.countyTaxCapped).toBe(true);
  });

  it('should NOT cap county tax when below $5,000', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 4000, // Below cap
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const result = taxCalculator.calculate(scenario, [], [], jurisdictionRules);

    // County tax on full $4,000: $4,000 * 0.01 = $40
    expect(result.countyTax).toBeCloseTo(40, 2);
    expect(result.countyTaxCapped).toBe(false);
  });

  it('should reduce taxable base by positive trade-in equity', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
      tradeIns: [
        {
          estimatedValue: 12000,
          payoffAmount: 5000,
          // Positive equity: $12,000 - $5,000 = $7,000
        },
      ],
    });

    const result = taxCalculator.calculate(scenario, [], [], jurisdictionRules);

    // Taxable base: $30,000 - $7,000 = $23,000
    expect(result.taxableBase).toBe(23000);
  });

  it('should NOT increase taxable base for negative trade-in equity', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
      tradeIns: [
        {
          estimatedValue: 5000,
          payoffAmount: 8000,
          // Negative equity: $5,000 - $8,000 = -$3,000 (should be ignored)
        },
      ],
    });

    const result = taxCalculator.calculate(scenario, [], [], jurisdictionRules);

    // Taxable base should remain $30,000 (negative equity doesn't reduce or increase)
    expect(result.taxableBase).toBe(30000);
  });

  it('should include taxable fees in taxable base', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const taxableDealerFees: LineItem[] = [
      {
        code: 'TAXABLE_FEE',
        category: 'dealer',
        description: 'Taxable Dealer Fee',
        amount: 500,
        taxable: true,
      },
    ];

    const result = taxCalculator.calculate(scenario, [], taxableDealerFees, jurisdictionRules);

    // Taxable base: $30,000 + $500 = $30,500
    expect(result.taxableBase).toBe(30500);
  });

  it('should NOT include non-taxable fees in taxable base', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const nonTaxableFees: LineItem[] = [
      {
        code: 'NON_TAXABLE_FEE',
        category: 'government',
        description: 'Non-Taxable Gov Fee',
        amount: 100,
        taxable: false,
      },
    ];

    const result = taxCalculator.calculate(scenario, nonTaxableFees, [], jurisdictionRules);

    // Taxable base should remain $30,000
    expect(result.taxableBase).toBe(30000);
  });

  it('should calculate total tax correctly', () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
    });

    const result = taxCalculator.calculate(scenario, [], [], jurisdictionRules);

    // State: $30,000 * 6% = $1,800
    // County: $5,000 * 1% = $50 (capped)
    // Total: $1,850
    expect(result.totalTax).toBeCloseTo(1850, 2);
  });
});

// ============================================================================
// Rules Evaluator Tests
// ============================================================================

describe('RulesEvaluator', () => {
  let evaluator: RulesEvaluator;

  beforeEach(() => {
    evaluator = new RulesEvaluator();
  });

  describe('evaluateCondition', () => {
    it('should evaluate simple equality condition', () => {
      const scenario = createBaseScenarioInput({
        deal: { dealType: 'retail', sellingPrice: 30000, lenderType: 'bank' },
      });
      const condition = { '==': [{ var: 'deal.dealType' }, 'retail'] };

      expect(evaluator.evaluateCondition(condition, scenario)).toBe(true);
    });

    it('should evaluate numeric comparison', () => {
      const scenario = createBaseScenarioInput({
        deal: { dealType: 'retail', sellingPrice: 30000, termMonths: 60, lenderType: 'bank' },
      });
      const condition = { '>': [{ var: 'deal.termMonths' }, 0] };

      expect(evaluator.evaluateCondition(condition, scenario)).toBe(true);
    });

    it('should evaluate false conditions correctly', () => {
      const scenario = createBaseScenarioInput({
        deal: { dealType: 'retail', sellingPrice: 30000, termMonths: 0, lenderType: 'bank' },
      });
      const condition = { '>': [{ var: 'deal.termMonths' }, 0] };

      expect(evaluator.evaluateCondition(condition, scenario)).toBe(false);
    });

    it('should evaluate AND conditions', () => {
      const scenario = createBaseScenarioInput({
        deal: { dealType: 'retail', sellingPrice: 30000, termMonths: 60, lenderType: 'bank' },
      });
      const condition = {
        and: [
          { '==': [{ var: 'deal.dealType' }, 'retail'] },
          { '>': [{ var: 'deal.termMonths' }, 0] },
        ],
      };

      expect(evaluator.evaluateCondition(condition, scenario)).toBe(true);
    });

    it('should evaluate OR conditions', () => {
      const scenario = createBaseScenarioInput({
        deal: { dealType: 'lease', sellingPrice: 30000, termMonths: 36, lenderType: 'bank' },
      });
      const condition = {
        or: [
          { '==': [{ var: 'deal.dealType' }, 'retail'] },
          { '==': [{ var: 'deal.dealType' }, 'lease'] },
        ],
      };

      expect(evaluator.evaluateCondition(condition, scenario)).toBe(true);
    });
  });

  describe('findApplicableGovernmentFees', () => {
    it('should return only government_fee rules', () => {
      const rules = createFloridaJurisdictionRules();
      const scenario = createBaseScenarioInput();

      const applicableFees = evaluator.findApplicableGovernmentFees(rules, scenario);

      applicableFees.forEach((fee) => {
        expect(fee.feeCode).toBeDefined();
        expect(fee.description).toBeDefined();
      });
    });

    it('should filter rules by conditions', () => {
      const rules = createFloridaJurisdictionRules();
      const scenario = createBaseScenarioInput({
        deal: { dealType: 'retail', sellingPrice: 30000, termMonths: 0, lenderType: 'other' },
        registration: { plateScenario: 'new_plate', firstTimeRegisteredInState: false },
      });

      const applicableFees = evaluator.findApplicableGovernmentFees(rules, scenario);

      // Should NOT include LIEN_FILING (termMonths = 0)
      expect(applicableFees.find((f) => f.feeCode === 'LIEN_FILING')).toBeUndefined();

      // Should include TITLE_TRANSFER (retail)
      expect(applicableFees.find((f) => f.feeCode === 'TITLE_TRANSFER')).toBeDefined();
    });

    it('should sort by priority (highest first)', () => {
      const rules = createFloridaJurisdictionRules();
      const scenario = createBaseScenarioInput({
        deal: { dealType: 'retail', sellingPrice: 30000, termMonths: 60, lenderType: 'bank' },
        registration: { plateScenario: 'new_plate', firstTimeRegisteredInState: true },
      });

      const applicableFees = evaluator.findApplicableGovernmentFees(rules, scenario);

      // Verify sorted by priority (descending)
      for (let i = 0; i < applicableFees.length - 1; i++) {
        expect(applicableFees[i].priority).toBeGreaterThanOrEqual(
          applicableFees[i + 1].priority || 0
        );
      }
    });
  });
});

// ============================================================================
// Full Integration Tests (All 6 Scenarios with Expected Fees)
// ============================================================================

describe('FeeCalculator - Full Scenario Integration', () => {
  let calculator: FeeCalculator;
  const jurisdictionRules = createFloridaJurisdictionRules();
  const dealerConfig = createDealerConfig();

  beforeEach(() => {
    calculator = new FeeCalculator();
  });

  const scenarioTestCases = [
    {
      name: 'trade_in_tag_transfer_financed',
      scenario: {
        deal: { dealType: 'retail' as const, sellingPrice: 35000, termMonths: 72, apr: 4.99, lenderType: 'bank' as const },
        tradeIns: [{ estimatedValue: 12000, payoffAmount: 5000 }],
        registration: { plateScenario: 'transfer_existing_plate' as const, firstTimeRegisteredInState: false },
      },
      expectedFees: {
        govFeeCodes: ['TITLE_TRANSFER', 'LIEN_FILING', 'REGISTRATION_TRANSFER'],
        excludedFeeCodes: ['INITIAL_REGISTRATION', 'NEW_PLATE'],
        tradeInCredit: 7000, // $12,000 - $5,000
        taxableBase: 28000, // $35,000 - $7,000
      },
    },
    {
      name: 'trade_in_tag_transfer_cash',
      scenario: {
        deal: { dealType: 'retail' as const, sellingPrice: 25000, termMonths: 0, lenderType: 'other' as const },
        tradeIns: [{ estimatedValue: 15000, payoffAmount: 0 }],
        registration: { plateScenario: 'transfer_existing_plate' as const, firstTimeRegisteredInState: false },
      },
      expectedFees: {
        govFeeCodes: ['TITLE_TRANSFER', 'REGISTRATION_TRANSFER'],
        excludedFeeCodes: ['LIEN_FILING', 'INITIAL_REGISTRATION', 'NEW_PLATE'],
        tradeInCredit: 15000,
        taxableBase: 10000, // $25,000 - $15,000
      },
    },
    {
      name: 'new_tag_financed',
      scenario: {
        deal: { dealType: 'retail' as const, sellingPrice: 40000, termMonths: 60, apr: 5.49, lenderType: 'captive' as const },
        tradeIns: [],
        registration: { plateScenario: 'new_plate' as const, firstTimeRegisteredInState: true },
      },
      expectedFees: {
        govFeeCodes: ['TITLE_TRANSFER', 'LIEN_FILING', 'INITIAL_REGISTRATION', 'NEW_PLATE'],
        excludedFeeCodes: ['REGISTRATION_TRANSFER'],
        tradeInCredit: 0,
        taxableBase: 40000,
      },
    },
    {
      name: 'new_tag_cash',
      scenario: {
        deal: { dealType: 'retail' as const, sellingPrice: 28000, termMonths: 0, lenderType: 'other' as const },
        tradeIns: [],
        registration: { plateScenario: 'new_plate' as const, firstTimeRegisteredInState: true },
      },
      expectedFees: {
        govFeeCodes: ['TITLE_TRANSFER', 'INITIAL_REGISTRATION', 'NEW_PLATE'],
        excludedFeeCodes: ['LIEN_FILING', 'REGISTRATION_TRANSFER'],
        tradeInCredit: 0,
        taxableBase: 28000,
      },
    },
    {
      name: 'standard_financed',
      scenario: {
        deal: { dealType: 'retail' as const, sellingPrice: 32000, termMonths: 48, apr: 6.99, lenderType: 'credit_union' as const },
        tradeIns: [],
        registration: { plateScenario: 'new_plate' as const, firstTimeRegisteredInState: false },
      },
      expectedFees: {
        govFeeCodes: ['TITLE_TRANSFER', 'LIEN_FILING', 'NEW_PLATE'],
        excludedFeeCodes: ['INITIAL_REGISTRATION', 'REGISTRATION_TRANSFER'],
        tradeInCredit: 0,
        taxableBase: 32000,
      },
    },
    {
      name: 'standard_cash',
      scenario: {
        deal: { dealType: 'retail' as const, sellingPrice: 22000, termMonths: 0, lenderType: 'other' as const },
        tradeIns: [],
        registration: { plateScenario: 'new_plate' as const, firstTimeRegisteredInState: false },
      },
      expectedFees: {
        govFeeCodes: ['TITLE_TRANSFER', 'NEW_PLATE'],
        excludedFeeCodes: ['LIEN_FILING', 'INITIAL_REGISTRATION', 'REGISTRATION_TRANSFER'],
        tradeInCredit: 0,
        taxableBase: 22000,
      },
    },
  ];

  test.each(scenarioTestCases)(
    '$name: should apply correct fees',
    async ({ name, scenario, expectedFees }) => {
      const input = createBaseScenarioInput(scenario);
      const result = await calculator.calculate(input, jurisdictionRules, dealerConfig);

      // Verify scenario type
      expect(result.detectedScenario.type).toBe(name);

      // Verify expected fees are included
      for (const feeCode of expectedFees.govFeeCodes) {
        const fee = result.lineItems.find(
          (item) => item.code === feeCode && item.category === 'government'
        );
        expect(fee).toBeDefined();
      }

      // Verify excluded fees are NOT included
      for (const feeCode of expectedFees.excludedFeeCodes) {
        const fee = result.lineItems.find(
          (item) => item.code === feeCode && item.category === 'government'
        );
        expect(fee).toBeUndefined();
      }

      // Verify taxable base
      expect(result.taxBreakdown.taxableBase).toBe(expectedFees.taxableBase);
    }
  );
});

// ============================================================================
// Dealer Fees Tests
// ============================================================================

describe('FeeCalculator - Dealer Fees', () => {
  let calculator: FeeCalculator;
  const jurisdictionRules = createFloridaJurisdictionRules();
  const dealerConfig = createDealerConfig();

  beforeEach(() => {
    calculator = new FeeCalculator();
  });

  it('should include dealer fees from standard package', async () => {
    const scenario = createBaseScenarioInput();
    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    const docFee = result.lineItems.find((item) => item.code === 'DOC_FEE');
    const efileFee = result.lineItems.find((item) => item.code === 'ELECTRONIC_FILING');

    expect(docFee).toBeDefined();
    expect(docFee?.amount).toBe(799);
    expect(docFee?.category).toBe('dealer');

    expect(efileFee).toBeDefined();
    expect(efileFee?.amount).toBe(199);
  });

  it('should calculate correct dealer fees total', async () => {
    const scenario = createBaseScenarioInput();
    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    expect(result.totals.dealerFees).toBe(799 + 199);
  });
});

// ============================================================================
// Edge Cases & Error Handling
// ============================================================================

describe('FeeCalculator - Edge Cases', () => {
  let calculator: FeeCalculator;
  const jurisdictionRules = createFloridaJurisdictionRules();
  const dealerConfig = createDealerConfig();

  beforeEach(() => {
    calculator = new FeeCalculator();
  });

  it('should handle zero selling price', async () => {
    const scenario = createBaseScenarioInput({
      deal: { dealType: 'retail', sellingPrice: 0, termMonths: 0, lenderType: 'other' },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    expect(result.taxBreakdown.taxableBase).toBe(0);
    expect(result.taxBreakdown.totalTax).toBe(0);
  });

  it('should handle multiple trade-ins', async () => {
    const scenario = createBaseScenarioInput({
      deal: { dealType: 'retail', sellingPrice: 50000, termMonths: 72, apr: 4.99, lenderType: 'bank' },
      tradeIns: [
        { estimatedValue: 10000, payoffAmount: 3000 }, // +$7,000 equity
        { estimatedValue: 8000, payoffAmount: 2000 }, // +$6,000 equity
      ],
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    // Total equity: $7,000 + $6,000 = $13,000
    // Taxable base: $50,000 - $13,000 = $37,000
    expect(result.taxBreakdown.taxableBase).toBe(37000);
  });

  it('should handle mixed equity trade-ins', async () => {
    const scenario = createBaseScenarioInput({
      deal: { dealType: 'retail', sellingPrice: 40000, termMonths: 60, apr: 5.99, lenderType: 'bank' },
      tradeIns: [
        { estimatedValue: 15000, payoffAmount: 5000 }, // +$10,000 equity
        { estimatedValue: 5000, payoffAmount: 8000 }, // -$3,000 equity (ignored)
      ],
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    // Only positive equity counts: $10,000
    // Taxable base: $40,000 - $10,000 = $30,000
    expect(result.taxBreakdown.taxableBase).toBe(30000);
  });

  it('should handle empty jurisdiction rules gracefully', async () => {
    const scenario = createBaseScenarioInput();
    const result = await calculator.calculate(scenario, [], dealerConfig);

    // Should still work with FL defaults
    expect(result.taxBreakdown.stateTaxRate).toBe(0.06);
    expect(result.totals.governmentFees).toBe(0);
  });

  it('should handle missing dealer package gracefully', async () => {
    const scenario = createBaseScenarioInput({
      dealerContext: {
        dealerId: 'dealer-001',
        configVersion: 'v1',
        feePackageId: 'nonexistent-package',
      },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    expect(result.totals.dealerFees).toBe(0);
  });
});

// ============================================================================
// Totals Calculation Tests
// ============================================================================

describe('FeeCalculator - Totals', () => {
  let calculator: FeeCalculator;
  const jurisdictionRules = createFloridaJurisdictionRules();
  const dealerConfig = createDealerConfig();

  beforeEach(() => {
    calculator = new FeeCalculator();
  });

  it('should calculate total fees correctly', async () => {
    const scenario = createBaseScenarioInput({
      deal: { dealType: 'retail', sellingPrice: 30000, termMonths: 60, apr: 5.99, lenderType: 'bank' },
      registration: { plateScenario: 'new_plate', firstTimeRegisteredInState: false },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    // Gov fees: Title ($75.25) + Lien ($2.00) + New Plate ($28.00) = $105.25
    // Dealer fees: Doc ($799) + E-File ($199) = $998
    // Total: $1,103.25
    expect(result.totals.totalFees).toBeCloseTo(1103.25, 2);
  });

  it('should calculate amount financed correctly', async () => {
    const scenario = createBaseScenarioInput({
      deal: {
        dealType: 'retail',
        sellingPrice: 30000,
        cashDown: 3000,
        termMonths: 60,
        apr: 5.99,
        lenderType: 'bank',
      },
      registration: { plateScenario: 'new_plate', firstTimeRegisteredInState: false },
    });

    const result = await calculator.calculate(scenario, jurisdictionRules, dealerConfig);

    // Amount financed: Sale price - Down + Total Fees + Tax
    // $30,000 - $3,000 + $1,103.25 + $1,850 = $29,953.25
    const expectedAmountFinanced =
      30000 - 3000 + result.totals.totalFees + result.taxBreakdown.totalTax;
    expect(result.totals.amountFinanced).toBeCloseTo(expectedAmountFinanced, 2);
  });
});
