import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DATABASE } from '../../../database/database.constants.js';
import type { Database, DatabaseExecutor } from '../../../database/database.module.js';
import { assertAmountFits } from '../../../database/schema/columns/index.js';
import { Program, programs } from '../../../database/schema/index.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import type {
  ApplyTreasuryStatementInput,
  ChangeCreditLimitInput,
  ChangeCapacityInput,
  ClientOperation,
} from '../types/program.repository.types.js';
import type { ApplyCreditLimitInput } from '../types/program.types.js';

@Injectable()
export class ProgramRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  public async findByCode(
    code: string,
    executor: DatabaseExecutor = this.database,
  ): Promise<Program | undefined> {
    const [program] = await executor
      .select()
      .from(programs)
      .where(eq(programs.code, code))
      .limit(1);

    return program;
  }

  /** Locks the row, so a limit change and a reservation cannot read the same state at once. */
  public async findByCodeForUpdate(
    code: string,
    executor: DatabaseExecutor,
  ): Promise<Program | undefined> {
    const [program] = await executor
      .select()
      .from(programs)
      .where(eq(programs.code, code))
      .for('update')
      .limit(1);

    return program;
  }

  /**
   * A concurrent insert of the same code raises the unique violation rather than being swallowed:
   * the message is then redelivered and finds the row.
   */
  public async createProgram(
    { programCode, currencyCode, creditLimit, treasuryVersion }: ApplyCreditLimitInput,
    executor: DatabaseExecutor,
  ): Promise<Program> {
    const [program] = await executor
      .insert(programs)
      .values({
        code: programCode,
        currencyCode,
        creditLimit,
        lastTreasuryVersion: treasuryVersion,
      })
      .returning();

    assertValue(program, ExceptionCode.Unreachable);

    return program;
  }

  /** Leaves `reservedAmount` alone: a limit change neither holds nor releases capacity. */
  public async applyCreditLimit(
    { programId, creditLimit, treasuryVersion }: ChangeCreditLimitInput,
    executor: DatabaseExecutor,
  ): Promise<Program> {
    const [program] = await executor
      .update(programs)
      .set({ creditLimit, lastTreasuryVersion: treasuryVersion })
      .where(eq(programs.id, programId))
      .returning();

    assertValue(program, ExceptionCode.Unreachable);

    return program;
  }

  /** The total comes from the reservations the statement leaves active, so it is set, not adjusted. */
  public async applyTreasuryStatement(
    input: ApplyTreasuryStatementInput,
    executor: DatabaseExecutor,
  ): Promise<Program> {
    const { programId, creditLimit, reservedAmount, treasuryVersion, reconciledAt } = input;

    const [program] = await executor
      .update(programs)
      .set({
        creditLimit,
        reservedAmount,
        lastTreasuryVersion: treasuryVersion,
        lastTreasuryReconciledAt: reconciledAt,
      })
      .where(eq(programs.id, programId))
      .returning();

    assertValue(program, ExceptionCode.Unreachable);

    return program;
  }

  /**
   * Takes capacity and the next operation number in one statement, so two concurrent callers
   * cannot both pass the check: the second waits on the row and then sees the updated amount.
   * Resolves to `undefined` when the program no longer has room for the amount.
   */
  public async holdCapacity(
    { programId, amount }: ChangeCapacityInput,
    executor: DatabaseExecutor,
  ): Promise<ClientOperation | undefined> {
    // The amount goes in as SQL below, so the column's own width check never sees it: Postgres
    // would coerce a surplus fraction into the column's scale in silence, and on this path
    // nothing else would catch it.
    assertAmountFits(amount);

    const held = amount.toFixed();

    const reservedAmountAfterHold = sql`${programs.reservedAmount} + ${held}::numeric`;
    const nextOperationNumber = sql`${programs.lastClientOperationNumber} + 1`;
    const hasRoomForAmount = sql`${programs.creditLimit} - ${programs.reservedAmount} >= ${held}::numeric`;

    const [operation] = await executor
      .update(programs)
      .set({
        reservedAmount: reservedAmountAfterHold,
        lastClientOperationNumber: nextOperationNumber,
      })
      .where(and(eq(programs.id, programId), hasRoomForAmount))
      .returning({ operationNumber: programs.lastClientOperationNumber });

    return operation;
  }

  /** Gives capacity back and takes the next operation number; the caller owns the amount. */
  public async releaseCapacity(
    { programId, amount }: ChangeCapacityInput,
    executor: DatabaseExecutor,
  ): Promise<ClientOperation> {
    // The amount goes in as SQL below, so the column's own width check never sees it: Postgres
    // would coerce a surplus fraction into the column's scale in silence, and on this path
    // nothing else would catch it.
    assertAmountFits(amount);

    const reservedAmountAfterRelease = sql`${programs.reservedAmount} - ${amount.toFixed()}::numeric`;
    const nextOperationNumber = sql`${programs.lastClientOperationNumber} + 1`;

    const [operation] = await executor
      .update(programs)
      .set({
        reservedAmount: reservedAmountAfterRelease,
        lastClientOperationNumber: nextOperationNumber,
      })
      .where(eq(programs.id, programId))
      .returning({ operationNumber: programs.lastClientOperationNumber });

    assertValue(operation, ExceptionCode.Unreachable);

    return operation;
  }
}
