import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { Env } from '../../config/env/env.schemas.js';
import { EnvVariable } from '../../shared/enums/env-variable.enum.js';
import { API_CLIENT_SECRET_HASHES } from './auth.constants.js';
import { ApiClientGuard } from './guards/api-client.guard.js';
import { parseSecretHashes } from './helpers/api-client.helpers.js';

/** Registered globally, so an endpoint added later is protected unless it opts out. */
@Module({
  providers: [
    {
      provide: API_CLIENT_SECRET_HASHES,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        parseSecretHashes(config.get(EnvVariable.API_CLIENTS, { infer: true })),
    },
    { provide: APP_GUARD, useClass: ApiClientGuard },
  ],
})
export class AuthModule {}
