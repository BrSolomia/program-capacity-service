import { getTableName, is, sql, Table } from 'drizzle-orm';
import { inject } from 'vitest';

import { createDatabase, Database } from '../../src/database/database.module.js';
import * as schema from '../../src/database/schema/index.js';

const tableNames = Object.values(schema)
  .filter((value) => is(value, Table))
  .map((table) => getTableName(table));

// Derived from the schema, so a table added later is emptied without touching this file.
const truncateAllTablesStatement = sql.raw(
  `TRUNCATE TABLE ${tableNames.map((name) => `"${name}"`).join(', ')} CASCADE`,
);

/** A handle the test owns: end it with `database.$client.end()`. */
export function createTestDatabase(): Database {
  return createDatabase(inject('databaseUrl'));
}

/** Leaves the migrated schema in place and drops every row, including reference data. */
export async function truncateAllTables(database: Database): Promise<void> {
  await database.execute(truncateAllTablesStatement);
}
