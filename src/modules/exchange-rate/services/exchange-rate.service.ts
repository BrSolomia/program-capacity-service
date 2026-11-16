import { Inject, Injectable } from '@nestjs/common';

import { AMOUNT_WIDTH } from '../../../database/schema/columns/index.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal, fitsIntegerDigits } from '../../../shared/primitives/exact-decimal/index.js';
import { EXCHANGE_RATE_PROVIDER } from '../exchange-rate.constants.js';
import { roundToMinorUnits } from '../helpers/exchange-rate.helpers.js';
import type { ExchangeRateProvider } from '../providers/exchange-rate.provider.js';
import type {
  AmountConversion,
  ConvertAmountInput,
  ExchangeRateInput,
} from '../types/exchange-rate.types.js';

/** A currency against itself, which no provider has to hold. */
const IDENTITY_RATE = new ExactDecimal(1);

@Injectable()
export class ExchangeRateService {
  constructor(@Inject(EXCHANGE_RATE_PROVIDER) private readonly provider: ExchangeRateProvider) {}

  public async findRateOrThrow(input: ExchangeRateInput): Promise<ExactDecimal> {
    if (input.fromCurrencyCode === input.toCurrencyCode) {
      return IDENTITY_RATE;
    }

    const rate = await this.provider.findRate(input);
    assertValue(rate, ExceptionCode.ExchangeRateNotFound, {
      fromCurrencyCode: input.fromCurrencyCode,
      toCurrencyCode: input.toCurrencyCode,
    });

    return rate;
  }

  public async convertAmount(input: ConvertAmountInput): Promise<AmountConversion> {
    const exchangeRate = await this.findRateOrThrow(input);
    const convertedAmount = roundToMinorUnits(input.amount.times(exchangeRate), input.toMinorUnits);

    // An amount small enough to round away leaves nothing to hold, and a zero reservation is
    // rejected.
    const isPositive = convertedAmount.isPositive() && !convertedAmount.isZero();
    assertValue(isPositive, ExceptionCode.ConvertedAmountNotPositive, {
      amount: input.amount.toFixed(),
      exchangeRate: exchangeRate.toFixed(),
    });

    // The conversion is the one place an amount grows: a payable invoice can still convert into
    // more than the program currency can hold, and the rate is why.
    const fitsAmountColumn = fitsIntegerDigits(convertedAmount, AMOUNT_WIDTH);
    assertValue(fitsAmountColumn, ExceptionCode.ConvertedAmountTooLarge, {
      convertedAmount: convertedAmount.toFixed(),
      exchangeRate: exchangeRate.toFixed(),
      amount: input.amount.toFixed(),
    });

    return { exchangeRate, convertedAmount };
  }
}
