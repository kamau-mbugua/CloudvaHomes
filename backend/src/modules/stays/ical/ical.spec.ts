import { parseDateOnly } from '../../../common/dates/date-only.js';
import { buildIcs } from './ical.js';

describe('buildIcs', () => {
  const now = new Date('2026-11-24T09:30:00.000Z');

  it('writes all-day events with exclusive check-out and no guest data', () => {
    const ics = buildIcs({
      calendarName: 'Garden Cottage, Naivasha',
      now,
      ranges: [
        {
          id: 'b1',
          from: parseDateOnly('2026-12-20'),
          to: parseDateOnly('2026-12-23'),
          kind: 'STAY',
        },
        {
          id: 'b2',
          from: parseDateOnly('2027-01-02'),
          to: parseDateOnly('2027-01-03'),
          kind: 'BLOCK',
        },
      ],
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:Garden Cottage\\, Naivasha');
    expect(buildIcs({ calendarName: 'A;B', now, ranges: [] })).toContain('X-WR-CALNAME:A\\;B');
    expect(ics).toContain('UID:b1@kodihq.co.ke\r\nDTSTAMP:20261124T093000Z');
    expect(ics).toContain(
      'DTSTART;VALUE=DATE:20261220\r\nDTEND;VALUE=DATE:20261223\r\nSUMMARY:Reserved',
    );
    expect(ics).toContain('SUMMARY:Not available');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('folds long lines', () => {
    const ics = buildIcs({ calendarName: 'x'.repeat(120), now, ranges: [] });
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  });
});
