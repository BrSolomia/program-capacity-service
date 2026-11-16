import { z } from 'zod';

import { ExceptionCode, throwException } from '../../../shared/helpers/assert-object.helpers.js';
import { safeJsonParse } from '../../../shared/helpers/json.helpers.js';
import { toPayloadIssues, toSchemaIssues } from '../../../shared/helpers/schema-issue.helpers.js';
import type { ApplyCreditLimitInput } from '../../program/index.js';
import type { TreasuryStatement } from '../../reservation/types/reconciliation.types.js';
import {
  ProgramCreditLimitMessageSchema,
  ProgramStatementMessageSchema,
} from '../schemas/treasury-message.schemas.js';

/** Parses a credit limit message into the input the domain takes. */
export function parseCreditLimitMessage(payload: string): ApplyCreditLimitInput {
  const message = parseMessage(ProgramCreditLimitMessageSchema, payload);

  return {
    programCode: message.programCode,
    currencyCode: message.currency,
    creditLimit: message.creditLimit,
    treasuryVersion: BigInt(message.version),
  };
}

/** Parses a reconciliation message into the statement the domain takes. */
export function parseTreasuryStatement(payload: string): TreasuryStatement {
  const message = parseMessage(ProgramStatementMessageSchema, payload);

  const reservations = message.reservations.map((reservation) => ({
    invoiceExternalId: reservation.invoiceId,
    reservedAmount: reservation.amount,
  }));

  return {
    programCode: message.programCode,
    currencyCode: message.currency,
    creditLimit: message.creditLimit,
    reservations,
    appliedThroughOperationNumber: BigInt(message.appliedThroughOperationNumber),
    treasuryVersion: BigInt(message.version),
    asOf: new Date(message.asOf),
  };
}

/**
 * Anything unreadable is reported as a bad message, which is what sends it to the dead letter
 * topic instead of back to the broker.
 */
function parseMessage<Schema extends z.ZodType>(schema: Schema, payload: string): z.output<Schema> {
  const result = schema.safeParse(parseMessageJson(payload));

  if (!result.success) {
    return throwException(ExceptionCode.InvalidMessage, {
      issues: toSchemaIssues(result.error.issues),
    });
  }

  return result.data;
}

/** The failure is reported as a bad message, not as a JSON error, because that is what it is. */
function parseMessageJson(payload: string): unknown {
  const [error, body] = safeJsonParse(payload);

  if (error !== null) {
    return throwException(ExceptionCode.InvalidMessage, { issues: toPayloadIssues(error.message) });
  }

  return body;
}
