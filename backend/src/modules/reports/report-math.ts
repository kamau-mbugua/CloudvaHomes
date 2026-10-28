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
