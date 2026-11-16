import { Currency, currencies, NewCurrency } from '../../src/database/schema/index.js';
import { Database } from '../../src/database/database.module.js';

export const US_DOLLAR: NewCurrency = { code: 'USD', minorUnits: 2 };
export const EURO: NewCurrency = { code: 'EUR', minorUnits: 2 };
export const JAPANESE_YEN: NewCurrency = { code: 'JPY', minorUnits: 0 };
export const KUWAITI_DINAR: NewCurrency = { code: 'KWD', minorUnits: 3 };

export async function insertCurrency(
  database: Database,
  values: NewCurrency = US_DOLLAR,
): Promise<Currency> {
  const [currency] = await database.insert(currencies).values(values).returning();

  return currency;
}
