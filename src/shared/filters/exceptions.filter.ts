import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import {
  ERROR_CODE_FIELD,
  ExceptionCode,
  isExceptionCode,
} from '../helpers/assert-object.helpers.js';
import { toPayloadIssues } from '../helpers/schema-issue.helpers.js';
import { isObject } from '../helpers/type-guard.helpers.js';

/** The body of every failure: the same `errorCode` and `details` a dead letter carries. */
type ErrorResponse = {
  errorCode: ExceptionCode;
  details?: Record<string, unknown>;
};

type MappedException = {
  status: number;
  response: ErrorResponse;
};

const INTERNAL_ERROR: MappedException = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  response: { errorCode: ExceptionCode.InternalError },
};

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;

    const context = host.switchToHttp();
    const { status, response } = this.mapException(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const request = context.getRequest();
      const route = `${httpAdapter.getRequestMethod(request)} ${httpAdapter.getRequestUrl(request)}`;

      this.logger.error(`Unhandled error on ${route}`, stackOf(exception));
    }

    httpAdapter.reply(context.getResponse(), response, status);
  }

  /** A 5xx answers only its code: what broke inside is for the log, not for the client. */
  private mapException(exception: unknown): MappedException {
    if (!(exception instanceof HttpException)) {
      return INTERNAL_ERROR;
    }

    const status = exception.getStatus();
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return INTERNAL_ERROR;
    }

    const body = exception.getResponse();
    if (isObject(body) && isExceptionCode(body.errorCode)) {
      return { status, response: { errorCode: body.errorCode, details: detailsOf(body) } };
    }

    // No code means the framework refused the request before a handler ran.
    if (status === HttpStatus.NOT_FOUND) {
      return { status, response: { errorCode: ExceptionCode.RouteNotFound } };
    }

    return {
      status,
      response: {
        errorCode: ExceptionCode.InvalidRequest,
        details: { issues: toPayloadIssues(exception.message) },
      },
    };
  }
}

/** Everything the exception carried besides its code; absent when that is nothing. */
function detailsOf(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const details = Object.fromEntries(
    Object.entries(body).filter(([field]) => field !== ERROR_CODE_FIELD),
  );

  return Object.keys(details).length > 0 ? details : undefined;
}

function stackOf(exception: unknown): string {
  return exception instanceof Error && exception.stack ? exception.stack : String(exception);
}
