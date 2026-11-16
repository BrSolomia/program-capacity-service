import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/config/app.module.js';
import { startKafkaConsumers } from '../../src/config/kafka.setup.js';
import { setupSwagger } from '../../src/config/swagger.setup.js';

/** Boots the whole app, pool and all, against the throwaway database; `app.close()` releases it. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  setupSwagger(app);
  await app.init();

  return app;
}

/** The same app with its consumers running, for the tests that go through the broker. */
export async function createTestAppWithConsumers(): Promise<INestApplication> {
  const app = await createTestApp();
  await startKafkaConsumers(app);

  return app;
}
