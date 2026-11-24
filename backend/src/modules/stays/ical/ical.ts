import { formatDateOnly } from '../../../common/dates/date-only.js';

/** One busy range on a listing's calendar: check-in day to check-out day (exclusive). */
export interface BusyRange {
  id: string;
  from: Date;
  to: Date;
  kind: 'STAY' | 'BLOCK';
}

const day = (d: Date) => formatDateOnly(d).replaceAll('-', '');

/** RFC 5545 text escaping. */
function text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

/**
 * A listing's calendar as iCalendar (phase 20, export): all-day events for stays and blocked
 * dates, so Airbnb, Booking.com and others can block the same nights. Dates only — never a
 * guest's name, phone or the price. DTEND is the check-out day, which iCal treats as
 * exclusive, matching how stays are stored.
 */
export function buildIcs(p: { calendarName: string; ranges: BusyRange[]; now: Date }): string {
  const stamp = p.now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KodiHQ//Stays calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(p.calendarName)}`,
  ];
  for (const r of p.ranges) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@kodihq.co.ke`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(r.from)}`,
      `DTEND;VALUE=DATE:${day(r.to)}`,
      `SUMMARY:${r.kind === 'BLOCK' ? 'Not available' : 'Reserved'}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
