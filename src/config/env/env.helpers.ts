import { ENV_LIST_SEPARATOR } from './env.constants.js';

/** Entries of a list-valued variable, with blanks and spacing around separators tolerated. */
export function splitEnvList(value: string): string[] {
  return value
    .split(ENV_LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
