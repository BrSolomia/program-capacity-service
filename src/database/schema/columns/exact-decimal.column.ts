import { customType } from 'drizzle-orm/pg-core';

import { ExceptionCode, throwException } from '../../../shared/helpers/assert-object.helpers.js';
import { isString } from '../../../shared/helpers/type-guard.helpers.js';
import {
  assertDecimalFits,
  ExactDecimal,
  ExactDecimalWidth,
} from '../../../shared/primitives/exact-decimal/index.js';

type ExactDecimalColumn = { data: ExactDecimal; driverData: unknown };

/**
 * Builds a column holding an `ExactDecimal` of the given width.
 *
 * Both ends assert the width — `toDriver` so a value is never rounded into the column,
 * `fromDriver` so a value some other path stored unchecked (`NaN` passes every comparison
 * Postgres makes) is reported instead of entering arithmetic.
 *
 * The driver must hand back the raw numeric text. A numeric type parser that returns a JS
 * number would drop digits long before we could notice, so anything but a string is rejected
 * here instead of being quietly accepted.
 */
export function exactDecimalColumn(width: ExactDecimalWidth) {
  return customType<ExactDecimalColumn>({
    dataType() {
      return `numeric(${width.totalDigits}, ${width.scale})`;
    },

    fromDriver(value) {
      if (!isString(value)) {
        const reason = `driver returned ${typeof value} instead of the raw numeric text`;
        throwException(ExceptionCode.InvalidDecimalValue, { reason, value });
      }

      const decimal = new ExactDecimal(value);
      assertDecimalFits(decimal, width);

      return decimal;
    },

    toDriver(value) {
      assertDecimalFits(value, width);

      return value.toFixed();
    },
  });
}
