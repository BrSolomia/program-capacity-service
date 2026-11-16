import { HttpException, HttpStatus } from '@nestjs/common';

import { isObject } from '../../shared/helpers/type-guard.helpers.js';
import { UNKNOWN_ERROR_CODE } from '../kafka.constants.js';
import type { DeadLetter, IncomingMessage } from '../types/kafka.types.js';
import {
  ERROR_CODE_FIELD,
  ExceptionCode,
  isExceptionCode,
} from '../../shared/helpers/assert-object.helpers.js';

/** A 4xx says the message is wrong on every redelivery, so park it; anything else is on us. */
export function isUnprocessableMessage(error: unknown): error is HttpException {
  return error instanceof HttpException && error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR;
}

export function toDeadLetter(message: IncomingMessage, error: HttpException): DeadLetter {
  return {
    errorCode: errorCodeOf(error),
    details: detailsOf(error),
    failedAt: new Date().toISOString(),
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    payload: message.value,
  };
}

function errorCodeOf(error: HttpException): ExceptionCode | typeof UNKNOWN_ERROR_CODE {
  const payload = error.getResponse();

  if (isObject(payload) && isExceptionCode(payload.errorCode)) {
    return payload.errorCode;
  }

  return UNKNOWN_ERROR_CODE;
}

function detailsOf(error: HttpException): Record<string, unknown> {
  const payload = error.getResponse();

  if (!isObject(payload)) {
    return { message: payload };
  }

  // The code is a field of its own, so it is not repeated inside the details.
  return Object.fromEntries(
    Object.entries(payload).filter(([field]) => field !== ERROR_CODE_FIELD),
  );
}
