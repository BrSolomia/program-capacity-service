import { ReconciliationOutcome } from '../../../shared/enums/program.enums.js';
import { ReservationStatus } from '../../../shared/enums/reservation.enums.js';
import { ExactDecimal, sumDecimals } from '../../../shared/primitives/exact-decimal/index.js';
import type {
  LedgerReservation,
  LedgerSidePlan,
  PlanReconciliationInput,
  ProgramReconciliation,
  ReconciliationPlan,
  ReservedAmountCorrection,
  StatementReservation,
  StatementSidePlan,
} from '../types/reconciliation.types.js';

/** Decides every write a statement implies, and the total that follows, before anything is written. */
export function planReconciliation(input: PlanReconciliationInput): ReconciliationPlan {
  const statementSide = planStatementSide(input);
  const ledgerSide = planLedgerSide(input);

  return {
    reservationsToCreate: statementSide.reservationsToCreate,
    amountsToCorrect: statementSide.amountsToCorrect,
    breaks: statementSide.breaks,
    reservationsToRelease: ledgerSide.reservationsToRelease,
    reservedAmount: statementSide.reservedAmount.plus(ledgerSide.reservedAmount),
  };
}

/** No threshold: which disagreement matters is a call for whoever reads the logs. */
export function requiresInvestigation(reconciliation: ProgramReconciliation): boolean {
  const { outcome, reservedAmountDifference, breaks } = reconciliation;

  // A program the statement just created had no ledger to disagree with.
  if (outcome === ReconciliationOutcome.Created) {
    return false;
  }

  return breaks > 0 || !reservedAmountDifference.isZero();
}

/** One decision per reservation the statement reports. */
function planStatementSide(input: PlanReconciliationInput): StatementSidePlan {
  const { statementReservations, ledgerReservations, appliedThroughOperationNumber } = input;

  const ledgerReservationByInvoiceExternalId = new Map(
    ledgerReservations.map((reservation) => [reservation.invoiceExternalId, reservation]),
  );

  const reservationsToCreate: StatementReservation[] = [];
  const amountsToCorrect: ReservedAmountCorrection[] = [];
  const breaks: LedgerReservation[] = [];
  const heldAmounts: ExactDecimal[] = [];

  for (const statementReservation of statementReservations) {
    const ledgerReservation = ledgerReservationByInvoiceExternalId.get(
      statementReservation.invoiceExternalId,
    );

    if (!ledgerReservation) {
      reservationsToCreate.push(statementReservation);
      heldAmounts.push(statementReservation.reservedAmount);
      continue;
    }

    const isReleasedInLedger = ledgerReservation.status === ReservationStatus.Released;
    const isReleaseInTransit =
      isReleasedInLedger &&
      !isAppliedByTreasury(
        ledgerReservation.releaseClientOperationNumber,
        appliedThroughOperationNumber,
      );

    // Timing difference: the statement was cut before our release reached treasury.
    if (isReleaseInTransit) {
      continue;
    }

    // A break: treasury applied the release, yet its statement still holds the capacity. It is not
    // taken again on treasury's word, because a release carries a client operation number.
    if (isReleasedInLedger) {
      breaks.push(ledgerReservation);
      continue;
    }

    const holdsAnotherAmount = !ledgerReservation.reservedAmount.equals(
      statementReservation.reservedAmount,
    );

    if (holdsAnotherAmount) {
      amountsToCorrect.push({
        reservation: ledgerReservation,
        reservedAmount: statementReservation.reservedAmount,
      });
    }

    heldAmounts.push(statementReservation.reservedAmount);
  }

  return {
    reservationsToCreate,
    amountsToCorrect,
    breaks,
    reservedAmount: sumDecimals(heldAmounts),
  };
}

/** What to do with capacity the statement never mentions. */
function planLedgerSide(input: PlanReconciliationInput): LedgerSidePlan {
  const { statementReservations, ledgerReservations, appliedThroughOperationNumber } = input;

  const statementInvoiceExternalIds = new Set(
    statementReservations.map((reservation) => reservation.invoiceExternalId),
  );

  const reservationsToRelease: LedgerReservation[] = [];
  const heldAmounts: ExactDecimal[] = [];

  for (const ledgerReservation of ledgerReservations) {
    const holdsNoCapacity = ledgerReservation.status !== ReservationStatus.Active;
    const isInStatement = statementInvoiceExternalIds.has(ledgerReservation.invoiceExternalId);

    if (holdsNoCapacity || isInStatement) {
      continue;
    }

    const isReserveInTransit = !isAppliedByTreasury(
      ledgerReservation.reserveClientOperationNumber,
      appliedThroughOperationNumber,
    );

    // Timing difference: the statement was cut before this reservation reached treasury.
    if (isReserveInTransit) {
      heldAmounts.push(ledgerReservation.reservedAmount);
      continue;
    }

    reservationsToRelease.push(ledgerReservation);
  }

  return { reservationsToRelease, reservedAmount: sumDecimals(heldAmounts) };
}

/** Applied once the statement's cut-off reaches it; treasury's own entries carry no number. */
function isAppliedByTreasury(
  clientOperationNumber: bigint | null,
  appliedThroughOperationNumber: bigint,
): boolean {
  return clientOperationNumber === null || clientOperationNumber <= appliedThroughOperationNumber;
}
