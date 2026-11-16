/**
 * Boundaries of the stored decimals, written out as literals instead of being built from the
 * widths they defend: a fixture derived from a width can never catch a wrong width.
 */

/** Largest amount stored exactly: 15 digits before the point, 4 after. */
export const LARGEST_AMOUNT = '999999999999999.9999';

/** Smallest positive amount stored exactly. */
export const SMALLEST_AMOUNT = '0.0001';

/** One decimal more than an amount column holds. */
export const AMOUNT_WITH_TOO_MANY_DECIMALS = '0.00001';

/** One integer digit more than an amount column holds. */
export const AMOUNT_TOO_LARGE = '1000000000000000';

/** Finest subdivision any currency has (KWD, three decimals), which an amount keeps intact. */
export const AMOUNT_AT_FINEST_MINOR_UNITS = '0.001';

/** Largest exchange rate stored exactly: 12 digits before the point, 12 after. */
export const LARGEST_EXCHANGE_RATE = '999999999999.999999999999';

/** Smallest positive exchange rate stored exactly. */
export const SMALLEST_EXCHANGE_RATE = '0.000000000001';

/**
 * Largest amount converted at the largest rate: 43 significant digits, which is the widest
 * product the application computes and so the width `DECIMAL_PRECISION` has to cover.
 */
export const WIDEST_EXACT_PRODUCT = '999999999999999999899999000.0000000000000001';
