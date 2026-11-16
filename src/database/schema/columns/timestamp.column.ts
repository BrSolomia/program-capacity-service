import { timestamp } from 'drizzle-orm/pg-core';

import { TIMESTAMP_PRECISION } from '../schema.constants.js';

/** Timestamp column as this schema stores them: timezone-aware, millisecond precision. */
export function timestampColumn(name: string) {
  return timestamp(name, {
    withTimezone: true,
    precision: TIMESTAMP_PRECISION,
    mode: 'date',
  });
}
