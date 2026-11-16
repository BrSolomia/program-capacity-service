import { Injectable, Logger } from '@nestjs/common';

import type { TreasuryOperationPublisher } from './treasury-operation.publisher.js';
import type { TreasuryOperation } from '../types/treasury.types.js';

/**
 * Mock: logs the operation instead of publishing it, because the task describes Kafka as an
 * inbound channel only.
 *
 * TODO: publish through a transactional outbox, in operation-number order: an operation must not be
 * lost between the commit and the send, and treasury reads its statement cut-off as "everything
 * up to this number".
 */
@Injectable()
export class LoggedTreasuryOperationPublisher implements TreasuryOperationPublisher {
  private readonly logger = new Logger(LoggedTreasuryOperationPublisher.name);

  public publish(operation: TreasuryOperation): Promise<void> {
    this.logger.log({
      ...operation,
      operationNumber: operation.operationNumber.toString(),
      amount: operation.amount.toFixed(),
    });

    return Promise.resolve();
  }
}
