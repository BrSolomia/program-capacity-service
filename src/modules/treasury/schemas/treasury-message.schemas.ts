import { z } from 'zod';

import { TreasuryMessageType } from '../../../shared/enums/treasury.enums.js';
import { hasUniqueValues } from '../../../shared/helpers/array.helpers.js';
import { AmountSchema } from '../../../shared/schemas/amount.schemas.js';
import {
  CurrencyCodeSchema,
  InvoiceExternalIdSchema,
  ProgramCodeSchema,
} from '../../../shared/schemas/identifier.schemas.js';

export const ProgramCreditLimitMessageSchema = z
  .object({
    type: z.literal(TreasuryMessageType.ProgramCreditLimitUpdated),
    programCode: ProgramCodeSchema,
    currency: CurrencyCodeSchema,
    creditLimit: AmountSchema,
    version: z.int().nonnegative(),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/** One reservation treasury still holds, with the capacity it holds in the program currency. */
const StatementReservationSchema = z
  .object({ invoiceId: InvoiceExternalIdSchema, amount: AmountSchema })
  .strict();

/** Two entries for one invoice contradict each other, and no rule downstream could pick one. */
const StatementReservationsSchema = z
  .array(StatementReservationSchema)
  .refine((reservations) => hasUniqueValues(reservations, (entry) => entry.invoiceId), {
    message: 'reservations hold the same invoiceId twice',
  });

export const ProgramStatementMessageSchema = z
  .object({
    type: z.literal(TreasuryMessageType.ProgramStatement),
    programCode: ProgramCodeSchema,
    currency: CurrencyCodeSchema,
    creditLimit: AmountSchema,
    reservations: StatementReservationsSchema,

    /** Number of the last client operation treasury had applied when it took the statement. */
    appliedThroughOperationNumber: z.int().nonnegative(),
    version: z.int().nonnegative(),
    asOf: z.iso.datetime({ offset: true }),
  })
  .strict()
  .brand<'ProgramStatementMessage'>();
