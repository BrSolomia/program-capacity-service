import { randomUUID } from 'node:crypto';

import { Kafka, logLevel } from 'kafkajs';
import { inject } from 'vitest';

import { splitEnvList } from '../../src/config/env/env.helpers.js';

export type RecordedMessage = { key: string | null; value: string };

/** A client the test owns, pointed at the throwaway broker. */
export function createTestKafka(): Kafka {
  return new Kafka({
    clientId: `test-${randomUUID()}`,
    brokers: splitEnvList(inject('kafkaBrokers')),
    logLevel: logLevel.NOTHING,
  });
}

/**
 * Creates the topics up front. Auto-creation would also make them, but on first access, which
 * leaves the first produce and the first subscribe racing for leadership.
 */
export async function createTopics(kafka: Kafka, topics: string[]): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({ topics: topics.map((topic) => ({ topic, numPartitions: 1 })) });
  await admin.disconnect();
}

/** Collects everything the topic receives from the beginning; `stop` releases the consumer. */
export async function recordTopic(
  kafka: Kafka,
  topic: string,
): Promise<{ messages: RecordedMessage[]; stop: () => Promise<void> }> {
  const messages: RecordedMessage[] = [];
  const consumer = kafka.consumer({ groupId: `test-recorder-${randomUUID()}` });

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({
    eachMessage: ({ message }) => {
      messages.push({
        key: message.key?.toString() ?? null,
        value: message.value?.toString() ?? '',
      });

      return Promise.resolve();
    },
  });

  return { messages, stop: () => consumer.disconnect() };
}
