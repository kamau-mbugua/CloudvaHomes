import { describe, expect, it } from 'vitest';
import { currentPeriod, formatPeriod, isPeriod, periodOf, shiftPeriod } from './periods';

describe('periods', () => {
  it('recognises YYYY-MM months only', () => {
    expect(isPeriod('2026-10')).toBe(true);
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod('2026-1')).toBe(false);
    expect(isPeriod('2026-10-01')).toBe(false);
    expect(isPeriod(null)).toBe(false);
  });

  it('takes the month of a day', () => {
    expect(periodOf('2026-10-27')).toBe('2026-10');
  });

  it('is this month in Nairobi, not UTC', () => {
    // 31 Oct 2026, 22:30 UTC is already 1 Nov in Nairobi (UTC+3).
    expect(currentPeriod(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11');
    expect(currentPeriod(new Date('2026-10-31T20:59:00Z'))).toBe('2026-10');
  });

  it('steps across year ends', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-10', -13)).toBe('2025-09');
    expect(shiftPeriod('nope', 1)).toBe('nope');
  });

  it('formats short and long', () => {
    expect(formatPeriod('2026-10')).toBe('Oct 2026');
    expect(formatPeriod('2026-01', true)).toBe('January 2026');
    expect(formatPeriod('')).toBe('—');
  });
});
