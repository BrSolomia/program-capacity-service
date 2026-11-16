import { Invoice, invoices, NewInvoice } from '../../src/database/schema/index.js';
import { Database } from '../../src/database/database.module.js';
import { ExactDecimal } from '../../src/shared/primitives/exact-decimal/index.js';
import { US_DOLLAR } from './currency.builders.js';

export const INVOICE_EXTERNAL_ID = 'INVOICE-1';
export const INVOICE_AMOUNT = '100.00';

export async function insertInvoice(
  database: Database,
  values: Partial<NewInvoice> & Pick<NewInvoice, 'programId'>,
): Promise<Invoice> {
  const [invoice] = await database
    .insert(invoices)
    .values({
      externalId: INVOICE_EXTERNAL_ID,
      amount: new ExactDecimal(INVOICE_AMOUNT),
      currencyCode: US_DOLLAR.code,
      ...values,
    })
    .returning();

  return invoice;
}
