import { formatDateOnly, isDateOnly, parseDateOnly } from './date-only.js';

describe('date-only', () => {
  it('parses to UTC midnight and formats back', () => {
    const d = parseDateOnly('2026-11-01');
    expect(d.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(formatDateOnly(d)).toBe('2026-11-01');
  });

  it('rejects impossible and malformed dates', () => {
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(isDateOnly('2026-13-01')).toBe(false);
    expect(isDateOnly('2026-1-01')).toBe(false);
    expect(isDateOnly('2026-11-01T00:00:00Z')).toBe(false);
    expect(isDateOnly(20261101)).toBe(false);
    expect(isDateOnly('2028-02-29')).toBe(true);
  });
});
