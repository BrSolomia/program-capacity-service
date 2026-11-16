import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp } from '../../../test/helpers/test-app.helpers.js';
import { SWAGGER_PATH } from '../swagger.setup.js';

describe('OpenAPI document', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  /** The document describes the contract and carries no program data, so no credentials for it. */
  it('is served without credentials', async () => {
    const response = await request(app.getHttpServer()).get(`/${SWAGGER_PATH}-json`).expect(200);

    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining([
        '/programs/{programCode}/capacity',
        '/programs/{programCode}/reservations',
        '/programs/{programCode}/reservations/{invoiceExternalId}',
      ]),
    );
  });

  /** The request schema comes from the same zod object the pipe validates with. */
  it('documents the reserve body the endpoint actually accepts', async () => {
    const response = await request(app.getHttpServer()).get(`/${SWAGGER_PATH}-json`).expect(200);

    const schema =
      response.body.paths['/programs/{programCode}/reservations'].post.requestBody.content[
        'application/json'
      ].schema;

    expect(schema.required).toEqual(['invoiceExternalId', 'amount', 'currencyCode']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.amount.type).toBe('string');
  });

  /** The codes are the enum and the description at once, so a client can generate against them. */
  it('lists exactly the codes a refusal can carry', async () => {
    const response = await request(app.getHttpServer()).get(`/${SWAGGER_PATH}-json`).expect(200);

    const conflict =
      response.body.paths['/programs/{programCode}/reservations'].post.responses['409'];
    const errorCode = conflict.content['application/json'].schema.properties.errorCode;

    expect(errorCode.enum).toEqual([
      'INSUFFICIENT_PROGRAM_CAPACITY',
      'INVOICE_RESERVED_WITH_DIFFERENT_TERMS',
      'INVOICE_ALREADY_RELEASED',
      'RESERVATION_BELONGS_TO_TREASURY',
    ]);
    expect(conflict.description).toBe(errorCode.enum.join(', '));
  });

  it('declares the basic authentication every endpoint requires', async () => {
    const response = await request(app.getHttpServer()).get(`/${SWAGGER_PATH}-json`).expect(200);

    expect(response.body.components.securitySchemes).toMatchObject({ basic: { scheme: 'basic' } });
  });
});
