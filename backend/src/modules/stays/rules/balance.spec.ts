import { describe, expect, it } from 'vitest';
import { owedOn } from './balance.js';

describe('owedOn', () => {
  it('is the total less net paid', () => {
    expect(owedOn({ total: 2_800_000n, amountPaid: 1_400_000n, amountRefunded: 0n })).toBe(
      1_400_000n,
    );
    expect(owedOn({ total: 2_800_000n, amountPaid: 1_400_000n, amountRefunded: 400_000n })).toBe(
      1_800_000n,
    );
  });

  it('leaves out a written-off balance', () => {
    expect(
      owedOn({
        total: 2_800_000n,
        amountPaid: 1_400_000n,
        amountRefunded: 0n,
        amountWrittenOff: 1_400_000n,
      }),
    ).toBe(0n);
  });

  it('is never negative', () => {
    expect(owedOn({ total: 1_000_000n, amountPaid: 1_200_000n, amountRefunded: 0n })).toBe(0n);
  });
});
