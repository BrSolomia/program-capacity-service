import { INestApplication } from '@nestjs/common';
import kafkajs, { Kafka, Producer } from 'kafkajs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { insertCurrency, insertProgram, US_DOLLAR } from '../../../../test/builders/index.js';
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
import { programs } from '../../../database/schema/index.js';
import { DEAD_LETTER_TOPIC_SUFFIX } from '../../../kafka/index.js';
import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { eq } from 'drizzle-orm';
import { TREASURY_CREDIT_LIMIT_TOPIC } from '../treasury.topics.js';

const { CompressionTypes } = kafkajs;

const DEAD_LETTER_TOPIC = `${TREASURY_CREDIT_LIMIT_TOPIC}${DEAD_LETTER_TOPIC_SUFFIX}`;

/** One per test, so messages and dead letters of different tests cannot be confused. */
let programCodeSequence = 0;

function nextProgramCode(): string {
  programCodeSequence += 1;

  return `KAFKA-PROGRAM-${programCodeSequence}`;
}

function creditLimitMessage(programCode: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'PROGRAM_CREDIT_LIMIT_UPDATED',
    programCode,
    currency: US_DOLLAR.code,
    creditLimit: '5000.00',
    version: 5,
    occurredAt: '2026-11-12T10:00:00Z',
    ...overrides,
  });
}

describe('program limit messages from treasury', () => {
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
    await createTopics(kafka, [TREASURY_CREDIT_LIMIT_TOPIC, DEAD_LETTER_TOPIC]);

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

  async function publish(programCode: string, message: string): Promise<void> {
    await producer.send({
      topic: TREASURY_CREDIT_LIMIT_TOPIC,
      messages: [{ key: programCode, value: message }],
    });
  }

  function findProgram(programCode: string) {
    return async () => {
      const [program] = await database
        .select()
        .from(programs)
        .where(eq(programs.code, programCode));

      return program;
    };
  }

  function findDeadLetter(programCode: string) {
    return () => Promise.resolve(deadLetters.find((deadLetter) => deadLetter.key === programCode));
  }

  it('creates a program it has never seen', async () => {
    const programCode = nextProgramCode();

    await publish(programCode, creditLimitMessage(programCode));

    const program = await waitUntil(findProgram(programCode), `program ${programCode}`);

    expect(program.creditLimit.toFixed()).toBe('5000');
    expect(program.currencyCode).toBe(US_DOLLAR.code);
    expect(program.lastTreasuryVersion).toBe(5n);
    expect(program.reservedAmount.toFixed()).toBe('0');
  });

  it('applies a newer limit to a program it already has', async () => {
    const programCode = nextProgramCode();
    await insertProgram(database, {
      code: programCode,
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: 1n,
    });

    await publish(
      programCode,
      creditLimitMessage(programCode, { version: 2, creditLimit: '7000.00' }),
    );

    const program = await waitUntil(async () => {
      const row = await findProgram(programCode)();

      return row.lastTreasuryVersion === 2n ? row : undefined;
    }, `the new limit of ${programCode}`);

    expect(program.creditLimit.toFixed()).toBe('7000');
  });

  it('ignores a message treasury has already superseded', async () => {
    const programCode = nextProgramCode();
    await insertProgram(database, {
      code: programCode,
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: 9n,
    });

    await publish(
      programCode,
      creditLimitMessage(programCode, { version: 8, creditLimit: '7000.00' }),
    );
    // The next message is applied, which proves the stale one was read and dropped, not pending.
    await publish(
      programCode,
      creditLimitMessage(programCode, { version: 10, creditLimit: '8000.00' }),
    );

    const program = await waitUntil(async () => {
      const row = await findProgram(programCode)();

      return row.lastTreasuryVersion === 10n ? row : undefined;
    }, `the newer limit of ${programCode}`);

    expect(program.creditLimit.toFixed()).toBe('8000');
    expect(deadLetters).toHaveLength(0);
  });

  it('parks a message that redenominates the program, leaving the program as it was', async () => {
    const programCode = nextProgramCode();
    await insertProgram(database, {
      code: programCode,
      creditLimit: new ExactDecimal('1000.00'),
      lastTreasuryVersion: 1n,
    });

    await publish(programCode, creditLimitMessage(programCode, { currency: 'EUR' }));

    const deadLetter = await waitUntil(findDeadLetter(programCode), 'the dead letter');

    expect(JSON.parse(deadLetter.value)).toMatchObject({
      errorCode: ExceptionCode.ProgramCurrencyChanged,
      topic: TREASURY_CREDIT_LIMIT_TOPIC,
      details: {
        programCode,
        currencyCode: US_DOLLAR.code,
        messageCurrencyCode: 'EUR',
      },
    });

    const program = await findProgram(programCode)();
    expect(program.creditLimit.toFixed()).toBe('1000');
    expect(program.currencyCode).toBe(US_DOLLAR.code);
  });

  it('parks a message that carries no payload', async () => {
    const programCode = nextProgramCode();

    await producer.send({
      topic: TREASURY_CREDIT_LIMIT_TOPIC,
      messages: [{ key: programCode, value: null }],
    });

    const deadLetter = await waitUntil(findDeadLetter(programCode), 'the dead letter');

    expect(JSON.parse(deadLetter.value)).toMatchObject({
      errorCode: ExceptionCode.InvalidMessage,
      payload: null,
    });
  });

  it('parks a message it cannot read, keeping the payload verbatim', async () => {
    const programCode = nextProgramCode();

    await publish(programCode, '{ not json');

    const deadLetter = await waitUntil(findDeadLetter(programCode), 'the dead letter');

    expect(JSON.parse(deadLetter.value)).toMatchObject({
      errorCode: ExceptionCode.InvalidMessage,
      payload: '{ not json',
    });
  });

  /** The limit is not rounded to what the column holds: a finer limit is treasury's mistake. */
  it('parks a limit finer than the currency', async () => {
    const programCode = nextProgramCode();

    await publish(programCode, creditLimitMessage(programCode, { creditLimit: '5000.005' }));

    const deadLetter = await waitUntil(findDeadLetter(programCode), 'the dead letter');

    expect(JSON.parse(deadLetter.value)).toMatchObject({
      errorCode: ExceptionCode.ProgramCreditLimitNotInMinorUnits,
    });
    expect(await findProgram(programCode)()).toBeUndefined();
  });

  /**
   * Compression is the broker's business, not ours — except that kafkajs refuses an unregistered
   * codec inside its decoder, where neither the dead letter path nor a redelivery can help.
   */
  it('reads a snappy batch, which is what most producers send by default', async () => {
    const programCode = nextProgramCode();

    await producer.send({
      topic: TREASURY_CREDIT_LIMIT_TOPIC,
      compression: CompressionTypes.Snappy,
      messages: [{ key: programCode, value: creditLimitMessage(programCode) }],
    });

    const program = await waitUntil(findProgram(programCode), `program ${programCode}`);

    expect(program.creditLimit.toFixed()).toBe('5000');
    expect(deadLetters).toHaveLength(0);
  });

  it('keeps consuming after a parked message', async () => {
    const programCode = nextProgramCode();

    await publish(programCode, creditLimitMessage(programCode));

    const program = await waitUntil(findProgram(programCode), `program ${programCode}`);
    expect(program.creditLimit.toFixed()).toBe('5000');
  });
});
