const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 50;

/**
 * Waits for something a consumer does in the background. Polling, not a fixed sleep: the test
 * then passes as soon as the effect is there and still fails loudly when it never arrives.
 */
export async function waitUntil<T>(
  read: () => Promise<T | undefined>,
  description: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();

    if (value !== undefined) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`timed out after ${timeoutMs}ms waiting for ${description}`);
}
