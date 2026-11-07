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
