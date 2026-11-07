import { formatKES } from '../lib/money';

export function formatMinorKES(minor: string | number): string {
  return formatKES(Number(minor)).replace(/\.00$/, '');
}

export type BookingStepId = 'dates' | 'details' | 'code' | 'review' | 'pay' | 'sent';

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
