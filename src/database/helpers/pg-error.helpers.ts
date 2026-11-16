import { isObject } from '../../shared/helpers/type-guard.helpers.js';

const UNIQUE_VIOLATION = '23505';

/**
 * Whether the error is Postgres rejecting a duplicate on the named constraint. Drizzle wraps
 * driver errors, so the constraint has to be looked for along the whole cause chain.
 */
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  let current: unknown = error;

  while (isObject(current)) {
    if (current.code === UNIQUE_VIOLATION && current.constraint === constraintName) {
      return true;
    }

    current = current.cause;
  }

  return false;
}
