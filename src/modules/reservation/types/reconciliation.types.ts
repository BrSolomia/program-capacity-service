import { ReconciliationOutcome } from '../../../shared/enums/program.enums.js';
import { ExactDecimal } from '../../../shared/primitives/exact-decimal/index.js';
import type { ReservationWithInvoiceExternalId } from './reservation.repository.types.js';

/** One reservation treasury still holds; the amount is capacity in the program currency. */
export type StatementReservation = {
  invoiceExternalId: string;
  reservedAmount: ExactDecimal;
};

/** Treasury's whole picture of one program, including how far it has read our operations. */
export type TreasuryStatement = {
  programCode: string;
  currencyCode: string;
  creditLimit: ExactDecimal;
  reservations: StatementReservation[];
  appliedThroughOperationNumber: bigint;
  treasuryVersion: bigint;
  asOf: Date;
};

/** Our side of the match, which is what the repository reads back. */
export type LedgerReservation = ReservationWithInvoiceExternalId;

export type ReservedAmountCorrection = {
  reservation: LedgerReservation;
  reservedAmount: ExactDecimal;
};

/** The two sides the match runs between: the statement from treasury, and the program's own rows. */
export type PlanReconciliationInput = {
  statementReservations: StatementReservation[];
  ledgerReservations: LedgerReservation[];
  appliedThroughOperationNumber: bigint;
};

/** Every write a statement implies, decided before anything is written. */
export type ReconciliationPlan = {
  reservationsToCreate: StatementReservation[];
  reservationsToRelease: LedgerReservation[];
  amountsToCorrect: ReservedAmountCorrection[];

  /** Released with a client operation treasury has applied, yet its statement still holds them. */
  breaks: LedgerReservation[];
  /** Sum of what holds capacity once the plan is applied. */
  reservedAmount: ExactDecimal;
};

/** What a statement changed, for the log and for the alarm. */
export type ProgramReconciliation = {
  outcome: ReconciliationOutcome;
  programCode: string;
  creditLimit: ExactDecimal;
  reservedAmount: ExactDecimal;

  /** How far our total was off before the statement was applied. */
  reservedAmountDifference: ExactDecimal;
  createdReservations: number;
  releasedReservations: number;
  correctedReservations: number;
  breaks: number;
  treasuryVersion: bigint;
};

/** Half of a plan: what the statement's own reservations decided. */
export type StatementSidePlan = {
  reservationsToCreate: StatementReservation[];
  amountsToCorrect: ReservedAmountCorrection[];
  breaks: LedgerReservation[];
  reservedAmount: ExactDecimal;
};

/** Half of a plan: what the reservations the statement never mentions decided. */
export type LedgerSidePlan = {
  reservationsToRelease: LedgerReservation[];
  reservedAmount: ExactDecimal;
};
