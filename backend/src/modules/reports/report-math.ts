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
  | 'MOVE_OUTS_THIS_WEEK'
  | 'NOTICE_ENDING'
  | 'DEPOSIT_REFUNDS_PENDING'
  | 'WORK_ORDERS_OVERDUE'
  | 'REMITTANCES_TO_APPROVE'
  | 'LEASES_EXPIRING';

export interface ActionItem {
  kind: ActionKind;
  count: number;
  /** Money involved, minor units — on OVERDUE_TENANTS and DEPOSIT_REFUNDS_PENDING. */
  amount?: bigint;
}

export interface ActionInput {
  uninvoicedTenancies: number;
  unmatchedInbound: number;
  overdueTenants: number;
  overdueAmount: bigint;
  /** Phase 14: still under notice with a move-out date in the next 7 days (or passed). */
  moveOutsIn7Days?: number;
  /** Under notice, moving out 8 to 14 days from now. */
  noticeEndingIn14Days: number;
  /** Phase 14: ended tenancies still holding a deposit, and how much. */
  depositRefundsPending?: number;
  depositRefundsAmount?: bigint;
  /** Phase 18: open maintenance jobs past their priority's response time. */
  lateJobs?: number;
  draftRemittances: number;
  leasesExpiringIn60Days: number;
}

/** The non-empty actions, in a fixed order (most time-sensitive money first). */
export function buildActionItems(i: ActionInput): ActionItem[] {
  const all: ActionItem[] = [
    { kind: 'INVOICE_RUN_PENDING', count: i.uninvoicedTenancies },
    { kind: 'UNMATCHED_PAYMENTS', count: i.unmatchedInbound },
    { kind: 'OVERDUE_TENANTS', count: i.overdueTenants, amount: i.overdueAmount },
    { kind: 'MOVE_OUTS_THIS_WEEK', count: i.moveOutsIn7Days ?? 0 },
    { kind: 'NOTICE_ENDING', count: i.noticeEndingIn14Days },
    {
      kind: 'DEPOSIT_REFUNDS_PENDING',
      count: i.depositRefundsPending ?? 0,
      amount: i.depositRefundsAmount ?? 0n,
    },
    { kind: 'WORK_ORDERS_OVERDUE', count: i.lateJobs ?? 0 },
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
