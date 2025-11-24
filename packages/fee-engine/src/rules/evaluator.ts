import jsonLogic from 'json-logic-js';
import type { ScenarioInput } from '../types/scenario-input';
import type { JurisdictionRule, GovernmentFeeRule } from '../types/jurisdiction-rules';

/**
 * Rules Evaluator
 *
 * Evaluates JSONLogic conditions against scenario input to determine
 * which fees, taxes, and exemptions apply.
 */
export class RulesEvaluator {
  /**
   * Evaluate a single rule's conditions against scenario input
   *
   * @param condition - JSONLogic condition object
   * @param scenarioInput - Complete scenario data
   * @returns true if condition is met, false otherwise
   */
  evaluateCondition(condition: any, scenarioInput: ScenarioInput): boolean {
    try {
      const result = jsonLogic.apply(condition, scenarioInput);
      return Boolean(result);
    } catch (error) {
      console.error('[RulesEvaluator] Error evaluating condition:', error);
      return false;
    }
  }

  /**
   * Find all jurisdiction rules that apply to a scenario
   *
   * @param rules - All available jurisdiction rules
   * @param scenarioInput - Scenario to evaluate
   * @returns Array of applicable rules
   */
  findApplicableRules(
    rules: JurisdictionRule[],
    scenarioInput: ScenarioInput
  ): JurisdictionRule[] {
    return rules.filter((rule) => {
      // Extract conditions from rule_data (handle both camelCase and snake_case)
      const ruleData = (rule as any).rule_data || rule.ruleData;
      const conditions = ruleData?.conditions;

      if (!conditions) {
        // No conditions means rule always applies
        return true;
      }

      return this.evaluateCondition(conditions, scenarioInput);
    });
  }

  /**
   * Find applicable government fee rules
   *
   * @param rules - All jurisdiction rules
   * @param scenarioInput - Scenario to evaluate
   * @returns Array of applicable government fee rules
   */
  findApplicableGovernmentFees(
    rules: JurisdictionRule[],
    scenarioInput: ScenarioInput
  ): GovernmentFeeRule[] {
    return this.findApplicableRules(rules, scenarioInput)
      .filter((rule) => {
        const ruleType = (rule as any).rule_type || rule.ruleType;
        const ruleData = (rule as any).rule_data || rule.ruleData;

        // Only include government fees
        if (ruleType !== 'government_fee') {
          return false;
        }

        // Exclude optional fees (autoApply: false or optional: true)
        if (ruleData.autoApply === false || ruleData.optional === true) {
          return false;
        }

        return true;
      })
      .map((rule) => {
        const ruleData = (rule as any).rule_data || rule.ruleData;
        return ruleData as GovernmentFeeRule;
      })
      .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Higher priority first
  }

  /**
   * Check if a specific exemption applies
   *
   * @param exemptionCode - The exemption code to check
   * @param rules - All jurisdiction rules
   * @param scenarioInput - Scenario to evaluate
   * @returns true if exemption applies
   */
  checkExemption(
    exemptionCode: string,
    rules: JurisdictionRule[],
    scenarioInput: ScenarioInput
  ): boolean {
    const exemptionRules = rules.filter(
      (rule) =>
        rule.ruleType === 'exemption' &&
        (rule.ruleData as any).exemptionCode === exemptionCode
    );

    return exemptionRules.some((rule) => {
      const conditions = (rule.ruleData as any).conditions;
      return conditions ? this.evaluateCondition(conditions, scenarioInput) : false;
    });
  }

  /**
   * Get explanation text for why a rule was applied
   *
   * @param rule - The rule that was applied
   * @param scenarioInput - Scenario data
   * @returns Human-readable explanation
   */
  getExplanation(rule: GovernmentFeeRule, scenarioInput: ScenarioInput): string {
    if (rule.explanation) {
      // Use template explanation if provided
      return this.interpolateTemplate(rule.explanation, scenarioInput);
    }

    // Generate default explanation
    return `${rule.description} applies to this scenario`;
  }

  /**
   * Interpolate template strings with scenario data
   *
   * @param template - Template string with {{variable}} placeholders
   * @param scenarioInput - Data to interpolate
   * @returns Interpolated string
   */
  private interpolateTemplate(template: string, scenarioInput: any): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getValueByPath(scenarioInput, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Get value from object by dot-notation path
   *
   * @param obj - Object to extract from
   * @param path - Dot-notation path (e.g., "registration.plateScenario")
   * @returns Value at path or undefined
   */
  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
