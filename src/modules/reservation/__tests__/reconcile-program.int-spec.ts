import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  insertCurrency,
  insertInvoice,
  insertProgram,
  insertReservation,
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
import { ReconciliationOutcome } from '../../../shared/enums/program.enums.js';
import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ReservationActor } from '../../../shared/enums/reservation.enums.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { CurrencyRepository, CurrencyService } from '../../currency/index.js';
import { InvoiceRepository, InvoiceService } from '../../invoice/index.js';
import { ProgramRepository, ProgramService } from '../../program/index.js';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import { ReconcileProgramService } from '../services/reconcile-program.service.js';
import type { Program } from '../../../database/schema/index.js';
import type { TreasuryStatement } from '../types/reconciliation.types.js';

const TREASURY_VERSION = 7n;
const APPLIED_THROUGH = 10n;
const AS_OF = new Date('2026-11-12T12:00:00Z');

function statement(overrides: Partial<TreasuryStatement> = {}): TreasuryStatement {
  return {
    programCode: PROGRAM_CODE,
    currencyCode: US_DOLLAR.code,
    creditLimit: new ExactDecimal('2000.00'),
    reservations: [],
    appliedThroughOperationNumber: APPLIED_THROUGH,
    treasuryVersion: TREASURY_VERSION,
    asOf: AS_OF,
    ...overrides,
  };
}

describe('reconciling a program against a treasury statement', () => {
  let database: Database;
  let service: ReconcileProgramService;

  beforeAll(() => {
    database = createTestDatabase();

    const currencies = new CurrencyService(new CurrencyRepository(database));
    service = new ReconcileProgramService(
      new TransactionService(database),
      new ProgramService(
        new ProgramRepository(database),
        currencies,
        new TransactionService(database),
      ),
      new InvoiceService(new InvoiceRepository(database)),
      new ReservationRepository(database),
      currencies,
    );
  });

  afterAll(async () => {
    await database.$client.end();
  });

  beforeEach(async () => {
    await truncateAllTables(database);
    await insertCurrency(database, US_DOLLAR);
  });

  async function reserveInvoice(
    program: Program,
    externalId: string,
    amount: string,
    reserveClientOperationNumber: bigint,
  ): Promise<void> {
    const invoice = await insertInvoice(database, {
      programId: program.id,
      externalId,
      amount: new ExactDecimal(amount),
      currencyCode: US_DOLLAR.code,
    });

    await insertReservation(database, {
      programId: program.id,
      invoiceId: invoice.id,
      reservedAmount: new ExactDecimal(amount),
      createdBy: ReservationActor.Client,
      reserveClientOperationNumber,
    });
  }

  it('creates a program the statement describes and we have never seen', async () => {
    const reconciliation = await service.reconcile(
      statement({
        reservations: [{ invoiceExternalId: 'INV-1', reservedAmount: new ExactDecimal('300.00') }],
      }),
    );

    expect(reconciliation).toMatchObject({
      outcome: ReconciliationOutcome.Created,
      programCode: PROGRAM_CODE,
      createdReservations: 1,
      releasedReservations: 0,
      correctedReservations: 0,
      treasuryVersion: TREASURY_VERSION,
    });
    expect(reconciliation.reservedAmount.toFixed()).toBe('300');
    expect(reconciliation.reservedAmountDifference.toFixed()).toBe('300');
  });

  /** A redelivery, not a newer picture: the statement must not be replayed onto what it produced. */
  it('ignores the same statement delivered twice', async () => {
    const delivered = statement({
      reservations: [{ invoiceExternalId: 'INV-1', reservedAmount: new ExactDecimal('300.00') }],
    });

    await service.reconcile(delivered);
    const repeated = await service.reconcile(delivered);

    expect(repeated).toMatchObject({
      outcome: ReconciliationOutcome.Ignored,
      createdReservations: 0,
      releasedReservations: 0,
      correctedReservations: 0,
    });
    expect(repeated.reservedAmount.toFixed()).toBe('300');
    expect(repeated.reservedAmountDifference.toFixed()).toBe('0');
  });

  /**
   * Each reported amount fits the column on its own, so only their total can overflow it. Refused
   * on the boundary rather than at the write, which is what makes it a dead letter and not a loop.
   */
  it('refuses a statement whose reservations add up past the column', async () => {
    const tooMuchTogether = new ExactDecimal('999999999999999.00');

    expect(
      await rejectedPayload(() =>
        service.reconcile(
          statement({
            reservations: [
              { invoiceExternalId: 'INV-1', reservedAmount: tooMuchTogether },
              { invoiceExternalId: 'INV-2', reservedAmount: tooMuchTogether },
            ],
          }),
        ),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.ProgramReservedAmountTooLarge });
  });

  it('reports what one statement changed', async () => {
    const program = await insertProgram(database, {
      reservedAmount: new ExactDecimal('300.00'),
      lastTreasuryVersion: 1n,
    });
    await reserveInvoice(program, 'INV-1', '100.00', 1n);
    await reserveInvoice(program, 'INV-2', '200.00', APPLIED_THROUGH + 1n);

    const reconciliation = await service.reconcile(
      statement({
        reservations: [
          { invoiceExternalId: 'INV-1', reservedAmount: new ExactDecimal('150.00') },
          { invoiceExternalId: 'INV-3', reservedAmount: new ExactDecimal('50.00') },
        ],
      }),
    );

    expect(reconciliation).toMatchObject({
      outcome: ReconciliationOutcome.Applied,
      createdReservations: 1,
      correctedReservations: 1,
      releasedReservations: 0,
      breaks: 0,
    });
    // 150 corrected + 50 created + 200 treasury has not read yet.
    expect(reconciliation.reservedAmount.toFixed()).toBe('400');
    expect(reconciliation.reservedAmountDifference.toFixed()).toBe('100');
  });
});
