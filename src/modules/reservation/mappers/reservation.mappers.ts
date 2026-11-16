import { Reservation } from '../../../database/schema/index.js';
import type { InvoiceExternalId } from '../../../shared/schemas/identifier.schemas.js';
import type { ReservationResponse } from '../schemas/reservation.response.js';

export function toReservationResponse(
  invoiceExternalId: InvoiceExternalId,
  reservation: Reservation,
): ReservationResponse {
  return {
    invoiceExternalId,
    reservationId: reservation.id,
    status: reservation.status,
    reservedAmount: reservation.reservedAmount.toFixed(),
    exchangeRate: reservation.invoiceToProgramFxRate.toFixed(),
    reserveOperationNumber: reservation.reserveClientOperationNumber?.toString() ?? null,
    releaseOperationNumber: reservation.releaseClientOperationNumber?.toString() ?? null,
  };
}
