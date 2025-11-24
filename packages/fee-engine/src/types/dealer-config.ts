import { z } from 'zod';

/**
 * Dealer Fee Item
 */
export const DealerFeeItemSchema = z.object({
  code: z.string(),
  description: z.string(),
  amount: z.number(),
  taxable: z.boolean().default(false),
  required: z.boolean().default(true),
});

/**
 * Fee Package (preset bundle of dealer fees)
 */
export const FeePackageSchema = z.object({
  packageId: z.string(),
  packageName: z.string(),
  description: z.string().optional(),
  fees: z.array(DealerFeeItemSchema),
});

/**
 * Dealer Configuration
 */
export const DealerConfigSchema = z.object({
  id: z.string().uuid(),
  dealerId: z.string(),
  configVersion: z.string(),
  configData: z.object({
    packages: z.array(FeePackageSchema),
    defaultPackageId: z.string().optional(),
  }),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Export TypeScript types
export type DealerFeeItem = z.infer<typeof DealerFeeItemSchema>;
export type FeePackage = z.infer<typeof FeePackageSchema>;
export type DealerConfig = z.infer<typeof DealerConfigSchema>;
