import { buildStatement, type RawEntry } from './statement.js';

const e = (date: string, type: RawEntry['type'], amount: bigint, ref = type): RawEntry => ({
  date,
  type,
  reference: ref,
  description: ref,
  amount,
  at: new Date(`${date}T10:00:00Z`),
});

describe('buildStatement', () => {
  it('carries an opening balance and a running balance, invoices before payments on a day', () => {
    const s = buildStatement(
      [
        e('2026-10-01', 'PAYMENT', -500n),
        e('2026-09-01', 'INVOICE', 1000n),
        e('2026-10-01', 'INVOICE', 1000n),
        e('2026-10-05', 'CREDIT_NOTE', -100n),
        e('2026-10-06', 'REVERSAL', 500n),
        e('2026-11-01', 'INVOICE', 1000n),
      ],
      '2026-10-01',
      '2026-10-31',
    );
    expect(s.openingBalance).toBe(1000n);
    expect(s.entries.map((x) => [x.type, x.debit, x.credit, x.balance])).toEqual([
      ['INVOICE', 1000n, 0n, 2000n],
      ['PAYMENT', 0n, 500n, 1500n],
      ['CREDIT_NOTE', 0n, 100n, 1400n],
      ['REVERSAL', 500n, 0n, 1900n],
    ]);
    expect(s.closingBalance).toBe(1900n);
  });
});
