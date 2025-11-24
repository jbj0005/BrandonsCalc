/**
 * @brandonscalc/fee-engine
 *
 * DMS-style fee calculation engine for automotive transactions
 *
 * @module @brandonscalc/fee-engine
 */

// Export all types
export * from './types';

// Export core engine classes
export { FeeCalculator } from './engine/fee-calculator';
export { TaxCalculator } from './engine/tax-calculator';
export { RulesEvaluator } from './rules/evaluator';

// Export adapters
export { CalculatorAdapter } from './adapters/calculator-adapter';
export type { CalculatorState } from './adapters/calculator-adapter';

// Version
export const VERSION = '1.0.0';
