import { nightsOf, quoteStay } from './pricing.js';

const p = {
  nightly: 200000n,
  weekend: 300000n,
  weeklyDiscountBps: 1000,
  cleaningFee: 50000n,
  special: [],
};

describe('stays pricing rules', () => {
  it('lists each night in YYYY-MM-DD order', () => {
    expect(nightsOf('2026-12-03', '2026-12-06')).toEqual([
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
    ]);
  });

  it('charges weekend price on Friday and Saturday nights', () => {
    const q = quoteStay('2026-12-03', '2026-12-06', p); // Thu, Fri, Sat nights
    expect(q.nights).toBe(3);
    expect(q.total).toBe(200000n + 300000n + 300000n + 50000n);
  });

  it('special date price beats weekend price', () => {
    const q = quoteStay('2026-12-04', '2026-12-05', {
      ...p,
      special: [{ from: '2026-12-04', to: '2026-12-04', nightly: 450000n }],
    });
    expect(q.total).toBe(450000n + 50000n);
  });

  it('takes 10% off the nights for 7+ nights, rounded down to whole shillings', () => {
    const q = quoteStay('2026-12-07', '2026-12-14', {
      ...p,
      weekend: null,
      nightly: 333300n,
    }); // 7 nights
    // nights 2,333,100; 10% = 233,310 → 233,300 off
    expect(q.lines.find((l) => l.kind === 'DISCOUNT')!.amount).toBe('-233300');
    expect(q.total).toBe(2333100n - 233300n + 50000n);
  });

  it('rejects check-out on or before check-in', () => {
    expect(() => quoteStay('2026-12-05', '2026-12-05', p)).toThrow();
  });
});

describe('quoteStay — phase 21 rules', () => {
  const p = {
    nightly: 1_000_000n,
    weekend: null,
    weeklyDiscountBps: 1000,
    monthlyDiscountBps: 2500,
    cleaningFee: 0n,
    special: [],
  };

  it('uses the monthly discount instead of the weekly one from 28 nights', () => {
    const month = quoteStay('2027-02-01', '2027-03-01', p);
    expect(month.nights).toBe(28);
    expect(month.lines.find((l) => l.kind === 'DISCOUNT')).toMatchObject({
      label: '28+ nights discount',
      amount: '-7000000',
    });
    expect(month.total).toBe(21_000_000n);
    const week = quoteStay('2027-02-01', '2027-02-08', p);
    expect(week.lines.find((l) => l.kind === 'DISCOUNT')?.label).toBe('7+ nights discount');
  });

  it('charges extra guests per night above those included, outside the discount', () => {
    const q = quoteStay('2027-02-01', '2027-02-03', {
      ...p,
      extraGuestFee: 100_000n,
      guestsIncluded: 2,
      guests: 4,
    });
    expect(q.lines.find((l) => l.kind === 'EXTRA_GUESTS')).toMatchObject({
      label: '2 extra guests × 2 nights',
      amount: '400000',
    });
    expect(q.total).toBe(2_400_000n);
    // Within the included number, or no limit set: no fee.
    expect(
      quoteStay('2027-02-01', '2027-02-03', {
        ...p,
        extraGuestFee: 100_000n,
        guestsIncluded: 4,
        guests: 4,
      }).total,
    ).toBe(2_000_000n);
    expect(
      quoteStay('2027-02-01', '2027-02-03', { ...p, extraGuestFee: 100_000n, guests: 6 }).total,
    ).toBe(2_000_000n);
  });
});
