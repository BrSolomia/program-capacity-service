/** Direction of a client operation, as treasury needs to read it. */
export enum TreasuryOperationType {
  Reserve = 'RESERVE',
  Release = 'RELEASE',
}

/** Kind of message treasury sends us; the field is read before anything else is trusted. */
export enum TreasuryMessageType {
  ProgramCreditLimitUpdated = 'PROGRAM_CREDIT_LIMIT_UPDATED',
  ProgramStatement = 'PROGRAM_STATEMENT',
}
