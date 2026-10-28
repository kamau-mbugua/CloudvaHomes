import { describe, expect, it } from 'vitest';
import { formatKES, minorToInput, parseAmount } from './money';

describe('formatKES', () => {
  it('formats minor units with grouping and two decimals', () => {
    expect(formatKES(123400)).toBe('KES 1,234.00');
    expect(formatKES(123456)).toBe('KES 1,234.56');
    expect(formatKES(100000000)).toBe('KES 1,000,000.00');
  });

  it('handles zero and sub-shilling amounts', () => {
    expect(formatKES(0)).toBe('KES 0.00');
    expect(formatKES(5)).toBe('KES 0.05');
    expect(formatKES(99)).toBe('KES 0.99');
  });

  it('puts the sign before the currency', () => {
    expect(formatKES(-5000)).toBe('-KES 50.00');
  });

  it('rejects fractional and unsafe values instead of rounding them', () => {
    expect(() => formatKES(12.5)).toThrow(RangeError);
    expect(() => formatKES(Number.NaN)).toThrow(RangeError);
    expect(() => formatKES(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });
});

describe('parseAmount', () => {
  const minor = (text: string) => {
    const result = parseAmount(text);
    return result.ok ? result.minor : result.error;
  };

  it('reads whole and decimal shillings into minor units', () => {
    expect(minor('25000')).toBe(2500000);
    expect(minor('25000.50')).toBe(2500050);
    expect(minor('25000.5')).toBe(2500050);
    expect(minor('0.05')).toBe(5);
    expect(minor('.5')).toBe(50);
    expect(minor('0')).toBe(0);
    expect(minor('12.')).toBe(1200);
  });

  it('accepts thousands separators, spaces around and a KES prefix', () => {
    expect(minor('25,000')).toBe(2500000);
    expect(minor(' 1,234,567.89 ')).toBe(123456789);
    expect(minor('KES 2,500')).toBe(250000);
    expect(minor('kes2500')).toBe(250000);
  });

  it('does not lose cents to binary fractions', () => {
    expect(minor('0.29')).toBe(29);
    expect(minor('1.13')).toBe(113);
    expect(minor('4.35')).toBe(435);
  });

  it('rejects more than two decimals', () => {
    expect(parseAmount('25000.505').ok).toBe(false);
    expect(minor('1.001')).toBe('Use at most two decimal places.');
  });

  it('rejects empty, negative, misplaced commas and junk', () => {
    expect(minor('')).toBe('Enter an amount.');
    expect(minor('   ')).toBe('Enter an amount.');
    expect(minor('-500')).toBe('The amount cannot be negative.');
    for (const bad of ['25,00', '2,5000', ',500', '1.2.3', 'abc', '25 000', '.', '1e5', '25,000,']) {
      expect(parseAmount(bad).ok, bad).toBe(false);
    }
  });

  it('rejects amounts beyond safe integers', () => {
    expect(parseAmount('999999999999999999').ok).toBe(false);
  });
});

describe('minorToInput', () => {
  it('drops .00 and keeps real cents', () => {
    expect(minorToInput(2500000)).toBe('25,000');
    expect(minorToInput(2500050)).toBe('25,000.50');
    expect(minorToInput(0)).toBe('0');
  });

  it('round-trips through parseAmount', () => {
    for (const value of [0, 5, 99, 100, 2500050, 123456789]) {
      expect(parseAmount(minorToInput(value))).toEqual({ ok: true, minor: value });
    }
  });
});
