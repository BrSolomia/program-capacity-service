import { Module } from '@nestjs/common';

import { EXCHANGE_RATE_PROVIDER } from './exchange-rate.constants.js';
import { MockedExchangeRateProvider } from './providers/mocked-exchange-rate.provider.js';
import { ExchangeRateService } from './services/exchange-rate.service.js';

@Module({
  providers: [
    { provide: EXCHANGE_RATE_PROVIDER, useClass: MockedExchangeRateProvider },
    ExchangeRateService,
  ],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
