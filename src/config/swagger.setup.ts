import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

/** Served without authentication: the document is the contract, it carries no program data. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Program Capacity & Invoice Reservation')
    .setDescription('Reserves and releases program capacity for client invoices.')
    .setVersion('0.0.1')
    .addBasicAuth()
    .build();

  SwaggerModule.setup(SWAGGER_PATH, app, SwaggerModule.createDocument(app, config));
}
