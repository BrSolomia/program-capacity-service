import { z } from 'zod';

import { ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { InvoiceExternalIdSchema } from '../../../shared/schemas/identifier.schemas.js';

export const ReservationResponseSchema = z.object({
  reservationId: z.uuid(),
  invoiceExternalId: InvoiceExternalIdSchema,
  status: z.enum(ReservationStatus),
  reservedAmount: z.string(),
  exchangeRate: z.string(),
  reserveOperationNumber: z.string().nullable(),
  releaseOperationNumber: z.string().nullable(),
});
export type ReservationResponse = z.infer<typeof ReservationResponseSchema>;
