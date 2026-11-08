import { describe, expect, it } from 'vitest';
import { adjustProblem, parseBundles } from './smsAdmin';

describe('KodiHub admin SMS forms', () => {
  it('checks a units adjustment before sending it', () => {
    expect(adjustProblem(-200, 150, 'Correction')).toBe('This would take the balance below zero (150 units left).');
    expect(adjustProblem(10, 150, '')).toBe('Give a reason');
    expect(adjustProblem(0, 150, 'Oops')).toBe('Enter a whole number of units other than 0');
    expect(adjustProblem(2.5, 150, 'Oops')).toBe('Enter a whole number of units other than 0');
    expect(adjustProblem(50, 150, 'Bank payment')).toBeNull();
  });

  it('reads the bundle list as typed', () => {
    expect(parseBundles('500, 1000, 5000', 100)).toEqual({ ok: true, bundles: [500, 1000, 5000] });
    expect(parseBundles('1,000 5,000', 100)).toEqual({ ok: false, error: 'Separate bundles with commas, e.g. 500, 1000, 5000' });
    expect(parseBundles('50, 500', 100)).toEqual({ ok: false, error: 'Every bundle needs at least 100 units' });
    expect(parseBundles('', 100)).toEqual({ ok: false, error: 'Give at least one bundle' });
    expect(parseBundles('1, 2, 3, 4, 5, 6, 7', 1)).toEqual({ ok: false, error: 'At most 6 bundles' });
  });
});
