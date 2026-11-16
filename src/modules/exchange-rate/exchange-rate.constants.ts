/** Injection token for the exchange rate provider. */
export const EXCHANGE_RATE_PROVIDER = Symbol('EXCHANGE_RATE_PROVIDER');

import { ExactDecimal } from '../../shared/primitives/exact-decimal/index.js';

/** Half-up: the most common commercial convention, and it has to match how treasury rounds. */
export const AMOUNT_ROUNDING = ExactDecimal.ROUND_HALF_UP;
