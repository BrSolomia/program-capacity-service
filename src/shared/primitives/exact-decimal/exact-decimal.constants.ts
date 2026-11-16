/**
 * Significant digits decimal.js keeps per operation. The exact product of two stored decimals
 * needs the sum of their digits, so this has to stay at or above that sum for every pair the
 * application multiplies — the column module asserts it against the widths it declares.
 */
export const DECIMAL_PRECISION = 64;
