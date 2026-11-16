import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EURO,
  insertCurrency,
  insertInvoice,
  insertProgram,
  insertReservation,
  currencyCode,
  invoiceExternalId,
  INVOICE_EXTERNAL_ID,
  JAPANESE_YEN,
  KUWAITI_DINAR,
  programCode,
  PROGRAM_CODE,
  PROGRAM_CREDIT_LIMIT,
  US_DOLLAR,
} from '../../../../test/builders/index.js';
import { rejectedPayload } from '../../../../test/helpers/exception.helpers.js';
import { waitUntil } from '../../../../test/helpers/wait.helpers.js';
import {
  createTestDatabase,
  truncateAllTables,
} from '../../../../test/helpers/test-database.helpers.js';
import type { Database } from '../../../database/database.module.js';
import { CurrencyRepository, CurrencyService } from '../../currency/index.js';
import { InvoiceRepository, InvoiceService } from '../../invoice/index.js';
import { ProgramRepository, ProgramService } from '../../program/index.js';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import {
  invoices,
  NewCurrency,
  Program,
  programs,
  Reservation,
  reservations,
} from '../../../database/schema/index.js';
import { ReservationActor, ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { TreasuryOperationType } from '../../../shared/enums/treasury.enums.js';
import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { TransactionService } from '../../../database/services/transaction.service.js';
import { ReleaseCapacityService } from '../services/release-capacity.service.js';
import { ReserveCapacityService } from '../services/reserve-capacity.service.js';
import type { ExchangeRateInput, ExchangeRateProvider } from '../../exchange-rate/index.js';
import { ExchangeRateService } from '../../exchange-rate/index.js';
import { TreasuryOperationService } from '../../treasury/index.js';
import type { TreasuryOperationPublisher } from '../../treasury/index.js';
import type { TreasuryOperation } from '../../treasury/index.js';

const INVOICE_AMOUNT = '100.00';

/** Compares amounts by value: `toFixed()` drops trailing zeros, so `100.00` reads back as `100`. */
function expectAmount(actual: ExactDecimal, expected: string): void {
  expect(actual.toFixed()).toBe(new ExactDecimal(expected).toFixed());
}

/** Reads the reservation over its own connection, so it can tell whether the commit happened. */
class RecordingPublisher implements TreasuryOperationPublisher {
  readonly published: { operation: TreasuryOperation; observed: Reservation | undefined }[] = [];

  constructor(private readonly probe: Database) {}

  async publish(operation: TreasuryOperation): Promise<void> {
    const [observed] = await this.probe
      .select()
      .from(reservations)
      .where(eq(reservations.id, operation.reservationId));

    this.published.push({ operation, observed });
  }
}

/** Rates a test can change, which is what makes "the rate moved after we reserved" reachable. */
class MutableExchangeRateProvider implements ExchangeRateProvider {
  private readonly rates = new Map<string, string>();

  public set(fromCurrencyCode: string, toCurrencyCode: string, rate: string): void {
    this.rates.set(`${fromCurrencyCode}:${toCurrencyCode}`, rate);
  }

  public findRate({
    fromCurrencyCode,
    toCurrencyCode,
  }: ExchangeRateInput): Promise<ExactDecimal | undefined> {
    const rate = this.rates.get(`${fromCurrencyCode}:${toCurrencyCode}`);

    return Promise.resolve(rate === undefined ? undefined : new ExactDecimal(rate));
  }
}

describe('reserving and releasing capacity', () => {
  let database: Database;
  let probe: Database;
  let publisher: RecordingPublisher;
  let reserveService: ReserveCapacityService;
  let releaseService: ReleaseCapacityService;
  let program: Program;
  let exchangeRates: MutableExchangeRateProvider;

  beforeAll(() => {
    database = createTestDatabase();
    probe = createTestDatabase();
  });

  afterAll(async () => {
    await Promise.all([database.$client.end(), probe.$client.end()]);
  });

  beforeEach(async () => {
    await truncateAllTables(database);
    await Promise.all(
      [US_DOLLAR, EURO, JAPANESE_YEN, KUWAITI_DINAR].map((currency) =>
        insertCurrency(database, currency),
      ),
    );
    program = await insertProgram(database);

    exchangeRates = new MutableExchangeRateProvider();
    exchangeRates.set(US_DOLLAR.code, EURO.code, '0.920000');
    exchangeRates.set(US_DOLLAR.code, JAPANESE_YEN.code, '157.200000');
    exchangeRates.set(US_DOLLAR.code, KUWAITI_DINAR.code, '0.306500');

    publisher = new RecordingPublisher(probe);
    const transactions = new TransactionService(database);
    const currencies = new CurrencyService(new CurrencyRepository(database));
    const programs = new ProgramService(new ProgramRepository(database), currencies, transactions);
    const invoices = new InvoiceService(new InvoiceRepository(database));
    const reservationRepository = new ReservationRepository(database);
    const treasuryOperations = new TreasuryOperationService(publisher);

    reserveService = new ReserveCapacityService(
      transactions,
      programs,
      invoices,
      reservationRepository,
      currencies,
      new ExchangeRateService(exchangeRates),
      treasuryOperations,
    );
    releaseService = new ReleaseCapacityService(
      transactions,
      programs,
      invoices,
      reservationRepository,
      treasuryOperations,
    );
  });

  function reserve(
    values: { invoiceExternalId?: string; amount?: string; currencyCode?: string } = {},
  ) {
    return reserveService.reserve({
      programCode: programCode(PROGRAM_CODE),
      invoiceExternalId: invoiceExternalId(values.invoiceExternalId ?? INVOICE_EXTERNAL_ID),
      invoiceAmount: new ExactDecimal(values.amount ?? INVOICE_AMOUNT),
      invoiceCurrencyCode: currencyCode(values.currencyCode ?? US_DOLLAR.code),
    });
  }

  /** The credit limit is denominated in the program's own currency, so a weak one needs more of it. */
  async function programIn(currency: NewCurrency, creditLimit = PROGRAM_CREDIT_LIMIT) {
    return insertProgram(database, {
      code: `PROGRAM-${currency.code}`,
      currencyCode: currency.code,
      creditLimit: new ExactDecimal(creditLimit),
    });
  }

  function reserveUnder(other: Program, amount: string, code = US_DOLLAR.code) {
    return reserveService.reserve({
      programCode: programCode(other.code),
      invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
      invoiceAmount: new ExactDecimal(amount),
      invoiceCurrencyCode: currencyCode(code),
    });
  }

  async function readProgram(): Promise<Program> {
    const [row] = await database.select().from(programs).where(eq(programs.id, program.id));

    return row;
  }

  describe('reserve', () => {
    it('holds the amount and numbers the operation', async () => {
      const reservation = await reserve();

      expect(reservation.status).toBe(ReservationStatus.Active);
      expect(reservation.createdBy).toBe(ReservationActor.Client);
      expectAmount(reservation.reservedAmount, INVOICE_AMOUNT);
      expect(reservation.reserveClientOperationNumber).toBe(1n);
      expect(reservation.invoiceToProgramFxRate.toFixed()).toBe('1');

      const updated = await readProgram();
      expectAmount(updated.reservedAmount, INVOICE_AMOUNT);
      expect(updated.lastClientOperationNumber).toBe(1n);
    });

    it('leaves nothing behind when capacity is short', async () => {
      expect(await rejectedPayload(() => reserve({ amount: '1000.01' }))).toMatchObject({
        errorCode: ExceptionCode.InsufficientProgramCapacity,
      });

      const unchanged = await readProgram();
      expectAmount(unchanged.reservedAmount, '0');
      expect(unchanged.lastClientOperationNumber).toBe(0n);
      expect(await database.select().from(invoices)).toEqual([]);
      expect(await database.select().from(reservations)).toEqual([]);
    });

    it('allows the limit to be reached exactly but not exceeded', async () => {
      await reserve({ amount: PROGRAM_CREDIT_LIMIT });

      expect(
        await rejectedPayload(() => reserve({ invoiceExternalId: 'INVOICE-2', amount: '0.01' })),
      ).toMatchObject({ errorCode: ExceptionCode.InsufficientProgramCapacity });
    });

    it('returns the first reservation when the same invoice is submitted again', async () => {
      const first = await reserve();
      const second = await reserve();

      expect(second.id).toBe(first.id);
      expectAmount((await readProgram()).reservedAmount, INVOICE_AMOUNT);
      expect((await readProgram()).lastClientOperationNumber).toBe(1n);
      expect(await database.select().from(reservations)).toHaveLength(1);
    });

    it('refuses an invoice the client has already released', async () => {
      await reserve();
      await releaseService.release({
        programCode: programCode(PROGRAM_CODE),
        invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
      });

      expect(await rejectedPayload(() => reserve())).toMatchObject({
        errorCode: ExceptionCode.InvoiceAlreadyReleased,
      });
      expectAmount((await readProgram()).reservedAmount, '0');
    });

    it('refuses an invoice treasury reserved, rather than handing it to the client', async () => {
      const invoice = await insertInvoice(database, { programId: program.id });
      await insertReservation(database, { programId: program.id, invoiceId: invoice.id });

      expect(await rejectedPayload(() => reserve())).toMatchObject({
        errorCode: ExceptionCode.ReservationBelongsToTreasury,
      });
    });

    it('refuses the same invoice on different terms', async () => {
      await reserve();

      expect(await rejectedPayload(() => reserve({ amount: '200.00' }))).toMatchObject({
        errorCode: ExceptionCode.InvoiceReservedWithDifferentTerms,
      });
    });

    it('refuses an amount finer than the currency subdivides', async () => {
      expect(await rejectedPayload(() => reserve({ amount: '100.005' }))).toMatchObject({
        errorCode: ExceptionCode.InvoiceAmountNotInMinorUnits,
      });
    });
    it('reports an unknown program', async () => {
      expect(
        await rejectedPayload(() =>
          reserveService.reserve({
            programCode: programCode('MISSING'),
            invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
            invoiceAmount: new ExactDecimal(INVOICE_AMOUNT),
            invoiceCurrencyCode: currencyCode(US_DOLLAR.code),
          }),
        ),
      ).toMatchObject({ errorCode: ExceptionCode.ProgramNotFound });
    });
  });

  describe('release', () => {
    it('returns exactly the amount that was held', async () => {
      await reserve();
      const released = await releaseService.release({
        programCode: programCode(PROGRAM_CODE),
        invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
      });

      expect(released.status).toBe(ReservationStatus.Released);
      expect(released.releasedBy).toBe(ReservationActor.Client);
      expect(released.releasedAt).toBeInstanceOf(Date);
      expect(released.releaseClientOperationNumber).toBe(2n);

      const updated = await readProgram();
      expectAmount(updated.reservedAmount, '0');
      expect(updated.lastClientOperationNumber).toBe(2n);
    });

    it('changes nothing when the reservation is already released', async () => {
      await reserve();
      const input = {
        programCode: programCode(PROGRAM_CODE),
        invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
      };
      const first = await releaseService.release(input);
      const second = await releaseService.release(input);

      expect(second.releaseClientOperationNumber).toBe(first.releaseClientOperationNumber);

      const updated = await readProgram();
      expectAmount(updated.reservedAmount, '0');
      expect(updated.lastClientOperationNumber).toBe(2n);
    });

    it('refuses to release a reservation treasury created', async () => {
      const invoice = await insertInvoice(database, { programId: program.id });
      await insertReservation(database, { programId: program.id, invoiceId: invoice.id });

      expect(
        await rejectedPayload(() =>
          releaseService.release({
            programCode: programCode(PROGRAM_CODE),
            invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
          }),
        ),
      ).toMatchObject({ errorCode: ExceptionCode.ReservationBelongsToTreasury });
    });

    /**
     * A reconciliation holds the program row and then reaches for reservation rows. A release that
     * locked the reservation first would hold what that transaction needs while waiting for what it
     * holds, and Postgres would abort one of the two.
     */
    it('takes the program row before the reservation row, as a reconciliation does', async () => {
      const reserved = await reserve();
      const reconciliation = await probe.$client.connect();

      try {
        await reconciliation.query('BEGIN');
        await reconciliation.query('SELECT 1 FROM programs WHERE id = $1 FOR UPDATE', [program.id]);

        const releasing = releaseService.release({
          programCode: programCode(PROGRAM_CODE),
          invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
        });

        await waitUntil(async () => {
          const { rows } = await probe.$client.query<{ waiting: number }>(
            "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock'",
          );

          return rows[0].waiting > 0 ? true : undefined;
        }, 'the release to wait for the program row');

        await reconciliation.query('SELECT 1 FROM reservations WHERE id = $1 FOR UPDATE', [
          reserved.id,
        ]);
        await reconciliation.query('COMMIT');

        expect((await releasing).status).toBe(ReservationStatus.Released);
      } finally {
        // Destroyed rather than returned: after a deadlock the connection sits in an aborted
        // transaction, and the next test would inherit it.
        reconciliation.release(true);
      }
    });

    it('reports an invoice that was never reserved', async () => {
      expect(
        await rejectedPayload(() =>
          releaseService.release({
            programCode: programCode(PROGRAM_CODE),
            invoiceExternalId: invoiceExternalId('UNKNOWN'),
          }),
        ),
      ).toMatchObject({ errorCode: ExceptionCode.ReservationNotFound });
    });
  });

  it('numbers operations without gaps across reserves and releases', async () => {
    const first = await reserve({ invoiceExternalId: 'INVOICE-1' });
    const second = await reserve({ invoiceExternalId: 'INVOICE-2' });
    const releasedFirst = await releaseService.release({
      programCode: programCode(PROGRAM_CODE),
      invoiceExternalId: invoiceExternalId('INVOICE-1'),
    });
    const third = await reserve({ invoiceExternalId: 'INVOICE-3' });

    expect([
      first.reserveClientOperationNumber,
      second.reserveClientOperationNumber,
      releasedFirst.releaseClientOperationNumber,
      third.reserveClientOperationNumber,
    ]).toEqual([1n, 2n, 3n, 4n]);
    expect((await readProgram()).lastClientOperationNumber).toBe(4n);
  });

  it('never lets parallel reserves exceed the limit', async () => {
    const attempts = 15;
    const fitting = 10;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, index) =>
        reserve({ invoiceExternalId: `INVOICE-${index}`, amount: '100.00' }),
      ),
    );

    const held = results.filter((result) => result.status === 'fulfilled');
    expect(held).toHaveLength(fitting);

    const updated = await readProgram();
    expectAmount(updated.reservedAmount, PROGRAM_CREDIT_LIMIT);
    expect(updated.lastClientOperationNumber).toBe(BigInt(fitting));

    const active = await database.select().from(reservations);
    const total = active.reduce((sum, row) => sum.plus(row.reservedAmount), new ExactDecimal(0));
    expectAmount(total, PROGRAM_CREDIT_LIMIT);

    const numbers = active
      .map((row) => row.reserveClientOperationNumber)
      .filter((number) => number !== null)
      .sort((left, right) => Number(left - right));
    expect(numbers).toEqual(Array.from({ length: fitting }, (_, index) => BigInt(index + 1)));
  });

  it('publishes the operation only once the transaction is committed', async () => {
    const reservation = await reserve();
    await releaseService.release({
      programCode: programCode(PROGRAM_CODE),
      invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
    });

    expect(publisher.published).toHaveLength(2);

    const [reserved, released] = publisher.published;
    expect(reserved.operation).toMatchObject({
      type: TreasuryOperationType.Reserve,
      programCode: PROGRAM_CODE,
      operationNumber: 1n,
      reservationId: reservation.id,
    });
    expect(reserved.observed?.status).toBe(ReservationStatus.Active);

    expect(released.operation).toMatchObject({
      type: TreasuryOperationType.Release,
      operationNumber: 2n,
    });
    expect(released.observed?.status).toBe(ReservationStatus.Released);
  });

  describe('converting into the program currency', () => {
    it('holds the converted amount and keeps the rate it used', async () => {
      const euroProgram = await programIn(EURO);

      const reservation = await reserveUnder(euroProgram, '100.00');

      expectAmount(reservation.reservedAmount, '92.00');
      expect(reservation.invoiceToProgramFxRate.toFixed()).toBe('0.92');

      const [programAfterReserve] = await database
        .select()
        .from(programs)
        .where(eq(programs.id, euroProgram.id));
      expectAmount(programAfterReserve.reservedAmount, '92.00');
    });

    it('rounds into a currency that has no decimals', async () => {
      const yenProgram = await programIn(JAPANESE_YEN, '1000000');

      const reservation = await reserveUnder(yenProgram, '100.00');

      expect(reservation.reservedAmount.toFixed(0)).toBe('15720');
    });

    it('rounds into a currency that has three decimals', async () => {
      const dinarProgram = await programIn(KUWAITI_DINAR);

      const reservation = await reserveUnder(dinarProgram, '100.00');

      expect(reservation.reservedAmount.toFixed(3)).toBe('30.650');
    });

    it('refuses a pair no rate is known for', async () => {
      const yenProgram = await programIn(JAPANESE_YEN);

      expect(
        await rejectedPayload(() => reserveUnder(yenProgram, '100.00', EURO.code)),
      ).toMatchObject({ errorCode: ExceptionCode.ExchangeRateNotFound });
    });

    it('refuses a currency the register does not hold', async () => {
      expect(await rejectedPayload(() => reserve({ currencyCode: 'XXX' }))).toMatchObject({
        errorCode: ExceptionCode.CurrencyNotFound,
      });
    });

    it('refuses an amount finer than the invoice currency subdivides', async () => {
      expect(
        await rejectedPayload(() => reserveUnder(program, '0.5', JAPANESE_YEN.code)),
      ).toMatchObject({ errorCode: ExceptionCode.InvoiceAmountNotInMinorUnits });
    });

    it('gives back what it held even after the rate moved', async () => {
      const euroProgram = await programIn(EURO);
      await reserveUnder(euroProgram, '100.00');

      exchangeRates.set(US_DOLLAR.code, EURO.code, '0.500000');

      const released = await releaseService.release({
        programCode: programCode(euroProgram.code),
        invoiceExternalId: invoiceExternalId(INVOICE_EXTERNAL_ID),
      });

      expectAmount(released.reservedAmount, '92.00');

      const [stored] = await database
        .select()
        .from(programs)
        .where(eq(programs.id, euroProgram.id));
      expectAmount(stored.reservedAmount, '0');
    });
  });
});
