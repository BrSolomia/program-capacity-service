import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedpandaContainer } from '@testcontainers/redpanda';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { TestProject } from 'vitest/node';

import { MIGRATIONS_FOLDER } from '../../src/database/database.constants.js';
import { createDatabase } from '../../src/database/database.module.js';
import { POSTGRES_IMAGE } from './test-database.constants.js';
import { REDPANDA_IMAGE } from './test-kafka.constants.js';

declare module 'vitest' {
  interface ProvidedContext {
    /** Connection URI of the throwaway Postgres every database-backed test shares. */
    databaseUrl: string;

    /** `host:port` of the throwaway broker; the real protocol, so no Kafka client is faked. */
    kafkaBrokers: string;
  }
}

/**
 * Starts one migrated Postgres and one broker for the whole run, so no test can reach the
 * development database or a real cluster.
 */
export default async function setup(project: TestProject) {
  const [postgres, redpanda] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new RedpandaContainer(REDPANDA_IMAGE).start(),
  ]);

  const databaseUrl = postgres.getConnectionUri();

  const database = createDatabase(databaseUrl);
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
  await database.$client.end();

  project.provide('databaseUrl', databaseUrl);
  project.provide('kafkaBrokers', redpanda.getBootstrapServers());

  return async () => {
    await Promise.all([postgres.stop(), redpanda.stop()]);
  };
}
