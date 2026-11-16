import { INestApplication } from '@nestjs/common';

import { TreasuryStatementConsumer } from '../modules/reservation/index.js';
import { TreasuryCreditLimitConsumer } from '../modules/treasury/index.js';

/** Starts what this process consumes. */
export async function startKafkaConsumers(app: INestApplication): Promise<void> {
  await app.get(TreasuryCreditLimitConsumer).start();
  await app.get(TreasuryStatementConsumer).start();
}
