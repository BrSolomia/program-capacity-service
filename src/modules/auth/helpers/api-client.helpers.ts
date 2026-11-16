import { splitEnvList } from '../../../config/env/env.helpers.js';
import { CREDENTIALS_SEPARATOR, SECRET_DIGEST_ENCODING } from '../auth.constants.js';

/**
 * Turns the configured `<id>:<hash>` entries into the lookup the guard uses.
 */
export function parseSecretHashes(apiClients: string): ReadonlyMap<string, Buffer> {
  const entries = splitEnvList(apiClients).map((entry): [string, Buffer] => {
    const [clientId, hash] = entry.split(CREDENTIALS_SEPARATOR);

    return [clientId, Buffer.from(hash, SECRET_DIGEST_ENCODING)];
  });

  return new Map(entries);
}
