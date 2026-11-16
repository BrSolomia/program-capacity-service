import { describe, expect, it } from 'vitest';

import { thrownPayload } from '../../../../../test/helpers/exception.helpers.js';
import { ExceptionCode } from '../../../../shared/helpers/assert-object.helpers.js';
import { parseCreditLimitMessage, parseTreasuryStatement } from '../treasury-message.helpers.js';

const creditLimitMessage = {
  type: 'PROGRAM_CREDIT_LIMIT_UPDATED',
  programCode: 'PRG-001',
  currency: 'USD',
  creditLimit: '10000000.00',
  version: 42,
  occurredAt: '2026-11-12T10:00:00Z',
};

function payloadOf(message: unknown): string {
  return JSON.stringify(message);
}

describe('parseCreditLimitMessage', () => {
  it('reads the limit as an exact decimal and the version as a bigint', () => {
    const change = parseCreditLimitMessage(payloadOf(creditLimitMessage));

    expect(change.programCode).toBe('PRG-001');
    expect(change.currencyCode).toBe('USD');
    expect(change.creditLimit.toFixed()).toBe('10000000');
    expect(change.treasuryVersion).toBe(42n);
  });

  it('keeps every digit of a limit a float would round', () => {
    const change = parseCreditLimitMessage(
      payloadOf({ ...creditLimitMessage, creditLimit: '9007199254740993.00' }),
    );

    expect(change.creditLimit.toFixed()).toBe('9007199254740993');
  });

  it('refuses a limit sent as a JSON number', () => {
    expect(
      thrownPayload(() =>
        parseCreditLimitMessage(payloadOf({ ...creditLimitMessage, creditLimit: 100 })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });

  it('refuses a payload that is not JSON', () => {
    expect(thrownPayload(() => parseCreditLimitMessage('not json'))).toMatchObject({
      errorCode: ExceptionCode.InvalidMessage,
    });
  });

  it('refuses another kind of message on this topic', () => {
    expect(
      thrownPayload(() =>
        parseCreditLimitMessage(payloadOf({ ...creditLimitMessage, type: 'PROGRAM_STATEMENT' })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });

  it('refuses a field that does not belong, because an unknown field is a contract change', () => {
    expect(
      thrownPayload(() =>
        parseCreditLimitMessage(payloadOf({ ...creditLimitMessage, reservations: [] })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });

  it('refuses a version that is not a whole non-negative number', () => {
    expect(
      thrownPayload(() =>
        parseCreditLimitMessage(payloadOf({ ...creditLimitMessage, version: 1.5 })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });

    expect(
      thrownPayload(() =>
        parseCreditLimitMessage(payloadOf({ ...creditLimitMessage, version: -1 })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });

  it('refuses a timestamp that is not an instant', () => {
    expect(
      thrownPayload(() =>
        parseCreditLimitMessage(payloadOf({ ...creditLimitMessage, occurredAt: '2026-11-12' })),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });
});

const reconciliationMessage = {
  type: 'PROGRAM_STATEMENT',
  programCode: 'PRG-001',
  currency: 'USD',
  creditLimit: '10000000.00',
  reservations: [{ invoiceId: 'INV-100', amount: '250000.00' }],
  appliedThroughOperationNumber: 128,
  version: 50,
  asOf: '2026-11-12T12:00:00Z',
};

describe('parseTreasuryStatement', () => {
  it('reads the statement into the input the domain takes', () => {
    const statement = parseTreasuryStatement(payloadOf(reconciliationMessage));

    expect(statement.programCode).toBe('PRG-001');
    expect(statement.currencyCode).toBe('USD');
    expect(statement.creditLimit.toFixed()).toBe('10000000');
    expect(statement.appliedThroughOperationNumber).toBe(128n);
    expect(statement.treasuryVersion).toBe(50n);
    expect(statement.asOf.toISOString()).toBe('2026-11-12T12:00:00.000Z');
    expect(statement.reservations).toEqual([
      { invoiceExternalId: 'INV-100', reservedAmount: expect.anything() },
    ]);
    expect(statement.reservations[0].reservedAmount.toFixed()).toBe('250000');
  });

  it('reads a program treasury holds nothing for', () => {
    const statement = parseTreasuryStatement(
      payloadOf({ ...reconciliationMessage, reservations: [] }),
    );

    expect(statement.reservations).toEqual([]);
  });

  /** Two entries for one invoice contradict each other, and no rule downstream could pick one. */
  it('refuses two entries for the same invoice', () => {
    expect(
      thrownPayload(() =>
        parseTreasuryStatement(
          payloadOf({
            ...reconciliationMessage,
            reservations: [
              { invoiceId: 'INV-100', amount: '1.00' },
              { invoiceId: 'INV-100', amount: '2.00' },
            ],
          }),
        ),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });

  it('refuses a reservation amount sent as a JSON number', () => {
    expect(
      thrownPayload(() =>
        parseTreasuryStatement(
          payloadOf({
            ...reconciliationMessage,
            reservations: [{ invoiceId: 'INV-100', amount: 250000 }],
          }),
        ),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });

  it('refuses a field inside a reservation that does not belong', () => {
    expect(
      thrownPayload(() =>
        parseTreasuryStatement(
          payloadOf({
            ...reconciliationMessage,
            reservations: [{ invoiceId: 'INV-100', amount: '1.00', currency: 'EUR' }],
          }),
        ),
      ),
    ).toMatchObject({ errorCode: ExceptionCode.InvalidMessage });
  });

  it('refuses a credit limit message on this topic', () => {
    expect(
      thrownPayload(() => parseTreasuryStatement(payloadOf(creditLimitMessage))),
    ).toMatchObject({
      errorCode: ExceptionCode.InvalidMessage,
    });
  });
});
