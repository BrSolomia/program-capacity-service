import assert from 'node:assert/strict';

import { Injectable } from '@nestjs/common';

import { MAX_EXCHANGE_RATE_SCALE } from '../../../shared/constants/currency.constants.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import type { ExchangeRateInput } from '../types/exchange-rate.types.js';
import type { ExchangeRateProvider } from './exchange-rate.provider.js';

/**
 * Mock: rates are fixed in the source, which keeps the tests free of a network.
 *
 * TODO: read them from a rate source on a schedule and cache, refusing rather than serving a rate
 * that has gone stale.
 */
const RATES: Record<string, string> = {
  'USD:EUR': '0.920000',
  'EUR:USD': '1.087000',
  'USD:JPY': '157.200000',
  'JPY:USD': '0.006361',
  'USD:KWD': '0.306500',
  'KWD:USD': '3.262600',
};

// A rate longer than this is rounded by its column on write, which would store a rate nobody chose.
for (const [pair, rate] of Object.entries(RATES)) {
  assert.ok(
    new ExactDecimal(rate).decimalPlaces() <= MAX_EXCHANGE_RATE_SCALE,
    `configured rate ${pair} has more than ${MAX_EXCHANGE_RATE_SCALE} decimal places`,
  );
}

@Injectable()
export class MockedExchangeRateProvider implements ExchangeRateProvider {
  public findRate(params: ExchangeRateInput): Promise<ExactDecimal | undefined> {
    const { fromCurrencyCode, toCurrencyCode } = params;

    const rate = RATES[`${fromCurrencyCode}:${toCurrencyCode}`];

    return Promise.resolve(!rate ? undefined : new ExactDecimal(rate));
  }
}
