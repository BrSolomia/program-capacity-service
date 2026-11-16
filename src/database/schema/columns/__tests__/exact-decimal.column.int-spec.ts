import { getTableColumns, getTableName, is, Table } from 'drizzle-orm';
import { types } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AMOUNT_AT_FINEST_MINOR_UNITS,
  AMOUNT_WITH_TOO_MANY_DECIMALS,
  LARGEST_AMOUNT,
  LARGEST_EXCHANGE_RATE,
  WIDEST_EXACT_PRODUCT,
} from '../../../../../test/fixtures/exact-decimal.fixtures.js';
import { rejectedPayload } from '../../../../../test/helpers/exception.helpers.js';
import {
  createTestDatabase,
  truncateAllTables,
} from '../../../../../test/helpers/test-database.helpers.js';
import { ReservationActor } from '../../../../shared/enums/reservation.enums.js';
import { ExceptionCode } from '../../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../../shared/primitives/exact-decimal/index.js';
import { Database } from '../../../database.module.js';
import * as schema from '../../index.js';

const CURRENCY_CODE = 'USD';
const MINOR_UNITS = 2;

/** Every column the schema keeps a decimal in, so one added later is covered without edits. */
const decimalColumns = Object.values(schema)
  .filter((value) => is(value, Table))
  .flatMap((table) => Object.values(getTableColumns(table)))
  .filter((column) => column.getSQLType().startsWith('numeric'));

const COLUMN_TYPE_QUERY = `
  SELECT format_type(atttypid, atttypmod) AS "declaredType"
  FROM pg_attribute WHERE attrelid = $1::regclass AND attname = $2`;

async function insertProgram(database: Database, creditLimit: string): Promise<string> {
  await database.insert(schema.currencies).values({ code: CURRENCY_CODE, minorUnits: MINOR_UNITS });

  const [program] = await database
    .insert(schema.programs)
    .values({
      code: 'PROGRAM-1',
      currencyCode: CURRENCY_CODE,
      creditLimit: new ExactDecimal(creditLimit),
      lastTreasuryVersion: 1n,
    })
    .returning({ id: schema.programs.id });

  return program.id;
}

async function insertReservation(
  database: Database,
  programId: string,
  exchangeRate: string,
): Promise<void> {
  const [invoice] = await database
    .insert(schema.invoices)
    .values({
      programId,
      externalId: 'INVOICE-1',
      amount: new ExactDecimal(LARGEST_AMOUNT),
      currencyCode: CURRENCY_CODE,
    })
    .returning({ id: schema.invoices.id });

  await database.insert(schema.reservations).values({
    programId,
    invoiceId: invoice.id,
    reservedAmount: new ExactDecimal(LARGEST_AMOUNT),
    invoiceToProgramFxRate: new ExactDecimal(exchangeRate),
    createdBy: ReservationActor.Treasury,
  });
}

/** Bypasses the column, the way the atomic UPDATE of B.1 and any seed script would. */
function insertProgramWithRawSql(database: Database, creditLimit: string): Promise<unknown> {
  return database.$client.query(
    `INSERT INTO programs (id, code, currency, credit_limit, last_treasury_version, updated_at)
     VALUES (gen_random_uuid(), 'RAW', $1, $2, 1, CURRENT_TIMESTAMP)`,
    [CURRENCY_CODE, creditLimit],
  );
}

describe('exact decimal columns', () => {
  let database: Database;

  beforeAll(() => {
    database = createTestDatabase();
  });

  afterAll(async () => {
    await database.$client.end();
  });

  beforeEach(async () => {
    await truncateAllTables(database);
  });

  it('round-trips an amount at the full width of its column', async () => {
    await insertProgram(database, LARGEST_AMOUNT);

    const [program] = await database.select().from(schema.programs);
    const { rows } = await database.$client.query<{ creditLimit: string }>(
      'SELECT credit_limit::text AS "creditLimit" FROM programs',
    );

    expect(program.creditLimit.toFixed()).toBe(LARGEST_AMOUNT);
    expect(rows[0].creditLimit).toBe(LARGEST_AMOUNT);
  });

  it('converts an amount at a rate read back without rounding', async () => {
    const programId = await insertProgram(database, LARGEST_AMOUNT);
    await insertReservation(database, programId, LARGEST_EXCHANGE_RATE);

    const [reservation] = await database.select().from(schema.reservations);
    const converted = reservation.reservedAmount.times(reservation.invoiceToProgramFxRate);

    expect(reservation.invoiceToProgramFxRate.toFixed()).toBe(LARGEST_EXCHANGE_RATE);
    expect(converted.toFixed()).toBe(WIDEST_EXACT_PRODUCT);
  });

  it('rejects an over-precise amount before it reaches the database', async () => {
    expect(
      await rejectedPayload(() => insertProgram(database, AMOUNT_WITH_TOO_MANY_DECIMALS)),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidDecimalValue });
  });

  it('keeps the finest subdivision any currency has through a write that bypasses the column', async () => {
    await insertProgram(database, LARGEST_AMOUNT);
    await insertProgramWithRawSql(database, AMOUNT_AT_FINEST_MINOR_UNITS);

    const { rows } = await database.$client.query<{ creditLimit: string }>(
      `SELECT credit_limit::text AS "creditLimit" FROM programs WHERE code = 'RAW'`,
    );

    expect(new ExactDecimal(rows[0].creditLimit).toFixed()).toBe(AMOUNT_AT_FINEST_MINOR_UNITS);
  });

  it('reports a non-finite value that some other path stored unchecked', async () => {
    await insertProgram(database, LARGEST_AMOUNT);
    await insertProgramWithRawSql(database, 'NaN');

    expect(await rejectedPayload(() => database.select().from(schema.programs))).toMatchObject({
      errorCode: ExceptionCode.InvalidDecimalValue,
    });
  });

  it('rejects a numeric the driver decoded into a number instead of losing digits', async () => {
    await insertProgram(database, LARGEST_AMOUNT);

    const defaultParser = types.getTypeParser(types.builtins.NUMERIC, 'text');
    types.setTypeParser(types.builtins.NUMERIC, Number);
    const probe = createTestDatabase();

    try {
      expect(await rejectedPayload(() => probe.select().from(schema.programs))).toMatchObject({
        errorCode: ExceptionCode.InvalidDecimalValue,
      });
    } finally {
      types.setTypeParser(types.builtins.NUMERIC, defaultParser);
      await probe.$client.end();
    }
  });

  it('declares every decimal column in the database exactly as the code does', async () => {
    expect(decimalColumns).not.toHaveLength(0);

    for (const column of decimalColumns) {
      const { rows } = await database.$client.query<{ declaredType: string }>(COLUMN_TYPE_QUERY, [
        getTableName(column.table),
        column.name,
      ]);

      expect({ column: column.name, ...rows[0] }).toEqual({
        column: column.name,
        declaredType: column.getSQLType().replaceAll(' ', ''),
      });
    }
  });
});
