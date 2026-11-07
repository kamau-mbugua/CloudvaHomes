import {
  balanceDueOn,
  type Cancellation,
  DEFAULT_RULES,
  describeCancellation,
  dueNow,
  effectiveRules,
  refundFor,
  rulesProblem,
} from './terms.js';

describe('stays payment terms & refund rules', () => {
  it('deposit percent rounds up to whole shillings', () => {
    expect(dueNow({ ...DEFAULT_RULES, payWhen: 'DEPOSIT', depositPercent: 30 }, 1234500n)).toBe(
      370400n,
    );
  });

  it('fixed deposit never exceeds the total', () => {
    expect(dueNow({ ...DEFAULT_RULES, payWhen: 'DEPOSIT', depositFixed: '900000' }, 500000n)).toBe(
      500000n,
    );
  });

  it('pay on arrival needs nothing now', () =>
    expect(dueNow({ ...DEFAULT_RULES, payWhen: 'ON_ARRIVAL' }, 500000n)).toBe(0n));

  it.each([
    ['FLEXIBLE', '2026-12-09', 1000000n],
    ['FLEXIBLE', '2026-12-10', 0n],
    ['MODERATE', '2026-12-05', 1000000n],
    ['MODERATE', '2026-12-06', 0n],
    ['STRICT', '2026-12-03', 500000n],
    ['STRICT', '2026-12-04', 0n],
  ])('%s refund when cancelling on %s for a 2026-12-10 check-in', (c, day, want) => {
    expect(
      refundFor({ ...DEFAULT_RULES, cancellation: c as Cancellation }, 1000000n, '2026-12-10', day),
    ).toBe(want);
  });

  it('custom: full until N days, then X%', () => {
    const r = {
      ...DEFAULT_RULES,
      cancellation: 'CUSTOM' as const,
      customFullRefundDays: 3,
      customLatePercent: 25,
    };
    expect(refundFor(r, 1000000n, '2026-12-10', '2026-12-07')).toBe(1000000n);
    expect(refundFor(r, 1000000n, '2026-12-10', '2026-12-08')).toBe(250000n);
  });

  it('balance before check-in is due N days before', () => {
    expect(
      balanceDueOn(
        {
          ...DEFAULT_RULES,
          payWhen: 'DEPOSIT',
          depositPercent: 30,
          balanceDue: 'BEFORE_CHECKIN',
          balanceDaysBefore: 2,
        },
        '2026-12-10',
      ),
    ).toBe('2026-12-08');
  });

  it('override replaces only the fields it sets', () => {
    expect(effectiveRules(DEFAULT_RULES, { bookingMode: 'REQUEST' })).toEqual({
      ...DEFAULT_RULES,
      bookingMode: 'REQUEST',
    });
  });

  it('validates rules and describes cancellation in plain English', () => {
    expect(rulesProblem(DEFAULT_RULES)).toBeNull();
    expect(rulesProblem({ ...DEFAULT_RULES, payWhen: 'DEPOSIT' })).toBeTruthy();
    expect(describeCancellation(DEFAULT_RULES)).toContain('5 days');
  });
});
