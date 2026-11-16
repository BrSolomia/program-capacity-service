import { applyDecorators } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiInternalServerErrorResponse,
  ApiResponseOptions,
  ApiUnauthorizedResponse,
  SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ExceptionCode } from '../helpers/assert-object.helpers.js';
import { ErrorResponseSchema } from '../schemas/error.response.js';

/** What the endpoint accepts: the schema before its transforms run, so money is still text. */
export function toRequestSchema(schema: z.ZodType): SchemaObject {
  return toOpenApiSchema(schema, 'input');
}

/** What the endpoint answers with. */
export function toResponseSchema(schema: z.ZodType): SchemaObject {
  return toOpenApiSchema(schema, 'output');
}

/**
 * A failure response that lists exactly the codes it can carry. They become both the description
 * and the schema's enum, so the two cannot disagree.
 */
export function toErrorResponse(
  ...errorCodes: [ExceptionCode, ...ExceptionCode[]]
): ApiResponseOptions {
  const schema = ErrorResponseSchema.extend({ errorCode: z.enum(errorCodes) });

  return { description: errorCodes.join(', '), schema: toResponseSchema(schema) };
}

/** What every client endpoint shares: Basic authentication, its refusal, and the unexpected. */
export function ApiClientEndpoint(): MethodDecorator {
  return applyDecorators(
    ApiBasicAuth(),
    ApiUnauthorizedResponse(toErrorResponse(ExceptionCode.NotAuthenticated)),
    ApiInternalServerErrorResponse(toErrorResponse(ExceptionCode.InternalError)),
  );
}

function toOpenApiSchema(schema: z.ZodType, io: 'input' | 'output'): SchemaObject {
  const jsonSchema = z.toJSONSchema(schema, { io });

  // zod emits JSON Schema 2020-12 and Swagger types the same document with its own interface:
  // the shapes agree, the compiler just has no way to know it.
  return jsonSchema as SchemaObject;
}
