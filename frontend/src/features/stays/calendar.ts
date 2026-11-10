import { fromMinor } from './money';
import type { BookingStatus } from './types';

const DAY_MS = 86_400_000;

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, delta: number): string {
  const ms = parseIsoDate(iso).getTime() + delta * DAY_MS;
  return formatIsoDate(new Date(ms));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / DAY_MS);
}

export function todayIso(now = new Date()): string {
  const eat = new Date(now.getTime() + 3 * 3600_000);
  return eat.toISOString().slice(0, 10);
}

export function dayColumns(from: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(addDays(from, i));
  }
  return out;
}

export interface CalendarBarPlacement {
  start: number;
  span: number;
  clippedLeft: boolean;
  clippedRight: boolean;
}

export function barFor(
  item: { checkIn: string; checkOut: string },
  from: string,
  days: number,
): CalendarBarPlacement | null {
  const winEnd = addDays(from, days);
  const checkIn = item.checkIn.slice(0, 10);
  const checkOut = item.checkOut.slice(0, 10);

  if (checkOut <= from || checkIn >= winEnd) {
    return null;
  }

  const clippedLeft = checkIn < from;
  const clippedRight = checkOut > winEnd;
  const visibleStart = clippedLeft ? from : checkIn;
  const visibleEnd = clippedRight ? winEnd : checkOut;

  const start = daysBetween(from, visibleStart);
  const span = daysBetween(visibleStart, visibleEnd);

  if (span <= 0) return null;

  return {
    start,
    span,
    clippedLeft,
    clippedRight,
  };
}

export type BookingAction =
  | 'accept'
  | 'decline'
  | 'mpesaPrompt'
  | 'recordPayment'
  | 'refund'
  | 'checkIn'
  | 'checkOut'
  | 'noShow'
  | 'cancel';

export function bookingActionsForStatus(status: BookingStatus): BookingAction[] {
  switch (status) {
    case 'REQUESTED':
      return ['accept', 'decline', 'cancel'];
    case 'HELD':
      return ['mpesaPrompt', 'recordPayment', 'cancel'];
    case 'CONFIRMED':
      return ['checkIn', 'mpesaPrompt', 'recordPayment', 'noShow', 'refund', 'cancel'];
    case 'CHECKED_IN':
      return ['checkOut', 'mpesaPrompt', 'recordPayment', 'refund'];
    case 'COMPLETED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'NO_SHOW':
      return ['refund'];
    case 'DECLINED':
      return [];
  }
}

/** Actions for one booking on `today` (Nairobi): a no-show can only be marked from the check-in day. */
export function bookingActions(b: { status: BookingStatus; checkIn: string }, today: string): BookingAction[] {
  const actions = bookingActionsForStatus(b.status);
  return b.checkIn > today ? actions.filter((a) => a !== 'noShow') : actions;
}

/**
 * The last money tile on a booking. Closed bookings get no reminders, so nothing is "due":
 * an unpaid no-show shows what was never collected; other closed bookings owe nothing.
 */
export function balanceStat(status: BookingStatus, balance: bigint): { label: string; amount: bigint } {
  if (status === 'NO_SHOW' && balance > 0n) return { label: 'Not collected', amount: balance };
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'DECLINED') {
    return { label: 'Balance due', amount: 0n };
  }
  return { label: 'Balance due', amount: balance };
}

export function initialCancelRefundInput(
  suggestedRefundMinor: string | null | undefined,
): string {
  if (!suggestedRefundMinor) return '0';
  return fromMinor(suggestedRefundMinor) || '0';
}

export function bookingStatusBadge(status: BookingStatus): {
  label: string;
  className: string;
  barClassName: string;
} {
  switch (status) {
    case 'REQUESTED':
      return {
        label: 'Requested',
        className: 'ad__badge ad__badge--warn',
        barClassName: 'st__cal__bar--requested',
      };
    case 'HELD':
      return {
        label: 'Waiting for payment',
        className: 'ad__badge ad__badge--part',
        barClassName: 'st__cal__bar--held',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        className: 'ad__badge ad__badge--ok',
        barClassName: 'st__cal__bar--confirmed',
      };
    case 'CHECKED_IN':
      return {
        label: 'Checked in',
        className: 'ad__badge ad__badge--info',
        barClassName: 'st__cal__bar--checked-in',
      };
    case 'COMPLETED':
      return {
        label: 'Completed',
        className: 'ad__badge ad__badge--off',
        barClassName: 'st__cal__bar--completed',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        className: 'ad__badge ad__badge--bad',
        barClassName: 'st__cal__bar--cancelled',
      };
    case 'DECLINED':
      return {
        label: 'Declined',
        className: 'ad__badge ad__badge--bad',
        barClassName: 'st__cal__bar--cancelled',
      };
    case 'EXPIRED':
      return {
        label: 'Expired',
        className: 'ad__badge ad__badge--bad',
        barClassName: 'st__cal__bar--cancelled',
      };
    case 'NO_SHOW':
      return {
        label: 'No-show',
        className: 'ad__badge ad__badge--bad',
        barClassName: 'st__cal__bar--cancelled',
      };
  }
}
