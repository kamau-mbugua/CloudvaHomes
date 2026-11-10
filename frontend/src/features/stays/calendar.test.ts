import { describe, expect, it } from 'vitest';
import {
  balanceStat,
  barFor,
  bookingActions,
  bookingActionsForStatus,
  dayColumns,
  initialCancelRefundInput,
} from './calendar';

describe('stays/calendar & booking actions', () => {
  it('computes dayColumns and barFor with clipping', () => {
    const cols = dayColumns('2026-12-04', 14);
    expect(cols).toHaveLength(14);
    expect(cols[0]).toBe('2026-12-04');
    expect(cols[13]).toBe('2026-12-17');

    expect(
      barFor({ checkIn: '2026-12-03', checkOut: '2026-12-06' }, '2026-12-04', 14),
    ).toEqual({
      start: 0,
      span: 2,
      clippedLeft: true,
      clippedRight: false,
    });

    expect(
      barFor({ checkIn: '2026-12-01', checkOut: '2026-12-04' }, '2026-12-04', 14),
    ).toBeNull();
  });

  it('shows Accept and Decline only for REQUESTED bookings', () => {
    const requested = bookingActionsForStatus('REQUESTED');
    expect(requested).toContain('accept');
    expect(requested).toContain('decline');

    for (const status of [
      'HELD',
      'CONFIRMED',
      'CHECKED_IN',
      'COMPLETED',
      'CANCELLED',
      'DECLINED',
      'EXPIRED',
      'NO_SHOW',
    ] as const) {
      const actions = bookingActionsForStatus(status);
      expect(actions).not.toContain('accept');
      expect(actions).not.toContain('decline');
    }
  });

  it('pre-fills CancelSheet refund from dry-run suggestedRefund in whole shillings', () => {
    expect(initialCancelRefundInput('1000000')).toBe('10000');
    expect(initialCancelRefundInput('0')).toBe('0');
    expect(initialCancelRefundInput(null)).toBe('0');
  });

  it('offers no-show only from the check-in day', () => {
    const b = { status: 'CONFIRMED' as const, checkIn: '2026-11-12' };
    expect(bookingActions(b, '2026-11-11')).not.toContain('noShow');
    expect(bookingActions(b, '2026-11-11')).toContain('checkIn');
    expect(bookingActions(b, '2026-11-12')).toContain('noShow');
    expect(bookingActions(b, '2026-11-14')).toContain('noShow');
  });

  it('shows an unpaid no-show as not collected, and nothing due on other closed bookings', () => {
    expect(balanceStat('CONFIRMED', 1700000n)).toEqual({ label: 'Balance due', amount: 1700000n });
    expect(balanceStat('NO_SHOW', 1700000n)).toEqual({ label: 'Not collected', amount: 1700000n });
    expect(balanceStat('NO_SHOW', 0n)).toEqual({ label: 'Balance due', amount: 0n });
    for (const s of ['CANCELLED', 'EXPIRED', 'DECLINED'] as const) {
      expect(balanceStat(s, 1700000n)).toEqual({ label: 'Balance due', amount: 0n });
    }
  });
});
