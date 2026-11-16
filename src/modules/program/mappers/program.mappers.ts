import { Program } from '../../../database/schema/index.js';
import { CreditLimitOutcome } from '../../../shared/enums/program.enums.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import type { ProgramCapacityResponse } from '../schemas/program.response.js';
import type { AppliedCreditLimit, ProgramCapacity } from '../types/program.types.js';

export function toProgramCapacityResponse(capacity: ProgramCapacity): ProgramCapacityResponse {
  return {
    programCode: capacity.programCode,
    currencyCode: capacity.currencyCode,
    creditLimit: capacity.creditLimit.toFixed(),
    reservedAmount: capacity.reservedAmount.toFixed(),
    availableAmount: capacity.availableAmount.toFixed(),
    lastTreasuryReconciledAt: capacity.lastTreasuryReconciledAt?.toISOString() ?? null,
  };
}

export function toAppliedCreditLimit(
  outcome: CreditLimitOutcome,
  program: Program,
  previousCreditLimit: ExactDecimal | null,
): AppliedCreditLimit {
  return {
    outcome,
    programCode: program.code,
    currencyCode: program.currencyCode,
    previousCreditLimit,
    creditLimit: program.creditLimit,
    treasuryVersion: program.lastTreasuryVersion,
  };
}
