import { TreasuryOperationType } from '../../../shared/enums/treasury.enums.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';

export type TreasuryOperation = {
  type: TreasuryOperationType;
  programId: string;
  programCode: string;
  operationNumber: bigint;
  reservationId: string;
  amount: ExactDecimal;
};
