import { describe, expect, it } from 'vitest';
import {
  greeting,
  longDate,
  needView,
  nightsSummary,
  payPill,
  readyPill,
  rowAction,
  rowChip,
  rowStayText,
  stayRange,
  versusLastMonth,
  type DashRow,
} from './dashboard';

const row = (over: Partial<DashRow> = {}): DashRow => ({
  id: 'b1',
  code: 'B00012',
  status: 'CONFIRMED',
  stage: 'ARRIVES_TODAY',
  guestName: 'David Kimani',
  guests: 2,
  unit: { id: 'u1', number: '401', title: 'Quiet 1BR retreat', propertyName: 'Kileleshwa Suites' },
  checkIn: '2026-11-21',
  checkOut: '2026-11-23',
  nights: 2,
  unitReady: false,
  requestExpiresAt: null,
  total: '2000000',
  paid: '1000000',
  owed: '1000000',
  ...over,
});

describe('host dashboard wording', () => {
  it('greets by the time of day and writes the date out', () => {
    expect(greeting(9)).toBe('Good morning');
    expect(greeting(13)).toBe('Good afternoon');
    expect(greeting(19)).toBe('Good evening');
    expect(longDate('2026-11-21')).toBe('Saturday, 21 November');
    expect(stayRange('2026-11-21', '2026-11-23')).toBe('21 → 23 Nov');
    expect(stayRange('2026-11-28', '2026-12-02')).toBe('28 Nov → 2 Dec');
  });

  it('describes an arrival whose unit is dirty and part paid', () => {
    const r = row();
    expect(rowChip(r)).toEqual({ top: 'Today', bottom: 'check-in', tone: 'arrive' });
    expect(rowStayText(r)).toBe('2 nights, to Mon 23');
    expect(payPill(r)).toEqual({ label: 'KES 10,000.00 due', tone: 'due' });
    expect(readyPill(r)).toEqual({ label: 'Not cleaned yet', tone: 'warn' });
    // Checking in is still allowed, just not the highlighted action.
    expect(rowAction(r)).toEqual({ action: 'check-in', label: 'Check in', primary: false });
  });

  it('describes an overdue check-out and offers to check the guest out', () => {
    const r = row({ status: 'CHECKED_IN', stage: 'OVERDUE', checkIn: '2026-11-15', checkOut: '2026-11-19', owed: '0', unitReady: null });
    expect(rowChip(r)).toEqual({ top: '19', bottom: 'Nov, late', tone: 'late' });
    expect(rowStayText(r)).toBe('was due out Thu 19');
    expect(payPill(r)).toEqual({ label: 'Settled', tone: 'ok' });
    expect(readyPill(r)?.tone).toBe('bad');
    expect(rowAction(r).action).toBe('check-out');
    expect(needView({ kind: 'OVERDUE_CHECKOUT', booking: r })).toMatchObject({
      tone: 'red',
      title: 'Check-out overdue',
      action: { kind: 'check-out' },
    });
  });

  it('leaves money out when the caller cannot see it', () => {
    const r = row({ stage: 'REQUESTED', status: 'REQUESTED', total: undefined, paid: undefined, owed: undefined });
    expect(payPill(r)).toBeNull();
    expect(needView({ kind: 'REQUEST', booking: r }).detail).toBe(
      'David Kimani, Quiet 1BR retreat, 21 → 23 Nov, 2 guests.',
    );
  });

  it('compares with last month and names the busiest nights', () => {
    expect(versusLastMonth(6_890_000n, 5_420_000n, 'October')).toEqual({
      text: 'Up 27% on October (KES 54,200.00)',
      up: true,
    });
    expect(versusLastMonth(100n, 0n, 'October')).toBeNull();
    expect(
      nightsSummary(
        [
          { date: '2026-11-27', booked: 8 },
          { date: '2026-11-28', booked: 8 },
          { date: '2026-11-29', booked: 5 },
        ],
        15,
      ),
    ).toBe('Fri 27 and Sat 28 are your busiest nights, with 8 of 15 units booked.');
    expect(nightsSummary([{ date: '2026-11-21', booked: 0 }], 15)).toBe('No units booked in the next 1 night.');
  });
});
