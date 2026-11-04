import {
  ageBucket,
  buildActionItems,
  mriDue,
  mriDueDate,
  rentShare,
  lastMonths,
  monthBounds,
  ratio,
  type ActionInput,
} from './report-math.js';

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

describe('buildActionItems', () => {
  const none: ActionInput = {
    uninvoicedTenancies: 0,
    unmatchedInbound: 0,
    overdueTenants: 0,
    overdueAmount: 0n,
    noticeEndingIn14Days: 0,
    draftRemittances: 0,
    leasesExpiringIn60Days: 0,
  };

  it('returns nothing when nothing needs doing', () => {
    expect(buildActionItems(none)).toEqual([]);
  });

  it('drops zero counts and keeps a fixed order', () => {
    expect(
      buildActionItems({
        ...none,
        leasesExpiringIn60Days: 2,
        unmatchedInbound: 1,
        uninvoicedTenancies: 4,
        draftRemittances: 3,
      }).map((a) => a.kind),
    ).toEqual([
      'INVOICE_RUN_PENDING',
      'UNMATCHED_PAYMENTS',
      'REMITTANCES_TO_APPROVE',
      'LEASES_EXPIRING',
    ]);
  });

  it('carries the overdue amount on OVERDUE_TENANTS only', () => {
    const items = buildActionItems({
      ...none,
      overdueTenants: 3,
      overdueAmount: 900_000n,
      noticeEndingIn14Days: 1,
    });
    expect(items).toEqual([
      { kind: 'OVERDUE_TENANTS', count: 3, amount: 900_000n },
      { kind: 'NOTICE_ENDING', count: 1 },
    ]);
  });
});

describe('rental income tax (MRI)', () => {
  it('takes the rent share of a payment, rounded half-up', () => {
    expect(rentShare(10_000n, 25_000n, 30_000n)).toBe(8_333n);
    expect(rentShare(30_000n, 25_000n, 30_000n)).toBe(25_000n);
    expect(rentShare(10_000n, 0n, 0n)).toBe(0n);
    expect(rentShare(-30_000n, 25_000n, 30_000n)).toBe(-25_000n); // a reversal takes it back
  });

  it('charges the rate on gross rent, to the cent', () => {
    expect(mriDue(2_500_000n, 750)).toBe(187_500n);
    expect(mriDue(1_234_567n, 750)).toBe(92_593n);
    expect(mriDue(-100n, 750)).toBe(0n);
  });

  it('is due on the 20th of the next month', () => {
    expect(mriDueDate('2026-11')).toBe('2026-12-20');
    expect(mriDueDate('2026-12')).toBe('2027-01-20');
  });
});
