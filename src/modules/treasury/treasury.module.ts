import { Module } from '@nestjs/common';

import { ProgramModule } from '../program/index.js';
import { TreasuryCreditLimitConsumer } from './consumers/treasury-credit-limit.consumer.js';
import { LoggedTreasuryOperationPublisher } from './publishers/logged-treasury-operation.publisher.js';
import { TreasuryOperationService } from './services/treasury-operation.service.js';
import { TREASURY_OPERATION_PUBLISHER } from './treasury.constants.js';

/**
 * Everything that talks to treasury.
 */
@Module({
  imports: [ProgramModule],
  providers: [
    TreasuryCreditLimitConsumer,
    { provide: TREASURY_OPERATION_PUBLISHER, useClass: LoggedTreasuryOperationPublisher },
    TreasuryOperationService,
  ],
  exports: [TreasuryCreditLimitConsumer, TreasuryOperationService],
})
export class TreasuryModule {}
