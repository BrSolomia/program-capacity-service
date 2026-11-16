import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';

export type ExchangeRateInput = {
  fromCurrencyCode: string;
  toCurrencyCode: string;
};

export type ConvertAmountInput = ExchangeRateInput & {
  amount: ExactDecimal;

  /** Decimal places of the target currency, which the converted amount is rounded to. */
  toMinorUnits: number;
};

export type AmountConversion = {
  exchangeRate: ExactDecimal;
  convertedAmount: ExactDecimal;
};
