/** Injection token for the kafkajs client. */
export const KAFKA = Symbol('KAFKA');

/** Identifies this application to the brokers, in their logs and quotas. */
export const KAFKA_CLIENT_ID = 'program-capacity';

/** Appended to a topic to name the one its unprocessable messages are parked in. */
export const DEAD_LETTER_TOPIC_SUFFIX = '.dlq';

/** Stands in a dead letter when the refusal carried no code of ours; nobody throws it. */
export const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';
