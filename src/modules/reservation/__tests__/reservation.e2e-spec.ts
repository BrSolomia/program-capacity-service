import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EURO,
  insertCurrency,
  INVOICE_EXTERNAL_ID,
  JAPANESE_YEN,
  KUWAITI_DINAR,
  PROGRAM_CODE,
  US_DOLLAR,
  insertProgram,
} from '../../../../test/builders/index.js';
import { API_CLIENT_ID, API_CLIENT_SECRET } from '../../../../test/fixtures/api-client.fixtures.js';
import { createTestApp } from '../../../../test/helpers/test-app.helpers.js';
import {
  createTestDatabase,
  truncateAllTables,
} from '../../../../test/helpers/test-database.helpers.js';
import type { Database } from '../../../database/database.module.js';

const EURO_PROGRAM_CODE = 'PROGRAM-EUR';

describe('reservations over HTTP', () => {
  let app: INestApplication;
  let database: Database;

  beforeEach(async () => {
    database = createTestDatabase();
    await truncateAllTables(database);
    await Promise.all(
      [US_DOLLAR, EURO, JAPANESE_YEN, KUWAITI_DINAR].map((currency) =>
        insertCurrency(database, currency),
      ),
    );
    await insertProgram(database);
    await insertProgram(database, { code: EURO_PROGRAM_CODE, currencyCode: EURO.code });

    app = await createTestApp();
  });

  afterEach(async () => {
    await Promise.all([app.close(), database.$client.end()]);
  });

  function reserve(programCode = PROGRAM_CODE) {
    return request(app.getHttpServer())
      .post(`/programs/${programCode}/reservations`)
      .auth(API_CLIENT_ID, API_CLIENT_SECRET);
  }

  const validBody = {
    invoiceExternalId: INVOICE_EXTERNAL_ID,
    amount: '100.00',
    currencyCode: US_DOLLAR.code,
  };

  it('holds capacity and answers with amounts as text', async () => {
    const response = await reserve().send(validBody).expect(201);

    expect(response.body).toMatchObject({
      invoiceExternalId: INVOICE_EXTERNAL_ID,
      status: 'ACTIVE',
      reservedAmount: '100',
      exchangeRate: '1',
      reserveOperationNumber: '1',
      releaseOperationNumber: null,
    });
    expect(typeof response.body.reservationId).toBe('string');
  });

  it('refuses a request without credentials', async () => {
    await request(app.getHttpServer())
      .post(`/programs/${PROGRAM_CODE}/reservations`)
      .send(validBody)
      .expect(401);
  });

  it('refuses a wrong secret', async () => {
    await request(app.getHttpServer())
      .post(`/programs/${PROGRAM_CODE}/reservations`)
      .auth(API_CLIENT_ID, 'not-the-secret')
      .send(validBody)
      .expect(401);
  });

  it('refuses an unknown client', async () => {
    await request(app.getHttpServer())
      .post(`/programs/${PROGRAM_CODE}/reservations`)
      .auth('nobody', API_CLIENT_SECRET)
      .send(validBody)
      .expect(401);
  });

  it('reports an amount sent as a JSON number', async () => {
    const response = await reserve()
      .send({ ...validBody, amount: 100 })
      .expect(400);

    expect(response.body.errorCode).toBe('INVALID_REQUEST');
  });

  it('reports an amount wider than the service can hold, rather than failing on write', async () => {
    const response = await reserve()
      .send({ ...validBody, amount: '1000000000000000.00' })
      .expect(400);

    expect(response.body.errorCode).toBe('INVOICE_AMOUNT_TOO_LARGE');
  });

  it('reports a field that does not belong', async () => {
    await reserve()
      .send({ ...validBody, unexpected: 'value' })
      .expect(400);
  });

  it('names every field it refused', async () => {
    const response = await reserve()
      .send({ invoiceExternalId: '', amount: 'abc', currencyCode: 'usd' })
      .expect(400);

    expect(response.body).toEqual({
      errorCode: 'INVALID_REQUEST',
      details: {
        issues: [
          { path: 'invoiceExternalId', message: expect.any(String) },
          { path: 'amount', message: expect.any(String) },
          { path: 'currencyCode', message: expect.any(String) },
        ],
      },
    });
  });

  /** Refused by the framework before a handler runs, and still answered in our shape. */
  it('answers a body that is not JSON with an error code', async () => {
    const response = await reserve()
      .set('content-type', 'application/json')
      .send('{ not json')
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'INVALID_REQUEST' });
    expect(response.body.details.issues).toHaveLength(1);
  });

  it('answers an unknown route with an error code', async () => {
    const response = await request(app.getHttpServer())
      .get('/no-such-route')
      .auth(API_CLIENT_ID, API_CLIENT_SECRET)
      .expect(404);

    expect(response.body).toEqual({ errorCode: 'ROUTE_NOT_FOUND' });
  });

  it('refuses to reserve an invoice it has already released', async () => {
    await reserve().send(validBody).expect(201);
    await request(app.getHttpServer())
      .delete(`/programs/${PROGRAM_CODE}/reservations/${INVOICE_EXTERNAL_ID}`)
      .auth(API_CLIENT_ID, API_CLIENT_SECRET)
      .expect(200);

    const response = await reserve().send(validBody).expect(409);

    expect(response.body).toEqual({ errorCode: 'INVOICE_ALREADY_RELEASED' });
  });

  it('answers a repeated invoice with the reservation it already has', async () => {
    const first = await reserve().send(validBody).expect(201);
    const second = await reserve().send(validBody).expect(201);

    expect(second.body.reservationId).toBe(first.body.reservationId);
  });

  it('refuses the same invoice on different terms', async () => {
    await reserve().send(validBody).expect(201);

    await reserve()
      .send({ ...validBody, amount: '200.00' })
      .expect(409);
  });

  it('refuses more than the program has left', async () => {
    await reserve()
      .send({ ...validBody, amount: '2000.00' })
      .expect(409);
  });

  it('reports an unknown program', async () => {
    await reserve('MISSING').send(validBody).expect(404);
  });

  it('reports a currency pair with no rate', async () => {
    await reserve(EURO_PROGRAM_CODE)
      .send({ ...validBody, currencyCode: JAPANESE_YEN.code, amount: '100' })
      .expect(422);
  });

  it('releases what it held', async () => {
    await reserve().send(validBody).expect(201);

    const response = await request(app.getHttpServer())
      .delete(`/programs/${PROGRAM_CODE}/reservations/${INVOICE_EXTERNAL_ID}`)
      .auth(API_CLIENT_ID, API_CLIENT_SECRET)
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'RELEASED',
      reservedAmount: '100',
      releaseOperationNumber: '2',
    });
  });

  it('reports an invoice that was never reserved', async () => {
    await request(app.getHttpServer())
      .delete(`/programs/${PROGRAM_CODE}/reservations/UNKNOWN`)
      .auth(API_CLIENT_ID, API_CLIENT_SECRET)
      .expect(404);
  });
});
