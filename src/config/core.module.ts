import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { DatabaseModule } from '../database/database.module.js';
import { KafkaModule } from '../kafka/index.js';
import { ExceptionsFilter } from '../shared/filters/exceptions.filter.js';
import { ExceptionCode, toException } from '../shared/helpers/assert-object.helpers.js';
import { toSchemaIssues } from '../shared/helpers/schema-issue.helpers.js';
import { validateEnv } from './env/env.schemas.js';

/**
 * App-wide infrastructure (config, database, Kafka).
 * Import only once, in AppModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    KafkaModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ExceptionsFilter },
    {
      // Validates every parameter that declares a schema, and returns what the schema produced.
      provide: APP_PIPE,
      useFactory: () =>
        new StandardSchemaValidationPipe({
          exceptionFactory: (issues) =>
            toException(ExceptionCode.InvalidRequest, { issues: toSchemaIssues(issues) }),
        }),
    },
  ],
})
export class CoreModule {}
