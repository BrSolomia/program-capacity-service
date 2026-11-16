import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { EnvVariable } from './shared/enums/env-variable.enum.js';
import { AppModule } from './config/app.module.js';
import { Env } from './config/env/env.schemas.js';
import { startKafkaConsumers } from './config/kafka.setup.js';
import { setupSwagger } from './config/swagger.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Without this, SIGTERM kills the process outright: `onModuleDestroy` never runs, the connection
  // pool is never closed, and queries in flight are cut off mid-statement.
  app.enableShutdownHooks();

  setupSwagger(app);

  await startKafkaConsumers(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  await app.listen(config.get(EnvVariable.PORT, { infer: true }));
}

await bootstrap();
