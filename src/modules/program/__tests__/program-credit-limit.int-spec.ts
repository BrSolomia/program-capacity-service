import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EURO,
  insertCurrency,
  insertProgram,
  PROGRAM_CODE,
  US_DOLLAR,
} from '../../../../test/builders/index.js';
import { rejectedPayload } from '../../../../test/helpers/exception.helpers.js';
import {
  createTestDatabase,
  truncateAllTables,
} from '../../../../test/helpers/test-database.helpers.js';
import type { Database } from '../../../database/database.module.js';
import { TransactionService } from '../../../database/services/transaction.service.js';
import { CreditLimitOutcome } from '../../../shared/enums/program.enums.js';
import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { CurrencyRepository, CurrencyService } from '../../currency/index.js';
import { ProgramRepository } from '../repositories/program.repository.js';
import { ProgramService } from '../services/program.service.js';
import type { ApplyCreditLimitInput } from '../types/program.types.js';

const TREASURY_VERSION = 7n;

function creditLimitInput(overrides: Partial<ApplyCreditLimitInput> = {}): ApplyCreditLimitInput {
  return {
    programCode: PROGRAM_CODE,
    currencyCode: US_DOLLAR.code,
    creditLimit: new ExactDecimal('2000.00'),
    treasuryVersion: TREASURY_VERSION,
    ...overrides,
  };
}

describe('applying a treasury limit change', () => {
  let database: Database;
  let service: ProgramService;

  beforeAll(() => {
    database = createTestDatabase();
    service = new ProgramService(
      new ProgramRepository(database),
      new CurrencyService(new CurrencyRepository(database)),
      new TransactionService(database),
    );
  });

  afterAll(async () => {
    await database.$client.end();
  });

  beforeEach(async () => {
    await truncateAllTables(database);
    await Promise.all([US_DOLLAR, EURO].map((currency) => insertCurrency(database, currency)));
  });

  it('creates a program treasury has described and we have never seen', async () => {
    const change = await service.applyCreditLimit(creditLimitInput());

    expect(change).toMatchObject({
      outcome: CreditLimitOutcome.Created,
      programCode: PROGRAM_CODE,
      previousCreditLimit: null,
      treasuryVersion: TREASURY_VERSION,
    });

    const capacity = await service.getCapacity(PROGRAM_CODE);
    expect(capacity.creditLimit.toFixed()).toBe('2000');
    expect(capacity.reservedAmount.toFixed()).toBe('0');
  });

  it('applies a newer limit and reports what it replaced', async () => {
    await insertProgram(database, {
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: 1n,
    });

    const change = await service.applyCreditLimit(creditLimitInput());

    expect(change.outcome).toBe(CreditLimitOutcome.Applied);
    expect(change.previousCreditLimit?.toFixed()).toBe('1000');
    expect(change.creditLimit.toFixed()).toBe('2000');
    expect(change.treasuryVersion).toBe(TREASURY_VERSION);
  });

  it('leaves reserved capacity and the client operation counter alone', async () => {
    await insertProgram(database, {
      reservedAmount: new ExactDecimal('250.00'),
      lastClientOperationNumber: 3n,
      lastTreasuryVersion: 1n,
    });

    await service.applyCreditLimit(creditLimitInput());

    const program = await service.findByCodeOrThrow(PROGRAM_CODE);
    expect(program.reservedAmount.toFixed()).toBe('250');
    expect(program.lastClientOperationNumber).toBe(3n);
  });

  /** Treasury owns the limit, so it may lower it below what clients already hold. */
  it('accepts a limit below the amount already reserved', async () => {
    await insertProgram(database, {
      reservedAmount: new ExactDecimal('900.00'),
      lastTreasuryVersion: 1n,
    });

    await service.applyCreditLimit(creditLimitInput({ creditLimit: new ExactDecimal('500.00') }));

    const capacity = await service.getCapacity(PROGRAM_CODE);
    expect(capacity.availableAmount.toFixed()).toBe('-400');
  });

  it('ignores a message treasury has already superseded', async () => {
    await insertProgram(database, {
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: 10n,
    });

    const change = await service.applyCreditLimit(creditLimitInput({ treasuryVersion: 9n }));

    expect(change.outcome).toBe(CreditLimitOutcome.Ignored);
    expect(change.creditLimit.toFixed()).toBe('1000');
    expect((await service.findByCodeOrThrow(PROGRAM_CODE)).lastTreasuryVersion).toBe(10n);
  });

  it('ignores the same message delivered twice', async () => {
    await service.applyCreditLimit(creditLimitInput());
    const repeated = await service.applyCreditLimit(creditLimitInput());

    expect(repeated.outcome).toBe(CreditLimitOutcome.Ignored);
    expect(repeated.creditLimit.toFixed()).toBe('2000');
  });

  it('refuses a message that redenominates the program', async () => {
    await insertProgram(database, { lastTreasuryVersion: 1n });

    expect(
      await rejectedPayload(() =>
        service.applyCreditLimit(creditLimitInput({ currencyCode: EURO.code })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramCurrencyChanged });

    expect((await service.findByCodeOrThrow(PROGRAM_CODE)).currencyCode).toBe(US_DOLLAR.code);
  });

  it('refuses a limit finer than the currency, leaving the program as it was', async () => {
    await insertProgram(database, {
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: 1n,
    });

    expect(
      await rejectedPayload(() =>
        service.applyCreditLimit(creditLimitInput({ creditLimit: new ExactDecimal('2000.005') })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramCreditLimitNotInMinorUnits });

    expect((await service.findByCodeOrThrow(PROGRAM_CODE)).creditLimit.toFixed()).toBe('1000');
  });

  it('refuses a program in a currency it has never heard of', async () => {
    expect(
      await rejectedPayload(() =>
        service.applyCreditLimit(creditLimitInput({ currencyCode: 'XXX' })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.CurrencyNotFound });
  });
});
