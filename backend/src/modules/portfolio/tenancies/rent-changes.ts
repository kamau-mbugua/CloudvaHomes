/**
 * Scheduled rent changes (phase 13): a tenancy's rent moves to `newRent` from the first day
 * of `effectivePeriod` ("YYYY-MM"). Only months not yet invoiced can change, so a bill
 * already sent is never re-priced. Pure rules; RentChangesService stores and applies them.
 */

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** The first month whose rent can still change: after the last billed month, and not past. */
export function earliestChangePeriod(t: {
  lastBilledPeriod: string | null;
  currentPeriod: string;
}): string {
  const afterBilled = t.lastBilledPeriod ? nextPeriod(t.lastBilledPeriod) : t.currentPeriod;
  return afterBilled > t.currentPeriod ? afterBilled : t.currentPeriod;
}

export function validateRentChange(
  effectivePeriod: string,
  earliest: string,
): 'OK' | 'ALREADY_BILLED' {
  return effectivePeriod < earliest ? 'ALREADY_BILLED' : 'OK';
}

/** The rent for `period`: the latest scheduled change that has started, else the current rent. */
export function rentForPeriod(
  rent: bigint,
  pending: readonly { effectivePeriod: string; newRent: bigint }[],
  period: string,
): bigint {
  const started = pending
    .filter((c) => c.effectivePeriod <= period)
    .sort((a, b) => (a.effectivePeriod < b.effectivePeriod ? -1 : 1));
  return started.length ? started[started.length - 1]!.newRent : rent;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2026-11" → "Nov 2026". */
export function shortPeriodLabel(period: string): string {
  return `${SHORT_MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}
