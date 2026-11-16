import { createHash } from 'node:crypto';

/** A generated secret, as the scheme requires: a chosen one would be brute-forceable offline. */
export const API_CLIENT_ID = 'test-client';
export const API_CLIENT_SECRET = 'n8Qe2bWfA1yKp7Rv0ZsLd4XjH6TgC9Mu';

export const API_CLIENTS = `${API_CLIENT_ID}:${createHash('sha256')
  .update(API_CLIENT_SECRET)
  .digest('hex')}`;
