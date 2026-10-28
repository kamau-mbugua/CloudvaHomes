/**
 * Dates as people in Kenya read them, in Nairobi time whatever the device says — an
 * audit trail must show the same moment to everyone looking at it.
 */
const DATE_TIME = new Intl.DateTimeFormat('en-KE', {
  timeZone: 'Africa/Nairobi',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "27 Oct 2026, 14:05", or an em dash when there is no date. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date);
}

/**
 * A `YYYY-MM-DD` day from a date input as the ISO instant where that day starts (or, with
 * `endOfDay`, ends) in Nairobi (UTC+3, no daylight saving).
 */
export function nairobiDayBoundary(day: string, endOfDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+03:00`).toISOString();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written `YYYY-MM-DD` (rejects 2026-02-30). */
export function isDay(value: string | null | undefined): value is string {
  const match = DAY.exec(value ?? '');
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * A `YYYY-MM-DD` day from the API → "27 Oct 2026". Read from the string itself: a day has
 * no time zone, and going through `Date` would shift it a day for anyone west of UTC.
 */
export function formatDay(day: string | null | undefined): string {
  if (!isDay(day)) return '—';
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

/** Today's date in Nairobi as `YYYY-MM-DD` — the default for a move-in. */
export function todayInNairobi(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
