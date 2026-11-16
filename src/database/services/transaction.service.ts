import { Inject, Injectable } from '@nestjs/common';

import { DATABASE } from '../database.constants.js';
import type { Database, DatabaseExecutor } from '../database.module.js';

@Injectable()
export class TransactionService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * Runs the work in one transaction. Every query inside has to go through the executor it hands
   * over, or it runs on another connection and outside the transaction.
   */
  public run<T>(work: (executor: DatabaseExecutor) => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }
}
