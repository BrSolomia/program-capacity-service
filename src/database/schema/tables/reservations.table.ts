import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { ReservationActor, ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { amountColumn, exchangeRateColumn, timestampColumn } from '../columns/index.js';
import { sqlStringLiteral } from '../../helpers/sql-literal.helpers.js';
import { invoices } from './invoices.table.js';
import { programs } from './programs.table.js';

export const reservationStatus = pgEnum('reservation_status', [
  ReservationStatus.Active,
  ReservationStatus.Released,
]);

export const reservationActor = pgEnum('reservation_actor', [
  ReservationActor.Client,
  ReservationActor.Treasury,
]);

/** Capacity held for one invoice. Amounts are in the program currency. */
export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),

    programId: uuid('program_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),

    reservedAmount: amountColumn('reserved_amount').notNull(),
    invoiceToProgramFxRate: exchangeRateColumn('invoice_to_program_fx_rate').notNull(),
    status: reservationStatus('status').notNull().default(ReservationStatus.Active),

    reserveClientOperationNumber: bigint('reserve_client_operation_number', {
      mode: 'bigint',
    }),
    releaseClientOperationNumber: bigint('release_client_operation_number', {
      mode: 'bigint',
    }),

    releasedBy: reservationActor('released_by'),
    releasedAt: timestampColumn('released_at'),

    createdBy: reservationActor('created_by').notNull(),
    createdAt: timestampColumn('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestampColumn('updated_at')
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One reservation per invoice.
    uniqueIndex('reservations_invoice_id_key').on(table.invoiceId),
    uniqueIndex('reservations_program_id_reserve_client_operation_number_key').on(
      table.programId,
      table.reserveClientOperationNumber,
    ),
    uniqueIndex('reservations_program_id_release_client_operation_number_key').on(
      table.programId,
      table.releaseClientOperationNumber,
    ),
    index('reservations_program_id_status_idx').on(table.programId, table.status),

    foreignKey({
      name: 'reservations_program_id_fkey',
      columns: [table.programId],
      foreignColumns: [programs.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'reservations_invoice_id_program_id_fkey',
      columns: [table.invoiceId, table.programId],
      foreignColumns: [invoices.id, invoices.programId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    check('reservations_reserved_amount_positive_chk', sql`${table.reservedAmount} > 0`),
    check(
      'reservations_invoice_to_program_fx_rate_positive_chk',
      sql`${table.invoiceToProgramFxRate} > 0`,
    ),
    check(
      'reservations_released_at_matches_status_chk',
      sql`(${table.status} = ${sqlStringLiteral(ReservationStatus.Released)}) = (${table.releasedAt} IS NOT NULL)`,
    ),
    check(
      'reservations_released_by_matches_status_chk',
      sql`(${table.status} = ${sqlStringLiteral(ReservationStatus.Released)}) = (${table.releasedBy} IS NOT NULL)`,
    ),
    check(
      'reservations_reserve_op_number_matches_created_by_chk',
      sql`(${table.createdBy} = ${sqlStringLiteral(ReservationActor.Client)}) = (${table.reserveClientOperationNumber} IS NOT NULL)`,
    ),
    // COALESCE is needed because released_by is nullable: NULL = 'CLIENT' yields NULL,
    // which a CHECK accepts.
    check(
      'reservations_release_op_number_matches_released_by_chk',
      sql`COALESCE(${table.releasedBy} = ${sqlStringLiteral(ReservationActor.Client)}, false) = (${table.releaseClientOperationNumber} IS NOT NULL)`,
    ),
    check(
      'reservations_client_operation_numbers_positive_chk',
      sql`${table.reserveClientOperationNumber} >= 1 AND ${table.releaseClientOperationNumber} >= 1`,
    ),
  ],
);

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
