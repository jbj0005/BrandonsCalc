import { v4 as uuidv4 } from 'uuid';
import { RulesEvaluator } from '../rules/evaluator';
import { TaxCalculator } from './tax-calculator';
import { ScenarioInputSchema } from '../types/scenario-input';
import type { ScenarioInput } from '../types/scenario-input';
import type {
  ScenarioResult,
  LineItem,
  DetectedScenario,
  TaxBreakdown,
} from '../types/scenario-result';
import type { JurisdictionRule, GovernmentFeeRule } from '../types/jurisdiction-rules';
import type { DealerConfig } from '../types/dealer-config';

/**
 * Fee Calculator Engine
 *
 * Main orchestrator that calculates all fees, taxes, and totals for a scenario.
 */
export class FeeCalculator {
  private rulesEvaluator: RulesEvaluator;
  private taxCalculator: TaxCalculator;

  constructor() {
    this.rulesEvaluator = new RulesEvaluator();
    this.taxCalculator = new TaxCalculator();
  }

  /**
   * Calculate complete fee breakdown for a scenario
   *
   * @param scenarioInput - Complete scenario data
   * @param jurisdictionRules - Government rules for this jurisdiction
   * @param dealerConfig - Dealer fee configuration
   * @returns Complete scenario result with all fees and explanations
   */
  async calculate(
    scenarioInput: ScenarioInput,
    jurisdictionRules: JurisdictionRule[],
    dealerConfig: DealerConfig
  ): Promise<ScenarioResult> {
    const startTime = Date.now();

    try {
      // 1. Validate input
      const validated = ScenarioInputSchema.parse(scenarioInput);

      // 2. Detect scenario type
      const detectedScenario = this.detectScenario(validated);

      // 3. Find applicable government fee rules
      let applicableFeeRules = this.rulesEvaluator.findApplicableGovernmentFees(
        jurisdictionRules,
        validated
      );

      // Add Florida weight-based registration fee when weight is provided
      const floridaWeightRule = this.getFloridaWeightFeeRule(validated);
      if (floridaWeightRule) {
        applicableFeeRules = [...applicableFeeRules, floridaWeightRule];
      }

      // 4. Calculate government fees
      const govFeeLineItems = this.calculateGovernmentFees(
        applicableFeeRules,
        validated
      );

      // 5. Calculate dealer fees
      const dealerFeeLineItems = this.calculateDealerFees(dealerConfig, validated);

      // 6. Calculate sales tax
      const taxBreakdown = this.taxCalculator.calculate(
        validated,
        govFeeLineItems,
        dealerFeeLineItems,
        jurisdictionRules
      );

      // 7. Build complete result
      const result = this.buildResult(
        validated,
        govFeeLineItems,
        dealerFeeLineItems,
        taxBreakdown,
        detectedScenario,
        applicableFeeRules
      );

      const calculationTime = Date.now() - startTime;
      console.log(`[FeeCalculator] Calculation completed in ${calculationTime}ms`);

      return result;
    } catch (error) {
      console.error('[FeeCalculator] Calculation error:', error);
      throw new Error(`Fee calculation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Detect scenario type from input data
   */
  private detectScenario(scenario: ScenarioInput): DetectedScenario {
    const hasTradeIn = scenario.tradeIns.length > 0;
    const isFinanced = (scenario.deal.termMonths || 0) > 0;
    const isTagTransfer = scenario.registration.plateScenario === 'transfer_existing_plate';
    const isFirstTimeRegistration =
      scenario.registration.firstTimeRegisteredInState || false;

    // Determine scenario type
    let type: string;
    let description: string;

    if (hasTradeIn && isTagTransfer && isFinanced) {
      type = 'trade_in_tag_transfer_financed';
      description = 'Tag transfer from trade-in with financing';
    } else if (hasTradeIn && isTagTransfer) {
      type = 'trade_in_tag_transfer_cash';
      description = 'Tag transfer from trade-in (cash purchase)';
    } else if (isFirstTimeRegistration && isFinanced) {
      type = 'new_tag_financed';
      description = 'New tag purchase with financing';
    } else if (isFirstTimeRegistration) {
      type = 'new_tag_cash';
      description = 'New tag purchase (cash)';
    } else if (isFinanced) {
      type = 'standard_financed';
      description = 'Standard financed purchase';
    } else {
      type = 'standard_cash';
      description = 'Standard cash purchase';
    }

    return {
      type,
      description,
      hasTradeIn,
      isFinanced,
      isTagTransfer,
      isFirstTimeRegistration,
    };
  }

  /**
   * Calculate government fee line items
   */
  private calculateGovernmentFees(
    applicableRules: GovernmentFeeRule[],
    scenario: ScenarioInput
  ): LineItem[] {
    return applicableRules.map((rule) => {
      // Calculate amount (fixed or formula-based)
      const amount = rule.amount || this.evaluateAmountFormula(rule, scenario);

      return {
        code: rule.feeCode,
        category: 'government',
        description: rule.description,
        amount,
        taxable: rule.taxable || false,
        appliedRuleId: rule.feeCode,
        explanation: this.rulesEvaluator.getExplanation(rule, scenario),
      };
    });
  }

  /**
   * Calculate dealer fee line items
   */
  private calculateDealerFees(
    dealerConfig: DealerConfig,
    scenario: ScenarioInput
  ): LineItem[] {
    // Get active fee package
    const packageId =
      scenario.dealerContext.feePackageId || dealerConfig.configData.defaultPackageId;

    const feePackage = dealerConfig.configData.packages.find(
      (pkg) => pkg.packageId === packageId
    );

    if (!feePackage) {
      console.warn(`[FeeCalculator] Fee package ${packageId} not found`);
      return [];
    }

    return feePackage.fees.map((fee) => ({
      code: fee.code,
      category: 'dealer',
      description: fee.description,
      amount: fee.amount,
      taxable: fee.taxable,
      explanation: 'Dealer fee',
    }));
  }

  /**
   * Evaluate amount formula (if provided)
   */
  private evaluateAmountFormula(rule: GovernmentFeeRule, scenario: ScenarioInput): number {
    if (!rule.amountFormula) {
      return 0;
    }

    // Simple formula evaluation (can be enhanced with a proper expression parser)
    // For now, support basic operations like "basePrice * 0.01"
    try {
      const formula = rule.amountFormula
        .replace(/basePrice/g, String(scenario.deal.sellingPrice))
        .replace(/msrp/g, String(scenario.deal.msrp || 0));

      // Evaluate using Function constructor (be cautious in production)
      const result = new Function(`return ${formula}`)();
      return Number(result) || 0;
    } catch (error) {
      console.error(`[FeeCalculator] Formula evaluation error:`, error);
      return 0;
    }
  }

  /**
   * Build complete scenario result
   */
  private buildResult(
    scenario: ScenarioInput,
    govFees: LineItem[],
    dealerFees: LineItem[],
    taxBreakdown: TaxBreakdown,
    detectedScenario: DetectedScenario,
    appliedRules: GovernmentFeeRule[]
  ): ScenarioResult {
    // Combine all line items
    const allLineItems = [...govFees, ...dealerFees];

    // Calculate totals
    const governmentFees = govFees.reduce((sum, item) => sum + item.amount, 0);
    const dealerFeesTotal = dealerFees.reduce((sum, item) => sum + item.amount, 0);
    const totalFees = governmentFees + dealerFeesTotal;

    // Build explanations
    const explanations = this.buildExplanations(
      scenario,
      detectedScenario,
      taxBreakdown,
      appliedRules
    );

    return {
      scenarioId: scenario.scenarioId,
      calculatedAt: new Date().toISOString(),
      lineItems: allLineItems,
      taxBreakdown,
      totals: {
        governmentFees,
        dealerFees: dealerFeesTotal,
        customerAddons: 0, // Not implemented yet
        salesTax: taxBreakdown.totalTax,
        totalFees,
        amountFinanced:
          scenario.deal.sellingPrice -
          (scenario.deal.cashDown || 0) +
          totalFees +
          taxBreakdown.totalTax,
      },
      detectedScenario,
      explanations,
      appliedRuleIds: appliedRules.map((rule) => rule.feeCode),
    };
  }

  /**
   * Build a derived government fee rule for Florida weight-based registration.
   * Source: https://www.factorywarrantylist.com/registration-calculator-florida.html
   */
  private getFloridaWeightFeeRule(scenario: ScenarioInput): GovernmentFeeRule | null {
    const { stateCode } = scenario.jurisdiction;
    const weight = scenario.vehicle.weightLbs;
    if (stateCode !== 'FL' || typeof weight !== 'number' || Number.isNaN(weight)) {
      return null;
    }

    const bodyType = (scenario.vehicle.bodyType || '').toLowerCase();
    const isTruck =
      bodyType.includes('truck') ||
      bodyType.includes('pickup') ||
      bodyType.includes('van'); // treat vans/pickups as trucks for weight fees

    const autoSchedule = [
      { max: 2499, fee: 14.5 },
      { max: 3499, fee: 22.5 },
      { max: Infinity, fee: 32.5 },
    ];

    const truckSchedule = [
      { max: 1999, fee: 14.5 },
      { max: 3000, fee: 22.5 },
      { max: 5000, fee: 32.5 },
      { max: 5999, fee: 60.75 },
      { max: 7999, fee: 87.75 },
      { max: 9999, fee: 103 },
      { max: 14999, fee: 118 },
      { max: 19999, fee: 177 },
      { max: 26000, fee: 251 },
      { max: 34999, fee: 324 },
      { max: 43999, fee: 405 },
      { max: 54999, fee: 773 },
      { max: 61999, fee: 916 },
      { max: 71999, fee: 1080 },
      { max: Infinity, fee: 1322 },
    ];

    const schedule = isTruck ? truckSchedule : autoSchedule;
    const band = schedule.find((entry) => weight <= entry.max);
    if (!band) return null;

    return {
      feeCode: 'FL_WEIGHT_FEE',
      description: 'Florida weight-based registration fee',
      amount: band.fee,
      taxable: false,
      conditions: {}, // already enforced by this method
      priority: 0,
    };
  }

  /**
   * Build human-readable explanations
   */
  private buildExplanations(
    scenario: ScenarioInput,
    detectedScenario: DetectedScenario,
    taxBreakdown: TaxBreakdown,
    appliedRules: GovernmentFeeRule[]
  ): string[] {
    const explanations: string[] = [];

    // Scenario detection explanation
    explanations.push(`Detected scenario: ${detectedScenario.description}`);

    // Trade-in explanation
    if (detectedScenario.hasTradeIn) {
      const tradeInValue = scenario.tradeIns.reduce((sum, t) => sum + t.estimatedValue, 0);
      const tradeInPayoff = scenario.tradeIns.reduce((sum, t) => sum + t.payoffAmount, 0);
      explanations.push(
        `Trade-in reduces taxable base by $${(tradeInValue - tradeInPayoff).toFixed(2)}`
      );
    }

    // Tag transfer explanation
    if (detectedScenario.isTagTransfer) {
      explanations.push(`Tag transfer saves initial registration fee ($225)`);
    }

    // County tax cap explanation
    if (taxBreakdown.countyTaxCapped) {
      explanations.push(
        `County tax capped at $5,000 of taxable base (Florida law)`
      );
    }

    // Applied fees count
    explanations.push(`${appliedRules.length} government fees applied based on your scenario`);

    return explanations;
  }
}
