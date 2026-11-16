import { Injectable } from '@nestjs/common';

import { TransactionService } from '../../../database/services/transaction.service.js';
import type { DatabaseExecutor } from '../../../database/database.module.js';
import { Program } from '../../../database/schema/index.js';
import { CreditLimitOutcome } from '../../../shared/enums/program.enums.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { CurrencyService } from '../../currency/index.js';
import {
  assertCreditLimitIsApplicable,
  assertProgramCurrencyUnchanged,
} from '../helpers/assert-program.helpers.js';
import { toAppliedCreditLimit } from '../mappers/program.mappers.js';
import { ProgramRepository } from '../repositories/program.repository.js';
import type {
  ApplyTreasuryStatementInput,
  ChangeCapacityInput,
  ClientOperation,
} from '../types/program.repository.types.js';
import type {
  ProgramCapacity,
  AppliedCreditLimit,
  ApplyCreditLimitInput,
} from '../types/program.types.js';

@Injectable()
export class ProgramService {
  constructor(
    private readonly programs: ProgramRepository,
    private readonly currencies: CurrencyService,
    private readonly transactions: TransactionService,
  ) {}

  public async findByCodeOrThrow(
    programCode: string,
    executor?: DatabaseExecutor,
  ): Promise<Program> {
    const program = await this.programs.findByCode(programCode, executor);
    assertValue(program, ExceptionCode.ProgramNotFound, { programCode });

    return program;
  }

  /** What a client may still reserve, and how fresh the limit behind it is. */
  public async getCapacity(programCode: string): Promise<ProgramCapacity> {
    const program = await this.findByCodeOrThrow(programCode);

    return {
      programCode: program.code,
      currencyCode: program.currencyCode,
      creditLimit: program.creditLimit,
      reservedAmount: program.reservedAmount,
      availableAmount: program.creditLimit.minus(program.reservedAmount),
      lastTreasuryReconciledAt: program.lastTreasuryReconciledAt,
    };
  }

  /** Applies a limit treasury passed. */
  public applyCreditLimit(input: ApplyCreditLimitInput): Promise<AppliedCreditLimit> {
    return this.transactions.run(async (executor) => {
      const program = await this.programs.findByCodeForUpdate(input.programCode, executor);
      if (!program) {
        const createdProgram = await this.createProgram(input, executor);

        return toAppliedCreditLimit(CreditLimitOutcome.Created, createdProgram, null);
      }

      const isAlreadyApplied = input.treasuryVersion <= program.lastTreasuryVersion;
      if (isAlreadyApplied) {
        return toAppliedCreditLimit(CreditLimitOutcome.Ignored, program, program.creditLimit);
      }

      assertProgramCurrencyUnchanged(program, input.currencyCode);

      const currency = await this.currencies.findByCodeOrThrow(input.currencyCode, executor);
      assertCreditLimitIsApplicable(input.creditLimit, currency);

      const updated = await this.programs.applyCreditLimit(
        {
          programId: program.id,
          creditLimit: input.creditLimit,
          treasuryVersion: input.treasuryVersion,
        },
        executor,
      );

      return toAppliedCreditLimit(CreditLimitOutcome.Applied, updated, program.creditLimit);
    });
  }

  /**
   * Checks the limit and takes the operation number atomically. Resolves to `undefined` when the
   * program no longer has room, which is the caller's signal to refuse the whole operation.
   */
  public holdCapacity(
    input: ChangeCapacityInput,
    executor: DatabaseExecutor,
  ): Promise<ClientOperation | undefined> {
    return this.programs.holdCapacity(input, executor);
  }

  /** Gives capacity back; the caller owns the amount, which has to be the one that was held. */
  public releaseCapacity(
    input: ChangeCapacityInput,
    executor: DatabaseExecutor,
  ): Promise<ClientOperation> {
    return this.programs.releaseCapacity(input, executor);
  }

  /** Locks the row for the rest of the transaction, so two treasury messages cannot interleave. */
  public findByCodeForUpdate(
    programCode: string,
    executor: DatabaseExecutor,
  ): Promise<Program | undefined> {
    return this.programs.findByCodeForUpdate(programCode, executor);
  }

  /** A program exists only because treasury described one, so its limit is checked on the way in. */
  public async createProgram(
    input: ApplyCreditLimitInput,
    executor: DatabaseExecutor,
  ): Promise<Program> {
    const currency = await this.currencies.findByCodeOrThrow(input.currencyCode, executor);
    assertCreditLimitIsApplicable(input.creditLimit, currency);

    return this.programs.createProgram(input, executor);
  }

  /** Writes what a reconciliation statement settled: the limit, the total, the version and its time. */
  public applyTreasuryStatement(
    input: ApplyTreasuryStatementInput,
    executor: DatabaseExecutor,
  ): Promise<Program> {
    return this.programs.applyTreasuryStatement(input, executor);
  }
}
