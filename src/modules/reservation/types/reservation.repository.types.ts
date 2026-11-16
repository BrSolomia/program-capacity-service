import { Invoice, NewReservation, Reservation } from '../../../database/schema/index.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';

/**
 * A client reservation always carries the number of the operation that created it.
 */
export type NewClientReservation = Pick<
  NewReservation,
  'programId' | 'invoiceId' | 'reservedAmount' | 'invoiceToProgramFxRate'
> & { reserveClientOperationNumber: bigint };

/** A reservation together with the invoice it holds capacity for. */
export type ReservedInvoice = {
  invoice: Invoice;
  reservation: Reservation;
};

export type FindReservedInvoiceInput = {
  programId: string;
  invoiceExternalId: string;
};

export type ReleaseByClientInput = {
  reservationId: string;
  releaseClientOperationNumber: bigint;
};

/** A reservation reconciliation creates: treasury made it, so it carries no client operation. */
export type NewTreasuryReservation = Pick<
  NewReservation,
  'programId' | 'invoiceId' | 'reservedAmount'
>;

export type FindReservationsInput = {
  programId: string;
  invoiceExternalIds: string[];
};

/** A reservation joined with the id its invoice carries in the system that issued it. */
export type ReservationWithInvoiceExternalId = Pick<
  Reservation,
  | 'id'
  | 'reservedAmount'
  | 'status'
  | 'reserveClientOperationNumber'
  | 'releaseClientOperationNumber'
> & { invoiceExternalId: string };

export type ChangeReservedAmountInput = {
  reservationId: string;
  reservedAmount: ExactDecimal;
};
