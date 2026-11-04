import { describe, expect, it } from 'vitest';
import {
  earliestChangePeriod,
  nextPeriod,
  rentForPeriod,
  validateRentChange,
} from './rent-changes.js';

describe('nextPeriod', () => {
  it('moves to the next month, across a year end', () => {
    expect(nextPeriod('2026-11')).toBe('2026-12');
    expect(nextPeriod('2026-12')).toBe('2027-01');
  });
});

describe('earliestChangePeriod', () => {
  it('is the month after the last one billed', () => {
    expect(earliestChangePeriod({ lastBilledPeriod: '2026-11', currentPeriod: '2026-11' })).toBe(
      '2026-12',
    );
  });

  it('is this month when nothing has been billed for it yet', () => {
    expect(earliestChangePeriod({ lastBilledPeriod: null, currentPeriod: '2026-11' })).toBe(
      '2026-11',
    );
    expect(earliestChangePeriod({ lastBilledPeriod: '2026-09', currentPeriod: '2026-11' })).toBe(
      '2026-11',
    );
  });
});

describe('validateRentChange', () => {
  it('refuses a month that is already invoiced', () => {
    expect(validateRentChange('2026-11', '2026-12')).toBe('ALREADY_BILLED');
    expect(validateRentChange('2026-12', '2026-12')).toBe('OK');
    expect(validateRentChange('2027-03', '2026-12')).toBe('OK');
  });
});

describe('rentForPeriod', () => {
  const changes = [
    { effectivePeriod: '2027-01', newRent: 3_000_000n },
    { effectivePeriod: '2027-06', newRent: 3_200_000n },
  ];

  it('uses the latest change that has started by the period', () => {
    expect(rentForPeriod(2_500_000n, changes, '2026-12')).toBe(2_500_000n);
    expect(rentForPeriod(2_500_000n, changes, '2027-01')).toBe(3_000_000n);
    expect(rentForPeriod(2_500_000n, changes, '2027-07')).toBe(3_200_000n);
  });

  it('ignores the order the changes come in', () => {
    expect(rentForPeriod(2_500_000n, [...changes].reverse(), '2027-07')).toBe(3_200_000n);
  });
});
