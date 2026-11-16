export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Narrows to a keyed object, excluding `null`, which `typeof` reports as an object too. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
