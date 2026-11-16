import { Injectable, Logger } from '@nestjs/common';

import { KafkaConsumerService } from '../../../kafka/index.js';
import type { IncomingMessage } from '../../../kafka/index.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { toPayloadIssues } from '../../../shared/helpers/schema-issue.helpers.js';
import { parseTreasuryStatement } from '../../treasury/helpers/treasury-message.helpers.js';
import {
  TREASURY_STATEMENT_CONSUMER_GROUP,
  TREASURY_STATEMENT_TOPIC,
} from '../../treasury/treasury.topics.js';
import { requiresInvestigation } from '../helpers/reconciliation.helpers.js';
import { toReconciliationLog } from '../mappers/reconciliation.mappers.js';
import { ReconcileProgramService } from '../services/reconcile-program.service.js';
import type { ProgramReconciliation } from '../types/reconciliation.types.js';

/** Lives with the reservations it writes: in the treasury module it would close a module cycle. */
@Injectable()
export class TreasuryStatementConsumer {
  private readonly logger = new Logger(TreasuryStatementConsumer.name);

  constructor(
    private readonly consumers: KafkaConsumerService,
    private readonly reconciliations: ReconcileProgramService,
  ) {}

  public start(): Promise<void> {
    return this.consumers.subscribe({
      topic: TREASURY_STATEMENT_TOPIC,
      groupId: TREASURY_STATEMENT_CONSUMER_GROUP,
      onMessage: (message) => this.reconcileProgram(message),
    });
  }

  private async reconcileProgram(message: IncomingMessage): Promise<void> {
    const { value } = message;

    assertValue(value, ExceptionCode.InvalidMessage, {
      issues: toPayloadIssues('message has no payload'),
    });

    const reconciliation = await this.reconciliations.reconcile(parseTreasuryStatement(value));

    this.report(reconciliation);
  }

  /** A statement that changed anything is logged loud enough to notice. */
  private report(reconciliation: ProgramReconciliation): void {
    const summary = `treasury reconciliation ${reconciliation.outcome}`;
    const record = toReconciliationLog(reconciliation);

    if (requiresInvestigation(reconciliation)) {
      // Could be push to another queue or something.
      this.logger.warn(summary, record);

      return;
    }

    this.logger.log(summary, record);
  }
}
