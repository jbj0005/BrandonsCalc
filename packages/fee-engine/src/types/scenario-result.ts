import { z } from 'zod';

/**
 * Fee Line Item
 */
export const LineItemSchema = z.object({
  code: z.string(),
  category: z.enum(['government', 'dealer', 'customer', 'tax']),
  description: z.string(),
  amount: z.number(),
  taxable: z.boolean().default(false),
  appliedRuleId: z.string().optional(),
  explanation: z.string().optional(),
});

/**
 * Tax Breakdown
 */
export const TaxBreakdownSchema = z.object({
  taxableBase: z.number(),
  stateTaxRate: z.number(),
  countyTaxRate: z.number(),
  stateTax: z.number(),
  countyTax: z.number(),
  totalTax: z.number(),
  countyTaxCapped: z.boolean().default(false),
});

/**
 * Totals Summary
 */
export const TotalsSchema = z.object({
  governmentFees: z.number(),
  dealerFees: z.number(),
  customerAddons: z.number(),
  salesTax: z.number(),
  totalFees: z.number(),
  amountFinanced: z.number().optional(),
});

/**
 * Detected Scenario Information
 */
export const DetectedScenarioSchema = z.object({
  type: z.string(), // e.g., "trade_in_tag_transfer", "new_tag_financed"
  description: z.string(),
  hasTradeIn: z.boolean(),
  isFinanced: z.boolean(),
  isTagTransfer: z.boolean(),
  isFirstTimeRegistration: z.boolean(),
});

/**
 * Complete Scenario Result
 */
export const ScenarioResultSchema = z.object({
  scenarioId: z.string().uuid(),
  calculatedAt: z.string().datetime(),
  lineItems: z.array(LineItemSchema),
  taxBreakdown: TaxBreakdownSchema,
  totals: TotalsSchema,
  detectedScenario: DetectedScenarioSchema,
  explanations: z.array(z.string()),
  appliedRuleIds: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

// Export TypeScript types
export type LineItem = z.infer<typeof LineItemSchema>;
export type TaxBreakdown = z.infer<typeof TaxBreakdownSchema>;
export type Totals = z.infer<typeof TotalsSchema>;
export type DetectedScenario = z.infer<typeof DetectedScenarioSchema>;
export type ScenarioResult = z.infer<typeof ScenarioResultSchema>;
