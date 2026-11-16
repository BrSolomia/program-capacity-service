import { HttpException } from '@nestjs/common';

import { isObject } from '../../src/shared/helpers/type-guard.helpers.js';

function payloadOf(error: unknown): Record<string, unknown> {
  if (error instanceof HttpException) {
    const response = error.getResponse();

    if (isObject(response)) {
      return { ...response };
    }
  }

  return {};
}

/** Payload of the exception a call threw, or an empty object if it threw nothing. */
export function thrownPayload(act: () => unknown): Record<string, unknown> {
  try {
    act();
  } catch (error) {
    return payloadOf(error);
  }

  return {};
}

/** Payload of the exception a call rejected with, or an empty object if it resolved. */
export async function rejectedPayload(
  act: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  try {
    await act();
  } catch (error) {
    return payloadOf(error);
  }

  return {};
}
