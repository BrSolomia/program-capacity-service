import { z } from 'zod';

import {
  INVOICE_EXTERNAL_ID_MAX_LENGTH,
  PROGRAM_CODE_MAX_LENGTH,
} from '../constants/identifier.constants.js';
import { CURRENCY_CODE_REGEX } from '../regexes/currency.regex.js';

/**
 *  Branded, so one identifier cannot stand in for another.
 */
export const ProgramCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(PROGRAM_CODE_MAX_LENGTH)
  .brand<'ProgramCode'>();
export type ProgramCode = z.infer<typeof ProgramCodeSchema>;

export const InvoiceExternalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(INVOICE_EXTERNAL_ID_MAX_LENGTH)
  .brand<'InvoiceExternalId'>();
export type InvoiceExternalId = z.infer<typeof InvoiceExternalIdSchema>;

export const CurrencyCodeSchema = z
  .string()
  .trim()
  .regex(CURRENCY_CODE_REGEX)
  .brand<'CurrencyCode'>();
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
