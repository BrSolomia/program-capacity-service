import { describe, expect, it } from 'vitest';

import {
  currencyCode,
  invoiceExternalId,
  programCode,
} from '../../../../../test/builders/index.js';
import { thrownPayload } from '../../../../../test/helpers/exception.helpers.js';
import { Currency } from '../../../../database/schema/index.js';
import { ExceptionCode } from '../../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../../shared/primitives/exact-decimal/index.js';
import type { ReserveInput } from '../../types/reservation.types.js';
import { ReservationActor, ReservationStatus } from '../../../../shared/enums/reservation.enums.js';
import {
  assertAmountIsApplicable,
  assertInvoiceMatchesReservation,
  assertReservationIsHeldByClient,
} from '../assert-invoice.helpers.js';

const usDollar: Pick<Currency, 'code' | 'minorUnits'> = { code: 'USD', minorUnits: 2 };
const japaneseYen: Pick<Currency, 'code' | 'minorUnits'> = { code: 'JPY', minorUnits: 0 };
const kuwaitiDinar: Pick<Currency, 'code' | 'minorUnits'> = { code: 'KWD', minorUnits: 3 };

describe('assertAmountIsApplicable', () => {
  it('accepts an amount the currency can express', () => {
    expect(() => assertAmountIsApplicable(new ExactDecimal('100.25'), usDollar)).not.toThrow();
    expect(() => assertAmountIsApplicable(new ExactDecimal('100'), japaneseYen)).not.toThrow();
    expect(() => assertAmountIsApplicable(new ExactDecimal('100.125'), kuwaitiDinar)).not.toThrow();
  });

  it('rejects an amount finer than the currency subdivides', () => {
    expect(
      thrownPayload(() => assertAmountIsApplicable(new ExactDecimal('100.005'), usDollar)),
    ).toMatchObject({
      errorCode: ExceptionCode.InvoiceAmountNotInMinorUnits,
    });
    expect(
      thrownPayload(() => assertAmountIsApplicable(new ExactDecimal('100.5'), japaneseYen)),
    ).toMatchObject({
      errorCode: ExceptionCode.InvoiceAmountNotInMinorUnits,
    });
  });

  it('rejects an amount that is not positive', () => {
    expect(
      thrownPayload(() => assertAmountIsApplicable(new ExactDecimal(0), usDollar)),
    ).toMatchObject({
      errorCode: ExceptionCode.InvoiceAmountNotPositive,
    });
    expect(
      thrownPayload(() => assertAmountIsApplicable(new ExactDecimal('-1.00'), usDollar)),
    ).toMatchObject({
      errorCode: ExceptionCode.InvoiceAmountNotPositive,
    });
  });

  /** Refused here, where it is a bad request, rather than by the column, where it is our failure. */
  it('refuses an amount wider than the amount column stores', () => {
    expect(
      thrownPayload(() =>
        assertAmountIsApplicable(new ExactDecimal('1000000000000000.00'), usDollar),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvoiceAmountTooLarge });

    expect(() =>
      assertAmountIsApplicable(new ExactDecimal('999999999999999.99'), usDollar),
    ).not.toThrow();
  });
});

describe('assertInvoiceMatchesReservation', () => {
  const reserved = {
    invoice: { amount: new ExactDecimal('100.00'), currencyCode: 'USD' },
  };
  const submitted: ReserveInput = {
    programCode: programCode('PROGRAM-1'),
    invoiceExternalId: invoiceExternalId('INVOICE-1'),
    invoiceAmount: new ExactDecimal('100.00'),
    invoiceCurrencyCode: currencyCode('USD'),
  };

  it('accepts a resubmission on the same terms', () => {
    expect(() => assertInvoiceMatchesReservation(submitted, reserved)).not.toThrow();
  });

  it('accepts an amount that differs only in trailing zeros', () => {
    const padded = { ...submitted, invoiceAmount: new ExactDecimal('100.0000') };

    expect(() => assertInvoiceMatchesReservation(padded, reserved)).not.toThrow();
  });

  it('rejects a different amount', () => {
    const other = { ...submitted, invoiceAmount: new ExactDecimal('200.00') };

    expect(thrownPayload(() => assertInvoiceMatchesReservation(other, reserved))).toMatchObject({
      errorCode: ExceptionCode.InvoiceReservedWithDifferentTerms,
    });
  });

  it('rejects a different currency', () => {
    const other = { ...submitted, invoiceCurrencyCode: currencyCode('EUR') };

    expect(thrownPayload(() => assertInvoiceMatchesReservation(other, reserved))).toMatchObject({
      errorCode: ExceptionCode.InvoiceReservedWithDifferentTerms,
    });
  });
});

describe('assertReservationIsHeldByClient', () => {
  const clientHold = { createdBy: ReservationActor.Client, status: ReservationStatus.Active };

  it('accepts an active reservation the client made', () => {
    expect(() => assertReservationIsHeldByClient(clientHold)).not.toThrow();
  });

  it('refuses one the client has already released', () => {
    expect(
      thrownPayload(() =>
        assertReservationIsHeldByClient({ ...clientHold, status: ReservationStatus.Released }),
      ),
    ).toMatchObject({
      errorCode: ExceptionCode.InvoiceAlreadyReleased,
    });
  });

  it('refuses one treasury created, whatever its status', () => {
    expect(
      thrownPayload(() =>
        assertReservationIsHeldByClient({ ...clientHold, createdBy: ReservationActor.Treasury }),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.ReservationBelongsToTreasury });
  });
});
