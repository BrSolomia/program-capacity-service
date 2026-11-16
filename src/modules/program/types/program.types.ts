import { Currency, Program } from '../../../database/schema/index.js';
import { CreditLimitOutcome } from '../../../shared/enums/program.enums.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';

export type ProgramCapacity = {
  programCode: string;
  currencyCode: string;
  creditLimit: ExactDecimal;
  reservedAmount: ExactDecimal;

  /** Negative when treasury lowered the limit below what is already reserved. */
  availableAmount: ExactDecimal;
  lastTreasuryReconciledAt: Date | null;
};

/** What the currency check reads off the program it is comparing a message against. */
export type ProgramCurrency = Pick<Program, 'code' | 'currencyCode'>;

/** What the limit check reads off the currency the limit is denominated in. */
export type CreditLimitCurrency = Pick<Currency, 'code' | 'minorUnits'>;

/** A limit as treasury states it: absolute, and numbered by the version that states it. */
export type ApplyCreditLimitInput = {
  programCode: string;
  currencyCode: string;
  creditLimit: ExactDecimal;
  treasuryVersion: bigint;
};

/** The limit in force after a treasury message; on `Ignored` both limits are the stored one. */
export type AppliedCreditLimit = {
  outcome: CreditLimitOutcome;
  programCode: string;
  currencyCode: string;
  previousCreditLimit: ExactDecimal | null;
  creditLimit: ExactDecimal;
  treasuryVersion: bigint;
};
