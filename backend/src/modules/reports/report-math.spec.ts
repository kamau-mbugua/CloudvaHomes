import { ageBucket, lastMonths, monthBounds, ratio } from './report-math.js';

describe('report helpers', () => {
  it('finds month bounds, leap years included', () => {
    const { start, end } = monthBounds('2028-02');
    expect([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]).toEqual([
      '2028-02-01',
      '2028-02-29',
    ]);
  });

  it('lists the last N months across a year end', () => {
    expect(lastMonths('2027-02', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('ages invoices by days past due', () => {
    expect(ageBucket('2026-10-27', '2026-10-27')).toBe('current');
    expect(ageBucket('2026-10-26', '2026-10-27')).toBe('d1_30');
    expect(ageBucket('2026-09-27', '2026-10-27')).toBe('d1_30');
    expect(ageBucket('2026-09-26', '2026-10-27')).toBe('d31_60');
    expect(ageBucket('2026-07-01', '2026-10-27')).toBe('d90plus');
  });

  it('computes ratios safely', () => {
    expect(ratio(1n, 3n)).toBe(0.3333);
    expect(ratio(5, 0)).toBeNull();
  });
});
