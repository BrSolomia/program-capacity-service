import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { isString } from './type-guard.helpers.js';

export enum ExceptionCode {
  InvalidEnvironment = 'INVALID_ENVIRONMENT',
  InvalidDecimalValue = 'INVALID_DECIMAL_VALUE',
  Unreachable = 'UNREACHABLE',

  ProgramNotFound = 'PROGRAM_NOT_FOUND',
  ProgramCurrencyChanged = 'PROGRAM_CURRENCY_CHANGED',
  ProgramCreditLimitNegative = 'PROGRAM_CREDIT_LIMIT_NEGATIVE',
  ProgramCreditLimitNotInMinorUnits = 'PROGRAM_CREDIT_LIMIT_NOT_IN_MINOR_UNITS',
  ProgramCreditLimitTooLarge = 'PROGRAM_CREDIT_LIMIT_TOO_LARGE',
  ProgramReservedAmountTooLarge = 'PROGRAM_RESERVED_AMOUNT_TOO_LARGE',
  ReservationNotFound = 'RESERVATION_NOT_FOUND',
  InsufficientProgramCapacity = 'INSUFFICIENT_PROGRAM_CAPACITY',
  InvoiceReservedWithDifferentTerms = 'INVOICE_RESERVED_WITH_DIFFERENT_TERMS',
  InvoiceAlreadyReleased = 'INVOICE_ALREADY_RELEASED',
  ReservationBelongsToTreasury = 'RESERVATION_BELONGS_TO_TREASURY',
  InvoiceAmountNotInMinorUnits = 'INVOICE_AMOUNT_NOT_IN_MINOR_UNITS',
  InvoiceAmountNotPositive = 'INVOICE_AMOUNT_NOT_POSITIVE',
  InvoiceAmountTooLarge = 'INVOICE_AMOUNT_TOO_LARGE',
  CurrencyNotFound = 'CURRENCY_NOT_FOUND',
  ExchangeRateNotFound = 'EXCHANGE_RATE_NOT_FOUND',
  ConvertedAmountNotPositive = 'CONVERTED_AMOUNT_NOT_POSITIVE',
  ConvertedAmountTooLarge = 'CONVERTED_AMOUNT_TOO_LARGE',
  NotAuthenticated = 'NOT_AUTHENTICATED',
  InvalidRequest = 'INVALID_REQUEST',
  InvalidMessage = 'INVALID_MESSAGE',
  RouteNotFound = 'ROUTE_NOT_FOUND',
  InternalError = 'INTERNAL_ERROR',
}

const EXCEPTION_CODES: ReadonlySet<string> = new Set(Object.values(ExceptionCode));
/** The field every exception payload carries its code in; everything else is detail. */
export const ERROR_CODE_FIELD = 'errorCode' satisfies keyof ErrorCodePayload;

type ExceptionExtras = Record<string, unknown>;
type ErrorCodePayload = { errorCode: ExceptionCode };
type ExceptionPayload = ErrorCodePayload & ExceptionExtras;

type ExceptionFactory = (data: ExceptionPayload) => HttpException;

const exceptionMap: Record<ExceptionCode, ExceptionFactory> = {
  [ExceptionCode.Unreachable]: (data) => new InternalServerErrorException(data),
  [ExceptionCode.InvalidEnvironment]: (data) => new InternalServerErrorException(data),
  [ExceptionCode.InvalidDecimalValue]: (data) => new InternalServerErrorException(data),

  [ExceptionCode.ProgramNotFound]: (data) => new NotFoundException(data),
  [ExceptionCode.ProgramCurrencyChanged]: (data) => new ConflictException(data),
  [ExceptionCode.ProgramCreditLimitNegative]: (data) => new BadRequestException(data),
  [ExceptionCode.ProgramCreditLimitNotInMinorUnits]: (data) => new BadRequestException(data),
  [ExceptionCode.ProgramCreditLimitTooLarge]: (data) => new BadRequestException(data),
  [ExceptionCode.ProgramReservedAmountTooLarge]: (data) => new BadRequestException(data),
  [ExceptionCode.ReservationNotFound]: (data) => new NotFoundException(data),
  [ExceptionCode.InsufficientProgramCapacity]: (data) => new ConflictException(data),
  [ExceptionCode.InvoiceReservedWithDifferentTerms]: (data) => new ConflictException(data),
  [ExceptionCode.InvoiceAlreadyReleased]: (data) => new ConflictException(data),
  [ExceptionCode.ReservationBelongsToTreasury]: (data) => new ConflictException(data),
  [ExceptionCode.InvoiceAmountNotInMinorUnits]: (data) => new BadRequestException(data),
  [ExceptionCode.InvoiceAmountNotPositive]: (data) => new BadRequestException(data),
  [ExceptionCode.InvoiceAmountTooLarge]: (data) => new BadRequestException(data),
  [ExceptionCode.CurrencyNotFound]: (data) => new BadRequestException(data),
  [ExceptionCode.ExchangeRateNotFound]: (data) => new UnprocessableEntityException(data),
  [ExceptionCode.ConvertedAmountNotPositive]: (data) => new UnprocessableEntityException(data),
  [ExceptionCode.ConvertedAmountTooLarge]: (data) => new UnprocessableEntityException(data),
  [ExceptionCode.NotAuthenticated]: (data) => new UnauthorizedException(data),
  [ExceptionCode.InvalidRequest]: (data) => new BadRequestException(data),
  [ExceptionCode.InvalidMessage]: (data) => new BadRequestException(data),
  [ExceptionCode.RouteNotFound]: (data) => new NotFoundException(data),
  [ExceptionCode.InternalError]: (data) => new InternalServerErrorException(data),
};

/** The exception an ExceptionCode stands for, for a caller that hands it to somebody else. */
export function toException(
  exceptionCode: ExceptionCode,
  exceptionExtras?: ExceptionExtras,
): HttpException {
  const createException = exceptionMap[exceptionCode];

  return createException({ ...exceptionExtras, errorCode: exceptionCode });
}

/** Throws the exception the given ExceptionCode stands for. */
export function throwException(
  exceptionCode: ExceptionCode,
  exceptionExtras?: ExceptionExtras,
): never {
  throw toException(exceptionCode, exceptionExtras);
}

/**
 * Asserts that `value` is not `falsy`.
 * If it is, looks up your ExceptionCode in `exceptionMap`
 * and throws a new instance of that exception with the code in the `errorCode` field.
 *
 * @param value            – the thing you expect to exist
 * @param exceptionCode    – which ExceptionCode/exception class to use
 * @param exceptionExtras  - optional object containing extra fields to include in the exception payload
 */
export function assertValue<T>(
  value: T | null | undefined,
  exceptionCode: ExceptionCode,
  exceptionExtras?: ExceptionExtras,
): asserts value is T {
  if (!value) {
    throwException(exceptionCode, exceptionExtras);
  }
}

export function isExceptionCode(value: unknown): value is ExceptionCode {
  return isString(value) && EXCEPTION_CODES.has(value);
}
