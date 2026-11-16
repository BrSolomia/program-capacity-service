import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
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
import { CurrencyRepository, CurrencyService } from '../../currency/index.js';
import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { ProgramService } from '../services/program.service.js';
import { ProgramRepository } from '../repositories/program.repository.js';

describe('ProgramService', () => {
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
    await insertCurrency(database);
  });

  it('reports what is left of the credit limit', async () => {
    await insertProgram(database, {
      creditLimit: new ExactDecimal('1000.00'),
      reservedAmount: new ExactDecimal('250.00'),
    });

    const capacity = await service.getCapacity(PROGRAM_CODE);

    expect(capacity.programCode).toBe(PROGRAM_CODE);
    expect(capacity.currencyCode).toBe(US_DOLLAR.code);
    expect(capacity.availableAmount.toFixed()).toBe('750');
    expect(capacity.lastTreasuryReconciledAt).toBeNull();
  });

  it('reports negative capacity when treasury lowered the limit below what is reserved', async () => {
    await insertProgram(database, {
      creditLimit: new ExactDecimal('100.00'),
      reservedAmount: new ExactDecimal('250.00'),
    });

    expect((await service.getCapacity(PROGRAM_CODE)).availableAmount.toFixed()).toBe('-150');
  });

  it('reports an unknown program', async () => {
    expect(await rejectedPayload(() => service.getCapacity('MISSING'))).toMatchObject({
      errorCode: ExceptionCode.ProgramNotFound,
    });
  });
});
