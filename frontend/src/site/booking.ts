import { formatKES } from '../lib/money';

export function formatMinorKES(minor: string | number): string {
  return formatKES(Number(minor)).replace(/\.00$/, '');
}

export type BookingStepId = 'dates' | 'details' | 'code' | 'review' | 'pay' | 'sent';

export const STEP_LABELS: Record<BookingStepId, string> = {
  dates: 'Dates',
  details: 'Your details',
  code: 'Confirm phone',
  review: 'Review',
  pay: 'Pay',
  sent: 'Request sent',
};

const GUEST_STATUS: Record<string, string> = {
  HELD: 'Waiting for payment',
  REQUESTED: 'Waiting for the host',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  DECLINED: 'Declined',
  NO_SHOW: 'No-show',
};

/** What a guest sees for a booking status: plain words, never the raw code. */
export function guestStatusLabel(status: string): string {
  const known = GUEST_STATUS[status];
  if (known) return known;
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Hold countdown: "1 h 59 min" for an hour or more, "14:59" under an hour. */
export function holdTimeLeft(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export interface BookingStepState {
  hasDates: boolean;
  hasDetails: boolean;
  hasVerifiedCode: boolean;
  hasReviewed: boolean;
  bookingMode: 'INSTANT' | 'REQUEST';
}

export function bookingSteps(state: BookingStepState): {
  next: BookingStepId;
  order: readonly BookingStepId[];
} {
  const terminal: BookingStepId = state.bookingMode === 'REQUEST' ? 'sent' : 'pay';
  const order: readonly BookingStepId[] = ['dates', 'details', 'code', 'review', terminal];
  if (!state.hasDates) return { next: 'dates', order };
  if (!state.hasDetails) return { next: 'details', order };
  if (!state.hasVerifiedCode) return { next: 'code', order };
  if (!state.hasReviewed) return { next: 'review', order };
  return { next: terminal, order };
}

export function payLabel(
  dueNowMinor: string | number,
  payWhen: 'FULL' | 'DEPOSIT' | 'ON_ARRIVAL',
  bookingMode: 'INSTANT' | 'REQUEST' = 'INSTANT',
): string {
  if (bookingMode === 'REQUEST') {
    return 'Send request';
  }
  const due = BigInt(String(dueNowMinor || '0'));
  if (payWhen === 'ON_ARRIVAL' || due <= 0n) {
    return 'Book — pay on arrival';
  }
  return `Pay ${formatMinorKES(due.toString())} now`;
}

export function isNightDisabled(
  dayIso: string,
  unavailable: ReadonlySet<string> | readonly string[],
  minDayIso?: string,
): boolean {
  if (minDayIso && dayIso < minDayIso) return true;
  if (unavailable instanceof Set) {
    return (unavailable as ReadonlySet<string>).has(dayIso);
  }
  return (unavailable as readonly string[]).includes(dayIso);
}

export function rangeHasUnavailable(
  checkInIso: string,
  checkOutIso: string,
  unavailable: ReadonlySet<string> | readonly string[],
): boolean {
  if (!checkInIso || !checkOutIso || checkOutIso <= checkInIso) return true;
  const set = unavailable instanceof Set ? unavailable : new Set(unavailable);
  const start = new Date(`${checkInIso}T00:00:00Z`).getTime();
  const end = new Date(`${checkOutIso}T00:00:00Z`).getTime();
  for (let ms = start; ms < end; ms += 86_400_000) {
    const iso = new Date(ms).toISOString().slice(0, 10);
    if (set.has(iso)) return true;
  }
  return false;
}

export function bookingErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (code === 'DATES_TAKEN') {
      return 'Those dates were just taken — pick other dates';
    }
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) {
      return msg;
    }
  }
  return 'Something went wrong — please try again.';
}

export function digitsOnly(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D+/g, '');
}

/** Today's date (YYYY-MM-DD) in Nairobi (UTC+3, no daylight saving). */
export function nairobiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** After check-in changes: keep check-out if it is still later, else move it to the next day. */
export function checkOutAfter(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return checkOut;
  return checkOut > checkIn ? checkOut : nextDay(checkIn);
}

/** A plain reason the dates can't be searched or booked, or null when they are fine. */
export function dateRangeProblem(checkIn: string, checkOut: string, today: string = nairobiToday()): string | null {
  if (!checkIn) return 'Choose a check-in date.';
  if (!checkOut) return 'Choose a check-out date.';
  if (checkIn < today) return 'Check-in can’t be in the past.';
  if (checkOut <= checkIn) return 'Check-out must be at least one night after check-in.';
  return null;
}

/**
 * What the guest owes right now — the same rule as the server's M-Pesa prompt: while dates are
 * held, the deposit less what is already paid (net of refunds); after that, the rest of the stay.
 */
export function amountDueNow(b: {
  status: string;
  dueNow: string;
  amountPaid: string;
  amountRefunded: string;
  owed: string;
}): bigint {
  const netPaid = BigInt(b.amountPaid || '0') - BigInt(b.amountRefunded || '0');
  const dueNow = BigInt(b.dueNow || '0');
  if (b.status === 'HELD' && dueNow > netPaid) return dueNow - netPaid;
  const owed = BigInt(b.owed || '0');
  return owed > 0n ? owed : 0n;
}

/** For hosts with no paybill/till on the site: who tells the guest how to pay (null = guest can pay here). */
export function howToPayLine(b: {
  canPayInApp: boolean;
  paybill: { number: string; accountRef: string } | null;
  contact: { businessName: string; phone: string | null; whatsappPhone: string | null };
}): string | null {
  if (b.canPayInApp || b.paybill) return null;
  const head = `${b.contact.businessName} will tell you how to pay.`;
  if (b.contact.phone) return `${head} Call ${b.contact.phone} if you have not heard from them.`;
  if (b.contact.whatsappPhone) return `${head} WhatsApp ${b.contact.whatsappPhone} if you have not heard from them.`;
  return head;
}
