import { ExceptionCode, throwException } from '../../../helpers/assert-object.helpers.js';
import { ExactDecimal } from '../exact-decimal.js';

/** Width of a stored decimal, in the terms SQL states it: `numeric(totalDigits, scale)`. */
export type ExactDecimalWidth = { totalDigits: number; scale: number };

/** Whether the value's magnitude fits the digits the width leaves before the point. */
export function fitsIntegerDigits(value: ExactDecimal, width: ExactDecimalWidth): boolean {
  return value.abs().lt(new ExactDecimal(`1e${integerDigitsOf(width)}`));
}

function integerDigitsOf(width: ExactDecimalWidth): number {
  return width.totalDigits - width.scale;
}

/**
 * Rejects a value the given width cannot hold exactly. A column with a scale rounds an over-long
 * fraction silently, and a rounding nobody decided on is a changed value, so the caller has to
 * round deliberately rather than leave it to the column.
 */
export function assertDecimalFits(value: ExactDecimal, width: ExactDecimalWidth): void {
  if (!value.isFinite()) {
    throwException(ExceptionCode.InvalidDecimalValue, {
      value: value.toString(),
      reason: 'value is not finite',
    });
  }

  if (value.decimalPlaces() > width.scale) {
    throwException(ExceptionCode.InvalidDecimalValue, {
      value: value.toFixed(),
      reason: `value has more than ${width.scale} decimal places and would be rounded on write`,
    });
  }

  if (!fitsIntegerDigits(value, width)) {
    throwException(ExceptionCode.InvalidDecimalValue, {
      value: value.toFixed(),
      reason: `value needs more than ${integerDigitsOf(width)} digits before the decimal point`,
    });
  }
}
