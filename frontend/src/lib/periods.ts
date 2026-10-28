import { todayInNairobi } from './dates';

/**
 * Billing periods: a calendar month written `YYYY-MM`, read in Nairobi time. Pure string
 * arithmetic — no `Date` — so a period never shifts with the device's time zone.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriod(value: string | null | undefined): value is string {
  return PERIOD.test(value ?? '');
}

/** "2026-10-27" → "2026-10". */
export function periodOf(day: string): string {
  return day.slice(0, 7);
}

/** This month in Nairobi. */
export function currentPeriod(now: Date = new Date()): string {
  return periodOf(todayInNairobi(now));
}

/** "2026-01" shifted by -1 → "2025-12". */
export function shiftPeriod(period: string, months: number): string {
  const match = PERIOD.exec(period);
  if (!match) return period;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** "2026-10" → "Oct 2026" (or "October 2026" with `long`). Anything else → em dash. */
export function formatPeriod(period: string | null | undefined, long = false): string {
  const match = PERIOD.exec(period ?? '');
  if (!match) return '—';
  return `${(long ? LONG_MONTHS : MONTHS)[Number(match[2]) - 1]} ${match[1]}`;
}
