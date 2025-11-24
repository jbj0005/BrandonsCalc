import { z } from 'zod';

/**
 * JSONLogic condition (recursive type for complex conditions)
 */
export type JSONLogicCondition =
  | string
  | number
  | boolean
  | { [key: string]: JSONLogicCondition | JSONLogicCondition[] }
  | JSONLogicCondition[];

/**
 * Government Fee Rule
 */
export const GovernmentFeeRuleSchema = z.object({
  feeCode: z.string(),
  description: z.string(),
  amount: z.number().optional(), // Fixed amount
  amountFormula: z.string().optional(), // Formula for calculation (e.g., "basePrice * 0.01")
  conditions: z.any(), // JSONLogic conditions
  taxable: z.boolean().default(false),
  priority: z.number().default(0), // For rule ordering
  explanation: z.string().optional(),
});

/**
 * Tax Rate Rule
 */
export const TaxRateRuleSchema = z.object({
  rateType: z.enum(['state', 'county', 'city', 'district']),
  ratePercent: z.number(),
  capAmount: z.number().optional(), // e.g., FL county tax cap at $5000
  conditions: z.any(),
  effectiveDate: z.string().datetime(),
  expirationDate: z.string().datetime().optional(),
});

/**
 * Exemption Rule
 */
export const ExemptionRuleSchema = z.object({
  exemptionCode: z.string(),
  description: z.string(),
  appliesToFees: z.array(z.string()), // Fee codes this exemption applies to
  discountType: z.enum(['percentage', 'fixed_amount', 'full_waiver']),
  discountValue: z.number().optional(),
  conditions: z.any(),
});

/**
 * Jurisdiction Rule (database record)
 */
export const JurisdictionRuleSchema = z.object({
  id: z.string().uuid(),
  stateCode: z.string(),
  countyName: z.string().optional(),
  ruleType: z.enum(['government_fee', 'tax_calculation', 'exemption']),
  ruleData: z.union([
    GovernmentFeeRuleSchema,
    TaxRateRuleSchema,
    ExemptionRuleSchema,
  ]),
  version: z.string().default('v1'),
  effectiveDate: z.string().datetime(),
  expirationDate: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Export TypeScript types
export type GovernmentFeeRule = z.infer<typeof GovernmentFeeRuleSchema>;
export type TaxRateRule = z.infer<typeof TaxRateRuleSchema>;
export type ExemptionRule = z.infer<typeof ExemptionRuleSchema>;
export type JurisdictionRule = z.infer<typeof JurisdictionRuleSchema>;
