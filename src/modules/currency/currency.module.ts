import { Module } from '@nestjs/common';

import { CurrencyRepository } from './repositories/currency.repository.js';
import { CurrencyService } from './services/currency.service.js';

@Module({
  providers: [CurrencyRepository, CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
