import { z } from 'zod';

/**
 * Jurisdiction (location-based taxation and registration context)
 */
export const JurisdictionSchema = z.object({
  countryCode: z.string().default('US'),
  stateCode: z.string(), // e.g., "FL"
  countyName: z.string().optional(),
  cityName: z.string().optional(),
  postalCode: z.string().optional(),
});

/**
 * Dealer Context
 */
export const DealerContextSchema = z.object({
  dealerId: z.string(),
  configVersion: z.string(),
  feePackageId: z.string().optional(),
});

/**
 * Deal (transaction economics)
 */
export const DealSchema = z.object({
  dealType: z.enum(['retail', 'lease', 'cash', 'balloon']),
  sellingPrice: z.number().min(0),
  msrp: z.number().min(0).optional(),
  capCostReduction: z.number().min(0).optional(),
  rebates: z.number().min(0).optional(),
  cashDown: z.number().min(0).optional(),
  termMonths: z.number().int().min(0).optional(),
  apr: z.number().min(0).optional(),
  moneyFactor: z.number().min(0).optional(),
  lenderName: z.string().optional(),
  lenderType: z.enum(['captive', 'bank', 'credit_union', 'other']).optional(),
});

/**
 * Vehicle Information
 */
export const VehicleSchema = z.object({
  vin: z.string(),
  year: z.number().int(),
  make: z.string().optional(),
  model: z.string().optional(),
  trim: z.string().optional(),
  bodyType: z.string(),
  newOrUsed: z.enum(['new', 'used']),
  odometer: z.number().int().min(0).optional(),
  weightLbs: z.number().int().min(0).optional(),
  useType: z.enum(['personal', 'commercial', 'fleet']).default('personal'),
});

/**
 * Trade-in Vehicle
 */
export const TradeInSchema = z.object({
  vin: z.string().optional(),
  estimatedValue: z.number().min(0),
  payoffAmount: z.number().min(0),
  lienHolderName: z.string().optional(),
  titleStateCode: z.string().optional(),
});

/**
 * Registration (plate and registration scenario)
 */
export const RegistrationSchema = z.object({
  plateScenario: z.enum([
    'new_plate',
    'transfer_existing_plate',
    'temp_tag',
    'no_plate',
  ]),
  existingPlateNumber: z.string().optional(),
  firstTimeRegisteredInState: z.boolean().optional(),
  garagingAddressPostalCode: z.string().optional(),
});

/**
 * Customer Information
 */
export const CustomerSchema = z.object({
  residentStatus: z.enum(['resident', 'non_resident', 'military_temp']),
  hasExistingStateRegistration: z.boolean().optional(),
  exemptions: z
    .array(
      z.enum([
        'disabled_veteran',
        'disabled_non_veteran',
        'active_duty_military',
        'government_entity',
        'non_profit',
        'other',
      ])
    )
    .optional(),
});

/**
 * Manual Overrides
 */
export const OverridesSchema = z.object({
  isInitialRegistration: z.boolean().optional(),
  forceGovFeeCodeInclusion: z.array(z.string()).optional(),
  forceGovFeeCodeExclusion: z.array(z.string()).optional(),
});

/**
 * Complete Scenario Input
 */
export const ScenarioInputSchema = z.object({
  scenarioId: z.string().uuid(),
  timestampUtc: z.string().datetime(),
  jurisdiction: JurisdictionSchema,
  dealerContext: DealerContextSchema,
  deal: DealSchema,
  vehicle: VehicleSchema,
  tradeIns: z.array(TradeInSchema).default([]),
  registration: RegistrationSchema,
  customer: CustomerSchema,
  overrides: OverridesSchema.optional(),
});

// Export TypeScript types
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;
export type DealerContext = z.infer<typeof DealerContextSchema>;
export type Deal = z.infer<typeof DealSchema>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export type TradeIn = z.infer<typeof TradeInSchema>;
export type Registration = z.infer<typeof RegistrationSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type Overrides = z.infer<typeof OverridesSchema>;
export type ScenarioInput = z.infer<typeof ScenarioInputSchema>;
