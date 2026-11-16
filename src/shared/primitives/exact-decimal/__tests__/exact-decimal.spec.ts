import { describe, expect, it } from 'vitest';

import {
  LARGEST_AMOUNT,
  LARGEST_EXCHANGE_RATE,
  SMALLEST_EXCHANGE_RATE,
  WIDEST_EXACT_PRODUCT,
} from '../../../../../test/fixtures/exact-decimal.fixtures.js';
import { thrownPayload } from '../../../../../test/helpers/exception.helpers.js';
import { ExceptionCode } from '../../../helpers/assert-object.helpers.js';
import { ExactDecimal } from '../exact-decimal.js';
import { assertDecimalFits, ExactDecimalWidth } from '../helpers/assert-decimal-fits.helpers.js';

describe('ExactDecimal', () => {
  it('keeps every digit when adding at the full width of an amount', () => {
    const value = new ExactDecimal('123456789012345.6789');

    expect(value.plus(new ExactDecimal('0.0001')).toFixed()).toBe('123456789012345.679');
  });

  it('converts the largest amount at the largest rate without rounding', () => {
    const product = new ExactDecimal(LARGEST_AMOUNT).times(new ExactDecimal(LARGEST_EXCHANGE_RATE));

    expect(product.toFixed()).toBe(WIDEST_EXACT_PRODUCT);
  });

  it('is exact where binary floating point is not', () => {
    expect(
      new ExactDecimal('0.1').plus(new ExactDecimal('0.2')).equals(new ExactDecimal('0.3')),
    ).toBe(true);
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('never prints exponential notation inside the stored range', () => {
    expect(new ExactDecimal(SMALLEST_EXCHANGE_RATE).toString()).toBe(SMALLEST_EXCHANGE_RATE);
    expect(new ExactDecimal(LARGEST_AMOUNT).toString()).toBe(LARGEST_AMOUNT);
  });
});

describe('assertDecimalFits', () => {
  // An arbitrary width, so the helper is tested as the generic thing it is. The widths the
  // application actually stores are checked against the database in the column's own spec.
  const width: ExactDecimalWidth = { totalDigits: 7, scale: 2 };

  it('accepts the range the width holds exactly', () => {
    expect(() => assertDecimalFits(new ExactDecimal(0), width)).not.toThrow();
    expect(() => assertDecimalFits(new ExactDecimal('0.01'), width)).not.toThrow();
    expect(() => assertDecimalFits(new ExactDecimal('99999.99'), width)).not.toThrow();
    expect(() => assertDecimalFits(new ExactDecimal('-99999.99'), width)).not.toThrow();
  });

  it('rejects a fraction the width would round away on write', () => {
    expect(thrownPayload(() => assertDecimalFits(new ExactDecimal('0.001'), width))).toMatchObject({
      errorCode: ExceptionCode.InvalidDecimalValue,
    });
  });

  it('rejects a value too large for the integer part', () => {
    expect(thrownPayload(() => assertDecimalFits(new ExactDecimal('100000'), width))).toMatchObject(
      { errorCode: ExceptionCode.InvalidDecimalValue },
    );
  });

  it('rejects values that are not finite', () => {
    expect(thrownPayload(() => assertDecimalFits(new ExactDecimal(NaN), width))).toMatchObject({
      errorCode: ExceptionCode.InvalidDecimalValue,
    });
    expect(thrownPayload(() => assertDecimalFits(new ExactDecimal(Infinity), width))).toMatchObject(
      { errorCode: ExceptionCode.InvalidDecimalValue },
    );
  });
});
