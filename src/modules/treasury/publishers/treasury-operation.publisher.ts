import type { TreasuryOperation } from '../types/treasury.types.js';

export interface TreasuryOperationPublisher {
  publish(operation: TreasuryOperation): Promise<void>;
}
