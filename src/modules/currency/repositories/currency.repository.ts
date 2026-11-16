import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Database, DatabaseExecutor } from '../../../database/database.module.js';
import { currencies, Currency } from '../../../database/schema/index.js';
import { DATABASE } from '../../../database/database.constants.js';

@Injectable()
export class CurrencyRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  public async findByCode(
    code: string,
    executor: DatabaseExecutor = this.database,
  ): Promise<Currency | undefined> {
    const [currency] = await executor
      .select()
      .from(currencies)
      .where(eq(currencies.code, code))
      .limit(1);

    return currency;
  }
}
