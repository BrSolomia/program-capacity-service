import { describe, expect, it } from 'vitest';

import { ExactDecimal } from '../../../../shared/primitives/exact-decimal/index.js';
import { roundToMinorUnits } from '../exchange-rate.helpers.js';

function round(value: string, minorUnits: number): string {
  return roundToMinorUnits(new ExactDecimal(value), minorUnits).toFixed(minorUnits);
}

describe('roundToMinorUnits', () => {
  it('rounds to the decimal places a currency subdivides into', () => {
    expect(round('92.0000', 2)).toBe('92.00');
    expect(round('15720.0000', 0)).toBe('15720');
    expect(round('30.6500', 3)).toBe('30.650');
  });

  it('rounds a half away from zero', () => {
    expect(round('0.125', 2)).toBe('0.13');
    expect(round('0.135', 2)).toBe('0.14');
    expect(round('-0.125', 2)).toBe('-0.13');
  });

  it('rounds rather than truncates', () => {
    expect(round('0.129', 2)).toBe('0.13');
    expect(round('0.121', 2)).toBe('0.12');
    expect(round('0.9', 0)).toBe('1');
  });

  it('leaves a value the currency can already hold untouched', () => {
    expect(round('9.99', 2)).toBe('9.99');
  });
});
