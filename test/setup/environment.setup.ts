import { inject } from 'vitest';

import { EnvVariable } from '../../src/shared/enums/env-variable.enum.js';
import { API_CLIENTS } from '../fixtures/api-client.fixtures.js';

// Set before any application module is imported: `ConfigModule.forRoot` validates the environment
// and caches it while the module file is being evaluated, so anything set later is ignored and the
// application would boot against whatever the developer's own `.env` points at.
process.env[EnvVariable.DATABASE_URL] = inject('databaseUrl');
process.env[EnvVariable.API_CLIENTS] = API_CLIENTS;
process.env[EnvVariable.KAFKA_BROKERS] = inject('kafkaBrokers');
