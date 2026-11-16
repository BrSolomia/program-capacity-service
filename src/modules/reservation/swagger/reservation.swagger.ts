import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import {
  ApiClientEndpoint,
  toErrorResponse,
  toRequestSchema,
  toResponseSchema,
} from '../../../shared/swagger/open-api-schema.helpers.js';
import { ReservationResponseSchema } from '../schemas/reservation.response.js';
import { ReserveBodySchema } from '../schemas/reservation.schemas.js';

const programCodeParam = () =>
  ApiParam({ name: 'programCode', description: 'Code treasury refers to the program by' });

const invoiceExternalIdParam = () =>
  ApiParam({ name: 'invoiceExternalId', description: 'Id the issuing system gave the invoice' });

/** Documentation lives here rather than on the handler, so the controller stays one screen. */
export function ApiReserveCapacity(): MethodDecorator {
  return applyDecorators(
    ApiClientEndpoint(),
    ApiOperation({
      summary: 'Reserve program capacity for an invoice',
      description:
        'Idempotent on the invoice external id: repeating an invoice the client still holds ' +
        'answers with that reservation, unchanged. An invoice already released, or one treasury ' +
        'reserved, is refused. An invoice in another currency is converted into the program ' +
        'currency at the rate stored on the reservation.',
    }),
    programCodeParam(),
    ApiBody({ schema: toRequestSchema(ReserveBodySchema) }),
    ApiCreatedResponse({ schema: toResponseSchema(ReservationResponseSchema) }),
    ApiBadRequestResponse(
      toErrorResponse(
        ExceptionCode.InvalidRequest,
        ExceptionCode.InvoiceAmountNotPositive,
        ExceptionCode.InvoiceAmountNotInMinorUnits,
        ExceptionCode.InvoiceAmountTooLarge,
        ExceptionCode.CurrencyNotFound,
      ),
    ),
    ApiNotFoundResponse(toErrorResponse(ExceptionCode.ProgramNotFound)),
    ApiConflictResponse(
      toErrorResponse(
        ExceptionCode.InsufficientProgramCapacity,
        ExceptionCode.InvoiceReservedWithDifferentTerms,
        ExceptionCode.InvoiceAlreadyReleased,
        ExceptionCode.ReservationBelongsToTreasury,
      ),
    ),
    ApiUnprocessableEntityResponse(
      toErrorResponse(
        ExceptionCode.ExchangeRateNotFound,
        ExceptionCode.ConvertedAmountNotPositive,
        ExceptionCode.ConvertedAmountTooLarge,
      ),
    ),
  );
}

export function ApiReleaseCapacity(): MethodDecorator {
  return applyDecorators(
    ApiClientEndpoint(),
    ApiOperation({
      summary: 'Release the capacity an invoice holds',
      description:
        'Gives back exactly the amount that was held. Idempotent: an already released ' +
        'reservation answers with its current state. A reservation treasury created was never ' +
        "the client's and is refused.",
    }),
    programCodeParam(),
    invoiceExternalIdParam(),
    ApiOkResponse({ schema: toResponseSchema(ReservationResponseSchema) }),
    ApiBadRequestResponse(toErrorResponse(ExceptionCode.InvalidRequest)),
    ApiNotFoundResponse(
      toErrorResponse(ExceptionCode.ProgramNotFound, ExceptionCode.ReservationNotFound),
    ),
    ApiConflictResponse(toErrorResponse(ExceptionCode.ReservationBelongsToTreasury)),
  );
}
