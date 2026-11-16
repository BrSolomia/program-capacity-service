import { getTableName } from 'drizzle-orm';

import { DATABASE } from '../../../src/database/database.constants.js';
import { Database } from '../../../src/database/database.module.js';
import {
  currencies,
  invoices,
  programs,
  reservations,
} from '../../../src/database/schema/index.js';
import { createTestApp } from '../../helpers/test-app.helpers.js';
import { createTestDatabase, truncateAllTables } from '../../helpers/test-database.helpers.js';

describe('database test harness', () => {
  let database: Database;

  beforeAll(() => {
    database = createTestDatabase();
  });

  afterAll(async () => {
    await database.$client.end();
  });

  beforeEach(async () => {
    await truncateAllTables(database);
  });

  it('applies every migration before the first test runs', async () => {
    const { rows } = await database.$client.query<{ tableName: string }>(
      `SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema = 'public'`,
    );

    expect(rows.map((row) => row.tableName)).toEqual(
      expect.arrayContaining([currencies, programs, invoices, reservations].map(getTableName)),
    );
  });

  it('empties the tables between tests', async () => {
    await database.insert(currencies).values({ code: 'USD', minorUnits: 2 });
    await truncateAllTables(database);

    expect(await database.select().from(currencies)).toEqual([]);
  });

  it('boots the app against the throwaway database', async () => {
    const app = await createTestApp();

    await expect(app.close()).resolves.toBeUndefined();
  });

  it('closes the connection pool when the app shuts down', async () => {
    const app = await createTestApp();
    const booted = app.get<Database>(DATABASE);

    await app.close();

    expect(booted.$client.ended).toBe(true);
  });
});
