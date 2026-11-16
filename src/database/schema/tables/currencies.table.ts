import { sql } from 'drizzle-orm';
import { char, check, pgTable, smallint } from 'drizzle-orm/pg-core';

import { CURRENCY_CODE_LENGTH } from '../../../shared/constants/currency.constants.js';
import { CURRENCY_CODE_REGEX } from '../../../shared/regexes/currency.regex.js';
import { sqlStringLiteral } from '../../helpers/sql-literal.helpers.js';

/** Supported currencies (ISO 4217). */
export const currencies = pgTable(
  'currencies',
  {
    code: char('code', { length: CURRENCY_CODE_LENGTH }).primaryKey(),
    /** Digits after the decimal point (USD 2, JPY 0, KWD 3); validates incoming amounts. */
    minorUnits: smallint('minor_units').notNull(),
  },
  (table) => [
    check(
      'currencies_code_iso4217_chk',
      sql`${table.code} ~ ${sqlStringLiteral(CURRENCY_CODE_REGEX.source)}`,
    ),
    check('currencies_minor_units_non_negative_chk', sql`${table.minorUnits} >= 0`),
  ],
);

export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;
