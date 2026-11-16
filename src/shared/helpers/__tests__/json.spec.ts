import { describe, expect, it } from 'vitest';

import { safeJsonParse } from '../json.helpers.js';

describe('safeJsonParse', () => {
  it('reports no error and the parsed value', () => {
    expect(safeJsonParse('{ "creditLimit": "100.00" }')).toEqual([null, { creditLimit: '100.00' }]);
  });

  it('reports what is wrong instead of throwing', () => {
    const [error, value] = safeJsonParse('{ not json');

    expect(error?.message).toBeTruthy();
    expect(value).toBeNull();
  });

  it('treats an empty text as an error, the way `JSON.parse` does', () => {
    expect(safeJsonParse('')[0]).toBeInstanceOf(Error);
  });
});
