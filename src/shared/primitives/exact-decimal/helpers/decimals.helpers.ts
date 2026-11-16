import { ExactDecimal } from '../exact-decimal.js';

const ZERO = new ExactDecimal(0);

/** Sum of a list, zero when it is empty. */
export function sumDecimals(values: ExactDecimal[]): ExactDecimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}
