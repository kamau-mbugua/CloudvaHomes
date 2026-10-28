import { platformTotal, previousPeriod, statusFor } from './platform-math.js';

describe('platform billing rules', () => {
  it('charges units × price with a minimum', () => {
    expect(platformTotal(12, 10000n, 50000n)).toBe(120000n);
    expect(platformTotal(2, 10000n, 50000n)).toBe(50000n);
    expect(platformTotal(0, 10000n, 0n)).toBe(0n);
  });

  it('bills the previous month, across year ends', () => {
    expect(previousPeriod('2026-11-01')).toBe('2026-10');
    expect(previousPeriod('2027-01-01')).toBe('2026-12');
  });

  const base = {
    current: 'ACTIVE' as const,
    today: '2026-11-20',
    trialEndsAt: null,
    noSuspendUntil: null,
    oldestOverdueDue: null,
    suspendAfterDays: 21,
  };

  it('moves through trial, grace and suspension', () => {
    expect(statusFor({ ...base, trialEndsAt: '2026-11-30' })).toBe('TRIAL');
    expect(statusFor(base)).toBe('ACTIVE');
    expect(statusFor({ ...base, oldestOverdueDue: '2026-11-11' })).toBe('GRACE');
    expect(statusFor({ ...base, oldestOverdueDue: '2026-10-30' })).toBe('SUSPENDED'); // 21 days
    expect(statusFor({ ...base, current: 'SUSPENDED' })).toBe('ACTIVE'); // paid up
  });

  it('respects the admin: closed stays closed, "no suspension until" holds at grace', () => {
    expect(statusFor({ ...base, current: 'CLOSED' })).toBe('CLOSED');
    expect(
      statusFor({ ...base, oldestOverdueDue: '2026-10-01', noSuspendUntil: '2026-11-30' }),
    ).toBe('GRACE');
    expect(
      statusFor({ ...base, oldestOverdueDue: '2026-10-01', noSuspendUntil: '2026-11-19' }),
    ).toBe('SUSPENDED');
  });
});
