import { isString } from '../../../shared/helpers/type-guard.helpers.js';
import type { BasicCredentials } from '../types/auth.types.js';
import {
  BASIC_SCHEME_PREFIX,
  CREDENTIALS_ENCODING,
  CREDENTIALS_SEPARATOR,
  CREDENTIALS_TEXT_ENCODING,
} from '../auth.constants.js';

/**
 * Reads `Authorization: Basic base64(id:secret)`.
 */
export function readBasicCredentials(header: unknown): BasicCredentials | undefined {
  if (!isString(header) || !header.startsWith(BASIC_SCHEME_PREFIX)) {
    return;
  }

  const decoded = Buffer.from(
    header.slice(BASIC_SCHEME_PREFIX.length),
    CREDENTIALS_ENCODING,
  ).toString(CREDENTIALS_TEXT_ENCODING);

  const [clientId, ...secretParts] = decoded.split(CREDENTIALS_SEPARATOR);
  const hasSecret = secretParts.length > 0;

  if (!hasSecret) {
    return;
  }

  return { clientId, secret: secretParts.join(CREDENTIALS_SEPARATOR) };
}
