import assert from 'node:assert/strict';

export const POSTGRES_URL_PROTOCOL_REGEX = /^postgres(ql)?$/;
assert.match('postgres', POSTGRES_URL_PROTOCOL_REGEX);
assert.match('postgresql', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('mysql', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('postgre', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('postgresq', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('postgresqlx', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('xpostgres', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('POSTGRES', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('postgres:', POSTGRES_URL_PROTOCOL_REGEX);
assert.doesNotMatch('postgres://', POSTGRES_URL_PROTOCOL_REGEX);

/**
 * One API client as `<id>:<sha256 of its secret, hex>`. The hash is stored, never the secret, and
 * a single SHA-256 is enough only because the secret is generated: 32 random bytes cannot be
 * brute-forced offline the way a chosen password can.
 */
export const API_CLIENT_REGEX = /^[A-Za-z0-9._-]+:[0-9a-f]{64}$/;

/** One Kafka broker as `host:port`; a list of them is what kafkajs takes. */
export const KAFKA_BROKER_REGEX = /^[^\s,:]+:\d+$/;
assert.match('localhost:9092', KAFKA_BROKER_REGEX);
assert.match('broker-1.kafka.internal:9093', KAFKA_BROKER_REGEX);
assert.doesNotMatch('localhost', KAFKA_BROKER_REGEX);
assert.doesNotMatch('localhost:', KAFKA_BROKER_REGEX);
assert.doesNotMatch(':9092', KAFKA_BROKER_REGEX);
assert.doesNotMatch('localhost:90a2', KAFKA_BROKER_REGEX);
assert.doesNotMatch('kafka://localhost:9092', KAFKA_BROKER_REGEX);
assert.doesNotMatch('localhost:9092,other:9092', KAFKA_BROKER_REGEX);
