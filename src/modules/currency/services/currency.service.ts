import { Injectable } from '@nestjs/common';

import type { DatabaseExecutor } from '../../../database/database.module.js';
import { Currency } from '../../../database/schema/index.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { CurrencyRepository } from '../repositories/currency.repository.js';

@Injectable()
export class CurrencyService {
  constructor(private readonly currencies: CurrencyRepository) {}

  public async findByCodeOrThrow(code: string, executor?: DatabaseExecutor): Promise<Currency> {
    const currency = await this.currencies.findByCode(code, executor);
    assertValue(currency, ExceptionCode.CurrencyNotFound, { currencyCode: code });

    return currency;
  }
}
