import { depositDelta, oldestFirst } from './allocation.js';

describe('oldestFirst', () => {
  const inv = [
    { id: 'a', balance: 1000n },
    { id: 'b', balance: 500n },
  ];

  it('pays oldest first and reports the remainder as credit', () => {
    expect(oldestFirst(inv, 1200n)).toEqual({
      plan: [
        { invoiceId: 'a', amount: 1000n },
        { invoiceId: 'b', amount: 200n },
      ],
      remainder: 0n,
    });
    expect(oldestFirst(inv, 2000n).remainder).toBe(500n);
    expect(oldestFirst(inv, 300n).plan).toEqual([{ invoiceId: 'a', amount: 300n }]);
    expect(oldestFirst([], 300n)).toEqual({ plan: [], remainder: 300n });
  });
});

describe('depositDelta', () => {
  it('counts the deposit as paid first', () => {
    expect(depositDelta(5000n, 0n, 3000n)).toBe(3000n);
    expect(depositDelta(5000n, 3000n, 6000n)).toBe(2000n);
    expect(depositDelta(5000n, 6000n, 7000n)).toBe(0n);
    expect(depositDelta(5000n, 7000n, 2000n)).toBe(-3000n); // reversal
    expect(depositDelta(0n, 0n, 7000n)).toBe(0n);
  });
});
