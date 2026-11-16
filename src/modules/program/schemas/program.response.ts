import { z } from 'zod';

/** Amounts leave as text, for the same reason they arrive as text. */
export const ProgramCapacityResponseSchema = z.object({
  programCode: z.string(),
  currencyCode: z.string(),
  creditLimit: z.string(),
  reservedAmount: z.string(),
  availableAmount: z.string(),
  lastTreasuryReconciledAt: z.iso.datetime().nullable(),
});
export type ProgramCapacityResponse = z.infer<typeof ProgramCapacityResponseSchema>;
