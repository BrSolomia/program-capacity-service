import { Module } from '@nestjs/common';

import { InvoiceRepository } from './repositories/invoice.repository.js';
import { InvoiceService } from './services/invoice.service.js';

@Module({
  providers: [InvoiceRepository, InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
