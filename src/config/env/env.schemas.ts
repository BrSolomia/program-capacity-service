import { z } from 'zod';

import { EnvVariable } from '../../shared/enums/env-variable.enum.js';
import { DEFAULT_PORT, MAX_PORT, MIN_PORT } from './env.constants.js';
import { splitEnvList } from './env.helpers.js';
import { NodeEnv } from '../../shared/enums/node-env.enum.js';
import { API_CLIENT_REGEX, KAFKA_BROKER_REGEX, POSTGRES_URL_PROTOCOL_REGEX } from './env.regex.js';
import { assertValue, ExceptionCode } from '../../shared/helpers/assert-object.helpers.js';

const EnvApiClientsSchema = z
  .string()
  .refine(
    (value) => splitEnvList(value).every((entry) => API_CLIENT_REGEX.test(entry)),
    'each API client must read "<id>:<sha256 hex of its secret>"',
  )
  .refine((value) => splitEnvList(value).length > 0, 'at least one API client is required');

const KafkaBrokersSchema = z
  .string()
  .refine(
    (value) => splitEnvList(value).every((broker) => KAFKA_BROKER_REGEX.test(broker)),
    'each Kafka broker must read "<host>:<port>"',
  )
  .refine((value) => splitEnvList(value).length > 0, 'at least one Kafka broker is required');

export const EnvSchema = z.object({
  [EnvVariable.NODE_ENV]: z.enum(NodeEnv),
  [EnvVariable.PORT]: z.coerce.number().int().min(MIN_PORT).max(MAX_PORT).default(DEFAULT_PORT),

  [EnvVariable.DATABASE_URL]: z.url({ protocol: POSTGRES_URL_PROTOCOL_REGEX }),
  [EnvVariable.API_CLIENTS]: EnvApiClientsSchema,
  [EnvVariable.KAFKA_BROKERS]: KafkaBrokersSchema,
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  assertValue(result.data, ExceptionCode.InvalidEnvironment);

  return result.data;
}
