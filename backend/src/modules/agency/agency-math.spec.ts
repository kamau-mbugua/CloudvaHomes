import { covers, overlaps, remittanceFor, waterfall, type WaterfallLine } from './agency-math.js';

const L = (
  kind: WaterfallLine['kind'],
  amount: bigint,
  position: number,
  refundable = false,
): WaterfallLine => ({
  kind,
  amount,
  position,
  refundable,
});

describe('waterfall', () => {
  const monthly = [L('RENT', 20000n, 0), L('CHARGE', 300n, 1), L('CHARGE', 1500n, 2)];

  it('pays rent first, then charges, in line order', () => {
    expect(waterfall(monthly, 0n, 15000n)).toEqual([
      { kind: 'RENT', refundable: false, amount: 15000n },
    ]);
    expect(waterfall(monthly, 15000n, 21000n)).toEqual([
      { kind: 'RENT', refundable: false, amount: 5000n },
      { kind: 'CHARGE', refundable: false, amount: 300n },
      { kind: 'CHARGE', refundable: false, amount: 700n },
    ]);
  });

  it('a reversal uncovers the same stretch, negatively', () => {
    expect(waterfall(monthly, 21000n, 15000n)).toEqual([
      { kind: 'RENT', refundable: false, amount: -5000n },
      { kind: 'CHARGE', refundable: false, amount: -300n },
      { kind: 'CHARGE', refundable: false, amount: -700n },
    ]);
  });

  it('pays refundable (deposit) lines before anything else', () => {
    const moveIn = [L('MOVE_IN', 1000n, 0), L('MOVE_IN', 20000n, 1, true)];
    expect(waterfall(moveIn, 0n, 20500n)).toEqual([
      { kind: 'MOVE_IN', refundable: true, amount: 20000n },
      { kind: 'MOVE_IN', refundable: false, amount: 500n },
    ]);
  });
});

describe('agreements', () => {
  const a = { startDate: '2026-01-01', endDate: '2026-06-30', propertyIds: ['p1'] };

  it('clash only when dates overlap and a property is shared', () => {
    expect(overlaps(a, { startDate: '2026-07-01', endDate: null, propertyIds: ['p1'] })).toBe(
      false,
    );
    expect(overlaps(a, { startDate: '2026-06-30', endDate: null, propertyIds: [] })).toBe(true);
    expect(overlaps(a, { startDate: '2026-03-01', endDate: null, propertyIds: ['p2'] })).toBe(
      false,
    );
  });

  it('cover a property within their dates', () => {
    expect(covers(a, 'p1', '2026-06-30')).toBe(true);
    expect(covers(a, 'p1', '2026-07-01')).toBe(false);
    expect(covers(a, 'p2', '2026-03-01')).toBe(false);
    expect(covers({ ...a, propertyIds: [] }, 'p2', '2026-03-01')).toBe(true);
  });

  it('remittance runs whichever way the balance says', () => {
    expect(remittanceFor(500n)).toEqual({ direction: 'TO_LANDLORD', net: 500n });
    expect(remittanceFor(-200n)).toEqual({ direction: 'FROM_LANDLORD', net: 200n });
  });
});
