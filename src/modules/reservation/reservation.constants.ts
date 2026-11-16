import { ExactDecimal } from '../../shared/primitives/exact-decimal/index.js';

/** Treasury reports capacity in the program currency, so a reconciled invoice needs no rate. */
export const STATEMENT_FX_RATE = new ExactDecimal(1);
