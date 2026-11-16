import { NewProgram, Program, programs } from '../../src/database/schema/index.js';
import { Database } from '../../src/database/database.module.js';
import { ExactDecimal } from '../../src/shared/primitives/exact-decimal/index.js';
import { US_DOLLAR } from './currency.builders.js';

export const PROGRAM_CODE = 'PROGRAM-1';
export const PROGRAM_CREDIT_LIMIT = '1000.00';

export async function insertProgram(
  database: Database,
  values: Partial<NewProgram> = {},
): Promise<Program> {
  const [program] = await database
    .insert(programs)
    .values({
      code: PROGRAM_CODE,
      currencyCode: US_DOLLAR.code,
      creditLimit: new ExactDecimal(PROGRAM_CREDIT_LIMIT),
      lastTreasuryVersion: 1n,
      ...values,
    })
    .returning();

  return program;
}
