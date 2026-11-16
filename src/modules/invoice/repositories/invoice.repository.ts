import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { DATABASE } from '../../../database/database.constants.js';
import type { Database, DatabaseExecutor } from '../../../database/database.module.js';
import { Invoice, invoices } from '../../../database/schema/index.js';
import type { FindInvoiceInput, NewInvoiceValues } from '../types/invoice.repository.types.js';
import { QueryBuilder } from '../../../shared/services/index.js';

@Injectable()
export class InvoiceRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  public async findByExternalId(
    { programId, externalId }: FindInvoiceInput,
    executor: DatabaseExecutor = this.database,
  ): Promise<Invoice | undefined> {
    const matchesInvoice = QueryBuilder.create()
      .apply(() => eq(invoices.programId, programId))
      .apply(() => eq(invoices.externalId, externalId))
      .value();

    const [invoice] = await executor.select().from(invoices).where(matchesInvoice).limit(1);

    return invoice;
  }

  public async insert(values: NewInvoiceValues, executor: DatabaseExecutor): Promise<Invoice> {
    const [invoice] = await executor.insert(invoices).values(values).returning();
    assertValue(invoice, ExceptionCode.Unreachable);

    return invoice;
  }
}
