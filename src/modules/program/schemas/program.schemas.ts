import { z } from 'zod';

import { ProgramCodeSchema } from '../../../shared/schemas/identifier.schemas.js';

export const ProgramParamsSchema = z.object({ programCode: ProgramCodeSchema });
export type ProgramParams = z.infer<typeof ProgramParamsSchema>;
