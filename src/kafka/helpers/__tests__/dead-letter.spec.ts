import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { UNKNOWN_ERROR_CODE } from '../../kafka.constants.js';
import type { IncomingMessage } from '../../types/kafka.types.js';
import { isUnprocessableMessage, toDeadLetter } from '../dead-letter.helpers.js';

const message: IncomingMessage = {
  topic: 'treasury.program-credit-limit.v1',
  partition: 0,
  offset: '12',
  key: 'PRG-001',
  value: '{ "creditLimit": "100.00" }',
};

describe('isUnprocessableMessage', () => {
  it('parks what the message itself got wrong', () => {
    expect(isUnprocessableMessage(new BadRequestException())).toBe(true);
    expect(isUnprocessableMessage(new ConflictException())).toBe(true);
  });

  /** Our own failure, and the message may well succeed once we are working again. */
  it('redelivers what we got wrong', () => {
    expect(isUnprocessableMessage(new Error('connection terminated unexpectedly'))).toBe(false);
  });
});

describe('toDeadLetter', () => {
  it('names the code that refused the message and where it was read', () => {
    const deadLetter = toDeadLetter(
      message,
      new ConflictException({ errorCode: ExceptionCode.ProgramCurrencyChanged }),
    );

    expect(deadLetter).toMatchObject({
      errorCode: ExceptionCode.ProgramCurrencyChanged,
      topic: message.topic,
      partition: 0,
      offset: '12',
      payload: message.value,
    });
  });

  it('carries what the refusal said beyond its code, without repeating the code', () => {
    const deadLetter = toDeadLetter(
      message,
      new ConflictException({
        errorCode: ExceptionCode.ProgramCurrencyChanged,
        programCode: 'PRG-001',
        currencyCode: 'USD',
        messageCurrencyCode: 'EUR',
      }),
    );

    expect(deadLetter.details).toEqual({
      programCode: 'PRG-001',
      currencyCode: 'USD',
      messageCurrencyCode: 'EUR',
    });
  });

  it('names a code that is not one of ours as unknown', () => {
    const deadLetter = toDeadLetter(message, new BadRequestException({ errorCode: 'NOT_OURS' }));

    expect(deadLetter.errorCode).toBe(UNKNOWN_ERROR_CODE);
  });

  /** Reachable: any exception raised by the framework rather than by `throwException`. */
  it('names an exception that carries no code of ours as unknown', () => {
    const deadLetter = toDeadLetter(message, new BadRequestException('plain message'));

    expect(deadLetter.errorCode).toBe(UNKNOWN_ERROR_CODE);
    expect(deadLetter.details).toEqual({
      statusCode: 400,
      message: 'plain message',
      error: 'Bad Request',
    });
  });
});
