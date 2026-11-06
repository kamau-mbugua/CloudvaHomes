import { describe, expect, it } from 'vitest';
import { lastMonths, mergeActivity, monthlySeries } from './tenant-insights.js';

describe('lastMonths', () => {
  it('lists n months ending with this one, oldest first, across a year end', () => {
    expect(lastMonths('2026-02-14', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('monthlySeries', () => {
  it('puts invoices by period and payments by month received, reversals netted', () => {
    expect(
      monthlySeries(
        ['2026-10', '2026-11'],
        [
          { period: '2026-11', amount: 1600000n },
          { period: '2026-08', amount: 999n }, // outside the window
        ],
        [
          { month: '2026-11', amount: 1000000n },
          { month: '2026-11', amount: -200000n },
        ],
      ),
    ).toEqual([
      { period: '2026-10', invoiced: 0n, paid: 0n },
      { period: '2026-11', invoiced: 1600000n, paid: 800000n },
    ]);
  });
});

describe('mergeActivity', () => {
  const item = (kind: string, at: string) => ({ kind, at }) as { kind: string; at: string };

  it('mixes kinds newest first and keeps only the limit', () => {
    const out = mergeActivity(
      [
        [item('PAYMENT', '2026-11-03T10:00:00.000Z'), item('PAYMENT', '2026-10-01T10:00:00.000Z')],
        [item('INVOICE', '2026-11-05T08:00:00.000Z')],
        [item('NOTICE', '2026-11-04T08:00:00.000Z')],
      ],
      3,
    );
    expect(out.map((i) => i.kind)).toEqual(['INVOICE', 'NOTICE', 'PAYMENT']);
  });
});

describe('feedNotice', () => {
  it('leaves out notices that repeat an invoice, payment or rent change already in the feed', async () => {
    const { feedNotice } = await import('./tenant-insights.js');
    expect(feedNotice('INVOICE_ISSUED')).toBe(false);
    expect(feedNotice('PAYMENT_RECEIVED')).toBe(false);
    expect(feedNotice('RENT_CHANGE')).toBe(false);
    expect(feedNotice('BROADCAST')).toBe(true);
    expect(feedNotice('UNIT_ASSIGNED')).toBe(true);
  });
});
