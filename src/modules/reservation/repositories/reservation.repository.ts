import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { union } from 'drizzle-orm/pg-core';

import { ReservationActor, ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { DATABASE } from '../../../database/database.constants.js';
import type { Database, DatabaseExecutor } from '../../../database/database.module.js';
import { invoices, Reservation, reservations } from '../../../database/schema/index.js';
import { QueryBuilder } from '../../../shared/services/index.js';
import { STATEMENT_FX_RATE } from '../reservation.constants.js';
import type {
  ChangeReservedAmountInput,
  FindReservationsInput,
  ReservationWithInvoiceExternalId,
  FindReservedInvoiceInput,
  NewClientReservation,
  NewTreasuryReservation,
  ReleaseByClientInput,
  ReservedInvoice,
} from '../types/reservation.repository.types.js';

@Injectable()
export class ReservationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  public async findByInvoiceExternalId(
    { programId, invoiceExternalId }: FindReservedInvoiceInput,
    executor: DatabaseExecutor = this.database,
  ): Promise<ReservedInvoice | undefined> {
    const matchesInvoice = QueryBuilder.create()
      .apply(() => eq(invoices.programId, programId))
      .apply(() => eq(invoices.externalId, invoiceExternalId))
      .value();

    const [reserved] = await executor
      .select({ invoice: invoices, reservation: reservations })
      .from(invoices)
      .innerJoin(reservations, eq(reservations.invoiceId, invoices.id))
      .where(matchesInvoice)
      .limit(1);

    return reserved;
  }

  /** Locks the row, so concurrent releases of the same reservation return the amount once. */
  public async findByInvoiceForUpdate(
    invoiceId: string,
    executor: DatabaseExecutor,
  ): Promise<Reservation | undefined> {
    const [reservation] = await executor
      .select()
      .from(reservations)
      .where(eq(reservations.invoiceId, invoiceId))
      .for('update')
      .limit(1);

    return reservation;
  }

  public async insertByClient(
    values: NewClientReservation,
    executor: DatabaseExecutor,
  ): Promise<Reservation> {
    const [reservation] = await executor
      .insert(reservations)
      .values({ ...values, createdBy: ReservationActor.Client })
      .returning();

    assertValue(reservation, ExceptionCode.Unreachable);

    return reservation;
  }

  public async releaseByClient(
    { reservationId, releaseClientOperationNumber }: ReleaseByClientInput,
    executor: DatabaseExecutor,
  ): Promise<Reservation> {
    const [reservation] = await executor
      .update(reservations)
      .set({
        status: ReservationStatus.Released,
        releasedBy: ReservationActor.Client,
        releasedAt: new Date(),
        releaseClientOperationNumber,
      })
      .where(eq(reservations.id, reservationId))
      .returning();

    assertValue(reservation, ExceptionCode.Unreachable);

    return reservation;
  }

  /**
   * Everything a reconciliation matches against: every active reservation of the program, plus the
   * reservations of the listed invoices at any status.
   */
  public async findActiveByInvoiceExternalIds(
    input: FindReservationsInput,
    executor: DatabaseExecutor,
  ): Promise<ReservationWithInvoiceExternalId[]> {
    const { programId, invoiceExternalIds } = input;

    const isActiveInProgram = QueryBuilder.create()
      .apply(() => eq(reservations.programId, programId))
      .apply(() => eq(reservations.status, ReservationStatus.Active))
      .value();

    const activeReservations =
      this.selectReservationsWithInvoiceExternalId(executor).where(isActiveInProgram);

    const hasListedInvoices = invoiceExternalIds.length > 0;
    if (!hasListedInvoices) {
      return activeReservations;
    }

    // Filtered by the invoice's program: the same program by foreign key, and the column the
    // unique index on `(program_id, external_id)` starts from.
    const isListedInvoiceOfProgram = QueryBuilder.create()
      .apply(() => eq(invoices.programId, programId))
      .apply(() => inArray(invoices.externalId, invoiceExternalIds))
      .value();

    const listedInvoiceReservations =
      this.selectReservationsWithInvoiceExternalId(executor).where(isListedInvoiceOfProgram);

    return union(activeReservations, listedInvoiceReservations);
  }

  /** An invoice and its reservation are written together, so a stored invoice always has one. */
  public async insertByTreasury(
    values: NewTreasuryReservation,
    executor: DatabaseExecutor,
  ): Promise<Reservation> {
    const [reservation] = await executor
      .insert(reservations)
      .values({
        ...values,
        invoiceToProgramFxRate: STATEMENT_FX_RATE,
        createdBy: ReservationActor.Treasury,
      })
      .returning();

    assertValue(reservation, ExceptionCode.Unreachable);

    return reservation;
  }

  /** No operation number: a release by treasury is not a client operation of this program. */
  public async releaseByTreasury(
    reservationId: string,
    executor: DatabaseExecutor,
  ): Promise<Reservation> {
    const [reservation] = await executor
      .update(reservations)
      .set({
        status: ReservationStatus.Released,
        releasedBy: ReservationActor.Treasury,
        releasedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId))
      .returning();

    assertValue(reservation, ExceptionCode.Unreachable);

    return reservation;
  }

  /** Treasury owns the amount it reports, so a reconciled reservation takes it as it stands. */
  public async changeReservedAmount(
    input: ChangeReservedAmountInput,
    executor: DatabaseExecutor,
  ): Promise<Reservation> {
    const { reservationId, reservedAmount } = input;

    const [reservation] = await executor
      .update(reservations)
      .set({ reservedAmount })
      .where(eq(reservations.id, reservationId))
      .returning();

    assertValue(reservation, ExceptionCode.Unreachable);

    return reservation;
  }

  /** The shape both halves above select, joined to the id the issuing system gave the invoice. */
  private selectReservationsWithInvoiceExternalId(executor: DatabaseExecutor) {
    return executor
      .select({
        id: reservations.id,
        invoiceExternalId: invoices.externalId,
        reservedAmount: reservations.reservedAmount,
        status: reservations.status,
        reserveClientOperationNumber: reservations.reserveClientOperationNumber,
        releaseClientOperationNumber: reservations.releaseClientOperationNumber,
      })
      .from(reservations)
      .innerJoin(invoices, eq(invoices.id, reservations.invoiceId));
  }
}
