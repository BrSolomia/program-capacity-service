import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Kafka, Partitioners, Producer } from 'kafkajs';

import { KAFKA } from '../kafka.constants.js';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnApplicationShutdown {
  private readonly producer: Promise<Producer>;

  constructor(@Inject(KAFKA) kafka: Kafka) {
    this.producer = connect(kafka);
  }

  /** Boot waits for the connection, so an unreachable broker is reported here, not on a publish. */
  public async onModuleInit(): Promise<void> {
    await this.producer;
  }

  /** The key decides the partition, so messages about one program keep their order. */
  public async publish(topic: string, key: string | null, value: string): Promise<void> {
    const producer = await this.producer;

    await producer.send({ topic, messages: [{ key, value }] });
  }

  public async onApplicationShutdown(): Promise<void> {
    const producer = await this.producer;

    await producer.disconnect();
  }
}

function connect(kafka: Kafka): Promise<Producer> {
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });

  return producer.connect().then(() => producer);
}
