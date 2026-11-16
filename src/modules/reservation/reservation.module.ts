import { Module } from '@nestjs/common';

import { CurrencyModule } from '../currency/index.js';
import { ExchangeRateModule } from '../exchange-rate/index.js';
import { InvoiceModule } from '../invoice/index.js';
import { ProgramModule } from '../program/index.js';
import { TreasuryModule } from '../treasury/index.js';
import { TreasuryStatementConsumer } from './consumers/treasury-statement.consumer.js';
import { ReservationController } from './controllers/reservation.controller.js';
import { ReservationRepository } from './repositories/reservation.repository.js';
import { ReconcileProgramService } from './services/reconcile-program.service.js';
import { ReleaseCapacityService } from './services/release-capacity.service.js';
import { ReserveCapacityService } from './services/reserve-capacity.service.js';

@Module({
  controllers: [ReservationController],
  imports: [ProgramModule, InvoiceModule, CurrencyModule, ExchangeRateModule, TreasuryModule],
  providers: [
    ReservationRepository,
    ReserveCapacityService,
    ReleaseCapacityService,
    ReconcileProgramService,
    TreasuryStatementConsumer,
  ],
  exports: [ReserveCapacityService, ReleaseCapacityService, TreasuryStatementConsumer],
})
export class ReservationModule {}
