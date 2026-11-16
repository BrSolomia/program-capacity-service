import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { char, check, foreignKey, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { INVOICE_EXTERNAL_ID_MAX_LENGTH } from '../../../shared/constants/identifier.constants.js';
import { CURRENCY_CODE_LENGTH } from '../../../shared/constants/currency.constants.js';
import { amountColumn, timestampColumn } from '../columns/index.js';
import { currencies } from './currencies.table.js';
import { programs } from './programs.table.js';

/**
 * Reserving the same invoice twice collides on this index, which the reservation service turns
 * into the idempotent answer rather than an error.
 */
export const INVOICE_EXTERNAL_ID_UNIQUE_INDEX = 'invoices_program_id_external_id_key';

/**
 * Invoice submitted for early payment under a program.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    programId: uuid('program_id').notNull(),
    externalId: varchar('external_id', { length: INVOICE_EXTERNAL_ID_MAX_LENGTH }).notNull(),

    amount: amountColumn('amount').notNull(),
    currencyCode: char('currency', { length: CURRENCY_CODE_LENGTH }).notNull(),

    createdAt: timestampColumn('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // Target of the composite foreign key from reservations, which keeps a reservation
    // and its invoice in the same program.
    uniqueIndex('invoices_id_program_id_key').on(table.id, table.programId),
    uniqueIndex(INVOICE_EXTERNAL_ID_UNIQUE_INDEX).on(table.programId, table.externalId),

    foreignKey({
      name: 'invoices_program_id_fkey',
      columns: [table.programId],
      foreignColumns: [programs.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'invoices_currency_fkey',
      columns: [table.currencyCode],
      foreignColumns: [currencies.code],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    check('invoices_amount_positive_chk', sql`${table.amount} > 0`),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
