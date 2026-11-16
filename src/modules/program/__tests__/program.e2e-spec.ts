import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  insertCurrency,
  insertProgram,
  PROGRAM_CODE,
  US_DOLLAR,
} from '../../../../test/builders/index.js';
import { API_CLIENT_ID, API_CLIENT_SECRET } from '../../../../test/fixtures/api-client.fixtures.js';
import { createTestApp } from '../../../../test/helpers/test-app.helpers.js';
import {
  createTestDatabase,
  truncateAllTables,
} from '../../../../test/helpers/test-database.helpers.js';
import type { Database } from '../../../database/database.module.js';
import { PROGRAM_CODE_MAX_LENGTH } from '../../../shared/constants/identifier.constants.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import { ProgramCapacityResponseSchema } from '../schemas/program.response.js';

describe('program capacity over HTTP', () => {
  let app: INestApplication;
  let database: Database;

  beforeEach(async () => {
    database = createTestDatabase();
    await truncateAllTables(database);
    await insertCurrency(database);
    await insertProgram(database, { reservedAmount: new ExactDecimal('250.00') });

    app = await createTestApp();
  });

  afterEach(async () => {
    await Promise.all([app.close(), database.$client.end()]);
  });

  it('reports what is left, and how fresh the limit is', async () => {
    const response = await request(app.getHttpServer())
      .get(`/programs/${PROGRAM_CODE}/capacity`)
      .auth(API_CLIENT_ID, API_CLIENT_SECRET)
      .expect(200);

    expect(ProgramCapacityResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      programCode: PROGRAM_CODE,
      currencyCode: US_DOLLAR.code,
      creditLimit: '1000',
      reservedAmount: '250',
      availableAmount: '750',
      lastTreasuryReconciledAt: null,
    });
  });

  it('refuses a request without credentials', async () => {
    await request(app.getHttpServer()).get(`/programs/${PROGRAM_CODE}/capacity`).expect(401);
  });

  it('reports a program code longer than treasury can send', async () => {
    const response = await request(app.getHttpServer())
      .get(`/programs/${'X'.repeat(PROGRAM_CODE_MAX_LENGTH + 1)}/capacity`)
      .auth(API_CLIENT_ID, API_CLIENT_SECRET)
      .expect(400);

    expect(response.body.errorCode).toBe('INVALID_REQUEST');
  });

  it('reports an unknown program', async () => {
    await request(app.getHttpServer())
      .get('/programs/MISSING/capacity')
      .auth(API_CLIENT_ID, API_CLIENT_SECRET)
      .expect(404);
  });
});
