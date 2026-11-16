import { z } from 'zod';

import { ExceptionCode } from '../helpers/assert-object.helpers.js';

/** One field a request or a message was refused for; an empty path means the payload as a whole. */
const SchemaIssueSchema = z.object({ path: z.string(), message: z.string() });

/** Every failure answers with its `errorCode`; `details` names what was rejected, when anything. */
export const ErrorResponseSchema = z.object({
  errorCode: z.enum(ExceptionCode),
  details: z
    .object({ issues: z.array(SchemaIssueSchema).optional() })
    .loose()
    .optional(),
});
