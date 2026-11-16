import {
  CurrencyCodeSchema,
  InvoiceExternalIdSchema,
  ProgramCodeSchema,
} from '../../src/shared/schemas/identifier.schemas.js';
import type {
  CurrencyCode,
  InvoiceExternalId,
  ProgramCode,
} from '../../src/shared/schemas/identifier.schemas.js';

/** Mints the branded codes the domain takes, the same way the HTTP boundary does. */
export function programCode(value: string): ProgramCode {
  return ProgramCodeSchema.parse(value);
}

export function invoiceExternalId(value: string): InvoiceExternalId {
  return InvoiceExternalIdSchema.parse(value);
}

export function currencyCode(value: string): CurrencyCode {
  return CurrencyCodeSchema.parse(value);
}
