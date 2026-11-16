/** Length of an ISO 4217 alphabetic code. */
export const CURRENCY_CODE_LENGTH = 3;

/** Most decimals an ISO 4217 currency subdivides into: three, for KWD, BHD and JOD. */
export const MAX_MINOR_UNITS = 3;

/** Most decimals an exchange rate may carry on input; a longer rate is rejected, not rounded. */
export const MAX_EXCHANGE_RATE_SCALE = 10;
