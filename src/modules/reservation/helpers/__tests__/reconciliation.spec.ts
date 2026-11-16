import { describe, expect, it } from 'vitest';

import { ReconciliationOutcome } from '../../../../shared/enums/program.enums.js';
import { ReservationStatus } from '../../../../shared/enums/reservation.enums.js';
import { ExactDecimal } from '../../../../shared/primitives/exact-decimal/index.js';
import { requiresInvestigation, planReconciliation } from '../reconciliation.helpers.js';
import type {
  ProgramReconciliation,
  StatementReservation,
  LedgerReservation,
} from '../../types/reconciliation.types.js';

const APPLIED_THROUGH = 10n;

function statementReservation(invoiceExternalId: string, amount: string): StatementReservation {
  return { invoiceExternalId, reservedAmount: new ExactDecimal(amount) };
}

function ledgerReservation(
  invoiceExternalId: string,
  amount: string,
  overrides: Partial<LedgerReservation> = {},
): LedgerReservation {
  return {
    id: `reservation-${invoiceExternalId}`,
    invoiceExternalId,
    reservedAmount: new ExactDecimal(amount),
    status: ReservationStatus.Active,
    reserveClientOperationNumber: null,
    releaseClientOperationNumber: null,
    ...overrides,
  };
}

function plan(
  statementReservations: StatementReservation[],
  ledgerReservations: LedgerReservation[] = [],
) {
  return planReconciliation({
    statementReservations,
    ledgerReservations,
    appliedThroughOperationNumber: APPLIED_THROUGH,
  });
}

describe('planning a reconciliation', () => {
  it('leaves a reservation both sides agree on alone', () => {
    const result = plan(
      [statementReservation('INV-1', '100.00')],
      [ledgerReservation('INV-1', '100.00')],
    );

    expect(result.reservationsToCreate).toHaveLength(0);
    expect(result.reservationsToRelease).toHaveLength(0);
    expect(result.amountsToCorrect).toHaveLength(0);
    expect(result.reservedAmount.toFixed()).toBe('100');
  });

  it('takes the amount treasury reports when the two differ', () => {
    const result = plan(
      [statementReservation('INV-1', '120.00')],
      [ledgerReservation('INV-1', '100.00')],
    );

    expect(result.amountsToCorrect).toHaveLength(1);
    expect(result.amountsToCorrect[0].reservedAmount.toFixed()).toBe('120');
    expect(result.reservedAmount.toFixed()).toBe('120');
  });

  it('creates a reservation only treasury holds', () => {
    const result = plan([statementReservation('INV-1', '70.00')]);

    expect(result.reservationsToCreate).toEqual([statementReservation('INV-1', '70.00')]);
    expect(result.reservedAmount.toFixed()).toBe('70');
  });

  it('releases a reservation treasury has read and no longer holds', () => {
    const ledgerReservations = ledgerReservation('INV-1', '100.00', {
      reserveClientOperationNumber: APPLIED_THROUGH,
    });

    const result = plan([], [ledgerReservations]);

    expect(result.reservationsToRelease).toEqual([ledgerReservations]);
    expect(result.reservedAmount.toFixed()).toBe('0');
  });

  it('keeps a reservation treasury has not read yet', () => {
    const ledgerReservations = ledgerReservation('INV-1', '100.00', {
      reserveClientOperationNumber: APPLIED_THROUGH + 1n,
    });

    const result = plan([], [ledgerReservations]);

    expect(result.reservationsToRelease).toHaveLength(0);
    expect(result.reservedAmount.toFixed()).toBe('100');
  });

  it('keeps a release treasury has not read yet released', () => {
    const ledgerReservations = ledgerReservation('INV-1', '100.00', {
      status: ReservationStatus.Released,
      reserveClientOperationNumber: 1n,
      releaseClientOperationNumber: APPLIED_THROUGH + 1n,
    });

    const result = plan([statementReservation('INV-1', '100.00')], [ledgerReservations]);

    expect(result.reservedAmount.toFixed()).toBe('0');
    expect(result.breaks).toHaveLength(0);
    expect(result.amountsToCorrect).toHaveLength(0);
  });

  it('reports a release treasury has read yet still holds, without taking the capacity again', () => {
    const ledgerReservations = ledgerReservation('INV-1', '100.00', {
      status: ReservationStatus.Released,
      reserveClientOperationNumber: 1n,
      releaseClientOperationNumber: APPLIED_THROUGH,
    });

    const result = plan([statementReservation('INV-1', '100.00')], [ledgerReservations]);

    expect(result.breaks).toEqual([ledgerReservations]);
    expect(result.reservedAmount.toFixed()).toBe('0');
  });

  it('releases a reservation treasury created itself and stopped reporting', () => {
    const result = plan([], [ledgerReservation('INV-1', '100.00')]);

    expect(result.reservationsToRelease).toHaveLength(1);
    expect(result.reservedAmount.toFixed()).toBe('0');
  });

  it('adds up everything that holds capacity once the plan is applied', () => {
    const result = plan(
      [
        statementReservation('INV-1', '100.00'),
        statementReservation('INV-2', '20.50'),
        statementReservation('INV-3', '5.00'),
      ],
      [
        ledgerReservation('INV-1', '100.00'),
        ledgerReservation('INV-2', '10.00'),
        ledgerReservation('INV-4', '7.00', { reserveClientOperationNumber: APPLIED_THROUGH + 1n }),
        ledgerReservation('INV-5', '3.00', { reserveClientOperationNumber: APPLIED_THROUGH }),
      ],
    );

    expect(result.reservationsToCreate).toHaveLength(1);
    expect(result.amountsToCorrect).toHaveLength(1);
    expect(result.reservationsToRelease).toHaveLength(1);
    expect(result.reservedAmount.toFixed()).toBe('132.5');
  });
});

function reconciliation(overrides: Partial<ProgramReconciliation> = {}): ProgramReconciliation {
  return {
    outcome: ReconciliationOutcome.Applied,
    programCode: 'PRG-1',
    creditLimit: new ExactDecimal('1000.00'),
    reservedAmount: new ExactDecimal('500.00'),
    reservedAmountDifference: new ExactDecimal('0'),
    createdReservations: 0,
    releasedReservations: 0,
    correctedReservations: 0,
    breaks: 0,
    treasuryVersion: 1n,
    ...overrides,
  };
}

describe('alarming on a reconciliation', () => {
  it('stays quiet when the statement changed nothing', () => {
    expect(requiresInvestigation(reconciliation())).toBe(false);
  });

  /** No threshold lives here: a correction of any size means the two sides had disagreed. */
  it('alarms on the smallest correction', () => {
    expect(
      requiresInvestigation(
        reconciliation({ reservedAmountDifference: new ExactDecimal('0.0001') }),
      ),
    ).toBe(true);
  });

  it('alarms on a correction in either direction', () => {
    expect(
      requiresInvestigation(
        reconciliation({ reservedAmountDifference: new ExactDecimal('-50.00') }),
      ),
    ).toBe(true);
  });

  it('stays quiet on a program the statement created, whatever it holds', () => {
    expect(
      requiresInvestigation(
        reconciliation({
          outcome: ReconciliationOutcome.Created,
          reservedAmountDifference: new ExactDecimal('300.00'),
        }),
      ),
    ).toBe(false);
  });

  it('alarms when treasury still holds a release it has applied', () => {
    expect(requiresInvestigation(reconciliation({ breaks: 1 }))).toBe(true);
  });
});
