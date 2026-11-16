import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Kafka, Producer } from 'kafkajs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  insertCurrency,
  insertInvoice,
  insertProgram,
  invoiceExternalId,
  programCode,
  US_DOLLAR,
} from '../../../../test/builders/index.js';
import { insertReservation } from '../../../../test/builders/reservation.builders.js';
import { createTestAppWithConsumers } from '../../../../test/helpers/test-app.helpers.js';
import {
  createTestDatabase,
  truncateAllTables,
} from '../../../../test/helpers/test-database.helpers.js';
import {
  createTestKafka,
  createTopics,
  RecordedMessage,
  recordTopic,
} from '../../../../test/helpers/test-kafka.helpers.js';
import { waitUntil } from '../../../../test/helpers/wait.helpers.js';
import type { Database } from '../../../database/database.module.js';
import { invoices, Program, programs, reservations } from '../../../database/schema/index.js';
import { DEAD_LETTER_TOPIC_SUFFIX } from '../../../kafka/index.js';
import { ReservationActor, ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { TREASURY_STATEMENT_TOPIC } from '../../treasury/treasury.topics.js';
import { ReleaseCapacityService } from '../services/release-capacity.service.js';
import type { NewReservation } from '../../../database/schema/index.js';

const DEAD_LETTER_TOPIC = `${TREASURY_STATEMENT_TOPIC}${DEAD_LETTER_TOPIC_SUFFIX}`;

const APPLIED_THROUGH = 10;
const STATEMENT_VERSION = 5;
const AS_OF = '2026-11-12T12:00:00Z';

/** One per test, so statements and dead letters of different tests cannot be confused. */
let programCodeSequence = 0;

function nextProgramCode(): string {
  programCodeSequence += 1;

  return `RECONCILED-PROGRAM-${programCodeSequence}`;
}

function statement(code: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'PROGRAM_STATEMENT',
    programCode: code,
    currency: US_DOLLAR.code,
    creditLimit: '5000.00',
    reservations: [],
    appliedThroughOperationNumber: APPLIED_THROUGH,
    version: STATEMENT_VERSION,
    asOf: AS_OF,
    ...overrides,
  });
}

describe('reconciliation statements from treasury', () => {
  let app: INestApplication;
  let database: Database;
  let kafka: Kafka;
  let producer: Producer;
  let deadLetters: RecordedMessage[];
  let stopRecording: () => Promise<void>;

  beforeAll(async () => {
    database = createTestDatabase();
    await truncateAllTables(database);
    await insertCurrency(database, US_DOLLAR);

    kafka = createTestKafka();
    await createTopics(kafka, [TREASURY_STATEMENT_TOPIC, DEAD_LETTER_TOPIC]);

    producer = kafka.producer();
    await producer.connect();

    ({ messages: deadLetters, stop: stopRecording } = await recordTopic(kafka, DEAD_LETTER_TOPIC));

    app = await createTestAppWithConsumers();
  });

  afterAll(async () => {
    await Promise.all([app.close(), producer.disconnect(), stopRecording()]);
    await database.$client.end();
  });

  beforeEach(() => {
    deadLetters.length = 0;
  });

  async function publish(code: string, message: string): Promise<void> {
    await producer.send({
      topic: TREASURY_STATEMENT_TOPIC,
      messages: [{ key: code, value: message }],
    });
  }

  function findProgram(code: string) {
    return async () => {
      const [program] = await database.select().from(programs).where(eq(programs.code, code));

      return program;
    };
  }

  /** The statement is applied in one transaction, so the version appearing means all of it landed. */
  function waitForVersion(code: string, version: bigint) {
    return waitUntil(async () => {
      const program = await findProgram(code)();

      return program?.lastTreasuryVersion === version ? program : undefined;
    }, `version ${version} of ${code}`);
  }

  function findDeadLetter(code: string) {
    return () => Promise.resolve(deadLetters.find((deadLetter) => deadLetter.key === code));
  }

  async function reservationsOf(program: Program) {
    return database
      .select({
        invoiceExternalId: invoices.externalId,
        invoiceAmount: invoices.amount,
        invoiceCurrencyCode: invoices.currencyCode,
        reservedAmount: reservations.reservedAmount,
        invoiceToProgramFxRate: reservations.invoiceToProgramFxRate,
        status: reservations.status,
        createdBy: reservations.createdBy,
        releasedBy: reservations.releasedBy,
      })
      .from(reservations)
      .innerJoin(invoices, eq(invoices.id, reservations.invoiceId))
      .where(eq(reservations.programId, program.id));
  }

  async function reserveInvoice(
    program: Program,
    externalId: string,
    amount: string,
    overrides: Partial<NewReservation> = {},
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
      ...overrides,
    });
  }

  it('creates a program and the reservations treasury holds for it', async () => {
    const code = nextProgramCode();

    await publish(
      code,
      statement(code, { reservations: [{ invoiceId: 'INV-1', amount: '300.00' }] }),
    );

    const program = await waitForVersion(code, BigInt(STATEMENT_VERSION));

    expect(program.creditLimit.toFixed()).toBe('5000');
    expect(program.reservedAmount.toFixed()).toBe('300');
    expect(program.lastTreasuryReconciledAt?.toISOString()).toBe('2026-11-12T12:00:00.000Z');

    expect(await reservationsOf(program)).toMatchObject([
      {
        invoiceExternalId: 'INV-1',
        invoiceCurrencyCode: US_DOLLAR.code,
        status: ReservationStatus.Active,
        createdBy: ReservationActor.Treasury,
      },
    ]);
  });

  it('takes the amount treasury reports when ours differs', async () => {
    const code = nextProgramCode();
    const program = await insertProgram(database, {
      code,
      reservedAmount: new ExactDecimal('100.00'),
      lastTreasuryVersion: 1n,
    });
    await reserveInvoice(program, 'INV-1', '100.00');

    await publish(
      code,
      statement(code, { reservations: [{ invoiceId: 'INV-1', amount: '120.00' }] }),
    );

    const reconciled = await waitForVersion(code, BigInt(STATEMENT_VERSION));

    expect(reconciled.reservedAmount.toFixed()).toBe('120');
    expect(await reservationsOf(program)).toMatchObject([
      { reservedAmount: new ExactDecimal('120.00'), status: ReservationStatus.Active },
    ]);
  });

  it('releases a reservation treasury has read and no longer holds', async () => {
    const code = nextProgramCode();
    const program = await insertProgram(database, {
      code,
      reservedAmount: new ExactDecimal('100.00'),
      lastTreasuryVersion: 1n,
    });
    await reserveInvoice(program, 'INV-1', '100.00', {
      createdBy: ReservationActor.Client,
      reserveClientOperationNumber: BigInt(APPLIED_THROUGH),
    });

    await publish(code, statement(code));

    const reconciled = await waitForVersion(code, BigInt(STATEMENT_VERSION));

    expect(reconciled.reservedAmount.toFixed()).toBe('0');
    expect(await reservationsOf(program)).toMatchObject([
      { status: ReservationStatus.Released, releasedBy: ReservationActor.Treasury },
    ]);
  });

  it('keeps a reservation treasury has not read yet', async () => {
    const code = nextProgramCode();
    const program = await insertProgram(database, {
      code,
      reservedAmount: new ExactDecimal('100.00'),
      lastTreasuryVersion: 1n,
    });
    await reserveInvoice(program, 'INV-1', '100.00', {
      createdBy: ReservationActor.Client,
      reserveClientOperationNumber: BigInt(APPLIED_THROUGH + 1),
    });

    await publish(code, statement(code));

    const reconciled = await waitForVersion(code, BigInt(STATEMENT_VERSION));

    expect(reconciled.reservedAmount.toFixed()).toBe('100');
    expect(await reservationsOf(program)).toMatchObject([{ status: ReservationStatus.Active }]);
  });

  it('ignores a statement treasury has already superseded', async () => {
    const code = nextProgramCode();
    await insertProgram(database, {
      code,
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: 9n,
    });

    await publish(code, statement(code, { version: 8, creditLimit: '7000.00' }));
    // The next statement is applied, which proves the stale one was read and dropped, not pending.
    await publish(code, statement(code, { version: 10, creditLimit: '8000.00' }));

    const reconciled = await waitForVersion(code, 10n);

    expect(reconciled.creditLimit.toFixed()).toBe('8000');
    expect(deadLetters).toHaveLength(0);
  });

  /** The version it already applied is a redelivery, not a newer picture of the program. */
  it('ignores a statement carrying the version it has already applied', async () => {
    const code = nextProgramCode();
    await insertProgram(database, {
      code,
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: BigInt(STATEMENT_VERSION),
    });

    await publish(
      code,
      statement(code, {
        creditLimit: '7000.00',
        reservations: [{ invoiceId: 'INV-1', amount: '300.00' }],
      }),
    );
    // The next statement is applied, which proves the redelivery was read and dropped, not pending.
    await publish(
      code,
      statement(code, { version: STATEMENT_VERSION + 1, creditLimit: '8000.00' }),
    );

    const reconciled = await waitForVersion(code, BigInt(STATEMENT_VERSION + 1));

    expect(reconciled.creditLimit.toFixed()).toBe('8000');
    // Applying the redelivery would have left this invoice behind, released but recorded.
    expect(await reservationsOf(reconciled)).toHaveLength(0);
    expect(deadLetters).toHaveLength(0);
  });

  it('leaves a release treasury has not read yet released, and does not hold the capacity again', async () => {
    const code = nextProgramCode();
    const program = await insertProgram(database, {
      code,
      reservedAmount: new ExactDecimal('0'),
      lastTreasuryVersion: 1n,
    });
    await reserveInvoice(program, 'INV-1', '100.00', {
      createdBy: ReservationActor.Client,
      reserveClientOperationNumber: 1n,
      status: ReservationStatus.Released,
      releasedBy: ReservationActor.Client,
      releaseClientOperationNumber: BigInt(APPLIED_THROUGH + 1),
      releasedAt: new Date(),
    });

    await publish(
      code,
      statement(code, { reservations: [{ invoiceId: 'INV-1', amount: '100.00' }] }),
    );

    const reconciled = await waitForVersion(code, BigInt(STATEMENT_VERSION));

    expect(reconciled.reservedAmount.toFixed()).toBe('0');
    expect(await reservationsOf(program)).toMatchObject([
      { status: ReservationStatus.Released, releasedBy: ReservationActor.Client },
    ]);
  });

  it('changes nothing when a client releases what reconciliation already released', async () => {
    const code = nextProgramCode();
    const program = await insertProgram(database, {
      code,
      reservedAmount: new ExactDecimal('100.00'),
      lastTreasuryVersion: 1n,
      lastClientOperationNumber: 4n,
    });
    await reserveInvoice(program, 'INV-1', '100.00', {
      createdBy: ReservationActor.Client,
      reserveClientOperationNumber: 4n,
    });

    await publish(code, statement(code));
    await waitForVersion(code, BigInt(STATEMENT_VERSION));

    await app.get(ReleaseCapacityService).release({
      programCode: programCode(code),
      invoiceExternalId: invoiceExternalId('INV-1'),
    });

    const [program_] = await database.select().from(programs).where(eq(programs.code, code));
    expect(program_.reservedAmount.toFixed()).toBe('0');
    expect(program_.lastClientOperationNumber).toBe(4n);
    expect(await reservationsOf(program)).toMatchObject([
      { status: ReservationStatus.Released, releasedBy: ReservationActor.Treasury },
    ]);
  });

  it('parks a statement that redenominates the program', async () => {
    const code = nextProgramCode();
    await insertProgram(database, { code, lastTreasuryVersion: 1n });

    await publish(code, statement(code, { currency: 'EUR' }));

    const deadLetter = await waitUntil(findDeadLetter(code), 'the dead letter');

    expect(JSON.parse(deadLetter.value)).toMatchObject({
      errorCode: ExceptionCode.ProgramCurrencyChanged,
      topic: TREASURY_STATEMENT_TOPIC,
    });
  });

  it('parks a statement that holds one invoice twice', async () => {
    const code = nextProgramCode();

    await publish(
      code,
      statement(code, {
        reservations: [
          { invoiceId: 'INV-1', amount: '1.00' },
          { invoiceId: 'INV-1', amount: '2.00' },
        ],
      }),
    );

    const deadLetter = await waitUntil(findDeadLetter(code), 'the dead letter');

    expect(JSON.parse(deadLetter.value)).toMatchObject({
      errorCode: ExceptionCode.InvalidMessage,
    });
    expect(await findProgram(code)()).toBeUndefined();
  });

  /** A reported amount the currency cannot express is treasury's mistake, not ours to round. */
  it('parks a statement whose reservation amount is finer than the currency', async () => {
    const code = nextProgramCode();

    await publish(
      code,
      statement(code, { reservations: [{ invoiceId: 'INV-1', amount: '100.005' }] }),
    );

    const deadLetter = await waitUntil(findDeadLetter(code), 'the dead letter');

    expect(JSON.parse(deadLetter.value)).toMatchObject({
      errorCode: ExceptionCode.InvoiceAmountNotInMinorUnits,
      details: { amount: '100.005' },
    });
  });
});
