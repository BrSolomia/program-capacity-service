import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { AMOUNT_ROUNDING } from '../exchange-rate.constants.js';

/** The place a money value is rounded. */
export function roundToMinorUnits(value: ExactDecimal, minorUnits: number): ExactDecimal {
  return value.toDecimalPlaces(minorUnits, AMOUNT_ROUNDING);
}
