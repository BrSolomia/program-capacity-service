import { HttpException, Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';

import { DEAD_LETTER_TOPIC_SUFFIX, KAFKA } from '../kafka.constants.js';
import { isUnprocessableMessage, toDeadLetter } from '../helpers/dead-letter.helpers.js';
import type { IncomingMessage, Subscription } from '../types/kafka.types.js';
import { KafkaProducerService } from './kafka-producer.service.js';

type OnMessageFn = Subscription['onMessage'];

@Injectable()
export class KafkaConsumerService implements OnApplicationShutdown {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumers: Consumer[] = [];

  constructor(
    @Inject(KAFKA) private readonly kafka: Kafka,
    private readonly producer: KafkaProducerService,
  ) {}

  /**
   * Starts consuming one topic.
   *
   * TODO: a consumer that stops for good goes unnoticed — kafkajs logs it and the process keeps
   * serving HTTP. Production needs a health probe over group membership (`@nestjs/terminus`).
   */
  public async subscribe({ topic, groupId, onMessage }: Subscription): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    this.consumers.push(consumer);

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    await consumer.run({
      eachMessage: (payload) => this.handleMessage(payload, onMessage),
    });
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.disconnect()));
  }

  private async handleMessage(
    messagePayload: EachMessagePayload,
    onMessage: OnMessageFn,
  ): Promise<void> {
    const { topic, partition, message } = messagePayload;

    const incoming: IncomingMessage = {
      topic,
      partition,
      offset: message.offset,
      key: message.key?.toString() ?? null,
      value: message.value?.toString() ?? null,
    };

    try {
      await onMessage(incoming);
    } catch (error) {
      // TODO: limit the attempts — a 5xx is retried forever, which is right for a database that
      // is down and wrong for a bug that will never succeed.

      if (!isUnprocessableMessage(error)) {
        throw error;
      }

      await this.publishDeadLetter(incoming, error);
    }
  }

  /** Keeps the original key, so the dead letter topic preserves the order of what it holds. */
  private async publishDeadLetter(message: IncomingMessage, error: HttpException): Promise<void> {
    const deadLetterTopic = `${message.topic}${DEAD_LETTER_TOPIC_SUFFIX}`;
    const deadLetter = toDeadLetter(message, error);

    this.logger.warn(deadLetter);

    await this.producer.publish(deadLetterTopic, message.key, JSON.stringify(deadLetter));
  }
}
