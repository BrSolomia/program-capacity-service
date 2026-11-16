import { NewReservation, Reservation, reservations } from '../../src/database/schema/index.js';
import { Database } from '../../src/database/database.module.js';
import { ReservationActor } from '../../src/shared/enums/reservation.enums.js';
import { ExactDecimal } from '../../src/shared/primitives/exact-decimal/index.js';
import { INVOICE_AMOUNT } from './invoice.builders.js';

/** Treasury by default: a client reservation also needs an operation number, which a CHECK enforces. */
export async function insertReservation(
  database: Database,
  values: Partial<NewReservation> & Pick<NewReservation, 'programId' | 'invoiceId'>,
): Promise<Reservation> {
  const [reservation] = await database
    .insert(reservations)
    .values({
      reservedAmount: new ExactDecimal(INVOICE_AMOUNT),
      invoiceToProgramFxRate: new ExactDecimal(1),
      createdBy: ReservationActor.Treasury,
      ...values,
    })
    .returning();

  return reservation;
}
