import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';

/** Number the program gave the client operation that just changed its reserved amount. */
export type ClientOperation = { operationNumber: bigint };

export type ChangeCapacityInput = {
  programId: string;
  amount: ExactDecimal;
};

/** A limit treasury stated, with the version that stated it, for the row it belongs to. */
export type ChangeCreditLimitInput = {
  programId: string;
  creditLimit: ExactDecimal;
  treasuryVersion: bigint;
};

/** The whole row a statement replaces: the limit, the recomputed total, the version and its time. */
export type ApplyTreasuryStatementInput = {
  programId: string;
  creditLimit: ExactDecimal;
  reservedAmount: ExactDecimal;
  treasuryVersion: bigint;
  reconciledAt: Date;
};
