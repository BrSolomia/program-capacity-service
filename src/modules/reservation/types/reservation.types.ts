import { Currency, Invoice, Reservation } from '../../../database/schema/index.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import type {
  CurrencyCode,
  InvoiceExternalId,
  ProgramCode,
} from '../../../shared/schemas/identifier.schemas.js';

export type ReserveInput = {
  programCode: ProgramCode;
  invoiceExternalId: InvoiceExternalId;
  invoiceAmount: ExactDecimal;
  invoiceCurrencyCode: CurrencyCode;
};

export type ReleaseInput = {
  programCode: ProgramCode;
  invoiceExternalId: InvoiceExternalId;
};

/**
 * A reservation after a client operation, and the number that operation took. `null` means this
 * request changed nothing — the reservation was already there.
 */
export type ReservationChange = {
  operationNumber: bigint | null;
  reservation: Reservation;
};

/** What the terms check reads off an invoice that is already reserved. */
export type ReservedInvoiceTerms = {
  invoice: Pick<Invoice, 'amount' | 'currencyCode'>;
};

/** What the amount check reads off the currency an amount is denominated in. */
export type AmountCurrency = Pick<Currency, 'code' | 'minorUnits'>;
