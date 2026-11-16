import { Module } from '@nestjs/common';

import { CurrencyModule } from '../currency/index.js';
import { ProgramController } from './controllers/program.controller.js';
import { ProgramRepository } from './repositories/program.repository.js';
import { ProgramService } from './services/program.service.js';

@Module({
  controllers: [ProgramController],
  imports: [CurrencyModule],
  providers: [ProgramRepository, ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}
