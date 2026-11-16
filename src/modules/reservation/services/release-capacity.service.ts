import { Injectable } from '@nestjs/common';

import { Program, Reservation } from '../../../database/schema/index.js';
import { TransactionService } from '../../../database/services/transaction.service.js';
import { ReservationActor, ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { TreasuryOperationType } from '../../../shared/enums/treasury.enums.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { InvoiceService } from '../../invoice/index.js';
import { ProgramService } from '../../program/index.js';
import { TreasuryOperationService } from '../../treasury/index.js';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import type { ReleaseInput, ReservationChange } from '../types/reservation.types.js';

@Injectable()
export class ReleaseCapacityService {
  constructor(
    private readonly transactions: TransactionService,
    private readonly programs: ProgramService,
    private readonly invoices: InvoiceService,
    private readonly reservations: ReservationRepository,
    private readonly treasuryOperations: TreasuryOperationService,
  ) {}

  /**
   * Returns exactly the amount that was held. Releasing an already released reservation changes
   * nothing.
   */
  public async release(input: ReleaseInput): Promise<Reservation> {
    const program = await this.programs.findByCodeOrThrow(input.programCode);

    const reservationChange = await this.transactions.run<ReservationChange>(async (executor) => {
      // Release and a statement for the same program cannot deadlock each other.
      await this.programs.findByCodeForUpdate(program.code, executor);

      const invoice = await this.invoices.findByExternalId(
        { programId: program.id, externalId: input.invoiceExternalId },
        executor,
      );
      assertValue(invoice, ExceptionCode.ReservationNotFound);

      const reservation = await this.reservations.findByInvoiceForUpdate(invoice.id, executor);
      assertValue(reservation, ExceptionCode.ReservationNotFound);

      const isReleasableByClient = reservation.createdBy === ReservationActor.Client;
      assertValue(isReleasableByClient, ExceptionCode.ReservationBelongsToTreasury);

      // The reservation has already been released, so this request changes nothing.
      if (reservation.status === ReservationStatus.Released) {
        return { reservation, operationNumber: null };
      }

      const { operationNumber } = await this.programs.releaseCapacity(
        { programId: program.id, amount: reservation.reservedAmount },
        executor,
      );

      const releasedReservation = await this.reservations.releaseByClient(
        { reservationId: reservation.id, releaseClientOperationNumber: operationNumber },
        executor,
      );

      return { reservation: releasedReservation, operationNumber };
    });

    await this.reportOperation(program, reservationChange);

    return reservationChange.reservation;
  }

  /** Tells treasury what this request did, and stays silent when it did nothing. */
  private async reportOperation(
    program: Program,
    reservationChange: ReservationChange,
  ): Promise<void> {
    const { reservation, operationNumber } = reservationChange;

    const hasOperationToReport = operationNumber !== null;
    if (!hasOperationToReport) {
      return;
    }

    await this.treasuryOperations.publish(
      TreasuryOperationType.Release,
      program,
      reservation,
      operationNumber,
    );
  }
}
