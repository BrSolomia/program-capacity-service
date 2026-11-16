import { z } from 'zod';

import { DECIMAL_REGEX } from '../regexes/decimal.regex.js';
import { ExactDecimal } from '../primitives/exact-decimal/index.js';

export const AmountSchema = z
  .string()
  .trim()
  .regex(DECIMAL_REGEX)
  .transform((value) => new ExactDecimal(value));
