import { percentOf, toMajorString, toMinor } from './money.js';

describe('toMinor', () => {
  it.each([
    ['1234.5', 123450n],
    ['1,234.50', 123450n],
    ['0.07', 7n],
    ['15000', 1500000n],
    ['-12.30', -1230n],
    [1234.5, 123450n],
  ])('%s → %s', (input, expected) => {
    expect(toMinor(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '1e5', '12.'])('rejects %j', (input) => {
    expect(() => toMinor(input)).toThrow(RangeError);
  });
});

describe('toMajorString', () => {
  it.each([
    [123450n, '1234.50'],
    [7n, '0.07'],
    [0n, '0.00'],
    [-1230n, '-12.30'],
  ])('%s → %s', (input, expected) => {
    expect(toMajorString(input)).toBe(expected);
  });
});

describe('percentOf', () => {
  it('takes basis-point percentages with half-up rounding', () => {
    expect(percentOf(1_500_000n, 1000)).toBe(150_000n); // 10% of KES 15,000
    expect(percentOf(333n, 1000)).toBe(33n); // 33.3 → 33
    expect(percentOf(335n, 1000)).toBe(34n); // 33.5 → 34
    expect(percentOf(-335n, 1000)).toBe(-34n); // symmetric for reversals
  });

  it('rejects fractional basis points', () => {
    expect(() => percentOf(100n, 7.5)).toThrow(RangeError);
  });
});
