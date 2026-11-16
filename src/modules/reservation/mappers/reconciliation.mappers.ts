import { Program } from '../../../database/schema/index.js';
import { ReconciliationOutcome } from '../../../shared/enums/program.enums.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import type { ProgramReconciliation, ReconciliationPlan } from '../types/reconciliation.types.js';

const NO_DRIFT = new ExactDecimal(0);

export function toProgramReconciliation(
  outcome: ReconciliationOutcome,
  program: Program,
  plan: ReconciliationPlan,
  previousReservedAmount: ExactDecimal,
): ProgramReconciliation {
  return {
    outcome,
    programCode: program.code,
    creditLimit: program.creditLimit,
    reservedAmount: program.reservedAmount,
    reservedAmountDifference: plan.reservedAmount.minus(previousReservedAmount),
    createdReservations: plan.reservationsToCreate.length,
    releasedReservations: plan.reservationsToRelease.length,
    correctedReservations: plan.amountsToCorrect.length,
    breaks: plan.breaks.length,
    treasuryVersion: program.lastTreasuryVersion,
  };
}

/** A statement treasury has already superseded leaves the program exactly as it stands. */
export function toIgnoredReconciliation(program: Program): ProgramReconciliation {
  return {
    outcome: ReconciliationOutcome.Ignored,
    programCode: program.code,
    creditLimit: program.creditLimit,
    reservedAmount: program.reservedAmount,
    reservedAmountDifference: NO_DRIFT,
    createdReservations: 0,
    releasedReservations: 0,
    correctedReservations: 0,
    breaks: 0,
    treasuryVersion: program.lastTreasuryVersion,
  };
}

/** Decimals and bigints do not survive a log as they are, so the record carries them as text. */
export function toReconciliationLog(
  reconciliation: ProgramReconciliation,
): Record<string, unknown> {
  return {
    ...reconciliation,
    creditLimit: reconciliation.creditLimit.toFixed(),
    reservedAmount: reconciliation.reservedAmount.toFixed(),
    reservedAmountDifference: reconciliation.reservedAmountDifference.toFixed(),
    treasuryVersion: reconciliation.treasuryVersion.toString(),
  };
}
