import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';

/** Pure helpers for reports. */

/** "2026-10" → first and last day as dates. */
export function monthBounds(period: string): { start: Date; end: Date } {
  const start = parseDateOnly(`${period}-01`);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end: new Date(next.getTime() - 86_400_000) };
}

/** The `count` months ending at `period`, oldest first. */
export function lastMonths(period: string, count: number): string[] {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const total = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

export type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus';

/** Ageing bucket for an invoice due on `due`, as of `today` (both YYYY-MM-DD). */
export function ageBucket(due: string, today: string): Bucket {
  const days = Math.round(
    (parseDateOnly(today).getTime() - parseDateOnly(due).getTime()) / 86_400_000,
  );
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90plus';
}

/** a / b as a 0–1 number rounded to 4 places, or null when b is 0. */
export function ratio(a: bigint | number, b: bigint | number): number | null {
  const den = Number(b);
  if (!den) return null;
  return Math.round((Number(a) / den) * 10_000) / 10_000;
}

export const BUCKETS: Bucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'];

export function isoDay(d: Date): string {
  return formatDateOnly(d);
}

/** Things on the dashboard's "Needs attention" list, in the order they are shown. */
export type ActionKind =
  | 'INVOICE_RUN_PENDING'
  | 'UNMATCHED_PAYMENTS'
  | 'OVERDUE_TENANTS'
  | 'NOTICE_ENDING'
  | 'REMITTANCES_TO_APPROVE'
  | 'LEASES_EXPIRING';

export interface ActionItem {
  kind: ActionKind;
  count: number;
  /** Money involved, minor units — only on OVERDUE_TENANTS. */
  amount?: bigint;
}

export interface ActionInput {
  uninvoicedTenancies: number;
  unmatchedInbound: number;
  overdueTenants: number;
  overdueAmount: bigint;
  noticeEndingIn14Days: number;
  draftRemittances: number;
  leasesExpiringIn60Days: number;
}

/** The non-empty actions, in a fixed order (most time-sensitive money first). */
export function buildActionItems(i: ActionInput): ActionItem[] {
  const all: ActionItem[] = [
    { kind: 'INVOICE_RUN_PENDING', count: i.uninvoicedTenancies },
    { kind: 'UNMATCHED_PAYMENTS', count: i.unmatchedInbound },
    { kind: 'OVERDUE_TENANTS', count: i.overdueTenants, amount: i.overdueAmount },
    { kind: 'NOTICE_ENDING', count: i.noticeEndingIn14Days },
    { kind: 'REMITTANCES_TO_APPROVE', count: i.draftRemittances },
    { kind: 'LEASES_EXPIRING', count: i.leasesExpiringIn60Days },
  ];
  return all.filter((a) => a.count > 0);
}

// ── Rental income tax (MRI, phase 13) ──

/** Half-up division for signed bigints (a reversal rounds the same way, in the other direction). */
function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const q = (abs * 2n + d) / (2n * d);
  return neg ? -q : q;
}

/** The rent part of money allocated to an invoice: allocated × rent ÷ invoice total. */
export function rentShare(allocated: bigint, invoiceRent: bigint, invoiceTotal: bigint): bigint {
  if (invoiceTotal <= 0n || invoiceRent <= 0n) return 0n;
  return divRound(allocated * invoiceRent, invoiceTotal);
}

/** Tax on a month's gross residential rent at `rateBps` (750 = 7.5%); never negative. */
export function mriDue(grossRent: bigint, rateBps: number): bigint {
  if (grossRent <= 0n) return 0n;
  return divRound(grossRent * BigInt(rateBps), 10_000n);
}

/** MRI for a month is due on the 20th of the next month. */
export function mriDueDate(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-20` : `${y}-${String(m + 1).padStart(2, '0')}-20`;
}
