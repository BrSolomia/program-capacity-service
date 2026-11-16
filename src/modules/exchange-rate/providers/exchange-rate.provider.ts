import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import type { ExchangeRateInput } from '../types/exchange-rate.types.js';

export interface ExchangeRateProvider {
  /** The rate for the ordered pair, or `undefined` when this provider holds none. */
  findRate(input: ExchangeRateInput): Promise<ExactDecimal | undefined>;
}
