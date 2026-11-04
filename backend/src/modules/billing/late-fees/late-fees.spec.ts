import { describe, expect, it } from 'vitest';
import { DEFAULT_LATE_FEES, type LateFeeSettings, lateFeeFor, readLateFees } from './late-fees.js';

const ON: LateFeeSettings = {
  enabled: true,
  mode: 'PERCENT',
  amount: 0n,
  percentBps: 500,
  graceDays: 5,
};
const inv = (o: Partial<Parameters<typeof lateFeeFor>[0]> = {}) => ({
  kind: 'MONTHLY' as const,
  status: 'ISSUED' as const,
  dueDate: '2026-11-08',
  balance: 2_500_000n,
  ...o,
});

describe('readLateFees', () => {
  it('defaults to off, 5% after 5 days', () => {
    expect(readLateFees({})).toEqual(DEFAULT_LATE_FEES);
    expect(readLateFees(null)).toEqual(DEFAULT_LATE_FEES);
    expect(DEFAULT_LATE_FEES).toEqual({
      enabled: false,
      mode: 'PERCENT',
      amount: 0n,
      percentBps: 500,
      graceDays: 5,
    });
  });

  it('reads stored settings, with the flat amount stored as a string of minor units', () => {
    expect(
      readLateFees({
        lateFees: { enabled: true, mode: 'FLAT', amount: '50000', percentBps: 500, graceDays: 3 },
      }),
    ).toEqual({ enabled: true, mode: 'FLAT', amount: 50_000n, percentBps: 500, graceDays: 3 });
  });
});

describe('lateFeeFor', () => {
  it('charges nothing while late fees are off', () => {
    expect(lateFeeFor(inv(), { ...ON, enabled: false }, '2026-11-20')).toBeNull();
  });

  it('waits out the grace days', () => {
    expect(lateFeeFor(inv(), ON, '2026-11-12')).toBeNull(); // due + 4
    expect(lateFeeFor(inv(), ON, '2026-11-13')).toBe(125_000n); // due + 5: 5% of 25,000
  });

  it('charges a flat amount', () => {
    expect(lateFeeFor(inv(), { ...ON, mode: 'FLAT', amount: 50_000n }, '2026-11-13')).toBe(50_000n);
  });

  it('rounds a percentage half-up to the cent', () => {
    expect(lateFeeFor(inv({ balance: 1_000_050n }), ON, '2026-11-13')).toBe(50_003n);
  });

  it('charges only on unpaid monthly invoices', () => {
    expect(lateFeeFor(inv({ balance: 0n }), ON, '2026-11-13')).toBeNull();
    for (const kind of ['ADHOC', 'MOVE_IN', 'LATE_FEE'] as const) {
      expect(lateFeeFor(inv({ kind }), ON, '2026-11-13')).toBeNull();
    }
    expect(lateFeeFor(inv({ status: 'VOID' }), ON, '2026-11-13')).toBeNull();
    expect(lateFeeFor(inv({ status: 'PAID' }), ON, '2026-11-13')).toBeNull();
  });

  it('charges nothing for a zero flat amount', () => {
    expect(lateFeeFor(inv(), { ...ON, mode: 'FLAT', amount: 0n }, '2026-11-13')).toBeNull();
  });
});
