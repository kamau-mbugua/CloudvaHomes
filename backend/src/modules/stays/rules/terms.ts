import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';

export type BookingMode = 'INSTANT' | 'REQUEST';
export type PayWhen = 'FULL' | 'DEPOSIT' | 'ON_ARRIVAL';
export type Cancellation = 'FLEXIBLE' | 'MODERATE' | 'STRICT' | 'CUSTOM';

export interface StayRules {
  bookingMode: BookingMode;
  payWhen: PayWhen;
  depositPercent: number | null;
  depositFixed: string | null; // minor units as string
  balanceDue: 'BEFORE_CHECKIN' | 'ON_ARRIVAL';
  balanceDaysBefore: number;
  cancellation: Cancellation;
  customFullRefundDays: number | null;
  customLatePercent: number | null;
}

export const DEFAULT_RULES: StayRules = {
  bookingMode: 'INSTANT',
  payWhen: 'FULL',
  depositPercent: null,
  depositFixed: null,
  balanceDue: 'ON_ARRIVAL',
  balanceDaysBefore: 0,
  cancellation: 'MODERATE',
  customFullRefundDays: null,
  customLatePercent: null,
};

const DAY_MS = 86_400_000;

export function effectiveRules(site: StayRules, override: Partial<StayRules> | null): StayRules {
  if (!override) return { ...site };
  const merged: StayRules = { ...site };
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined) {
      (merged as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return merged;
}

export function rulesProblem(r: StayRules): string | null {
  if (r.bookingMode !== 'INSTANT' && r.bookingMode !== 'REQUEST') {
    return 'Choose instant or request booking mode';
  }
  if (r.payWhen !== 'FULL' && r.payWhen !== 'DEPOSIT' && r.payWhen !== 'ON_ARRIVAL') {
    return 'Choose when the guest pays';
  }
  if (r.payWhen === 'DEPOSIT') {
    const hasPct = r.depositPercent !== null && r.depositPercent !== undefined;
    const hasFixed =
      r.depositFixed !== null && r.depositFixed !== undefined && r.depositFixed !== '';
    if (!hasPct && !hasFixed) {
      return 'Set a deposit percentage or fixed amount';
    }
    if (
      hasPct &&
      (!Number.isInteger(r.depositPercent) || r.depositPercent! < 1 || r.depositPercent! > 100)
    ) {
      return 'Deposit percentage must be between 1 and 100';
    }
    if (hasFixed) {
      try {
        const amt = BigInt(r.depositFixed!);
        if (amt <= 0n || amt % 100n !== 0n) return 'Use whole shillings for the deposit';
      } catch {
        return 'Use whole shillings for the deposit';
      }
    }
    if (r.balanceDue === 'BEFORE_CHECKIN') {
      if (
        !Number.isInteger(r.balanceDaysBefore) ||
        r.balanceDaysBefore < 0 ||
        r.balanceDaysBefore > 90
      ) {
        return 'Balance due days must be between 0 and 90';
      }
    }
  }
  if (
    r.cancellation !== 'FLEXIBLE' &&
    r.cancellation !== 'MODERATE' &&
    r.cancellation !== 'STRICT' &&
    r.cancellation !== 'CUSTOM'
  ) {
    return 'Choose a cancellation policy';
  }
  if (r.cancellation === 'CUSTOM') {
    if (
      r.customFullRefundDays === null ||
      !Number.isInteger(r.customFullRefundDays) ||
      r.customFullRefundDays < 0 ||
      r.customFullRefundDays > 90
    ) {
      return 'Set full refund days between 0 and 90';
    }
    if (
      r.customLatePercent === null ||
      !Number.isInteger(r.customLatePercent) ||
      r.customLatePercent < 0 ||
      r.customLatePercent > 100
    ) {
      return 'Set late refund percentage between 0 and 100';
    }
  }
  return null;
}

export function dueNow(r: StayRules, total: bigint): bigint {
  if (total <= 0n) return 0n;
  if (r.payWhen === 'ON_ARRIVAL') return 0n;
  if (r.payWhen === 'FULL') return total;

  // DEPOSIT
  if (r.depositFixed !== null && r.depositFixed !== undefined && r.depositFixed !== '') {
    const fixed = BigInt(r.depositFixed);
    if (fixed <= 0n) return 0n;
    return fixed > total ? total : fixed;
  }
  if (r.depositPercent !== null && r.depositPercent !== undefined) {
    const pct = BigInt(r.depositPercent);
    // Round up to whole shillings (100 minor units):
    const shillings = (total * pct + 9999n) / 10000n;
    const deposit = shillings * 100n;
    return deposit > total ? total : deposit;
  }
  return total;
}

export function balanceDueOn(r: StayRules, checkIn: string): string | null {
  if (r.payWhen === 'FULL') return null;
  if (r.payWhen === 'ON_ARRIVAL') return checkIn;
  if (r.balanceDue === 'BEFORE_CHECKIN') {
    const checkInDate = parseDateOnly(checkIn);
    const due = new Date(checkInDate.getTime() - r.balanceDaysBefore * DAY_MS);
    return formatDateOnly(due);
  }
  return checkIn;
}

export function refundFor(r: StayRules, paid: bigint, checkIn: string, cancelDay: string): bigint {
  if (paid <= 0n) return 0n;
  const daysBefore = Math.floor(
    (parseDateOnly(checkIn).getTime() - parseDateOnly(cancelDay).getTime()) / DAY_MS,
  );

  if (r.cancellation === 'FLEXIBLE') {
    return daysBefore >= 1 ? paid : 0n;
  }
  if (r.cancellation === 'MODERATE') {
    return daysBefore >= 5 ? paid : 0n;
  }
  if (r.cancellation === 'STRICT') {
    if (daysBefore >= 7) {
      return ((paid * 50n) / 10000n) * 100n;
    }
    return 0n;
  }
  // CUSTOM
  const fullDays = r.customFullRefundDays ?? 0;
  const latePct = r.customLatePercent ?? 0;
  if (daysBefore >= fullDays) {
    return paid;
  }
  if (latePct <= 0) return 0n;
  return ((paid * BigInt(latePct)) / 10000n) * 100n;
}

export function describeCancellation(r: StayRules): string {
  switch (r.cancellation) {
    case 'FLEXIBLE':
      return 'Full refund up to 1 day before check-in; no refund after that.';
    case 'MODERATE':
      return 'Full refund up to 5 days before check-in; no refund after that.';
    case 'STRICT':
      return '50% refund up to 7 days before check-in; no refund after that.';
    case 'CUSTOM': {
      const days = r.customFullRefundDays ?? 0;
      const pct = r.customLatePercent ?? 0;
      const dayLabel = days === 1 ? '1 day' : `${days} days`;
      return pct > 0
        ? `Full refund up to ${dayLabel} before check-in, then ${pct}% refund.`
        : `Full refund up to ${dayLabel} before check-in; no refund after that.`;
    }
  }
}
