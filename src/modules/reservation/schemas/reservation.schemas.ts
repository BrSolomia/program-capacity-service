import { z } from 'zod';

import { AmountSchema } from '../../../shared/schemas/amount.schemas.js';
import {
  CurrencyCodeSchema,
  InvoiceExternalIdSchema,
  ProgramCodeSchema,
} from '../../../shared/schemas/identifier.schemas.js';

export const ReserveParamsSchema = z.object({ programCode: ProgramCodeSchema });
export type ReserveParams = z.infer<typeof ReserveParamsSchema>;

/** Strict, so a misspelled field is reported instead of silently ignored. */
export const ReserveBodySchema = z
  .object({
    invoiceExternalId: InvoiceExternalIdSchema,
    amount: AmountSchema,
    currencyCode: CurrencyCodeSchema,
  })
  .strict();
export type ReserveBody = z.infer<typeof ReserveBodySchema>;

export const ReleaseParamsSchema = z.object({
  programCode: ProgramCodeSchema,
  invoiceExternalId: InvoiceExternalIdSchema,
});
export type ReleaseParams = z.infer<typeof ReleaseParamsSchema>;
