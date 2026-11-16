import { describe, expect, it } from 'vitest';

import { thrownPayload } from '../../../../../test/helpers/exception.helpers.js';
import { ExceptionCode } from '../../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../../shared/primitives/exact-decimal/index.js';
import type { CreditLimitCurrency, ProgramCurrency } from '../../types/program.types.js';
import {
  assertCreditLimitIsApplicable,
  assertProgramCurrencyUnchanged,
} from '../assert-program.helpers.js';

const usDollar: CreditLimitCurrency = { code: 'USD', minorUnits: 2 };
const japaneseYen: CreditLimitCurrency = { code: 'JPY', minorUnits: 0 };

const usDollarProgram: ProgramCurrency = { code: 'PRG-001', currencyCode: 'USD' };

describe('assertCreditLimitIsApplicable', () => {
  it('accepts a limit the currency can state', () => {
    expect(() =>
      assertCreditLimitIsApplicable(new ExactDecimal('10000000.25'), usDollar),
    ).not.toThrow();
    expect(() =>
      assertCreditLimitIsApplicable(new ExactDecimal('157200'), japaneseYen),
    ).not.toThrow();
  });

  it('accepts zero, because treasury may close a program for new reservations', () => {
    expect(() => assertCreditLimitIsApplicable(new ExactDecimal('0'), usDollar)).not.toThrow();
  });

  it('refuses a fraction finer than the currency, instead of rounding it away', () => {
    expect(
      thrownPayload(() => assertCreditLimitIsApplicable(new ExactDecimal('100.005'), usDollar)),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramCreditLimitNotInMinorUnits });

    expect(
      thrownPayload(() => assertCreditLimitIsApplicable(new ExactDecimal('100.5'), japaneseYen)),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramCreditLimitNotInMinorUnits });
  });

  it('refuses a negative limit', () => {
    expect(
      thrownPayload(() => assertCreditLimitIsApplicable(new ExactDecimal('-1.00'), usDollar)),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramCreditLimitNegative });
  });

  /** Refused here, where it is a bad message, rather than by the column, where it is our failure. */
  it('refuses a limit wider than the amount column stores', () => {
    expect(
      thrownPayload(() =>
        assertCreditLimitIsApplicable(new ExactDecimal('1000000000000000.00'), usDollar),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramCreditLimitTooLarge });

    expect(() =>
      assertCreditLimitIsApplicable(new ExactDecimal('999999999999999.99'), usDollar),
    ).not.toThrow();
  });
});

describe('assertProgramCurrencyUnchanged', () => {
  it('accepts the currency the program was created in', () => {
    expect(() => assertProgramCurrencyUnchanged(usDollarProgram, 'USD')).not.toThrow();
  });

  it('refuses another currency, which would redenominate everything already reserved', () => {
    expect(
      thrownPayload(() => assertProgramCurrencyUnchanged(usDollarProgram, 'EUR')),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramCurrencyChanged });
  });
});
