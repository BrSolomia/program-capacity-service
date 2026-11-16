import { Injectable } from '@nestjs/common';

import type { DatabaseExecutor } from '../../../database/database.module.js';
import { Invoice } from '../../../database/schema/index.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import type { FindInvoiceInput, NewInvoiceValues } from '../types/invoice.repository.types.js';

@Injectable()
export class InvoiceService {
  constructor(private readonly invoices: InvoiceRepository) {}

  public findByExternalId(
    input: FindInvoiceInput,
    executor?: DatabaseExecutor,
  ): Promise<Invoice | undefined> {
    return this.invoices.findByExternalId(input, executor);
  }

  public create(values: NewInvoiceValues, executor: DatabaseExecutor): Promise<Invoice> {
    return this.invoices.insert(values, executor);
  }
}
