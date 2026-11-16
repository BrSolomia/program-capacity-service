import { AMOUNT_WIDTH } from '../../../database/schema/columns/index.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal, fitsIntegerDigits } from '../../../shared/primitives/exact-decimal/index.js';
import type { CreditLimitCurrency, ProgramCurrency } from '../types/program.types.js';

/** A limit treasury may set. */
export function assertCreditLimitIsApplicable(
  creditLimit: ExactDecimal,
  currency: CreditLimitCurrency,
): void {
  assertValue(!creditLimit.isNegative(), ExceptionCode.ProgramCreditLimitNegative, {
    creditLimit: creditLimit.toFixed(),
  });

  const fitsMinorUnits = creditLimit.decimalPlaces() <= currency.minorUnits;
  assertValue(fitsMinorUnits, ExceptionCode.ProgramCreditLimitNotInMinorUnits, {
    creditLimit: creditLimit.toFixed(),
    currencyCode: currency.code,
  });

  const fitsAmountColumn = fitsIntegerDigits(creditLimit, AMOUNT_WIDTH);
  assertValue(fitsAmountColumn, ExceptionCode.ProgramCreditLimitTooLarge, {
    creditLimit: creditLimit.toFixed(),
  });
}

/** A program keeps the currency it was created in. */
export function assertProgramCurrencyUnchanged(
  program: ProgramCurrency,
  currencyCode: string,
): void {
  assertValue(program.currencyCode === currencyCode, ExceptionCode.ProgramCurrencyChanged, {
    programCode: program.code,
    currencyCode: program.currencyCode,
    messageCurrencyCode: currencyCode,
  });
}

/** The recomputed total shares the column with the limit, so it faces the same width. */
export function assertReservedAmountIsStorable(reservedAmount: ExactDecimal): void {
  const fitsAmountColumn = fitsIntegerDigits(reservedAmount, AMOUNT_WIDTH);
  assertValue(fitsAmountColumn, ExceptionCode.ProgramReservedAmountTooLarge, {
    reservedAmount: reservedAmount.toFixed(),
  });
}
