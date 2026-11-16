import { describe, expect, it } from 'vitest';

import { rejectedPayload } from '../../../../test/helpers/exception.helpers.js';
import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import type { ExchangeRateProvider } from '../providers/exchange-rate.provider.js';
import { ExchangeRateService } from '../services/exchange-rate.service.js';
import type { ExchangeRateInput } from '../types/exchange-rate.types.js';

/** Holds one pair, so a test can also show what happens when the pair is missing. */
class SinglePairProvider implements ExchangeRateProvider {
  public consulted = 0;

  constructor(
    private readonly pair: ExchangeRateInput,
    private readonly rate: string,
  ) {}

  public findRate(input: ExchangeRateInput): Promise<ExactDecimal | undefined> {
    this.consulted += 1;

    const matches =
      input.fromCurrencyCode === this.pair.fromCurrencyCode &&
      input.toCurrencyCode === this.pair.toCurrencyCode;

    return Promise.resolve(matches ? new ExactDecimal(this.rate) : undefined);
  }
}

function serviceWith(rate = '0.920000') {
  const provider = new SinglePairProvider({ fromCurrencyCode: 'USD', toCurrencyCode: 'EUR' }, rate);

  return { provider, service: new ExchangeRateService(provider) };
}

describe('ExchangeRateService', () => {
  it('rates a currency against itself as one without consulting the provider', async () => {
    const { provider, service } = serviceWith();

    const rate = await service.findRateOrThrow({
      fromCurrencyCode: 'USD',
      toCurrencyCode: 'USD',
    });

    expect(rate.toFixed()).toBe('1');
    expect(provider.consulted).toBe(0);
  });

  it('returns the rate the provider holds for the pair', async () => {
    const { service } = serviceWith();

    const rate = await service.findRateOrThrow({
      fromCurrencyCode: 'USD',
      toCurrencyCode: 'EUR',
    });

    expect(rate.toFixed()).toBe('0.92');
  });

  it('refuses a pair the provider does not hold instead of deriving one', async () => {
    const { service } = serviceWith();

    const payload = await rejectedPayload(() =>
      service.findRateOrThrow({ fromCurrencyCode: 'EUR', toCurrencyCode: 'JPY' }),
    );

    expect(payload).toMatchObject({ errorCode: ExceptionCode.ExchangeRateNotFound });
  });

  it('converts at the rate and reports both halves', async () => {
    const { service } = serviceWith();

    const conversion = await service.convertAmount({
      amount: new ExactDecimal('100.00'),
      fromCurrencyCode: 'USD',
      toCurrencyCode: 'EUR',
      toMinorUnits: 2,
    });

    expect(conversion.exchangeRate.toFixed()).toBe('0.92');
    expect(conversion.convertedAmount.toFixed(2)).toBe('92.00');
  });

  it('refuses an amount that the conversion rounds away to nothing', async () => {
    const { service } = serviceWith('0.000001');

    const payload = await rejectedPayload(() =>
      service.convertAmount({
        amount: new ExactDecimal('0.01'),
        fromCurrencyCode: 'USD',
        toCurrencyCode: 'EUR',
        toMinorUnits: 2,
      }),
    );

    expect(payload).toMatchObject({ errorCode: ExceptionCode.ConvertedAmountNotPositive });
  });

  /** A payable invoice can still convert into more than the program currency can hold. */
  it('refuses a conversion wider than the amount column stores', async () => {
    const { service } = serviceWith('157.200000');

    const payload = await rejectedPayload(() =>
      service.convertAmount({
        amount: new ExactDecimal('100000000000000.00'),
        fromCurrencyCode: 'USD',
        toCurrencyCode: 'EUR',
        toMinorUnits: 2,
      }),
    );

    expect(payload).toMatchObject({ errorCode: ExceptionCode.ConvertedAmountTooLarge });
  });
});
