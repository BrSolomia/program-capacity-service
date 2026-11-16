import { Injectable } from '@nestjs/common';

import { isUniqueViolation } from '../../../database/helpers/pg-error.helpers.js';
import {
  INVOICE_EXTERNAL_ID_UNIQUE_INDEX,
  Program,
  Reservation,
} from '../../../database/schema/index.js';
import { TransactionService } from '../../../database/services/transaction.service.js';
import { TreasuryOperationType } from '../../../shared/enums/treasury.enums.js';
import { assertValue, ExceptionCode } from '../../../shared/helpers/assert-object.helpers.js';
import { CurrencyService } from '../../currency/index.js';
import { ExchangeRateService } from '../../exchange-rate/index.js';
import { InvoiceService } from '../../invoice/index.js';
import { ProgramService } from '../../program/index.js';
import { TreasuryOperationService } from '../../treasury/index.js';
import {
  assertAmountIsApplicable,
  assertInvoiceMatchesReservation,
  assertReservationIsHeldByClient,
} from '../helpers/assert-invoice.helpers.js';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import type { AmountConversion } from '../../exchange-rate/index.js';
import type { ReservationChange, ReserveInput } from '../types/reservation.types.js';

@Injectable()
export class ReserveCapacityService {
  constructor(
    private readonly transactions: TransactionService,
    private readonly programs: ProgramService,
    private readonly invoices: InvoiceService,
    private readonly reservations: ReservationRepository,
    private readonly currencies: CurrencyService,
    private readonly exchangeRates: ExchangeRateService,
    private readonly treasuryOperations: TreasuryOperationService,
  ) {}

  /**
   * Holds program capacity for an invoice. Reserving the same invoice again returns the first
   * reservation; reserving it with a different amount or currency is a conflict.
   */
  public async reserve(input: ReserveInput): Promise<Reservation> {
    const program = await this.programs.findByCodeOrThrow(input.programCode);

    const invoiceCurrency = await this.currencies.findByCodeOrThrow(input.invoiceCurrencyCode);
    assertAmountIsApplicable(input.invoiceAmount, invoiceCurrency);

    const reservedInvoice = await this.reservations.findByInvoiceExternalId({
      programId: program.id,
      invoiceExternalId: input.invoiceExternalId,
    });

    if (reservedInvoice) {
      assertInvoiceMatchesReservation(input, reservedInvoice);
      assertReservationIsHeldByClient(reservedInvoice.reservation);

      return reservedInvoice.reservation;
    }

    const programCurrency = await this.currencies.findByCodeOrThrow(program.currencyCode);
    const conversion = await this.exchangeRates.convertAmount({
      amount: input.invoiceAmount,
      fromCurrencyCode: input.invoiceCurrencyCode,
      toCurrencyCode: program.currencyCode,
      toMinorUnits: programCurrency.minorUnits,
    });

    const reservationChange = await this.createReservation(program, input, conversion);
    await this.reportOperation(program, reservationChange);

    return reservationChange.reservation;
  }

  private async reportOperation(
    program: Program,
    reservationChange: ReservationChange,
  ): Promise<void> {
    const { reservation, operationNumber } = reservationChange;

    const hasOperationToReport = operationNumber !== null;
    if (!hasOperationToReport) {
      return;
    }

    await this.treasuryOperations.publish(
      TreasuryOperationType.Reserve,
      program,
      reservation,
      operationNumber,
    );
  }

  /**
   * Takes capacity, records the invoice and the reservation in one transaction, and reports the
   * number the operation took.
   */
  private async createReservation(
    program: Program,
    input: ReserveInput,
    amountConversion: AmountConversion,
  ): Promise<ReservationChange> {
    const { exchangeRate, convertedAmount } = amountConversion;

    try {
      return await this.transactions.run(async (executor) => {
        const operation = await this.programs.holdCapacity(
          { programId: program.id, amount: convertedAmount },
          executor,
        );

        assertValue(operation, ExceptionCode.InsufficientProgramCapacity, {
          requestedAmount: convertedAmount.toFixed(),
          programCode: program.code,
        });

        const invoice = await this.invoices.create(
          {
            currencyCode: input.invoiceCurrencyCode,
            externalId: input.invoiceExternalId,
            amount: input.invoiceAmount,
            programId: program.id,
          },
          executor,
        );

        const reservation = await this.reservations.insertByClient(
          {
            reserveClientOperationNumber: operation.operationNumber,
            invoiceToProgramFxRate: exchangeRate,
            reservedAmount: convertedAmount,
            programId: program.id,
            invoiceId: invoice.id,
          },
          executor,
        );

        return { reservation, operationNumber: operation.operationNumber };
      });
    } catch (error) {
      return this.handleDuplicateInvoice(error, program, input);
    }
  }

  /**
   * Answers a duplicate-invoice collision with the reservation that already exists: another
   * request reserved this invoice between the check in `reserve` and our write, so its
   * reservation is the result and there is no new operation to report. Any other error is
   * rethrown for the caller.
   */
  private async handleDuplicateInvoice(
    error: unknown,
    program: Program,
    input: ReserveInput,
  ): Promise<ReservationChange> {
    if (!isUniqueViolation(error, INVOICE_EXTERNAL_ID_UNIQUE_INDEX)) {
      throw error;
    }

    const existingInvoice = await this.reservations.findByInvoiceExternalId({
      programId: program.id,
      invoiceExternalId: input.invoiceExternalId,
    });

    assertValue(existingInvoice, ExceptionCode.Unreachable);
    assertInvoiceMatchesReservation(input, existingInvoice);
    assertReservationIsHeldByClient(existingInvoice.reservation);

    return { reservation: existingInvoice.reservation, operationNumber: null };
  }
}
