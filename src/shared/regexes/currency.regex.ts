import assert from 'node:assert/strict';

import { CURRENCY_CODE_LENGTH } from '../constants/currency.constants.js';

/** ISO 4217 alphabetic code: exactly three uppercase letters. */
export const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;
assert.match('USD', CURRENCY_CODE_REGEX);
assert.match('JPY', CURRENCY_CODE_REGEX);
assert.doesNotMatch('usd', CURRENCY_CODE_REGEX);
assert.doesNotMatch('US', CURRENCY_CODE_REGEX);
assert.doesNotMatch('USDD', CURRENCY_CODE_REGEX);
assert.doesNotMatch('US1', CURRENCY_CODE_REGEX);
assert.doesNotMatch('US ', CURRENCY_CODE_REGEX);
assert.doesNotMatch('', CURRENCY_CODE_REGEX);

// The column length and the pattern describe the same code.
assert.match('A'.repeat(CURRENCY_CODE_LENGTH), CURRENCY_CODE_REGEX);
assert.doesNotMatch('A'.repeat(CURRENCY_CODE_LENGTH + 1), CURRENCY_CODE_REGEX);
