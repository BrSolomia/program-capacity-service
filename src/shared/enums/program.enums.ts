/** What a credit limit message from treasury did to the program it names. */
export enum CreditLimitOutcome {
  Created = 'CREATED',
  Applied = 'APPLIED',
  Ignored = 'IGNORED',
}

/** What a treasury statement did to the program it names. */
export enum ReconciliationOutcome {
  Created = 'CREATED',
  Applied = 'APPLIED',
  Ignored = 'IGNORED',
}
