import 'dotenv/config';
import assert from 'node:assert/strict';

import { defineConfig } from 'drizzle-kit';

import { MIGRATIONS_FOLDER } from './src/database/database.constants.js';

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required to run drizzle-kit');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: MIGRATIONS_FOLDER,
  dbCredentials: { url: databaseUrl },
});
