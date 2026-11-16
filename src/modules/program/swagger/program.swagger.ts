import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import {
  ApiClientEndpoint,
  toErrorResponse,
  toResponseSchema,
} from '../../../shared/swagger/open-api-schema.helpers.js';
import { ProgramCapacityResponseSchema } from '../schemas/program.response.js';

/** Documentation lives here rather than on the handler, so the controller stays one screen. */
export function ApiGetProgramCapacity(): MethodDecorator {
  return applyDecorators(
    ApiClientEndpoint(),
    ApiOperation({
      summary: 'Report how much of a program limit is still free',
      description:
        'Amounts are denominated in the program currency and leave as text. The available ' +
        'amount is negative when treasury lowered the limit below what is already reserved.',
    }),
    ApiParam({ name: 'programCode', description: 'Code treasury refers to the program by' }),
    ApiOkResponse({ schema: toResponseSchema(ProgramCapacityResponseSchema) }),
    ApiBadRequestResponse(toErrorResponse(ExceptionCode.InvalidRequest)),
    ApiNotFoundResponse(toErrorResponse(ExceptionCode.ProgramNotFound)),
  );
}
