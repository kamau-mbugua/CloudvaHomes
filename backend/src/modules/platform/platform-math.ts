import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { addDays } from '../billing/billing-math.js';
import { monthBounds } from '../reports/report-math.js';

/** Pure platform-billing rules. */

export type OrgStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'CLOSED';

/**
 * Computes when an organisation's paid subscription starts (`firstPaidDate`) and when its first
 * monthly Hodi invoice will be issued (`firstInvoiceDate`, the 1st of the month following the
 * first billable calendar month).
 */
export function firstPlatformBillingDates(
  trialEndsAt: Date | null,
  today: string,
): { firstPaidDate: string; firstBillablePeriod: string; firstInvoiceDate: string } {
  const trialStr = trialEndsAt ? formatDateOnly(trialEndsAt) : null;
  const firstPaid =
    trialEndsAt && trialStr && trialStr >= today ? addDays(trialEndsAt, 1) : parseDateOnly(today);
  const firstPaidDate = formatDateOnly(firstPaid);
  const firstBillablePeriod = firstPaidDate.slice(0, 7);
  const { end } = monthBounds(firstBillablePeriod);
  const firstInvoiceDate = formatDateOnly(addDays(end, 1));
  return { firstPaidDate, firstBillablePeriod, firstInvoiceDate };
}

/** The month's Hodi charge: units × price, never below the minimum. */
export function platformTotal(units: number, rate: bigint, minimum: bigint): bigint {
  const t = BigInt(units) * rate;
  return t > minimum ? t : minimum;
}

/** The previous month of a date: "2026-11-01" → "2026-10". */
export function previousPeriod(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface StatusInput {
  current: OrgStatus;
  today: string;
  trialEndsAt: string | null;
  noSuspendUntil: string | null;
  /** Due date of the oldest unpaid platform invoice, if any is past due. */
  oldestOverdueDue: string | null;
  suspendAfterDays: number;
}

/**
 * Where an organisation should be today. CLOSED is the admin's decision and never changes
 * here. "No suspension until" holds an organisation at GRACE at worst.
 */
export function statusFor(s: StatusInput): OrgStatus {
  if (s.current === 'CLOSED') return 'CLOSED';
  if (s.oldestOverdueDue) {
    const days = Math.round(
      (Date.parse(`${s.today}T00:00:00Z`) - Date.parse(`${s.oldestOverdueDue}T00:00:00Z`)) /
        86_400_000,
    );
    const held = s.noSuspendUntil !== null && s.today <= s.noSuspendUntil;
    if (days >= s.suspendAfterDays && !held) return 'SUSPENDED';
    if (days > 0) return 'GRACE';
  }
  return s.trialEndsAt && s.today <= s.trialEndsAt ? 'TRIAL' : 'ACTIVE';
}
