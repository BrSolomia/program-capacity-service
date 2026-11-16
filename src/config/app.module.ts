import { Module } from '@nestjs/common';

import { AuthModule } from '../modules/auth/index.js';
import { ReservationModule } from '../modules/reservation/index.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule, AuthModule, ReservationModule],
})
export class AppModule {}
