import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseSecretHashes } from '../api-client.helpers.js';

function digestOf(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function entryFor(clientId: string, secret: string): string {
  return `${clientId}:${digestOf(secret).toString('hex')}`;
}

describe('parseSecretHashes', () => {
  it('reads a client into the digest the guard compares against', () => {
    const hashes = parseSecretHashes(entryFor('first-client', 'secret'));

    expect(hashes.get('first-client')).toEqual(digestOf('secret'));
  });

  it('reads several clients, tolerating spacing and a trailing separator', () => {
    const hashes = parseSecretHashes(
      ` ${entryFor('first', 'one')} , ${entryFor('second', 'two')} , `,
    );

    expect([...hashes.keys()]).toEqual(['first', 'second']);
    expect(hashes.get('second')).toEqual(digestOf('two'));
  });

  it('holds nothing for a client it was not given', () => {
    const hashes = parseSecretHashes(entryFor('first', 'one'));

    expect(hashes.get('second')).toBeUndefined();
  });
});
