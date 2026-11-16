/** The error comes first, so a caller cannot reach the value without looking at it. */
type JsonParsed = [error: Error, value: null] | [error: null, value: unknown];

export function safeJsonParse(text: string): JsonParsed {
  try {
    const value: unknown = JSON.parse(text);

    return [null, value];
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));

    return [error, null];
  }
}
