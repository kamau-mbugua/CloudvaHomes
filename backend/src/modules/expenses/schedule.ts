import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';

/** Recurring-expense calendar (pure). Days are capped at 28 so every month has one. */

/** The date `months` after `from`, on `dayOfMonth`. */
export function addMonths(from: string, months: number, dayOfMonth: number): string {
  const d = parseDateOnly(from);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
}

/** First due date for a start date: the start date, its day capped at 28. */
export function firstDue(startDate: string): { nextDue: string; dayOfMonth: number } {
  const day = Math.min(Number(startDate.slice(8, 10)), 28);
  return { nextDue: `${startDate.slice(0, 8)}${String(day).padStart(2, '0')}`, dayOfMonth: day };
}

/** Every date due by `today` (catching up missed ones), and the next due date after them. */
export function dueDates(
  r: { nextDue: Date; everyMonths: number; dayOfMonth: number; endDate: Date | null },
  today: string,
): { dates: string[]; next: string } {
  const dates: string[] = [];
  let next = formatDateOnly(r.nextDue);
  const end = r.endDate ? formatDateOnly(r.endDate) : null;
  while (next <= today && (!end || next <= end) && dates.length < 120) {
    dates.push(next);
    next = addMonths(next, r.everyMonths, r.dayOfMonth);
  }
  return { dates, next };
}
