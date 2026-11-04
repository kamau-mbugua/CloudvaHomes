import { describe, expect, it } from 'vitest';
import { actionLink, checkMonthRange, mriNotice, mriRate, parseRatePercent, columnPath, daysBetween, formatCompactKES, formatRate, niceScale, periodRange, pnlCategories, readReportTab } from './rules';
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

describe('actionLink', () => {
  it('sends unmatched M-Pesa payments to reconciliation, with a counted label', () => {
    const link = actionLink('UNMATCHED_PAYMENTS');
    expect(link.to).toBe('/app/reconciliation');
    expect(link.permission).toBe('reconciliation:view');
    expect(link.label(1)).toBe('1 M-Pesa payment to match');
    expect(link.label(3)).toBe('3 M-Pesa payments to match');
  });

  it('points every kind at the page that fixes it', () => {
    expect(actionLink('INVOICE_RUN_PENDING')).toMatchObject({ to: '/app/invoices/run', permission: 'invoices:view' });
    expect(actionLink('OVERDUE_TENANTS')).toMatchObject({ to: '/app/reports?tab=arrears', permission: 'reports:view' });
    expect(actionLink('NOTICE_ENDING')).toMatchObject({ to: '/app/tenancies?status=NOTICE', permission: 'tenancies:view' });
    expect(actionLink('REMITTANCES_TO_APPROVE')).toMatchObject({ to: '/app/remittances?status=DRAFT', permission: 'remittances:view' });
    expect(actionLink('LEASES_EXPIRING')).toMatchObject({ to: '/app/tenancies?expiring=60', permission: 'tenancies:view' });
  });

  it('words singular and plural counts', () => {
    expect(actionLink('INVOICE_RUN_PENDING').label(1)).toBe('Invoice run: 1 tenancy not billed yet');
    expect(actionLink('INVOICE_RUN_PENDING').label(4)).toBe('Invoice run: 4 tenancies not billed yet');
    expect(actionLink('OVERDUE_TENANTS').label(2)).toBe('2 tenants overdue');
    expect(actionLink('NOTICE_ENDING').label(1)).toBe('1 tenancy ends within 14 days');
    expect(actionLink('REMITTANCES_TO_APPROVE').label(2)).toBe('2 remittances to approve');
    expect(actionLink('LEASES_EXPIRING').label(2)).toBe('2 leases end within 60 days');
  });
});

describe('rental income tax (MRI) tab', () => {
  it('opens from ?tab=mri', () => {
    expect(readReportTab('mri')).toBe('mri');
  });

  it('shows the rate and says it is an estimate', () => {
    expect(mriRate(750)).toBe('7.5%');
    expect(mriRate(1000)).toBe('10%');
    expect(mriNotice(750, '2026-12-20')).toBe(
      'Estimate: residential rent received this month at 7.5%, due by 20 Dec 2026. Commercial properties, water and other charges, deposits and late fees are left out. Confirm with your tax advisor before filing on KRA iTax.',
    );
  });
});

describe('parseRatePercent', () => {
  it('turns a percentage into basis points', () => {
    expect(parseRatePercent('7.5')).toEqual({ ok: true, bps: 750 });
    expect(parseRatePercent(' 10 ')).toEqual({ ok: true, bps: 1000 });
    expect(parseRatePercent('0')).toEqual({ ok: true, bps: 0 });
  });

  it('rejects anything else', () => {
    expect(parseRatePercent('7.555')).toEqual({ ok: false, error: 'Enter a rate from 0 to 50, with at most two decimals.' });
    expect(parseRatePercent('51')).toEqual({ ok: false, error: 'Enter a rate from 0 to 50, with at most two decimals.' });
    expect(parseRatePercent('')).toEqual({ ok: false, error: 'Enter a rate from 0 to 50, with at most two decimals.' });
  });
});
