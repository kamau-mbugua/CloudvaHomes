import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import type { InvoiceStatus } from '../../generated/prisma/client.js';

/**
 * Pure billing arithmetic. Money is BigInt cents; meter quantities are exact decimals with
 * three places, handled as BigInt thousandths ("milli") — never floats.
 */

const QUANTITY = /^\d{1,11}(\.\d{1,3})?$/;

/** "12.5" → 12500n thousandths. Throws RangeError on anything but a non-negative ≤3-dp number. */
export function toMilli(text: string): bigint {
  const t = text.trim();
  if (!QUANTITY.test(t)) throw new RangeError(`Not a quantity: "${text}"`);
  const [whole, frac = ''] = t.split('.');
  return BigInt(whole!) * 1000n + BigInt(frac.padEnd(3, '0'));
}

/** 12500n → "12.500" */
export function fromMilli(milli: bigint): string {
  const neg = milli < 0n;
  const abs = neg ? -milli : milli;
  return `${neg ? '-' : ''}${abs / 1000n}.${(abs % 1000n).toString().padStart(3, '0')}`;
}

export function isQuantity(text: unknown): boolean {
  return typeof text === 'string' && QUANTITY.test(text.trim());
}

/** Consumption (thousandths of a unit) × rate (cents per unit), rounded half-up to the cent. */
export function meteredAmount(consumptionMilli: bigint, unitRate: bigint): bigint {
  return (consumptionMilli * unitRate + 500n) / 1000n;
}

/** Status follows the money: nothing settled → ISSUED; fully settled → PAID. */
export function invoiceStatus(total: bigint, paid: bigint, credited: bigint): InvoiceStatus {
  const settled = paid + credited;
  if (settled >= total) return 'PAID';
  return settled > 0n ? 'PARTIALLY_PAID' : 'ISSUED';
}

export function balanceOf(i: { total: bigint; amountPaid: bigint; creditedAmount: bigint }) {
  return i.total - i.amountPaid - i.creditedAmount;
}

/** Move-in charge for a rent: N × rent, or the fixed amount. */
export function moveInAmount(
  c: { amount: bigint | null; rentMonths: number | null },
  rent: bigint,
) {
  return c.rentMonths ? rent * BigInt(c.rentMonths) : (c.amount ?? 0n);
}

// ── Calendar (Africa/Nairobi, design §4.2) ──

const NAIROBI_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Nairobi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Nairobi as "YYYY-MM-DD". */
export function todayInNairobi(now = new Date()): string {
  return NAIROBI_DAY.format(now);
}

export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-10-27" → "2026-10" */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

/** The date in `period` on which a tenancy with `billingDay` (1–28) is billed. */
export function billingDate(period: string, billingDay: number): Date {
  return parseDateOnly(`${period}-${String(billingDay).padStart(2, '0')}`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export interface RunCandidate {
  status: 'ACTIVE' | 'NOTICE' | 'ENDED';
  billingDay: number;
  startDate: Date;
  endDate: Date | null;
  /** Short notice (phase 14): rent runs to this date, even after the tenant leaves. */
  noticeEndsOn?: Date | null;
}

/** The last day rent is billed for: the move-out date, or a later notice end (rent in lieu). */
export function rentRunsTo(t: Pick<RunCandidate, 'endDate' | 'noticeEndsOn'>): Date | null {
  if (t.noticeEndsOn && t.endDate && t.noticeEndsOn > t.endDate) return t.noticeEndsOn;
  return t.endDate;
}

/**
 * Whether the run on `date` bills this tenancy for date's month (ignoring whether it already
 * has an invoice): its billing day has come, it had started by then, and it doesn't end
 * before it. An ended tenancy is billed only for rent in lieu of short notice.
 */
export function isDueForRun(t: RunCandidate, date: string): boolean {
  const runsTo = rentRunsTo(t);
  if (t.status === 'ENDED' && runsTo === t.endDate) return false;
  const day = billingDate(periodOf(date), t.billingDay);
  if (formatDateOnly(day) > date) return false;
  if (t.startDate > day) return false;
  return !runsTo || runsTo >= day;
}

/**
 * Notice to vacate (phase 14): the earliest move-out date `noticeDays` allows from `givenOn`,
 * and, for an earlier `moveOut`, the rent in lieu: one month's rent for each billing day
 * after the move-out and up to the end of the notice period.
 */
export function noticeTerms(p: {
  givenOn: Date;
  noticeDays: number;
  moveOut: Date;
  billingDay: number;
  rent: bigint;
}): { earliest: Date; shortNotice: boolean; noticeEndsOn: Date | null; rentInLieu: bigint } {
  const earliest = addDays(p.givenOn, p.noticeDays);
  if (p.moveOut >= earliest) {
    return { earliest, shortNotice: false, noticeEndsOn: null, rentInLieu: 0n };
  }
  let months = 0n;
  let period = periodOf(formatDateOnly(p.moveOut));
  for (;;) {
    const day = billingDate(period, p.billingDay);
    if (day > earliest) break;
    if (day > p.moveOut) months += 1n;
    period = nextPeriod(period);
  }
  return { earliest, shortNotice: true, noticeEndsOn: earliest, rentInLieu: months * p.rent };
}

function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
