import { createHash, timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { API_CLIENT_SECRET_HASHES, SECRET_DIGEST, SECRET_DIGEST_BYTES } from '../auth.constants.js';
import { readBasicCredentials } from '../helpers/basic-credentials.helpers.js';
import type { RequestHeaders } from '../types/auth.types.js';

/**
 * Stands in for the hash of a client we do not know, so an unknown id costs the same as a wrong
 * secret and the response time does not say which clients exist.
 */
const UNKNOWN_CLIENT_HASH = Buffer.alloc(SECRET_DIGEST_BYTES);

@Injectable()
export class ApiClientGuard implements CanActivate {
  constructor(
    @Inject(API_CLIENT_SECRET_HASHES) private readonly secretHashes: ReadonlyMap<string, Buffer>,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: RequestHeaders }>();

    const credentials = readBasicCredentials(request.headers.authorization);
    assertValue(credentials, ExceptionCode.NotAuthenticated);

    const presentedHash = createHash(SECRET_DIGEST).update(credentials.secret).digest();
    const expectedHash = this.secretHashes.get(credentials.clientId) ?? UNKNOWN_CLIENT_HASH;

    // Both sides are digests of the same length, so the comparison cannot leak where they differ.
    const matches = timingSafeEqual(presentedHash, expectedHash);
    assertValue(matches, ExceptionCode.NotAuthenticated);

    return true;
  }
}
