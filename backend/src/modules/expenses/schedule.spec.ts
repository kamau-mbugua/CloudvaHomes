import { parseDateOnly } from '../../common/dates/date-only.js';
import { addMonths, dueDates, firstDue } from './schedule.js';

describe('recurring expense schedule', () => {
  it('caps the day at 28 and steps whole months across years', () => {
    expect(firstDue('2026-01-31')).toEqual({ nextDue: '2026-01-28', dayOfMonth: 28 });
    expect(addMonths('2026-11-28', 3, 28)).toBe('2027-02-28');
    expect(addMonths('2026-01-05', 12, 5)).toBe('2027-01-05');
  });

  it('catches up every missed date, stops at the end date', () => {
    const r = {
      nextDue: parseDateOnly('2026-07-05'),
      everyMonths: 1,
      dayOfMonth: 5,
      endDate: null,
    };
    expect(dueDates(r, '2026-10-04')).toEqual({
      dates: ['2026-07-05', '2026-08-05', '2026-09-05'],
      next: '2026-10-05',
    });
    expect(dueDates({ ...r, endDate: parseDateOnly('2026-08-31') }, '2026-10-04').dates).toEqual([
      '2026-07-05',
      '2026-08-05',
    ]);
    expect(dueDates(r, '2026-07-04')).toEqual({ dates: [], next: '2026-07-05' });
  });
});
