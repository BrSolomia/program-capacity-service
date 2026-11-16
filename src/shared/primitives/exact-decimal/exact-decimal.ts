import { Decimal } from 'decimal.js';

import { DECIMAL_PRECISION } from './exact-decimal.constants.js';

/**
 * The only decimal constructor a stored value may be built with: it keeps enough significant
 * digits for the values we store, and never prints exponential notation, which Postgres and
 * JSON consumers would read as a different number.
 *
 * decimal.js clones share one prototype, so `instanceof` cannot tell an ExactDecimal from a
 * default-precision Decimal. Never import `decimal.js` directly for a value that gets stored.
 */
export const ExactDecimal = Decimal.clone({
  precision: DECIMAL_PRECISION,
  toExpNeg: -DECIMAL_PRECISION,
  toExpPos: DECIMAL_PRECISION,
});

export type ExactDecimal = Decimal;
