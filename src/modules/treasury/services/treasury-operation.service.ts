import { Inject, Injectable } from '@nestjs/common';

import { Program, Reservation } from '../../../database/schema/index.js';
import { TreasuryOperationType } from '../../../shared/enums/treasury.enums.js';
import type { TreasuryOperationPublisher } from '../publishers/treasury-operation.publisher.js';
import { TREASURY_OPERATION_PUBLISHER } from '../treasury.constants.js';

@Injectable()
export class TreasuryOperationService {
  constructor(
    @Inject(TREASURY_OPERATION_PUBLISHER) private readonly publisher: TreasuryOperationPublisher,
  ) {}

  /**
   * Reports one client operation to treasury. The amount is always the one the reservation
   * stores, in the program's currency, which is what treasury reconciles against — not the
   * amount the client asked for, which is denominated in the invoice currency.
   *
   * Call after the commit, so treasury never hears of an operation that rolled back.
   */
  public publish(
    type: TreasuryOperationType,
    program: Program,
    reservation: Reservation,
    operationNumber: bigint,
  ): Promise<void> {
    return this.publisher.publish({
      type,
      operationNumber,
      programId: program.id,
      programCode: program.code,
      reservationId: reservation.id,
      amount: reservation.reservedAmount,
    });
  }
}
