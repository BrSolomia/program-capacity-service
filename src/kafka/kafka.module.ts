import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel } from 'kafkajs';

import { Env } from '../config/env/env.schemas.js';
import { splitEnvList } from '../config/env/env.helpers.js';
import { EnvVariable } from '../shared/enums/env-variable.enum.js';
import { registerCompressionCodecs } from './kafka.codecs.js';
import { KAFKA, KAFKA_CLIENT_ID } from './kafka.constants.js';
import { KafkaConsumerService } from './services/kafka-consumer.service.js';
import { KafkaProducerService } from './services/kafka-producer.service.js';

@Global()
@Module({
  providers: [
    {
      provide: KAFKA,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        registerCompressionCodecs();

        return new Kafka({
          clientId: KAFKA_CLIENT_ID,
          brokers: splitEnvList(config.get(EnvVariable.KAFKA_BROKERS, { infer: true })),
          logLevel: logLevel.WARN,
        });
      },
    },
    KafkaProducerService,
    KafkaConsumerService,
  ],
  exports: [KAFKA, KafkaProducerService, KafkaConsumerService],
})
export class KafkaModule {}
