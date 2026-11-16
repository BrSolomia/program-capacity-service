import { NewInvoice } from '../../../database/schema/index.js';

export type NewInvoiceValues = Pick<
  NewInvoice,
  'programId' | 'externalId' | 'amount' | 'currencyCode'
>;

export type FindInvoiceInput = {
  programId: string;
  externalId: string;
};
