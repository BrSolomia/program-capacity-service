import assert from 'node:assert/strict';

import { MAX_EXCHANGE_RATE_SCALE } from '../../../shared/constants/currency.constants.js';
import {
  DECIMAL_PRECISION,
  ExactDecimalWidth,
} from '../../../shared/primitives/exact-decimal/index.js';
import { AMOUNT_WIDTH } from './amount.column.js';
import { exactDecimalColumn } from './exact-decimal.column.js';

/** 12 digits before the point, 12 after. A rate is not money and is not rounded like money. */
export const EXCHANGE_RATE_WIDTH: ExactDecimalWidth = { totalDigits: 24, scale: 12 };

// Postgres rounds a longer rate away silently, so the scale stays above what we accept on input.
assert.ok(
  EXCHANGE_RATE_WIDTH.scale > MAX_EXCHANGE_RATE_SCALE,
  'an exchange rate column must hold more decimals than a rate may arrive with',
);

// Converting an amount at a rate multiplies the two, and the exact product needs both widths at
// once; below this, decimal.js rounds the conversion before anyone decides to.
assert.ok(
  AMOUNT_WIDTH.totalDigits + EXCHANGE_RATE_WIDTH.totalDigits <= DECIMAL_PRECISION,
  'decimal.js precision must cover an amount multiplied by a rate',
);

/** Rate between two currencies, fixed at the moment it is applied. */
export const exchangeRateColumn = exactDecimalColumn(EXCHANGE_RATE_WIDTH);
