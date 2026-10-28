import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDay, isDay, nairobiDayBoundary, todayInNairobi } from './dates';

describe('formatDateTime', () => {
  it('shows Nairobi time', () => {
    expect(formatDateTime('2026-10-27T11:05:00Z')).toMatch(/27 Oct 2026.*14:05/);
  });

  it('shows a dash for missing or bad dates', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('nope')).toBe('—');
  });
});

describe('nairobiDayBoundary', () => {
  it('converts a day to its Nairobi start and end instants', () => {
    expect(nairobiDayBoundary('2026-10-27')).toBe('2026-10-26T21:00:00.000Z');
    expect(nairobiDayBoundary('2026-10-27', true)).toBe('2026-10-27T20:59:59.999Z');
    expect(nairobiDayBoundary('')).toBeUndefined();
  });
});

describe('isDay', () => {
  it('accepts real days only', () => {
    expect(isDay('2026-10-27')).toBe(true);
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('27/10/2026')).toBe(false);
    expect(isDay(null)).toBe(false);
  });
});

describe('formatDay', () => {
  it('formats the day as written, without shifting it', () => {
    expect(formatDay('2026-10-27')).toBe('27 Oct 2026');
    expect(formatDay('2027-01-01')).toBe('1 Jan 2027');
    expect(formatDay(null)).toBe('—');
    expect(formatDay('soon')).toBe('—');
  });
});

describe('todayInNairobi', () => {
  it('uses the Nairobi calendar day', () => {
    // 22:30 UTC is already the next day in Nairobi (UTC+3).
    expect(todayInNairobi(new Date('2026-10-27T22:30:00Z'))).toBe('2026-10-28');
    expect(todayInNairobi(new Date('2026-10-27T20:59:00Z'))).toBe('2026-10-27');
  });
});
