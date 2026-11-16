/**
 * Topics and consumer groups of the treasury contract. The version is part of the topic name, so
 * a breaking change to the message is a new topic read by a new consumer rather than a migration
 * of messages already in flight.
 */
export const TREASURY_CREDIT_LIMIT_TOPIC = 'treasury.program-credit-limit.v1';

/** One group per topic, named after what it does, so its lag is readable in the broker. */
export const TREASURY_CREDIT_LIMIT_CONSUMER_GROUP = 'program-capacity.credit-limit';

export const TREASURY_STATEMENT_TOPIC = 'treasury.program-statement.v1';

export const TREASURY_STATEMENT_CONSUMER_GROUP = 'program-capacity.statement';
