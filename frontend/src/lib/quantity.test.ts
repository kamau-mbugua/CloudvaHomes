import { describe, expect, it } from 'vitest';
import { calculateReading, formatQuantity, meteredAmount, parseQuantity, trimQuantity } from './quantity';

const milli = (input: string) => {
  const r = parseQuantity(input);
  return r.ok ? r.milli : r.error;
};

describe('parseQuantity', () => {
  it('reads whole numbers, decimals and grouped thousands as thousandths', () => {
    expect(milli('120')).toBe(120000n);
    expect(milli('120.5')).toBe(120500n);
    expect(milli('120.500')).toBe(120500n);
    expect(milli('1,204.25')).toBe(1204250n);
    expect(milli('.5')).toBe(500n);
    expect(milli('0')).toBe(0n);
    expect(milli(' 007.010 ')).toBe(7010n);
  });

  it('rejects negatives, a fourth decimal, junk and blanks', () => {
    expect(milli('-1')).toBe('A reading cannot be negative.');
    expect(milli('1.2345')).toBe('Use at most three decimal places.');
    expect(milli('12a')).toBe('Enter a number like 1204 or 1204.5.');
    expect(milli('1,20')).toBe('Enter a number like 1204 or 1204.5.');
    expect(milli('.')).toBe('Enter a number like 1204 or 1204.5.');
    expect(milli('')).toBe('Enter a reading.');
  });

  it('caps the whole part at 11 digits like Decimal(14,3)', () => {
    expect(milli('99999999999.999')).toBe(99999999999999n);
    expect(milli('100000000000')).toBe('That number is too large.');
  });
});

describe('formatQuantity / trimQuantity', () => {
  it('writes three decimals', () => {
    expect(formatQuantity(120500n)).toBe('120.500');
    expect(formatQuantity(5n)).toBe('0.005');
    expect(formatQuantity(0n)).toBe('0.000');
    expect(formatQuantity(-100n)).toBe('-0.100');
  });

  it('drops trailing zeros for display', () => {
    expect(trimQuantity('120.500')).toBe('120.5');
    expect(trimQuantity('1.000')).toBe('1');
    expect(trimQuantity('0.005')).toBe('0.005');
    expect(trimQuantity('15')).toBe('15');
    expect(trimQuantity(null)).toBe('');
  });
});

describe('meteredAmount', () => {
  it('multiplies consumption by the rate in integers', () => {
    // 12.5 m³ × KES 150.00 = KES 1,875.00
    expect(meteredAmount(12500n, 15000)).toBe(187500);
  });

  it('rounds half up to the cent', () => {
    // 0.005 × 100 cents = 0.5 cent → 1
    expect(meteredAmount(5n, 100)).toBe(1);
    // 0.004 × 100 = 0.4 → 0
    expect(meteredAmount(4n, 100)).toBe(0);
    // 1.333 × 333 = 443.889 → 444
    expect(meteredAmount(1333n, 333)).toBe(444);
    // 2.5 × 1 = 2.5 → 3
    expect(meteredAmount(2500n, 1)).toBe(3);
  });

  it('is exact where floats are not', () => {
    // 0.1 + 0.2 style trap: 120.3 - 120.0 = 0.3 exactly, × 1,000.00 = 300.00
    const used = 120300n - 120000n;
    expect(meteredAmount(used, 100000)).toBe(30000);
    // A large reading × rate beyond 2^53 before the division still comes out exact.
    expect(meteredAmount(99999999999999n, 100)).toBe(9999999999999 + 1);
  });

  it('refuses negative consumption and fractional rates', () => {
    expect(() => meteredAmount(-1n, 100)).toThrow(RangeError);
    expect(() => meteredAmount(1000n, 1.5)).toThrow(RangeError);
  });
});

describe('calculateReading', () => {
  it('is empty until a current reading is typed', () => {
    expect(calculateReading('120.000', '', 15000)).toEqual({ state: 'empty' });
    expect(calculateReading('120.000', '   ', 15000)).toEqual({ state: 'empty' });
  });

  it('gives consumption to three decimals and its amount', () => {
    expect(calculateReading('120.000', '132.5', 15000)).toEqual({ state: 'ok', consumption: '12.500', amount: 187500 });
    expect(calculateReading('120', '120', 15000)).toEqual({ state: 'ok', consumption: '0.000', amount: 0 });
  });

  it('flags a current below previous, and bad input in either box', () => {
    expect(calculateReading('120', '119.999', 15000)).toEqual({ state: 'invalid', field: 'current', error: 'Lower than the previous reading.' });
    expect(calculateReading('x', '130', 15000)).toMatchObject({ state: 'invalid', field: 'previous' });
    expect(calculateReading('120', '130.0001', 15000)).toMatchObject({ state: 'invalid', field: 'current' });
  });

  it('leaves the amount unknown without a rate', () => {
    expect(calculateReading('1', '2', null)).toEqual({ state: 'ok', consumption: '1.000', amount: null });
  });
});
