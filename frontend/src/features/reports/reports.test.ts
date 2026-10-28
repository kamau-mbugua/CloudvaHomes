import { describe, expect, it } from 'vitest';
import { checkMonthRange, columnPath, daysBetween, formatCompactKES, formatRate, niceScale, periodRange, pnlCategories, readReportTab } from './rules';
import type { PnlFigures } from './types';

describe('formatRate', () => {
  it('shows a 0–1 rate as a percentage', () => {
    expect(formatRate(0.82)).toBe('82%');
    expect(formatRate(0.8251)).toBe('82.5%');
    expect(formatRate(1)).toBe('100%');
    expect(formatRate(0)).toBe('0%');
  });

  it('shows a dash with nothing to divide by', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(undefined)).toBe('—');
    expect(formatRate(Number.NaN)).toBe('—');
  });
});

describe('formatCompactKES', () => {
  it('shortens cents for an axis', () => {
    expect(formatCompactKES(0)).toBe('0');
    expect(formatCompactKES(50_000)).toBe('KES 500');
    expect(formatCompactKES(25_000_000)).toBe('KES 250K');
    expect(formatCompactKES(120_000_000)).toBe('KES 1.2M');
    expect(formatCompactKES(-150_000)).toBe('-KES 1.5K');
  });
});

describe('niceScale', () => {
  it('rounds the top up to a nice step', () => {
    expect(niceScale(83_000_000)).toEqual({ max: 100_000_000, ticks: [0, 25_000_000, 50_000_000, 75_000_000, 100_000_000] });
    const s = niceScale(1_234_567);
    expect(s.max).toBeGreaterThanOrEqual(1_234_567);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks.at(-1)).toBe(s.max);
  });

  it('keeps an exact top', () => {
    expect(niceScale(40_000_000).max).toBe(40_000_000);
  });

  it('gives an empty series a small default axis', () => {
    expect(niceScale(0)).toEqual({ max: 100_000, ticks: [0, 25_000, 50_000, 75_000, 100_000] });
  });
});

describe('dates', () => {
  it('turns a month into its days', () => {
    expect(periodRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('bad')).toEqual({ from: '', to: '' });
  });

  it('counts days between', () => {
    expect(daysBetween('2026-10-01', '2026-10-27')).toBe(26);
    expect(daysBetween('2026-10-27', '2026-10-27')).toBe(0);
    expect(daysBetween('x', '2026-10-27')).toBeNull();
  });

  it('checks a month range', () => {
    expect(checkMonthRange('2026-01', '2026-10', '2026-10')).toBeNull();
    expect(checkMonthRange('2026-11', '2026-10', '2026-10')).toBe('The first month must not be after the last.');
    expect(checkMonthRange('2026-01', '2026-11', '2026-10')).toBe('The last month can’t be in the future.');
    expect(checkMonthRange('', '2026-10', '2026-10')).toBe('Choose the first and last month.');
  });
});

describe('pnlCategories', () => {
  const figures = (expenses: Record<string, number>): PnlFigures => ({
    invoiced: { rent: 0, charges: 0, moveIn: 0, other: 0, total: 0 },
    collected: 0,
    expenses: { total: Object.values(expenses).reduce((a, b) => a + b, 0), ...expenses },
    net: 0,
  });

  it('keeps categories with spending, in the fixed order, unknown ones last', () => {
    const report = {
      totals: figures({ SECURITY: 100, REPAIRS: 50, CLEANING: 0, ZZ_NEW: 5 }),
      rows: [figures({ SECURITY: 100, REPAIRS: 50, CLEANING: 0, ZZ_NEW: 5 })],
    };
    expect(pnlCategories(report)).toEqual(['REPAIRS', 'SECURITY', 'ZZ_NEW']);
  });
});

describe('readReportTab', () => {
  it('defaults to P&L', () => {
    expect(readReportTab('arrears')).toBe('arrears');
    expect(readReportTab('occupancy')).toBe('occupancy');
    expect(readReportTab('nope')).toBe('pnl');
  });
});

describe('columnPath', () => {
  it('draws nothing for zero height and clamps the radius', () => {
    expect(columnPath(0, 10, 12, 0)).toBe('');
    expect(columnPath(0, 98, 12, 2)).toContain('V100');
    expect(columnPath(10, 20, 12, 80)).toBe('M10,100 V24 Q10,20 14,20 H18 Q22,20 22,24 V100 Z');
  });
});
