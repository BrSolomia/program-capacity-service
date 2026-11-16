import assert from 'node:assert/strict';

import { MAX_MINOR_UNITS } from '../../../shared/constants/currency.constants.js';
import {
  assertDecimalFits,
  ExactDecimal,
  ExactDecimalWidth,
} from '../../../shared/primitives/exact-decimal/index.js';
import { exactDecimalColumn } from './exact-decimal.column.js';

/** 15 digits before the point, 4 after. */
export const AMOUNT_WIDTH: ExactDecimalWidth = { totalDigits: 19, scale: 4 };

// The scale has to exceed the longest fraction an amount can legitimately arrive with. Where it
// does not, Postgres rounds the surplus away silently, and no CHECK can catch that, because the
// value is coerced to the column's scale before constraints are evaluated.
assert.ok(
  AMOUNT_WIDTH.scale > MAX_MINOR_UNITS,
  'an amount column must hold more decimals than any currency subdivides into',
);

/** Amount of money, in the currency of the row that owns it. */
export const amountColumn = exactDecimalColumn(AMOUNT_WIDTH);

/** Guards an amount that reaches the column through raw SQL, where `toDriver` does not run. */
export function assertAmountFits(value: ExactDecimal): void {
  assertDecimalFits(value, AMOUNT_WIDTH);
}
