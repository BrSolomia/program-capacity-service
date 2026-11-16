import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { Env } from '../config/env/env.schemas.js';
import { EnvVariable } from '../shared/enums/env-variable.enum.js';
import { DATABASE } from './database.constants.js';
import { TransactionService } from './services/transaction.service.js';
import * as schema from './schema/index.js';

/** Owns the connection pool it creates. */
export function createDatabase(connectionString: string) {
  return drizzle(new Pool({ connectionString }), { schema });
}

export type Database = ReturnType<typeof createDatabase>;

/** The pooled handle or a transaction on it, for queries that run on either. */
export type DatabaseExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createDatabase(config.get(EnvVariable.DATABASE_URL, { infer: true })),
    },
    TransactionService,
  ],
  exports: [DATABASE, TransactionService],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  public async onModuleDestroy(): Promise<void> {
    await this.database.$client.end();
  }
}
