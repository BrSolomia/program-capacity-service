import { Controller, Get, Param } from '@nestjs/common';

import { toProgramCapacityResponse } from '../mappers/program.mappers.js';
import type { ProgramCapacityResponse } from '../schemas/program.response.js';
import { ProgramParamsSchema } from '../schemas/program.schemas.js';
import type { ProgramParams } from '../schemas/program.schemas.js';
import { ProgramService } from '../services/program.service.js';
import { ApiGetProgramCapacity } from '../swagger/program.swagger.js';

@Controller('programs/:programCode')
export class ProgramController {
  constructor(private readonly programs: ProgramService) {}

  @Get('capacity')
  @ApiGetProgramCapacity()
  public async getCapacity(
    @Param({ schema: ProgramParamsSchema }) params: ProgramParams,
  ): Promise<ProgramCapacityResponse> {
    const capacity = await this.programs.getCapacity(params.programCode);

    return toProgramCapacityResponse(capacity);
  }
}
