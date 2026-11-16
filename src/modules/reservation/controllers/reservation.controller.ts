import { Body, Controller, Delete, Param, Post } from '@nestjs/common';

import { toReservationResponse } from '../mappers/reservation.mappers.js';
import type { ReservationResponse } from '../schemas/reservation.response.js';
import {
  ReleaseParamsSchema,
  ReserveBodySchema,
  ReserveParamsSchema,
} from '../schemas/reservation.schemas.js';
import type { ReleaseParams, ReserveBody, ReserveParams } from '../schemas/reservation.schemas.js';
import { ReleaseCapacityService } from '../services/release-capacity.service.js';
import { ReserveCapacityService } from '../services/reserve-capacity.service.js';
import { ApiReleaseCapacity, ApiReserveCapacity } from '../swagger/reservation.swagger.js';

@Controller('programs/:programCode/reservations')
export class ReservationController {
  constructor(
    private readonly reserveCapacity: ReserveCapacityService,
    private readonly releaseCapacity: ReleaseCapacityService,
  ) {}

  @Post()
  @ApiReserveCapacity()
  public async createReservation(
    @Param({ schema: ReserveParamsSchema }) params: ReserveParams,
    @Body({ schema: ReserveBodySchema }) body: ReserveBody,
  ): Promise<ReservationResponse> {
    const reservation = await this.reserveCapacity.reserve({
      programCode: params.programCode,
      invoiceExternalId: body.invoiceExternalId,
      invoiceAmount: body.amount,
      invoiceCurrencyCode: body.currencyCode,
    });

    return toReservationResponse(body.invoiceExternalId, reservation);
  }

  @Delete(':invoiceExternalId')
  @ApiReleaseCapacity()
  public async releaseReservation(
    @Param({ schema: ReleaseParamsSchema }) params: ReleaseParams,
  ): Promise<ReservationResponse> {
    const reservation = await this.releaseCapacity.release(params);

    return toReservationResponse(params.invoiceExternalId, reservation);
  }
}
