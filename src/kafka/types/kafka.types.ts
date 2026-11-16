import type { ExceptionCode } from '../../shared/helpers/assert-object.helpers.js';
import type { UNKNOWN_ERROR_CODE } from '../kafka.constants.js';

/** One consumed message, decoded, so feature code never handles kafkajs types or buffers. */
export type IncomingMessage = {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: string | null;
};

export type MessageHandler = (message: IncomingMessage) => Promise<void>;

export type Subscription = {
  topic: string;
  groupId: string;
  onMessage: MessageHandler;
};

/** A message parked because it can never succeed. */
export type DeadLetter = {
  errorCode: ExceptionCode | typeof UNKNOWN_ERROR_CODE;

  /** What the refusal said beyond its code: which program, which currency, which field. */
  details: Record<string, unknown>;
  failedAt: string;
  topic: string;
  partition: number;
  offset: string;
  payload: string | null;
};
