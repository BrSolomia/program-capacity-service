import { Injectable } from '@nestjs/common';

import type { DatabaseExecutor } from '../../../database/database.module.js';
import { Program } from '../../../database/schema/index.js';
import { TransactionService } from '../../../database/services/transaction.service.js';
import { ReconciliationOutcome } from '../../../shared/enums/program.enums.js';
import { CurrencyService } from '../../currency/index.js';
import { InvoiceService } from '../../invoice/index.js';
import {
  assertCreditLimitIsApplicable,
  assertProgramCurrencyUnchanged,
  assertReservedAmountIsStorable,
  ProgramService,
} from '../../program/index.js';
import { assertStatementAmountsAreApplicable } from '../helpers/assert-invoice.helpers.js';
import { planReconciliation } from '../helpers/reconciliation.helpers.js';
import {
  toIgnoredReconciliation,
  toProgramReconciliation,
} from '../mappers/reconciliation.mappers.js';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import type {
  ProgramReconciliation,
  StatementReservation,
  TreasuryStatement,
  ReconciliationPlan,
} from '../types/reconciliation.types.js';

@Injectable()
export class ReconcileProgramService {
  constructor(
    private readonly transactions: TransactionService,
    private readonly programs: ProgramService,
    private readonly invoices: InvoiceService,
    private readonly reservations: ReservationRepository,
    private readonly currencies: CurrencyService,
  ) {}

  /**
   * Replays treasury's whole picture of one program onto ours.
   */
  public reconcile(statement: TreasuryStatement): Promise<ProgramReconciliation> {
    return this.transactions.run(async (executor) => {
      const program = await this.programs.findByCodeForUpdate(statement.programCode, executor);
      if (!program) {
        const created = await this.programs.createProgram(statement, executor);
        return this.applyToProgram(ReconciliationOutcome.Created, created, statement, executor);
      }

      const isAlreadyApplied = statement.treasuryVersion <= program.lastTreasuryVersion;
      if (isAlreadyApplied) {
        return toIgnoredReconciliation(program);
      }

      assertProgramCurrencyUnchanged(program, statement.currencyCode);

      const currency = await this.currencies.findByCodeOrThrow(statement.currencyCode, executor);
      assertCreditLimitIsApplicable(statement.creditLimit, currency);

      return this.applyToProgram(ReconciliationOutcome.Applied, program, statement, executor);
    });
  }

  private async applyToProgram(
    outcome: ReconciliationOutcome,
    program: Program,
    statement: TreasuryStatement,
    executor: DatabaseExecutor,
  ): Promise<ProgramReconciliation> {
    const currency = await this.currencies.findByCodeOrThrow(program.currencyCode, executor);
    assertStatementAmountsAreApplicable(statement.reservations, currency);

    const statementInvoiceExternalIds = statement.reservations.map(
      (reservation) => reservation.invoiceExternalId,
    );

    const ledgerReservations = await this.reservations.findActiveByInvoiceExternalIds(
      { programId: program.id, invoiceExternalIds: statementInvoiceExternalIds },
      executor,
    );

    const plan = planReconciliation({
      appliedThroughOperationNumber: statement.appliedThroughOperationNumber,
      statementReservations: statement.reservations,
      ledgerReservations,
    });

    assertReservedAmountIsStorable(plan.reservedAmount);

    await this.applyPlan(program, plan, executor);

    const reconciledProgram = await this.programs.applyTreasuryStatement(
      {
        programId: program.id,
        creditLimit: statement.creditLimit,
        reservedAmount: plan.reservedAmount,
        treasuryVersion: statement.treasuryVersion,
        reconciledAt: statement.asOf,
      },
      executor,
    );

    return toProgramReconciliation(outcome, reconciledProgram, plan, program.reservedAmount);
  }

  private async applyPlan(
    program: Program,
    plan: ReconciliationPlan,
    executor: DatabaseExecutor,
  ): Promise<void> {
    for (const reserved of plan.reservationsToCreate) {
      await this.createReservation(program, reserved, executor);
    }

    for (const reservation of plan.reservationsToRelease) {
      await this.reservations.releaseByTreasury(reservation.id, executor);
    }

    for (const correction of plan.amountsToCorrect) {
      await this.reservations.changeReservedAmount(
        { reservationId: correction.reservation.id, reservedAmount: correction.reservedAmount },
        executor,
      );
    }
  }

  private async createReservation(
    program: Program,
    reserved: StatementReservation,
    executor: DatabaseExecutor,
  ): Promise<void> {
    const invoice = await this.invoices.create(
      {
        programId: program.id,
        externalId: reserved.invoiceExternalId,
        amount: reserved.reservedAmount,
        currencyCode: program.currencyCode,
      },
      executor,
    );

    await this.reservations.insertByTreasury(
      { programId: program.id, invoiceId: invoice.id, reservedAmount: reserved.reservedAmount },
      executor,
    );
  }
}
