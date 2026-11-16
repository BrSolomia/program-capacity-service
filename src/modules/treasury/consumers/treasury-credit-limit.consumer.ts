import { Injectable, Logger } from '@nestjs/common';

import { KafkaConsumerService } from '../../../kafka/index.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { toPayloadIssues } from '../../../shared/helpers/schema-issue.helpers.js';
import type { IncomingMessage } from '../../../kafka/index.js';
import { ProgramService } from '../../program/index.js';
import { parseCreditLimitMessage } from '../helpers/treasury-message.helpers.js';
import {
  TREASURY_CREDIT_LIMIT_CONSUMER_GROUP,
  TREASURY_CREDIT_LIMIT_TOPIC,
} from '../treasury.topics.js';

@Injectable()
export class TreasuryCreditLimitConsumer {
  private readonly logger = new Logger(TreasuryCreditLimitConsumer.name);

  constructor(
    private readonly consumers: KafkaConsumerService,
    private readonly programs: ProgramService,
  ) {}

  public start(): Promise<void> {
    return this.consumers.subscribe({
      topic: TREASURY_CREDIT_LIMIT_TOPIC,
      groupId: TREASURY_CREDIT_LIMIT_CONSUMER_GROUP,
      onMessage: (message) => this.applyCreditLimit(message),
    });
  }

  private async applyCreditLimit(message: IncomingMessage): Promise<void> {
    const { value } = message;

    assertValue(value, ExceptionCode.InvalidMessage, {
      issues: toPayloadIssues('message has no payload'),
    });

    const parsedValue = parseCreditLimitMessage(value);
    const appliedLimit = await this.programs.applyCreditLimit(parsedValue);

    this.logger.log(`treasury credit limit ${appliedLimit.outcome}`, {
      ...appliedLimit,
      previousCreditLimit: appliedLimit.previousCreditLimit?.toFixed() ?? null,
      creditLimit: appliedLimit.creditLimit.toFixed(),
      treasuryVersion: appliedLimit.treasuryVersion.toString(),
    });
  }
}
