import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  foreignKey,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { PROGRAM_CODE_MAX_LENGTH } from '../../../shared/constants/identifier.constants.js';
import { sqlNumberLiteral, sqlStringLiteral } from '../../helpers/sql-literal.helpers.js';
import { CURRENCY_CODE_LENGTH } from '../../../shared/constants/currency.constants.js';
import { CURRENCY_CODE_REGEX } from '../../../shared/regexes/currency.regex.js';
import { amountColumn, timestampColumn } from '../columns/index.js';
import { NO_CLIENT_OPERATIONS } from '../schema.constants.js';
import { currencies } from './currencies.table.js';

/**
 * Financing program with a credit limit.
 */
export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),

    /** Business key treasury refers the program by. */
    code: varchar('code', { length: PROGRAM_CODE_MAX_LENGTH }).notNull(),

    currencyCode: char('currency', { length: CURRENCY_CODE_LENGTH }).notNull(),
    creditLimit: amountColumn('credit_limit').notNull(),
    reservedAmount: amountColumn('reserved_amount')
      .notNull()
      .default(sql`0`),

    /** Version of the last applied treasury message; */
    lastTreasuryVersion: bigint('last_treasury_version', {
      mode: 'bigint',
    }).notNull(),
    lastTreasuryReconciledAt: timestampColumn('last_treasury_reconciled_at'),

    /**
     * Number of the last client operation (reserve or release a client asked for), counted per program.
     */
    lastClientOperationNumber: bigint('last_client_operation_number', {
      mode: 'bigint',
    })
      .notNull()
      .default(sqlNumberLiteral(NO_CLIENT_OPERATIONS)),

    createdAt: timestampColumn('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestampColumn('updated_at')
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('programs_code_key').on(table.code),

    foreignKey({
      name: 'programs_currency_fkey',
      columns: [table.currencyCode],
      foreignColumns: [currencies.code],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    // No `reserved_amount <= credit_limit` check: treasury may lower the limit below the
    // amount already reserved, and existing reservations are not cancelled when it does.
    check('programs_reserved_amount_non_negative_chk', sql`${table.reservedAmount} >= 0`),
    check('programs_credit_limit_non_negative_chk', sql`${table.creditLimit} >= 0`),
    check(
      'programs_currency_iso4217_chk',
      sql`${table.currencyCode} ~ ${sqlStringLiteral(CURRENCY_CODE_REGEX.source)}`,
    ),
    check(
      'programs_last_client_operation_number_non_negative_chk',
      sql`${table.lastClientOperationNumber} >= 0`,
    ),
  ],
);

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
