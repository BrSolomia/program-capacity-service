import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { ExpressAdapter } from '@nestjs/platform-express';
import { describe, expect, it, vi } from 'vitest';

import { ExceptionCode, toException } from '../../helpers/assert-object.helpers.js';
import { ExceptionsFilter } from '../exceptions.filter.js';

/** Runs the filter and returns what it replied with. */
function reply(exception: unknown): { body: unknown; status: number } {
  const adapter = new ExpressAdapter();
  const replyWith = vi.spyOn(adapter, 'reply').mockImplementation(() => undefined);
  const adapterHost = new HttpAdapterHost();
  adapterHost.httpAdapter = adapter;

  const request = { method: 'GET', originalUrl: '/programs', url: '/programs' };
  new ExceptionsFilter(adapterHost).catch(exception, new ExecutionContextHost([request, {}]));

  const [, body, status] = replyWith.mock.calls[0];

  return { body, status: Number(status) };
}

describe('ExceptionsFilter', () => {
  it('answers our refusal with its code and what it carries', () => {
    expect(reply(toException(ExceptionCode.ProgramNotFound, { programCode: 'P-1' }))).toEqual({
      status: 404,
      body: { errorCode: ExceptionCode.ProgramNotFound, details: { programCode: 'P-1' } },
    });
  });

  it('leaves details out when the refusal carries nothing else', () => {
    expect(reply(toException(ExceptionCode.NotAuthenticated)).body).toEqual({
      errorCode: ExceptionCode.NotAuthenticated,
    });
  });

  it('sends no internals with a 5xx, even one of ours', () => {
    expect(reply(toException(ExceptionCode.Unreachable, { secret: 'x' }))).toEqual({
      status: 500,
      body: { errorCode: ExceptionCode.InternalError },
    });
    expect(reply(new Error('database is down'))).toEqual({
      status: 500,
      body: { errorCode: ExceptionCode.InternalError },
    });
  });

  it('gives a code to what the framework refused on its own', () => {
    expect(reply(new NotFoundException('Cannot GET /nowhere')).body).toEqual({
      errorCode: ExceptionCode.RouteNotFound,
    });
    expect(reply(new BadRequestException('Unexpected token'))).toEqual({
      status: 400,
      body: {
        errorCode: ExceptionCode.InvalidRequest,
        details: { issues: [{ path: '', message: 'Unexpected token' }] },
      },
    });
  });
});
