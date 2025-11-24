import type { ScenarioInput, TradeIn } from '../types/scenario-input';
import type { LineItem, TaxBreakdown } from '../types/scenario-result';
import type { JurisdictionRule, TaxRateRule } from '../types/jurisdiction-rules';

/**
 * Tax Calculator
 *
 * Calculates sales tax based on jurisdiction rules and scenario details.
 * Handles state-specific logic like Florida's $5,000 county tax cap.
 */
export class TaxCalculator {
  /**
   * Calculate sales tax for a scenario
   *
   * @param scenario - Complete scenario input
   * @param govFees - Government fee line items
   * @param dealerFees - Dealer fee line items
   * @param taxRateRules - Tax rate rules from jurisdiction
   * @returns Tax breakdown with all calculations
   */
  calculate(
    scenario: ScenarioInput,
    govFees: LineItem[],
    dealerFees: LineItem[],
    taxRateRules: JurisdictionRule[]
  ): TaxBreakdown {
    // 1. Calculate taxable base
    const salePrice = scenario.deal.sellingPrice;
    const tradeInCredit = this.calculateTradeInCredit(scenario.tradeIns);
    const taxableFees = this.sumTaxableFees([...govFees, ...dealerFees]);

    const taxableBase = Math.max(0, salePrice - tradeInCredit + taxableFees);

    // 2. Get tax rates (state and county)
    const { stateTaxRate, countyTaxRate, countyTaxCap } = this.getTaxRates(
      scenario,
      taxRateRules
    );

    // 3. Calculate state tax (no cap)
    const stateTax = taxableBase * stateTaxRate;

    // 4. Calculate county tax (with potential cap)
    let countyTax = 0;
    let countyTaxCapped = false;

    if (countyTaxCap !== null) {
      // Florida-style: county tax capped at $5,000 of taxable base
      const countyTaxableBase = Math.min(taxableBase, countyTaxCap);
      countyTax = countyTaxableBase * countyTaxRate;
      countyTaxCapped = taxableBase > countyTaxCap;
    } else {
      // No cap - standard calculation
      countyTax = taxableBase * countyTaxRate;
    }

    // 5. Build tax breakdown
    return {
      taxableBase,
      stateTaxRate,
      countyTaxRate,
      stateTax,
      countyTax,
      totalTax: stateTax + countyTax,
      countyTaxCapped,
    };
  }

  /**
   * Calculate trade-in credit (reduces taxable base)
   *
   * Only positive equity (allowance > payoff) reduces tax.
   * Negative equity or cash-out equity does not reduce tax.
   *
   * @param tradeIns - Array of trade-in vehicles
   * @returns Total trade-in credit amount
   */
  private calculateTradeInCredit(tradeIns: TradeIn[]): number {
    return tradeIns.reduce((total, tradeIn) => {
      const equity = tradeIn.estimatedValue - tradeIn.payoffAmount;
      // Only positive equity applied to purchase reduces tax
      return total + Math.max(0, equity);
    }, 0);
  }

  /**
   * Sum all taxable fees
   *
   * @param lineItems - All fee line items
   * @returns Total taxable fees
   */
  private sumTaxableFees(lineItems: LineItem[]): number {
    return lineItems.reduce((total, item) => {
      return item.taxable ? total + item.amount : total;
    }, 0);
  }

  /**
   * Extract tax rates from jurisdiction rules
   *
   * @param scenario - Scenario input
   * @param taxRateRules - Tax rate rules
   * @returns Tax rates and county cap
   */
  private getTaxRates(
    scenario: ScenarioInput,
    taxRateRules: JurisdictionRule[]
  ): {
    stateTaxRate: number;
    countyTaxRate: number;
    countyTaxCap: number | null;
  } {
    let stateTaxRate = 0;
    let countyTaxRate = 0;
    let countyTaxCap: number | null = null;

    // Filter to tax_calculation rules
    const taxRules = taxRateRules.filter((rule) => rule.ruleType === 'tax_calculation');

    // Find state tax rate
    const stateRule = taxRules.find((rule) => {
      const ruleData = rule.ruleData as TaxRateRule;
      return ruleData.rateType === 'state';
    });

    if (stateRule) {
      const ruleData = stateRule.ruleData as TaxRateRule;
      stateTaxRate = ruleData.ratePercent / 100; // Convert percent to decimal
    }

    // Find county tax rate
    const countyRule = taxRules.find((rule) => {
      const ruleData = rule.ruleData as TaxRateRule;
      return (
        ruleData.rateType === 'county' &&
        (rule.countyName === scenario.jurisdiction.countyName || !rule.countyName)
      );
    });

    if (countyRule) {
      const ruleData = countyRule.ruleData as TaxRateRule;
      countyTaxRate = ruleData.ratePercent / 100;
      countyTaxCap = ruleData.capAmount || null;
    }

    // Fallback to default FL rates if no rules found
    if (scenario.jurisdiction.stateCode === 'FL') {
      if (stateTaxRate === 0) stateTaxRate = 0.06; // 6% FL state tax
      if (countyTaxRate === 0) countyTaxRate = 0.01; // 1% default county
      if (countyTaxCap === null) countyTaxCap = 5000; // FL county cap
    }

    return { stateTaxRate, countyTaxRate, countyTaxCap };
  }
}
