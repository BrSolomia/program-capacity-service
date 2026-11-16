import { AMOUNT_WIDTH } from '../../../database/schema/columns/index.js';
import { Reservation } from '../../../database/schema/index.js';
import { ReservationActor, ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal, fitsIntegerDigits } from '../../../shared/primitives/exact-decimal/index.js';
import type { StatementReservation } from '../types/reconciliation.types.js';
import type {
  AmountCurrency,
  ReservedInvoiceTerms,
  ReserveInput,
} from '../types/reservation.types.js';

/**
 * An amount has to be expressible in the currency it is denominated in: a currency subdivides
 * only so far, and a finer amount is a mistake on the caller's side, not something to round away
 * on their behalf. Whether the program still has room for it is decided by the hold, not here.
 */
export function assertAmountIsApplicable(amount: ExactDecimal, currency: AmountCurrency): void {
  const isPositiveAmount = amount.isPositive() && !amount.isZero();
  assertValue(isPositiveAmount, ExceptionCode.InvoiceAmountNotPositive, {
    amount: amount.toFixed(),
  });

  const fitsMinorUnits = amount.decimalPlaces() <= currency.minorUnits;
  assertValue(fitsMinorUnits, ExceptionCode.InvoiceAmountNotInMinorUnits, {
    amount: amount.toFixed(),
    currencyCode: currency.code,
  });

  // Past this point the amount reaches a column that cannot hold it.
  const fitsAmountColumn = fitsIntegerDigits(amount, AMOUNT_WIDTH);
  assertValue(fitsAmountColumn, ExceptionCode.InvoiceAmountTooLarge, {
    amount: amount.toFixed(),
  });
}

/**
 * A repeated invoice answers with its reservation only while that is still the client's own hold.
 */
export function assertReservationIsHeldByClient(
  reservation: Pick<Reservation, 'createdBy' | 'status'>,
): void {
  const isCreatedByClient = reservation.createdBy === ReservationActor.Client;
  assertValue(isCreatedByClient, ExceptionCode.ReservationBelongsToTreasury);

  const isActive = reservation.status === ReservationStatus.Active;
  assertValue(isActive, ExceptionCode.InvoiceAlreadyReleased);
}
/**
 * Resubmitting an invoice is a retry and returns the reservation it already has. Resubmitting it
 * with a different amount or currency is not a retry: the same key would then stand for two
 * different things, so it is a conflict rather than a second reservation.
 */
export function assertInvoiceMatchesReservation(
  input: ReserveInput,
  reserved: ReservedInvoiceTerms,
): void {
  const matchesReservedInvoice =
    reserved.invoice.amount.equals(input.invoiceAmount) &&
    reserved.invoice.currencyCode === input.invoiceCurrencyCode;

  assertValue(matchesReservedInvoice, ExceptionCode.InvoiceReservedWithDifferentTerms, {
    invoiceExternalId: input.invoiceExternalId,
    reservedAmount: reserved.invoice.amount.toFixed(),
    reservedCurrencyCode: reserved.invoice.currencyCode,
  });
}

/** A statement amount becomes the invoice reconciliation records, so it faces the same rule. */
export function assertStatementAmountsAreApplicable(
  reservations: StatementReservation[],
  currency: AmountCurrency,
): void {
  for (const reservation of reservations) {
    assertAmountIsApplicable(reservation.reservedAmount, currency);
  }
}
